export interface Prefs {
  autoFill: boolean;
  autoCopy: boolean;
  notificationsEnabled: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  autoFill: true,
  autoCopy: true,
  notificationsEnabled: true,
};

/** Minimal Gmail message data we keep around — never the raw API response. */
export interface GmailMessageMeta {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  /** epoch ms, from Gmail's internalDate */
  internalDate: number;
  snippet: string;
}

export interface OtpCandidate {
  code: string;
  confidence: number;
  sender: string;
  subject: string;
  messageId: string;
  receivedAt: number;
}

/** What the popup shows for "last detected code". Lives in chrome.storage.session only. */
export interface LastDetectedCode {
  code: string;
  sender: string;
  subject: string;
  detectedAt: number;
  tabId?: number;
}

export type ConnectionState =
  | { status: 'disconnected' }
  | { status: 'connected'; email: string }
  | { status: 'reconnect_required' };
