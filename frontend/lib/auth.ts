/**
 * chrome.identity.getAuthToken's callback shape changed across Chrome versions
 * (plain string in older Chrome vs. { token, grantedScopes } in newer Chrome),
 * so this normalizes both rather than trusting one shape.
 */
function normalizeTokenResult(result: string | { token?: string } | undefined): string | null {
  if (!result) return null;
  if (typeof result === 'string') return result;
  return result.token ?? null;
}

export function getAuthToken(interactive: boolean): Promise<string | null> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      if (chrome.runtime.lastError) {
        // Non-interactive calls fail with "no cached token" when the user
        // simply hasn't connected yet — treat that as "no token", not an error.
        if (!interactive) {
          resolve(null);
          return;
        }
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(normalizeTokenResult(result as string | { token?: string } | undefined));
    });
  });
}

export function removeCachedAuthToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

/** Best-effort server-side revoke so a disconnect actually revokes Google access, not just the local cache. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    // Revocation is best-effort — local token cache is cleared regardless.
  }
}

/**
 * Gets a usable token, retrying once non-interactively after clearing the
 * cache if Gmail rejected the cached token (expired/revoked externally).
 */
export async function getValidToken(): Promise<string | null> {
  const token = await getAuthToken(false);
  return token;
}

export async function refreshToken(staleToken: string): Promise<string | null> {
  await removeCachedAuthToken(staleToken);
  return getAuthToken(false);
}

export async function disconnect(): Promise<void> {
  const token = await getAuthToken(false);
  if (token) {
    await removeCachedAuthToken(token);
    await revokeToken(token);
  }
}
