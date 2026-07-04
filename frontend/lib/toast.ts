const HOST_ID = 'otp-extension-toast-host';

export interface ToastOptions {
  code: string;
  anchor: HTMLElement;
  onUse?: () => void;
  autoDismissMs?: number;
}

export function showOtpToast({ code, anchor, onUse, autoDismissMs = 10_000 }: ToastOptions): void {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  document.documentElement.appendChild(host);

  // Shadow DOM isolates the toast from the host page's CSS (and vice versa).
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .toast {
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1f2430; color: #fff; border-radius: 10px; padding: 10px 14px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.25); display: flex; align-items: center; gap: 10px;
    }
    .code { font-weight: 600; letter-spacing: 0.05em; }
    button {
      background: #4c8bf5; color: #fff; border: none; border-radius: 6px;
      padding: 6px 10px; font: inherit; cursor: pointer;
    }
    button:hover { background: #3d78e0; }
  `;

  const wrapper = document.createElement('div');
  wrapper.className = 'toast';

  const label = document.createElement('span');
  label.textContent = 'Code found: ';
  const codeSpan = document.createElement('span');
  codeSpan.className = 'code';
  codeSpan.textContent = code;
  label.appendChild(codeSpan);

  const useButton = document.createElement('button');
  useButton.type = 'button';
  useButton.textContent = 'Use';
  useButton.addEventListener('click', () => {
    onUse?.();
    host.remove();
  });

  wrapper.append(label, useButton);
  shadow.append(style, wrapper);

  positionNear(host, anchor);

  const dismissTimer = setTimeout(() => host.remove(), autoDismissMs);
  wrapper.addEventListener('mouseenter', () => clearTimeout(dismissTimer));
}

function positionNear(host: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  host.style.top = `${rect.bottom + window.scrollY + 8}px`;
  host.style.left = `${rect.left + window.scrollX}px`;
}
