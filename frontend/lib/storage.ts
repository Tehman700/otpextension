import { DEFAULT_PREFS, type LastDetectedCode, type Prefs } from './types';

/** Age-pruned de-dup record so processedMessageIds doesn't grow forever. */
interface ProcessedEntry {
  id: string;
  ts: number;
}

const PROCESSED_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const LAST_CODE_TTL_MS = 10 * 60 * 1000; // 10 min — stale codes shouldn't linger in the popup

interface LocalSchema {
  gmailStartHistoryId: string | null;
  processedMessageIds: ProcessedEntry[];
  prefs: Prefs;
  connectedAccountEmail: string | null;
}

const LOCAL_DEFAULTS: LocalSchema = {
  gmailStartHistoryId: null,
  processedMessageIds: [],
  prefs: DEFAULT_PREFS,
  connectedAccountEmail: null,
};

async function getLocal<K extends keyof LocalSchema>(key: K): Promise<LocalSchema[K]> {
  const result = await chrome.storage.local.get(key);
  return key in result ? (result[key] as LocalSchema[K]) : LOCAL_DEFAULTS[key];
}

async function setLocal<K extends keyof LocalSchema>(key: K, value: LocalSchema[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export const storage = {
  getStartHistoryId: () => getLocal('gmailStartHistoryId'),
  setStartHistoryId: (id: string | null) => setLocal('gmailStartHistoryId', id),

  getPrefs: () => getLocal('prefs'),
  setPrefs: (prefs: Prefs) => setLocal('prefs', prefs),

  getConnectedAccountEmail: () => getLocal('connectedAccountEmail'),
  setConnectedAccountEmail: (email: string | null) => setLocal('connectedAccountEmail', email),

  async hasProcessed(messageId: string): Promise<boolean> {
    const entries = await getLocal('processedMessageIds');
    return entries.some((e) => e.id === messageId);
  },

  async markProcessed(messageId: string): Promise<void> {
    const now = Date.now();
    const entries = await getLocal('processedMessageIds');
    const pruned = entries.filter((e) => now - e.ts < PROCESSED_MAX_AGE_MS);
    pruned.push({ id: messageId, ts: now });
    await setLocal('processedMessageIds', pruned);
  },

  /** Clears everything tied to the connected account, but keeps user prefs (auto-fill/copy/notifications). */
  async clearAccountData(): Promise<void> {
    await Promise.all([
      setLocal('gmailStartHistoryId', null),
      setLocal('processedMessageIds', []),
      setLocal('connectedAccountEmail', null),
    ]);
    await chrome.storage.session.remove('lastDetectedCode');
  },

  // --- session (in-memory only, cleared on browser restart) ---

  async getLastDetectedCode(): Promise<LastDetectedCode | null> {
    const result = await chrome.storage.session.get('lastDetectedCode');
    const value = result.lastDetectedCode as LastDetectedCode | undefined;
    if (!value) return null;
    if (Date.now() - value.detectedAt > LAST_CODE_TTL_MS) {
      await chrome.storage.session.remove('lastDetectedCode');
      return null;
    }
    return value;
  },

  async setLastDetectedCode(value: LastDetectedCode): Promise<void> {
    await chrome.storage.session.set({ lastDetectedCode: value });
  },
};
