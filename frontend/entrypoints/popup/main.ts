import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/eb-garamond/latin-400.css';
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

function renderStatusBadge(state: PopupState): string {
  switch (state.connection.status) {
    case 'connected':
      return `<span class="badge-pill"><span class="status-dot connected"></span>Connected</span>`;
    case 'reconnect_required':
      return `<span class="badge-pill"><span class="status-dot reconnect"></span>Reconnect required</span>`;
    default:
      return `<span class="badge-pill"><span class="status-dot"></span>Not connected</span>`;
  }
}

function renderLastCode(state: PopupState): string {
  const last = state.lastDetectedCode;
  if (!last) return '<p class="empty-state">No code detected yet.</p>';
  const ago = Math.max(0, Math.round((Date.now() - last.detectedAt) / 1000));
  return `
    <div class="code-card">
      <div class="row-between">
        <span class="code-value">${escapeHtml(last.code)}</span>
        <button id="copy-last" class="btn btn-outline btn-sm" type="button">Copy</button>
      </div>
      <span class="code-meta">${escapeHtml(last.subject || last.sender)} · ${ago}s ago</span>
    </div>
  `;
}

function renderPrefsToggle(id: keyof Prefs, label: string, prefs: Prefs): string {
  return `
    <label class="toggle-row" for="${id}">
      <span class="toggle-label">${label}</span>
      <span class="switch">
        <input type="checkbox" id="${id}" ${prefs[id] ? 'checked' : ''} />
        <span class="switch-track"></span>
      </span>
    </label>
  `;
}

function render(): void {
  if (!state) {
    app.innerHTML = '<p class="empty-state">Loading…</p>';
    return;
  }

  const connected = state.connection.status === 'connected';
  const needsReconnect = state.connection.status === 'reconnect_required';

  app.innerHTML = `
    <header class="popup-header">
      <div class="orb" aria-hidden="true"></div>
      <h1 class="brand-title">CodeCatch</h1>
    </header>

    <section class="panel">
      <div class="row-between">${renderStatusBadge(state)}</div>
      ${state.connection.status === 'connected' ? `<span class="code-meta">${escapeHtml(state.connection.email)}</span>` : ''}
      ${error ? `<p class="error-text">${escapeHtml(error)}</p>` : ''}
      ${
        connected
          ? `<button id="disconnect" class="btn btn-outline btn-block" type="button" ${busy ? 'disabled' : ''}>Disconnect</button>`
          : `<button id="connect" class="btn btn-primary btn-block" type="button" ${busy ? 'disabled' : ''}>${needsReconnect ? 'Reconnect Gmail' : 'Connect Gmail'}</button>`
      }
    </section>

    <section class="panel">
      <div class="row-between">
        <span class="eyebrow">Last detected code</span>
        <button id="check-now" class="btn btn-outline btn-sm" type="button" ${busy || !connected ? 'disabled' : ''}>Check now</button>
      </div>
      ${renderLastCode(state)}
    </section>

    <section class="panel">
      <span class="eyebrow">Settings</span>
      <div class="toggle-list">
        ${renderPrefsToggle('autoFill', 'Auto-fill code into page', state.prefs)}
        ${renderPrefsToggle('autoCopy', 'Auto-copy to clipboard', state.prefs)}
        ${renderPrefsToggle('notificationsEnabled', 'Show notifications', state.prefs)}
      </div>
    </section>

    <footer class="popup-footer">Your Gmail data never leaves your browser.</footer>
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
