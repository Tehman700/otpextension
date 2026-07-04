import { getAuthToken, getValidToken, refreshToken, removeCachedAuthToken, disconnect as authDisconnect } from '@/lib/auth';
import {
  GmailApiError,
  getMessageBody,
  getMessageMetadata,
  getProfile,
  listRecentMessageIds,
  syncHistory,
} from '@/lib/gmail-client';
import { BURST_PORT_NAME, type BurstClientMessage, type BurstServerMessage, type RuntimeRequest, type RuntimeResponse } from '@/lib/messaging';
import { CONFIDENT_THRESHOLD, POSSIBLE_THRESHOLD, bestCandidate, extractOtpCandidates } from '@/lib/otp-extractor';
import { storage } from '@/lib/storage';
import type { ConnectionState, GmailMessageMeta, OtpCandidate } from '@/lib/types';

const COARSE_ALARM_NAME = 'coarse-poll';
const BURST_INTERVAL_MS = 1200;
const BURST_DURATION_MS = 120_000;

export default defineBackground(() => {
  ensureCoarseAlarm();
  chrome.runtime.onInstalled.addListener(() => ensureCoarseAlarm());
  chrome.runtime.onStartup.addListener(() => ensureCoarseAlarm());

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === COARSE_ALARM_NAME) {
      runCoarsePass().catch((err) => console.error('[otp-extension] coarse pass failed', err));
    }
  });

  chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
    handleRuntimeMessage(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    return true; // keep the message channel open for the async response
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === BURST_PORT_NAME) handleBurstConnection(port);
  });
});

async function ensureCoarseAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(COARSE_ALARM_NAME);
  if (!existing) {
    await chrome.alarms.create(COARSE_ALARM_NAME, { periodInMinutes: 1 });
  }
}

// --- popup messaging -------------------------------------------------------

async function handleRuntimeMessage(message: RuntimeRequest): Promise<RuntimeResponse> {
  switch (message.type) {
    case 'CONNECT_GMAIL': {
      const token = await getAuthToken(true);
      if (!token) return { ok: false, error: 'No token returned from Google.' };
      const profile = await getProfile(token);
      await storage.setConnectedAccountEmail(profile.emailAddress);
      // Seed the baseline at "now" — v1 intentionally doesn't backfill older mail.
      await storage.setStartHistoryId(profile.historyId);
      return buildPopupState();
    }
    case 'DISCONNECT': {
      await authDisconnect();
      await storage.clearAccountData();
      return buildPopupState();
    }
    case 'GET_STATE':
      return buildPopupState();
    case 'SET_PREFS':
      await storage.setPrefs(message.prefs);
      return buildPopupState();
    case 'MANUAL_CHECK_NOW': {
      const pageUrl = await getActiveTabUrl();
      await runSyncPass({ pageUrl, notifyThreshold: POSSIBLE_THRESHOLD });
      return buildPopupState();
    }
    default:
      return { ok: false, error: 'Unknown message type' };
  }
}

async function buildPopupState(): Promise<RuntimeResponse> {
  const [connection, prefs, lastDetectedCode] = await Promise.all([
    getConnectionState(),
    storage.getPrefs(),
    storage.getLastDetectedCode(),
  ]);
  return { ok: true, state: { connection, prefs, lastDetectedCode } };
}

async function getConnectionState(): Promise<ConnectionState> {
  const [token, email] = await Promise.all([getValidToken(), storage.getConnectedAccountEmail()]);
  if (token && email) return { status: 'connected', email };
  if (!token && email) return { status: 'reconnect_required' };
  return { status: 'disconnected' };
}

async function getActiveTabUrl(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? null;
}

// --- coarse (alarm-driven) polling ------------------------------------------

async function runCoarsePass(): Promise<void> {
  const prefs = await storage.getPrefs();
  const result = await runSyncPass({ pageUrl: null, notifyThreshold: CONFIDENT_THRESHOLD });
  if (result.candidate && prefs.notificationsEnabled) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon/128.png'),
      title: 'New verification code',
      message: `${result.candidate.code} — from ${result.candidate.subject || result.candidate.sender}`,
    });
  }
}

// --- burst (port-driven) polling --------------------------------------------

interface BurstState {
  intervalId: ReturnType<typeof setInterval>;
  timeoutId: ReturnType<typeof setTimeout>;
  port: chrome.runtime.Port;
}

// Per-tab bursts run independently rather than being coalesced into one shared
// poll — simpler and correct for v1; Gmail API quota at this call volume is
// negligible, so the coalescing optimization isn't worth the added complexity
// unless real usage shows otherwise.
const activeBursts = new Map<number, BurstState>();

function handleBurstConnection(port: chrome.runtime.Port): void {
  const tabId = port.sender?.tab?.id;
  if (tabId == null) {
    port.disconnect();
    return;
  }

  port.onMessage.addListener((message: BurstClientMessage) => {
    if (message.type === 'BURST_START') startBurst(tabId, port);
    else if (message.type === 'BURST_STOP') stopBurst(tabId);
  });
  port.onDisconnect.addListener(() => stopBurst(tabId));
}

