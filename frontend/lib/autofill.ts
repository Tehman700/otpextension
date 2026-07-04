import type { OtpFieldMatch } from './field-detector';

/**
 * Setting `.value` directly doesn't update React/Vue's internal state since
 * they patch the native setter — going through the *original* prototype
 * setter, then dispatching a real input event, is what makes frameworks
 * observe the change.
 */
function setNativeValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function autofillOtp(match: OtpFieldMatch, code: string): void {
  if (match.kind === 'single') {
    setNativeValue(match.inputs[0], code);
    match.inputs[0].focus();
    return;
  }

  const chars = code.split('');
  match.inputs.forEach((input, i) => setNativeValue(input, chars[i] ?? ''));
  const lastIndex = Math.min(chars.length, match.inputs.length) - 1;
  match.inputs[Math.max(0, lastIndex)]?.focus();
}
