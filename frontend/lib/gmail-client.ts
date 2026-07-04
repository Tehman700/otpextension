import type { GmailMessageMeta } from './types';

const API_BASE = 'https://www.googleapis.com/gmail/v1/users/me';

export class GmailApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}

async function gmailFetch<T>(token: string, path: string, params?: Record<string, string | string[]>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, v);
      } else {
        url.searchParams.set(key, value);
      }
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new GmailApiError(`Gmail API ${path} failed: ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export interface GmailProfile {
  emailAddress: string;
  historyId: string;
}

export function getProfile(token: string): Promise<GmailProfile> {
  return gmailFetch<GmailProfile>(token, '/profile');
}

interface MessageListResponse {
  messages?: { id: string; threadId: string }[];
}

/** Used only for the initial sync / resync-after-expired-checkpoint path. */
export async function listRecentMessageIds(token: string, maxResults = 10): Promise<string[]> {
  const res = await gmailFetch<MessageListResponse>(token, '/messages', {
    maxResults: String(maxResults),
  });
  return (res.messages ?? []).map((m) => m.id);
}

interface HistoryListResponse {
  history?: { messagesAdded?: { message: { id: string } }[] }[];
  historyId: string;
  nextPageToken?: string;
}

export interface HistorySyncResult {
  newMessageIds: string[];
  newHistoryId: string;
  /** true if the checkpoint had expired and the caller should fall back to a full resync */
  expired: boolean;
}

export async function syncHistory(token: string, startHistoryId: string): Promise<HistorySyncResult> {
  try {
    const res = await gmailFetch<HistoryListResponse>(token, '/history', {
      startHistoryId,
      historyTypes: 'messageAdded',
    });
    const ids = new Set<string>();
    for (const record of res.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        ids.add(added.message.id);
      }
    }
    return { newMessageIds: [...ids], newHistoryId: res.historyId, expired: false };
  } catch (err) {
    if (err instanceof GmailApiError && err.status === 404) {
      return { newMessageIds: [], newHistoryId: startHistoryId, expired: true };
    }
    throw err;
  }
}

interface MessagePart {
  mimeType: string;
  body?: { data?: string };
  parts?: MessagePart[];
}

interface MessageGetResponse {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload: {
    headers: { name: string; value: string }[];
    mimeType: string;
    body?: { data?: string };
    parts?: MessagePart[];
  };
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    return atob(base64);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prefers text/plain; falls back to a stripped text/html part. */
function extractBodyText(payload: MessageGetResponse['payload']): string {
  let plain: string | null = null;
  let html: string | null = null;

  function walk(part: { mimeType: string; body?: { data?: string }; parts?: MessagePart[] }): void {
    if (part.mimeType === 'text/plain' && part.body?.data && !plain) {
      plain = decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data && !html) {
      html = decodeBase64Url(part.body.data);
    }
    for (const child of part.parts ?? []) walk(child);
  }

  walk(payload);
  if (plain) return plain;
  if (html) return stripHtml(html);
  return '';
}

function header(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export async function getMessageMetadata(token: string, id: string): Promise<GmailMessageMeta> {
  const res = await gmailFetch<MessageGetResponse>(token, `/messages/${id}`, {
    format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'Date'],
  });
  return {
    id: res.id,
    threadId: res.threadId,
    from: header(res.payload.headers, 'From'),
    subject: header(res.payload.headers, 'Subject'),
    internalDate: Number(res.internalDate),
    snippet: res.snippet,
  };
}

/** Escalated fetch when the snippet alone isn't enough to find a confident code. */
export async function getMessageBody(token: string, id: string): Promise<string> {
  const res = await gmailFetch<MessageGetResponse>(token, `/messages/${id}`, { format: 'full' });
  return extractBodyText(res.payload);
}