function startBurst(tabId: number, port: chrome.runtime.Port): void {
  stopBurst(tabId); // replace any existing burst for this tab

  const runOnce = async () => {
    try {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      const result = await runSyncPass({ pageUrl: tab?.url ?? null, notifyThreshold: POSSIBLE_THRESHOLD });
      if (result.candidate) {
        postBurstMessage(port, { type: 'OTP_FOUND', candidate: result.candidate });
        stopBurst(tabId);
      }
    } catch (err) {
      console.error('[otp-extension] burst pass failed', err);
    }
  };

  const timeoutId = setTimeout(() => {
    postBurstMessage(port, { type: 'BURST_TIMEOUT' });
    stopBurst(tabId);
  }, BURST_DURATION_MS);
  const intervalId = setInterval(runOnce, BURST_INTERVAL_MS);

  activeBursts.set(tabId, { intervalId, timeoutId, port });
  runOnce(); // don't wait a full interval for the first check
}

function stopBurst(tabId: number): void {
  const state = activeBursts.get(tabId);
  if (!state) return;
  clearInterval(state.intervalId);
  clearTimeout(state.timeoutId);
  activeBursts.delete(tabId);
  try {
    state.port.disconnect();
  } catch {
    // already disconnected
  }
}

function postBurstMessage(port: chrome.runtime.Port, message: BurstServerMessage): void {
  try {
    port.postMessage(message);
  } catch {
    // port may already be gone (tab closed mid-burst)
  }
}

// --- shared Gmail sync + OTP extraction pipeline ----------------------------

interface SyncPassOptions {
  pageUrl?: string | null;
  /** minimum confidence required to count as a "found" result for this pass */
  notifyThreshold: number;
}

interface SyncPassResult {
  candidate: OtpCandidate | null;
}

async function runSyncPass(options: SyncPassOptions, isRetry = false): Promise<SyncPassResult> {
  const token = await getValidToken();
  if (!token) return { candidate: null };

  try {
    return await runSyncPassWithToken(token, options);
  } catch (err) {
    if (err instanceof GmailApiError && err.status === 401) {
      if (isRetry) {
        // Chrome's cached token is rejected even after a refresh attempt — most likely
        // the user revoked access outside the extension. Drop the cache so the
        // connection state flips to "reconnect required" instead of staying stuck.
        await removeCachedAuthToken(token);
        return { candidate: null };
      }
      const refreshed = await refreshToken(token);
      if (!refreshed) return { candidate: null };
      return runSyncPass(options, true);
    }
    throw err;
  }
}

async function runSyncPassWithToken(token: string, options: SyncPassOptions): Promise<SyncPassResult> {
  const startHistoryId = await storage.getStartHistoryId();

  if (!startHistoryId) {
    // First run since connecting — establish a baseline, don't backfill old mail.
    const profile = await getProfile(token);
    await storage.setStartHistoryId(profile.historyId);
    return { candidate: null };
  }

  let newMessageIds: string[];
  const sync = await syncHistory(token, startHistoryId);
  if (sync.expired) {
    newMessageIds = await listRecentMessageIds(token, 5);
    const profile = await getProfile(token);
    await storage.setStartHistoryId(profile.historyId);
  } else {
    newMessageIds = sync.newMessageIds;
    await storage.setStartHistoryId(sync.newHistoryId);
  }

  let best: OtpCandidate | null = null;

  for (const id of newMessageIds) {
    if (await storage.hasProcessed(id)) continue;

    const meta = await fetchMessageWithEscalation(token, id);
    await storage.markProcessed(id);

    const candidates = extractOtpCandidates({
      subject: meta.subject,
      body: meta.bodyText,
      senderFrom: meta.from,
      messageAgeMs: Date.now() - meta.internalDate,
      pageUrl: options.pageUrl,
    });
    const top = bestCandidate(candidates);
    if (top && (!best || top.confidence > best.confidence)) {
      best = {
        code: top.code,
        confidence: top.confidence,
        sender: meta.from,
        subject: meta.subject,
        messageId: id,
        receivedAt: meta.internalDate,
      };
    }
  }

  if (best && best.confidence >= options.notifyThreshold) {
    await storage.setLastDetectedCode({
      code: best.code,
      sender: best.sender,
      subject: best.subject,
      detectedAt: Date.now(),
    });
    await openPopupSafely();
    return { candidate: best };
  }
  return { candidate: null };
}

/**
 * chrome.action.openPopup() no longer requires an active user gesture on
 * current Chrome, but it can still fail (no focused window, etc.), so this
 * is best-effort — the rest of the detection pipeline must not depend on it.
 */
async function openPopupSafely(): Promise<void> {
  try {
    await chrome.action.openPopup();
  } catch (err) {
    console.warn('[otp-extension] could not auto-open popup', err);
  }
}

interface MessageWithBody extends GmailMessageMeta {
  bodyText: string;
}

async function fetchMessageWithEscalation(token: string, id: string): Promise<MessageWithBody> {
  const meta = await getMessageMetadata(token, id);
  let bodyText = meta.snippet;

  // Escalate to the full body only if the snippet alone doesn't look conclusive —
  // keeps quota usage low since most codes are findable in the (much cheaper) snippet.
  const quickBest = bestCandidate(
    extractOtpCandidates({ subject: meta.subject, body: bodyText, senderFrom: meta.from, messageAgeMs: 0 }),
  );
  if (!quickBest || quickBest.confidence < CONFIDENT_THRESHOLD) {
    try {
      bodyText = await getMessageBody(token, id);
    } catch {
      // fall back to snippet-only if the full fetch fails for any reason
    }
  }

  return { ...meta, bodyText };
}
