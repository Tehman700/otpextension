import { autofillOtp } from '@/lib/autofill';
import { copyToClipboard } from '@/lib/clipboard';
import { detectOtpField, findOtpFieldsInDocument, isFieldStillOpen, type OtpFieldMatch } from '@/lib/field-detector';
import { BURST_PORT_NAME, type BurstClientMessage, type BurstServerMessage } from '@/lib/messaging';
import { storage } from '@/lib/storage';
import { showOtpToast } from '@/lib/toast';

const RESCAN_DEBOUNCE_MS = 500;
// Caps how long untouched, still-empty fields keep getting auto-re-armed
// (10 restarts * ~2min bursts ≈ 20 min) so an abandoned tab doesn't poll forever.
const MAX_AUTO_RESTARTS = 10;

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    let port: chrome.runtime.Port | null = null;
    // All OTP-looking fields currently being watched — a found code fills every one.
    let currentMatches: OtpFieldMatch[] = [];
    let restartCount = 0;
    let rescanTimer: ReturnType<typeof setTimeout> | null = null;

    // Proactive: watch as soon as the page loads, no click required.
    considerMatches(findOtpFieldsInDocument());

    // Covers SPA flows where a code field appears after the initial load
    // (e.g. after submitting a "send code" step) without a full navigation.
    const observer = new MutationObserver(() => {
      if (rescanTimer) clearTimeout(rescanTimer);
      rescanTimer = setTimeout(() => considerMatches(findOtpFieldsInDocument()), RESCAN_DEBOUNCE_MS);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Kept as a secondary trigger (e.g. a field our heuristics only resolve
    // once focused) for fields the proactive scan didn't already pick up.
    document.addEventListener(
      'focusin',
      (event) => {
        const match = detectOtpField(event.target);
        if (match) considerMatches([match]);
      },
      true,
    );

    window.addEventListener('pagehide', () => {
      observer.disconnect();
      teardownPort();
    });

    function considerMatches(matches: OtpFieldMatch[]): void {
      const fresh = matches.filter((match) => !currentMatches.some((m) => m.inputs[0] === match.inputs[0]));
      if (fresh.length === 0) return;
      currentMatches = [...currentMatches, ...fresh];
      restartCount = 0;
      if (!port) startBurst();
    }

    function startBurst(): void {
      port = chrome.runtime.connect({ name: BURST_PORT_NAME });
      port.onMessage.addListener((message: BurstServerMessage) => {
        if (message.type === 'OTP_FOUND') {
          const matches = currentMatches;
          teardownPort();
          currentMatches = [];
          if (matches.length > 0) void handleOtpFound(message.candidate.code, matches);
        } else if (message.type === 'BURST_TIMEOUT') {
          teardownPort();
          maybeRestartBurst();
        }
      });
      port.onDisconnect.addListener(() => {
        port = null;
      });
      const startMessage: BurstClientMessage = { type: 'BURST_START' };
      port.postMessage(startMessage);
    }

    function maybeRestartBurst(): void {
      currentMatches = currentMatches.filter(isFieldStillOpen);
      if (currentMatches.length === 0 || restartCount >= MAX_AUTO_RESTARTS) {
        currentMatches = [];
        return;
      }
      restartCount += 1;
      startBurst();
    }

    function teardownPort(): void {
      if (port) {
        try {
          port.disconnect();
        } catch {
          // already disconnected
        }
      }
      port = null;
    }

    async function handleOtpFound(code: string, matches: OtpFieldMatch[]): Promise<void> {
      const prefs = await storage.getPrefs();
      if (prefs.autoCopy) await copyToClipboard(code);
      if (prefs.autoFill) {
        for (const match of matches) autofillOtp(match, code);
      }
      showOtpToast({
        code,
        anchor: matches[0].inputs[0],
        onUse: () => {
          void copyToClipboard(code);
          for (const match of matches) autofillOtp(match, code);
        },
      });
    }
  },
});
