import type { ConnectionState, LastDetectedCode, OtpCandidate, Prefs } from './types';

export const BURST_PORT_NAME = 'burst';

/** One-shot messages: popup/content -> background, via chrome.runtime.sendMessage. */
export type RuntimeRequest =
  | { type: 'CONNECT_GMAIL' }
  | { type: 'DISCONNECT' }
  | { type: 'GET_STATE' }
  | { type: 'SET_PREFS'; prefs: Prefs }
  | { type: 'MANUAL_CHECK_NOW' };

export interface PopupState {
  connection: ConnectionState;
  prefs: Prefs;
  lastDetectedCode: LastDetectedCode | null;
}

export type RuntimeResponse = { ok: true; state: PopupState } | { ok: false; error: string };

/** Messages over the long-lived 'burst' port: content -> background. */
export type BurstClientMessage = { type: 'BURST_START' } | { type: 'BURST_STOP' };

/** Messages over the long-lived 'burst' port: background -> content. */
export type BurstServerMessage =
  | { type: 'OTP_FOUND'; candidate: OtpCandidate }
  | { type: 'BURST_TIMEOUT' };

export function sendRuntimeMessage(message: RuntimeRequest): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message);
}
