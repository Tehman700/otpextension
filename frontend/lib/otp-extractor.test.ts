import { describe, expect, it } from 'vitest';
import { CONFIDENT_THRESHOLD, POSSIBLE_THRESHOLD, bestCandidate, extractOtpCandidates } from './otp-extractor';

const FRESH = 5_000; // 5s old
const STALE = 2 * 24 * 60 * 60 * 1000; // 2 days old

describe('extractOtpCandidates — real-world-shaped codes', () => {
  it('finds a 6-digit code with an explicit "code is" phrase', () => {
    const best = bestCandidate(
      extractOtpCandidates({
        subject: 'Your verification code',
        body: 'Your verification code is 482913. It expires in 10 minutes.',
        senderFrom: 'Google <no-reply@accounts.google.com>',
        messageAgeMs: FRESH,
      }),
    );
    expect(best?.code).toBe('482913');
    expect(best?.confidence).toBeGreaterThanOrEqual(CONFIDENT_THRESHOLD);
  });

  it('finds a prefixed code like "G-482913"', () => {
    const candidates = extractOtpCandidates({
      subject: '',
      body: 'G-482913 is your Google verification code. Don\'t share it.',
      senderFrom: 'Google <no-reply@accounts.google.com>',
      messageAgeMs: FRESH,
    });
    expect(candidates.some((c) => c.code === '482913')).toBe(true);
  });

  it('finds a code when the keyword is only in the subject', () => {
    const best = bestCandidate(
      extractOtpCandidates({
        subject: 'Your one-time passcode',
        body: '837201',
        senderFrom: 'Microsoft account team <account-security-noreply@accountprotection.microsoft.com>',
        messageAgeMs: FRESH,
      }),
    );
    expect(best?.code).toBe('837201');
    expect(best?.confidence).toBeGreaterThanOrEqual(POSSIBLE_THRESHOLD);
  });

  it('finds an 8-digit GitHub-style code', () => {
    const best = bestCandidate(
      extractOtpCandidates({
        subject: 'Your GitHub launch code',
        body: '48291037 is your GitHub authentication code. This code will expire in 15 minutes.',
        senderFrom: 'GitHub <noreply@github.com>',
        messageAgeMs: FRESH,
      }),
    );
    expect(best?.code).toBe('48291037');
  });

  it('finds a 10-digit numeric code', () => {
    const best = bestCandidate(
      extractOtpCandidates({
        subject: 'Verification code',
        body: 'Your verification code is 4829103756. Enter it to continue.',
        senderFrom: 'no-reply@example.com',
        messageAgeMs: FRESH,
      }),
    );
    expect(best?.code).toBe('4829103756');
    expect(best?.confidence).toBeGreaterThanOrEqual(CONFIDENT_THRESHOLD);
  });

  it('finds a letter-only uppercase code next to a keyword', () => {
    const best = bestCandidate(
      extractOtpCandidates({
        subject: 'Your access code',
        body: 'Your access code is ABCDEF. It expires soon.',
        senderFrom: 'no-reply@example.com',
        messageAgeMs: FRESH,
      }),
    );
    expect(best?.code).toBe('ABCDEF');
    expect(best?.confidence).toBeGreaterThanOrEqual(POSSIBLE_THRESHOLD);
  });

  it('boosts confidence when the sender domain matches the active page', () => {
    // Deliberately avoids a "code is/:" phrase directly adjacent to the number and
    // uses a 5-digit code, so the score has headroom below the 1.0 ceiling and the
    // domain-match bonus is actually observable rather than clamped away on both sides.
    const body = 'Your security code is ready: 59201 (valid 5 min).';
    const withMatch = bestCandidate(
      extractOtpCandidates({
        subject: '',
        body,
        senderFrom: 'no-reply@example.com',
        pageUrl: 'https://accounts.example.com/login',
        messageAgeMs: FRESH,
      }),
    );
    const withoutMatch = bestCandidate(
      extractOtpCandidates({
        subject: '',
        body,
        senderFrom: 'no-reply@example.com',
        pageUrl: 'https://totally-different-site.test/login',
        messageAgeMs: FRESH,
      }),
    );
    expect(withMatch!.confidence).toBeGreaterThan(withoutMatch!.confidence);
  });
});

describe('extractOtpCandidates — false-positive rejection', () => {
  it('rejects a bare year in a copyright footer', () => {
    const candidates = extractOtpCandidates({
      subject: 'Your monthly newsletter',
      body: 'Thanks for reading! © 2026 Example Corp. All rights reserved.',
      senderFrom: 'newsletter@example.com',
      messageAgeMs: FRESH,
    });
    expect(candidates.find((c) => c.code === '2026')).toBeUndefined();
  });

  it('rejects a price amount', () => {
    const candidates = extractOtpCandidates({
      subject: 'Your invoice',
      body: 'Your invoice total is $1999.00, due on the 1st.',
      senderFrom: 'billing@example.com',
      messageAgeMs: FRESH,
    });
    expect(candidates.find((c) => c.code === '1999')).toBeUndefined();
  });

  it('rejects a bare uppercase acronym with no code context anywhere in the message', () => {
    const candidates = extractOtpCandidates({
      subject: 'Company newsletter',
      body: 'NASA announced new plans today for upcoming missions.',
      senderFrom: 'newsletter@example.com',
      messageAgeMs: FRESH,
    });
    expect(candidates.find((c) => c.code === 'NASA')).toBeUndefined();
  });

  it('rejects a phone number fragment', () => {
    const candidates = extractOtpCandidates({
      subject: 'Contact us',
      body: 'Call us anytime at (555) 123-4567 for support.',
      senderFrom: 'support@example.com',
      messageAgeMs: FRESH,
    });
    expect(candidates.find((c) => c.code === '4567')).toBeUndefined();
  });

  it('rejects an order number without a code keyword nearby', () => {
    const candidates = extractOtpCandidates({
      subject: 'Your order has shipped',
      body: 'Your order #58291034 has shipped and will arrive Thursday.',
      senderFrom: 'orders@example.com',
      messageAgeMs: FRESH,
    });
    expect(candidates.find((c) => c.code === '58291034')).toBeUndefined();
  });

  it('hard-rejects everything from a stale (2-day-old) message', () => {
    const candidates = extractOtpCandidates({
      subject: 'Your verification code',
      body: 'Your verification code is 482913.',
      senderFrom: 'no-reply@accounts.google.com',
      messageAgeMs: STALE,
    });
    expect(candidates).toHaveLength(0);
  });
});
