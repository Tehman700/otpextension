import './style.css';
import { copyToClipboard } from '@/lib/clipboard';
import { sendRuntimeMessage } from '@/lib/messaging';
import type { PopupState } from '@/lib/messaging';
import type { Prefs } from '@/lib/types';

const app = document.querySelector<HTMLDivElement>('#app')!;

let state: PopupState | null = null;
let error: string | null = null;
let busy = false;

async function refresh(): Promise<void> {
  const res = await sendRuntimeMessage({ type: 'GET_STATE' });
  if (res.ok) state = res.state;
  render();
}

async function withBusy(action: () => Promise<void>): Promise<void> {
  busy = true;
  error = null;
  render();
  try {
    await action();
  } finally {
    busy = false;
  }
  await refresh();
}

function connectionStatusLine(state: PopupState): string {
  switch (state.connection.status) {
    case 'connected':
      return `<span class="status-dot connected"></span>Connected as ${escapeHtml(state.connection.email)}`;
    case 'reconnect_required':
      return `<span class="status-dot reconnect"></span>Reconnect required`;
    default:
      return `<span class="status-dot disconnected"></span>Not connected`;
  }
}

function renderLastCode(state: PopupState): string {
  const last = state.lastDetectedCode;
  if (!last) return '<p class="muted">No code detected yet.</p>';
  const ago = Math.max(0, Math.round((Date.now() - last.detectedAt) / 1000));
  return `
    <div class="code-card">
      <div class="row">
        <span class="code-value">${escapeHtml(last.code)}</span>
        <button id="copy-last" type="button">Copy</button>
      </div>
      <span class="muted">${escapeHtml(last.subject || last.sender)} · ${ago}s ago</span>
    </div>
  `;
}

function renderPrefsToggle(id: keyof Prefs, label: string, prefs: Prefs): string {
  return `
    <label class="toggle-row" for="${id}">
      <span>${label}</span>
      <input type="checkbox" id="${id}" ${prefs[id] ? 'checked' : ''} />
    </label>
  `;
}

function render(): void {
  if (!state) {
    app.innerHTML = '<p class="muted">Loading…</p>';
    return;
  }

  const connected = state.connection.status === 'connected';
  const needsReconnect = state.connection.status === 'reconnect_required';

  app.innerHTML = `
    <h1>OTP Extension</h1>

    <div class="section">
      <div class="row status-line">${connectionStatusLine(state)}</div>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
      <div class="row">
        ${
          connected
            ? `<button id="disconnect" type="button" ${busy ? 'disabled' : ''}>Disconnect</button>`
            : `<button id="connect" class="primary" type="button" ${busy ? 'disabled' : ''}>${needsReconnect ? 'Reconnect Gmail' : 'Connect Gmail'}</button>`
        }
      </div>
    </div>

    <div class="section">
      <div class="row">
        <strong style="font-size:13px">Last detected code</strong>
        <button id="check-now" type="button" ${busy || !connected ? 'disabled' : ''}>Check now</button>
      </div>
      ${renderLastCode(state)}
    </div>

    <div class="section">
      ${renderPrefsToggle('autoFill', 'Auto-fill code into page', state.prefs)}
      ${renderPrefsToggle('autoCopy', 'Auto-copy to clipboard', state.prefs)}
      ${renderPrefsToggle('notificationsEnabled', 'Show notifications', state.prefs)}
    </div>

    <footer>
      <span>Your Gmail data never leaves your browser.</span>
    </footer>
  `;

  attachListeners();
}

async function callAndCheck(request: Parameters<typeof sendRuntimeMessage>[0]): Promise<void> {
  const res = await sendRuntimeMessage(request);
  if (!res.ok) error = res.error;
}

function attachListeners(): void {
  document.getElementById('connect')?.addEventListener('click', () =>
    withBusy(() => callAndCheck({ type: 'CONNECT_GMAIL' })),
  );

  document.getElementById('disconnect')?.addEventListener('click', () =>
    withBusy(() => callAndCheck({ type: 'DISCONNECT' })),
  );

  document.getElementById('check-now')?.addEventListener('click', () =>
    withBusy(() => callAndCheck({ type: 'MANUAL_CHECK_NOW' })),
  );

  document.getElementById('copy-last')?.addEventListener('click', async () => {
    if (state?.lastDetectedCode) await copyToClipboard(state.lastDetectedCode.code);
  });

  for (const id of ['autoFill', 'autoCopy', 'notificationsEnabled'] as const) {
    document.getElementById(id)?.addEventListener('change', (event) => {
      if (!state) return;
      const checked = (event.target as HTMLInputElement).checked;
      const prefs: Prefs = { ...state.prefs, [id]: checked };
      void withBusy(async () => {
        await sendRuntimeMessage({ type: 'SET_PREFS', prefs });
      });
    });
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

void refresh();
