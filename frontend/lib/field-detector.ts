const KEYWORD_RE = /otp|one[-\s]?time|verification.?code|security.?code|auth.?code|passcode|2fa/i;

export type OtpFieldMatch =
  | { kind: 'single'; inputs: [HTMLInputElement] }
  | { kind: 'segmented'; inputs: HTMLInputElement[] };

function getLabelText(input: HTMLInputElement): string {
  const parts: string[] = [];
  for (const label of Array.from(input.labels ?? [])) parts.push(label.textContent ?? '');
  const labelledBy = input.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      parts.push(document.getElementById(id)?.textContent ?? '');
    }
  }
  return parts.join(' ');
}

function textSignals(input: HTMLInputElement): string {
  return [input.id, input.name, input.placeholder, input.getAttribute('aria-label') ?? '', getLabelText(input)].join(
    ' ',
  );
}

function isCertainMatch(input: HTMLInputElement): boolean {
  return input.autocomplete === 'one-time-code';
}

function hasKeywordSignal(input: HTMLInputElement): boolean {
  return KEYWORD_RE.test(textSignals(input));
}

function isSegmentCandidate(el: Element): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  const numericish = el.inputMode === 'numeric' || el.type === 'tel' || el.type === 'number' || el.type === 'text';
  return numericish && el.maxLength === 1;
}

/**
 * Segmented multi-box OTP UIs are a much stronger signal than a lone numeric
 * input (which is just as often a real phone-number field), so this is
 * checked before falling back to the single-field keyword heuristic.
 */
function findSegmentedGroup(input: HTMLInputElement): HTMLInputElement[] | null {
  if (input.maxLength !== 1) return null;

  const container = input.closest('form') ?? input.parentElement?.parentElement ?? input.parentElement;
  if (!container) return null;

  const candidates = Array.from(container.querySelectorAll('input')).filter(isSegmentCandidate);
  if (candidates.length < 3 || !candidates.includes(input)) return null;

  const rect = input.getBoundingClientRect();
  const rowTolerance = Math.max(rect.height, 10) * 1.5;
  const sameRow = candidates.filter((el) => Math.abs(el.getBoundingClientRect().top - rect.top) < rowTolerance);
  if (sameRow.length < 3) return null;

  return sameRow.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
}

export function detectOtpField(target: EventTarget | null): OtpFieldMatch | null {
  if (!(target instanceof HTMLInputElement)) return null;

  if (isCertainMatch(target)) return { kind: 'single', inputs: [target] };

  const segmented = findSegmentedGroup(target);
  if (segmented) return { kind: 'segmented', inputs: segmented };

  if (hasKeywordSignal(target)) return { kind: 'single', inputs: [target] };

  return null;
}

/**
 * Proactively scans the whole document for every qualifying field (a page can
 * legitimately have more than one — e.g. a visible input plus a hidden mirror
 * field some frameworks add), so watching can start the moment the page loads
 * and all of them get filled, rather than waiting for a click into just one.
 */
export function findOtpFieldsInDocument(root: ParentNode = document): OtpFieldMatch[] {
  const inputs = Array.from(root.querySelectorAll('input')).filter(
    (el): el is HTMLInputElement => el instanceof HTMLInputElement,
  );

  const matches: OtpFieldMatch[] = [];
  const used = new Set<HTMLInputElement>();

  // Segmented groups are checked first — the most unambiguous signal — so an
  // unrelated single field elsewhere on the page can't consume one of its boxes.
  for (const input of inputs) {
    if (used.has(input)) continue;
    const segmented = findSegmentedGroup(input);
    if (segmented) {
      matches.push({ kind: 'segmented', inputs: segmented });
      segmented.forEach((el) => used.add(el));
    }
  }

  for (const input of inputs) {
    if (used.has(input) || !isCertainMatch(input)) continue;
    matches.push({ kind: 'single', inputs: [input] });
    used.add(input);
  }

  for (const input of inputs) {
    if (used.has(input) || !hasKeywordSignal(input)) continue;
    matches.push({ kind: 'single', inputs: [input] });
    used.add(input);
  }

  return matches;
}

/** True while every box in the match is still on the page and still empty. */
export function isFieldStillOpen(match: OtpFieldMatch): boolean {
  return match.inputs.every((input) => document.contains(input) && input.value === '');
}
