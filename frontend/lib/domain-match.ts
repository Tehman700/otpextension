// Lightweight eTLD+1 heuristic (not a full public-suffix-list parse). This only
// feeds a *soft* confidence boost in the OTP scorer, never a hard requirement,
// so an occasional mis-split on an exotic ccTLD is an acceptable tradeoff
// against pulling in a public-suffix-list dependency for a non-security signal.
const KNOWN_TWO_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk',
  'co.jp', 'ne.jp', 'or.jp',
  'co.kr', 'co.in', 'co.nz', 'co.za', 'co.il', 'co.id',
  'com.au', 'com.br', 'com.mx', 'com.cn', 'com.tw', 'com.sg', 'com.hk',
]);

function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');

  const lastTwo = labels.slice(-2).join('.');
  if (KNOWN_TWO_LABEL_SUFFIXES.has(lastTwo)) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

/** Extracts the email address from a "From" header like `Name <user@domain.com>`. */
export function extractEmailAddress(fromHeader: string): string | null {
  const match = fromHeader.match(/<([^>]+)>/);
  const address = match ? match[1] : fromHeader.trim();
  return address.includes('@') ? address : null;
}

export function domainFromEmail(fromHeader: string): string | null {
  const address = extractEmailAddress(fromHeader);
  if (!address) return null;
  const domain = address.split('@')[1];
  return domain ? registrableDomain(domain) : null;
}

export function domainFromUrl(url: string): string | null {
  try {
    return registrableDomain(new URL(url).hostname);
  } catch {
    return null;
  }
}

export function domainsMatch(senderFrom: string, pageUrl: string): boolean {
  const senderDomain = domainFromEmail(senderFrom);
  const siteDomain = domainFromUrl(pageUrl);
  if (!senderDomain || !siteDomain) return false;
  return senderDomain === siteDomain;
}
