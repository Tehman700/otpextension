import { domainsMatch } from './domain-match';

export const CONFIDENT_THRESHOLD = 0.6;
export const POSSIBLE_THRESHOLD = 0.3;
export const FRESHNESS_WINDOW_MS = 10 * 60 * 1000; // 10 min
const HARD_AGE_CUTOFF_MS = 24 * 60 * 60 * 1000; // 24h — never resurface mail older than this

export interface ExtractInput {
  subject: string;
  body: string;
  senderFrom: string;
  /** Date.now() - message internalDate, computed by the caller so this stays pure/testable. */
  messageAgeMs: number;
  /** Current active tab URL, for a soft sender-domain confidence boost. */
  pageUrl?: string | null;
}

export interface ScoredCandidate {
  code: string;
  confidence: number;
  origin: 'subject' | 'body';
}

const KEYWORD_RE =
  /(?:\bone[-\s]?time\b|\bverification\b|\bpasscode\b|\bpass code\b|\bsecurity code\b|\bauth(?:entication)? code\b|\blogin code\b|\baccess code\b|\bconfirmation code\b|\b2fa\b|\botp\b|\bcode\b)/i;
const KEYWORD_ADJACENT_RE =
  /(?:code|otp|passcode|pin)\s*(?:is|:)?\s*$/i; // e.g. "code is: " or "code: " right before the number
const YEAR_RE = /^(19|20)\d{2}$/;
const CURRENCY_BEFORE_RE = /[$€£¥]\s*$/;
const DECIMAL_AFTER_RE = /^\s*\.\d{2}\b/; // "1999.00" style
// Phone-number shape: a hyphen/dot directly between two digit groups (e.g. "123-4567").
// Anchored to a digit on the numeric side so an ordinary sentence-ending period
// after a code (e.g. "code is 482913. It expires...") isn't mistaken for this.
const NUMERIC_GLUE_BEFORE_RE = /\d[-.]$/;
const NUMERIC_GLUE_AFTER_RE = /^[-.]\d/;
const HASH_PREFIX_RE = /#\s*$/;
const ORDER_KEYWORD_RE = /\b(?:order|ticket|invoice|reference|tracking)\s*(?:#|no\.?|number)?\s*$/i;

const NUMERIC_CANDIDATE_RE = /\b\d{4,10}\b/g;
// Mixed alnum (at least one letter AND one digit), 4-10 chars — avoids re-matching plain words or plain numbers.
const ALNUM_CANDIDATE_RE = /\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]{4,10}\b/g;
// Letter-only codes (e.g. "ABCDEF"). Restricted to ALL-CAPS runs — real letter-only
// codes are almost always rendered uppercase for legibility, and that restriction
// is what keeps this from matching ordinary capitalized words/acronyms in prose;
// scoreMatch additionally hard-requires a nearby keyword for this shape.
const ALPHA_CANDIDATE_RE = /\b[A-Z]{4,10}\b/g;

const WINDOW = 40;

interface RawMatch {
  code: string;
  index: number;
}

function findRawMatches(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  const seen = new Set<number>();
  for (const re of [NUMERIC_CANDIDATE_RE, ALNUM_CANDIDATE_RE, ALPHA_CANDIDATE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (!seen.has(m.index)) {
        seen.add(m.index);
        matches.push({ code: m[0], index: m.index });
      }
    }
  }
  return matches;
}

function scoreMatch(
  match: RawMatch,
  text: string,
  origin: 'subject' | 'body',
  subjectHasKeyword: boolean,
  senderMatchesPage: boolean,
  messageAgeMs: number,
): number {
  const before = text.slice(Math.max(0, match.index - WINDOW), match.index);
  const after = text.slice(match.index + match.code.length, match.index + match.code.length + WINDOW);
  const localKeyword = KEYWORD_RE.test(before) || KEYWORD_RE.test(after);

  // Hard rejects
  if (YEAR_RE.test(match.code) && !localKeyword && !subjectHasKeyword) return 0;

  // Letter-only "codes" are the noisiest shape (ordinary capitalized words/acronyms
  // match the pattern too), so unlike digits they don't get a free pass — no
  // keyword nearby at all means this is almost certainly not a real code.
  const isAlphaOnly = /^[A-Za-z]+$/.test(match.code);
  if (isAlphaOnly && !localKeyword && !subjectHasKeyword) return 0;

  let score = 0.2; // base: it's a plausible-shaped candidate at all

  if (localKeyword) score += 0.5;
  if (subjectHasKeyword && origin === 'body' && !localKeyword) score += 0.25;
  if (KEYWORD_ADJACENT_RE.test(before)) score += 0.2;

  if (match.code.length === 6) score += 0.15;
  else if (match.code.length === 4 || match.code.length === 8) score += 0.05;

  if (senderMatchesPage) score += 0.1;

  if (messageAgeMs <= FRESHNESS_WINDOW_MS) score += 0.1;
  else score -= 0.2;

  // Soft rejects / penalties
  if (CURRENCY_BEFORE_RE.test(before) || DECIMAL_AFTER_RE.test(after)) score -= 0.6;
  if (NUMERIC_GLUE_BEFORE_RE.test(before) || NUMERIC_GLUE_AFTER_RE.test(after)) score -= 0.6;
  if ((HASH_PREFIX_RE.test(before) || ORDER_KEYWORD_RE.test(before)) && !localKeyword) score -= 0.5;

  return Math.max(0, Math.min(1, score));
}

export function extractOtpCandidates(input: ExtractInput): ScoredCandidate[] {
  if (input.messageAgeMs > HARD_AGE_CUTOFF_MS) return [];

  const subjectHasKeyword = KEYWORD_RE.test(input.subject);
  const senderMatchesPage = input.pageUrl ? domainsMatch(input.senderFrom, input.pageUrl) : false;

  const results: ScoredCandidate[] = [];
  const sources: [string, 'subject' | 'body'][] = [
    [input.subject, 'subject'],
    [input.body, 'body'],
  ];
  for (const [text, origin] of sources) {
    for (const match of findRawMatches(text)) {
      const confidence = scoreMatch(match, text, origin, subjectHasKeyword, senderMatchesPage, input.messageAgeMs);
      if (confidence > 0) results.push({ code: match.code, confidence, origin });
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

export function bestCandidate(candidates: ScoredCandidate[]): ScoredCandidate | null {
  return candidates.length > 0 ? candidates[0] : null;
}
