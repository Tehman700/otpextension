# CodeCatch — Project Handout

> Purpose: complete context document for resuming work in a fresh conversation.
> Last updated: **July 7, 2026** (during Google OAuth verification submission).

---

## 1. What this product is

**CodeCatch** (formerly "OTP Extension") is a Chrome Manifest V3 extension that solves one problem: when a website emails you a one-time verification code (OTP), you shouldn't have to switch to Gmail, find the email, and copy the code manually. CodeCatch watches the connected Gmail account, detects incoming verification codes, and surfaces them automatically:

1. **Auto-copy** to clipboard
2. **On-page toast** near the code field (with a "Use" button)
3. **Auto-fill** directly into the detected input field(s) — including segmented multi-box UIs
4. **Auto-opens the extension popup** (`chrome.action.openPopup()`) when a code is found
5. **System notification** (coarse mode, when not on a code-entry page)

Intended as a **real shippable product** (Chrome Web Store), free for v1, monetization deferred.

### Locked-in decisions (do not re-litigate)
- **Gmail only** for v1, via Gmail REST API + `chrome.identity` OAuth (`getAuthToken`). No IMAP, no Gmail-tab scraping.
- **No backend.** Everything is client-side; the extension calls Gmail directly. `backend/` folder exists but is **empty/unused** (reserved for future licensing/payments/sync). This "no server" fact is also the basis of our privacy story AND the claim that gets us the free OAuth verification path instead of paid CASA.
- **Burst + coarse polling** (see architecture below) to fit MV3 service-worker lifetime limits.
- **All three surfacing modes** + popup auto-open.
- **Proactive detection**: fields are detected on page load / DOM mutation — user does NOT need to click into the field first (this was an explicit user requirement).
- **Fill every detected field on the page**, not just one (explicit user requirement).
- **Free for now**; freemium/paywall postponed.

---

## 2. Key identifiers & accounts (critical — do not lose)

| Thing | Value |
|---|---|
| Product name | **CodeCatch** |
| Extension ID (permanent, CWS-assigned) | `fjfaaefhmkdiebabpgkdpplcbjmlpmag` |
| Public key | stored in `frontend/keys/extension-public-key.b64.txt` (this is the **CWS-assigned** key, pinned as `manifest.key`) |
| OAuth client ID (type "Chrome Extension") | `510126417367-0sfs6ab8e9uq61n50dcck11eqvu9niep.apps.googleusercontent.com` |
| OAuth scope | `https://www.googleapis.com/auth/gmail.readonly` (**restricted** scope → verification required) |
| Google Cloud project | `OTPVerificationExtensionV1` (slug `otpverificationextensionv1`) |
| Google account (everything) | `tehmanhassan@gmail.com` — Cloud Console, Search Console, CWS publisher, support email, test user |
| Custom domain | **codecatch.site** (Namecheap, bought 2026-07-06, expires 2027-07-06, WithheldForPrivacy on) |
| Privacy policy / home page URL | `https://codecatch.site/` (GitHub Pages behind custom domain) |
| GitHub repo | `https://github.com/Tehman700/otpextension.git`, branch `main` |
| GitHub Pages source | `main` branch, `/docs` folder + `docs/CNAME` containing `codecatch.site` |
| Demo video (OAuth verification) | `https://youtu.be/-Ltp2txYQGM` ("CodeCatch Testing Video, Auto OTP Picker", unlisted) |
| CWS item status | **Draft** created; keyless zip uploaded first (reserved the ID), then re-uploaded `codecatch-1.0.0-chrome.zip` **with** key |
| CWS trader declaration | **Non-trader** account |
| Version | 1.0.0 |

### Extension ID history (important to understand)
1. Dev started with a **self-generated** RSA key → ID `pcicemoaiofmjogmipnihegkjfikaimk` (now obsolete; old private key `frontend/keys/extension-key.pem` is gitignored and no longer meaningful).
2. CWS rejects a manual `key` on an item's **first** upload → we built a keyless zip via `SKIP_MANIFEST_KEY=1 npx wxt zip`, uploaded it as a draft, and CWS assigned the permanent ID above.
3. The CWS "View public key" value was normalized to one line and now lives in `frontend/keys/extension-public-key.b64.txt`; `wxt.config.ts` reads it into `manifest.key`, so **local dev and the store share the same ID**.
4. All **future** uploads must INCLUDE the key (default `npm run zip` does this). `SKIP_MANIFEST_KEY` is never needed again.
5. The OAuth client's "Item ID" in Cloud Console was updated to the permanent ID.

### DNS (Namecheap → GitHub Pages)
- 4 × A records `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- CNAME `www` → `tehman700.github.io.`
- TXT `@` → `google-site-verification=...` (for Search Console **Domain**-type property)
- Namecheap's default `codecatch.site → www` redirect was **removed**.
- HTTPS is live (GitHub-provisioned Let's Encrypt).

### Search Console
- `codecatch.site` verified as a **Domain property** (DNS TXT). This is what Google Cloud branding verification actually checks.
- Lesson learned: **URL-prefix verification of a github.io page does NOT satisfy Cloud Console's "domain registered to you" check** — that dead end is why we bought the custom domain. The old `docs/google9647a3514365a96c.html` file (URL-prefix verification for github.io) is still in the repo; harmless.

---

## 3. Repo layout

Repo root: `d:\OTP Extension` (git repo, remote `origin`, branch `main`).

```
d:\OTP Extension\
  .gitignore                  — ignores .claude/
  Design.md                   — design-system spec (ElevenLabs-inspired) the popup UI follows
  handout.md                  — THIS file
  docs/                       — GitHub Pages source (published at https://codecatch.site/)
    index.md                  — privacy policy (the live/public copy)
    CNAME                     — "codecatch.site"
    google9647a3514365a96c.html — old Search Console URL-prefix token (obsolete, harmless)
  backend/                    — EMPTY, reserved for future
  frontend/                   — the extension (WXT project)
    wxt.config.ts             — manifest config; reads pinned key; SKIP_MANIFEST_KEY env skips it
    package.json              — name "codecatch", v1.0.0; scripts: dev/build/zip/test/compile
    keys/
      extension-public-key.b64.txt  — PERMANENT CWS public key (committed)
      extension-key.pem             — old self-generated private key (GITIGNORED, obsolete)
    entrypoints/
      background.ts           — service worker (see §4)
      content.ts              — content script (see §4)
      popup/index.html|main.ts|style.css — popup UI (see §5)
    lib/
      auth.ts                 — getAuthToken (normalizes string vs {token} callback shapes),
                                removeCachedAuthToken, revokeToken (oauth2.googleapis.com/revoke),
                                refreshToken, disconnect
      gmail-client.ts         — fetch wrapper: getProfile, listRecentMessageIds, syncHistory
                                (history.list, 404→expired flag), getMessageMetadata
                                (format=metadata, From/Subject/Date), getMessageBody
                                (format=full; text/plain preferred, HTML stripped); GmailApiError
      otp-extractor.ts        — pure scoring extractor (see §4.3)
      otp-extractor.test.ts   — 13 Vitest tests, all passing
      field-detector.ts       — detectOtpField (focus target), findOtpFieldsInDocument (ALL
                                matches, segmented checked first), isFieldStillOpen
      autofill.ts             — native value setter + InputEvent/change dispatch (React/Vue-safe);
                                per-char fill + focus for segmented groups
      clipboard.ts            — navigator.clipboard.writeText, execCommand fallback on http:
      toast.ts                — Shadow-DOM toast anchored to field, "Use" button, 10s dismiss
      domain-match.ts         — registrable-domain heuristic (known 2-label suffix list),
                                domainFromEmail/domainFromUrl/domainsMatch
      messaging.ts            — typed contracts (see §4.4)
      storage.ts              — typed chrome.storage wrapper (see §4.5)
      types.ts                — Prefs, GmailMessageMeta, OtpCandidate, LastDetectedCode, ConnectionState
    assets/icon-source.svg    — keyhole glyph on #4C6FFF rounded square (brand icon source)
    public/icon/{16,32,48,96,128}.png — rendered from the SVG (via sharp, not a saved dep)
    test-page/
      index.html              — 3 test cases: autocomplete="one-time-code" input,
                                keyword-named input, segmented 6-box group
      serve.cjs               — `node serve.cjs` → http://localhost:8080
    docs/
      PRIVACY_POLICY.md       — privacy policy source copy (keep in sync with docs/index.md!)
      PERMISSION_JUSTIFICATIONS.md — per-permission CWS justification text + scope justification
```

---

## 4. Architecture (how it actually works)

### 4.1 Background service worker (`entrypoints/background.ts`)
- **Coarse mode**: `chrome.alarms` `'coarse-poll'`, `periodInMinutes: 1`, re-asserted on install/startup. Each fire runs one sync pass; a confident hit fires `chrome.notifications.create` (if pref enabled).
- **Burst mode**: content script opens `chrome.runtime.connect({name: 'burst'})`. Port keeps the MV3 worker alive (documented Chrome behavior). Background runs `setInterval` at **`BURST_INTERVAL_MS = 1200`** (user wanted faster than the original 2500), capped by **`BURST_DURATION_MS = 120_000`**. Per-tab `Map<tabId, BurstState>`; a found code posts `OTP_FOUND` and stops the burst; timeout posts `BURST_TIMEOUT`.
- **Gmail sync pass** (`runSyncPass`): `getValidToken` → on 401: `removeCachedAuthToken` + one non-interactive retry → if still 401, drop cache so popup shows "Reconnect required". Uses stored `startHistoryId` with `users.history.list(historyTypes=messageAdded)`; on 404 (checkpoint expired ~1 week) falls back to `users.messages.list(5)` + re-baseline. First run after connect just seeds baseline (no backfill of old mail — intentional).
- **Message fetch escalation**: `messages.get(format=metadata)` first; escalate to `format=full` only when the snippet doesn't yield a `CONFIDENT_THRESHOLD` candidate (quota-friendly).
- **Cross-site disambiguation (important fix)**: when multiple new messages produce candidates in one pass and page context exists (burst), a message whose **sender domain matches the current site categorically outranks** a non-matching one, regardless of raw confidence. Coarse mode (no page) uses plain highest-confidence. This prevents, e.g., a coincidental Netflix code autofilling into a Twitter login. Residual limitation: if the relevant service sends via an unrelated third-party domain AND an unrelated code lands in the same seconds-wide window, domain can't disambiguate — acknowledged, rare.
- On accepted candidate: `storage.setLastDetectedCode(...)` then `openPopupSafely()` (try/catch — `chrome.action.openPopup()` works without user gesture on Chrome 127+, but can fail if no focused window; must never break the pipeline).
- **Thresholds used per pass**: burst & manual-check use `POSSIBLE_THRESHOLD`; coarse/notification path uses `CONFIDENT_THRESHOLD`.

### 4.2 Content script (`entrypoints/content.ts`)
- Runs on `http://*/*`, `https://*/*`, `all_frames: true`, `document_idle`.
- **Proactive**: `findOtpFieldsInDocument()` on load — no click needed. Plus a debounced (500ms) `MutationObserver` rescan for SPA flows, plus `focusin` as a secondary trigger.
- Tracks **ALL** matches (`currentMatches: OtpFieldMatch[]`); `OTP_FOUND` fills **every** watched field.
- If a burst times out and fields are still present & empty, restarts the burst, up to **`MAX_AUTO_RESTARTS = 10`** (≈20 min total watching), then gives up.
- Surfacing honors prefs: autoCopy → clipboard; autoFill → all matches; toast always shown (its "Use" button re-copies + re-fills).

### 4.3 OTP extractor (`lib/otp-extractor.ts`) — pure functions, unit-tested
- Candidate shapes: numeric `\b\d{4,10}\b`; mixed alnum 4–10 chars (must contain a letter AND a digit); **letter-only UPPERCASE 4–10** (added on user request — hard-requires a nearby code keyword, else score 0, to avoid matching acronyms like "NASA").
- Scoring (base 0.2, clamp 0–1): +0.5 keyword within 40 chars; +0.25 subject-keyword for body matches without local keyword; +0.2 "code is/:" adjacency; length prior (+0.15 six digits, +0.05 four/eight); +0.1 sender-domain matches page (soft); +0.1 fresh (≤10 min) / −0.2 stale.
- Rejections/penalties: bare year (hard 0 unless keyword), currency/decimal (−0.6), digit-glued hyphen/dot = phone shape (−0.6; anchored to digits so "code is 482913." isn't penalized — this was a real bug found by test), `#`/order/ticket/invoice prefix without keyword (−0.5). Hard age cutoff 24h.
- Constants: `CONFIDENT_THRESHOLD = 0.6`, `POSSIBLE_THRESHOLD = 0.3`, `FRESHNESS_WINDOW_MS = 10 min`.
- 13 tests in `otp-extractor.test.ts` cover: 6-digit "code is", "G-482913" prefix, subject-only keyword, 8-digit GitHub style, 10-digit, letter-only ABCDEF, domain-match boost, and rejections (year, price, phone, order#, stale, acronym).

### 4.4 Messaging contract (`lib/messaging.ts`)
- Port name `'burst'`. Port messages: client → `BURST_START` / `BURST_STOP`; server → `OTP_FOUND {candidate}` / `BURST_TIMEOUT`.
- One-shot runtime messages: `CONNECT_GMAIL`, `DISCONNECT`, `GET_STATE`, `SET_PREFS {prefs}`, `MANUAL_CHECK_NOW` → all respond `{ok:true, state: PopupState} | {ok:false, error}`.

### 4.5 Storage (`lib/storage.ts`)
- `chrome.storage.local`: `gmailStartHistoryId`, `processedMessageIds` (de-dup; **age-pruned at 24h**), `prefs {autoFill, autoCopy, notificationsEnabled}` (all default true), `connectedAccountEmail`.
- `chrome.storage.session`: `lastDetectedCode {code, sender, subject, detectedAt}` with **10-min TTL** enforced on read.
- `clearAccountData()` on disconnect clears account stuff but **keeps prefs**.
- Never stored: tokens (Chrome identity manages them), full email bodies, raw API responses. This is a privacy-policy commitment — don't violate it casually.

### 4.6 Manifest (generated by `wxt.config.ts`)
- Permissions: `identity`, `storage`, `alarms`, `notifications`, `clipboardWrite`. (`scripting` was deliberately REMOVED — unused permissions are a CWS review flag.)
- Host permissions: `https://*.googleapis.com/*` (Gmail API + token revoke), `http://*/*`, `https://*/*` (content script must work on arbitrary sites — triggers CWS in-depth review; justification text is prepared).
- `oauth2` block: client ID above, scope `gmail.readonly`.
- `key`: pinned from `keys/extension-public-key.b64.txt` unless `SKIP_MANIFEST_KEY=1`.

---

## 5. Popup UI & design system

- Spec: **`Design.md`** at repo root (ElevenLabs-inspired editorial system). Off-white canvas `#f5f5f5`, warm near-black ink `#0c0a09`/`#292524`, hairlines `#e7e5e4`, pill-shaped buttons (solid ink = primary, outline = secondary), hairline+soft-shadow white cards (`radius 16px`), pastel gradient-orb as decoration ONLY.
- Fonts self-hosted via fontsource, **latin subsets only** (`@fontsource/inter/latin-{400,500,600,700}.css`, `@fontsource/eb-garamond/latin-400.css`). Note: **EB Garamond has no 300 weight** — spec's "Waldenburg Light 300" is approximated with EB Garamond 400 for the display face. Full-subset imports ballooned the build to 1.24 MB; latin-only brings it to ~307 kB. Don't reintroduce bare `@fontsource/x/400.css` imports.
- Popup sections: header (serif "CodeCatch" + blurred mint/lavender orb), connection status pill badge + Connect/Reconnect (primary) or Disconnect (outline), "Last detected code" card (large code + Copy + "Check now"), three custom toggle switches (auto-fill / auto-copy / notifications), footer: "Your Gmail data never leaves your browser."
- All popup logic in `main.ts` (plain TS, `render()` + `attachListeners()`, `escapeHtml` for anything user-derived).

---

## 6. Dev workflow

```bash
cd "d:\OTP Extension\frontend"
npm run dev        # WXT dev server + HMR; load .output/chrome-mv3-dev/ as unpacked
npm run build      # production build → .output/chrome-mv3/
npm run zip        # production zip (INCLUDES key) → .output/codecatch-1.0.0-chrome.zip
npm test           # Vitest (13 tests)
npm run compile    # tsc --noEmit
node test-page/serve.cjs   # scratch test page → http://localhost:8080
```

- Node v24, npm 11. Windows machine, PowerShell + Git Bash available.
- Testing flow: load unpacked → connect Gmail in popup → open localhost:8080 → send yourself an email ("Your code is 123456") → watch burst detect/fill within ~1–5s. "Check now" in popup forces a manual pass.
- Debug console logs were **stripped for production** (privacy: never log email subjects/senders/codes). Only error-level logs remain. If debugging detection again, add temporary logs — and remove them before shipping.
- Known dev-only noise: occasional `coarse pass failed TypeError: Failed to fetch` in the service worker while `npm run dev` hot-reloads — dev-server teardown artifact, monitor but not a production concern so far.
- npm audit: ~8 vulns, all in dev-only tooling (wxt/web-ext-run chain), do not ship to users; `npm audit fix` applied where non-breaking.

---

## 7. Publishing status — WHERE WE ARE (as of 2026-07-07)

### Done
1. Extension fully working end-to-end, user-validated: OAuth connect, detection, multi-field autofill (single + segmented), clipboard, toast, popup auto-open, notifications.
2. CWS developer account registered ($5), **non-trader** declared, draft item created, permanent ID reserved, updated zip (with key + CodeCatch name + redesigned popup) re-uploaded.
3. Store listing partially filled: name/summary from package; **description drafted** (see §9); category should be **Productivity**, language **English**.
4. Privacy policy live at `https://codecatch.site/`; domain verified in Search Console (Domain property, DNS TXT).
5. OAuth consent screen (Google Auth Platform): branding fields set (name CodeCatch, logo, home/privacy = codecatch.site, authorized domain codecatch.site, contacts) — **branding verification passed** after the domain migration.
6. Data Access: `gmail.readonly` scope added with justification text + demo video link.
7. Verification questionnaire answered: personal-use **No**, internal **No**, dev/testing **No**, WordPress SMTP **No**; both acknowledgment checkboxes checked. "Additional info" text supplied stating **no backend server** (basis for avoiding paid CASA; the CASA checkbox is a blanket disclosure, actual requirement is determined by review — our no-server architecture should qualify for the standard free path).

### In flight / to confirm
- **OAuth verification submission**: the questionnaire was filled in the last session; **confirm the final "Submit for verification"/Confirm button was actually clicked** and the Verification Center shows a pending/in-review state. Then it's a waiting game (days to weeks). Google may email `tehmanhassan@gmail.com` with follow-up questions — answer promptly, reiterate the no-server architecture if CASA comes up.
- Until verification approves: consent screen shows "unverified app" warning, 100-user cap (currently 1/100), only listed test users connect cleanly.

### Not done yet
1. **CWS screenshots** (required, ≥1, 1280×800 or 640×400 PNG/JPEG): capture popup-with-code, on-page toast+autofill on the test page or a real flow. User must capture these (we have no screenshot access to their Chrome).
2. **CWS Privacy practices tab**: single-purpose statement + per-permission justifications — all text ready in `frontend/docs/PERMISSION_JUSTIFICATIONS.md`; privacy policy URL `https://codecatch.site/`.
3. **Submit CWS listing for review** — can be done in parallel with OAuth verification or after it approves (after is lower-risk of review friction).
4. Optional pre-launch hardening: manual QA against real services (Google, Microsoft, GitHub, a segmented-input site), keyboard-event fallback for segmented libs that listen to keydown instead of input events.
5. Consider updating popup footer / store listing to link the privacy policy.

### Ongoing obligations (post-launch)
- Restricted-scope **annual reverification** by Google.
- Keep `docs/index.md` (live policy) and `frontend/docs/PRIVACY_POLICY.md` (source copy) in sync; policy promises: no server, no selling data, session-only code storage, 24h de-dup pruning, disconnect = revoke.
- Namecheap domain renewal 2027-07-06 (~standard .site renewal pricing — check it).

---

## 8. Roadmap / future ideas (explicitly deferred)
- **Monetization**: freemium (e.g., free clipboard-copy; paid auto-fill/multi-account) — `backend/` reserved for license/payments (e.g., Stripe) that must NEVER touch Gmail data.
- **Real-time push** (Gmail watch + Pub/Sub webhook) — needs a backend; would cut detection latency but v1 burst polling was deemed sufficient. Note: total latency floor includes Gmail's own delivery pipeline (a few seconds) — "instant" isn't physically achievable by polling faster; this was explained to and accepted by the user.
- **Outlook/other providers**; provider-agnostic IMAP rejected for v1 (credential trust burden).
- Possible custom-domain email for support later (currently tehmanhassan@gmail.com everywhere).

---

## 9. Reusable copy (already written, don't rewrite from scratch)

**CWS description (drafted):**
> Never dig through your inbox for a verification code again. CodeCatch watches your Gmail for one-time codes and instantly copies them to your clipboard, shows them in a quick on-page notification, and can auto-fill them directly into the sign-in or verification field you're using — no switching tabs, no typing.
>
> • Works automatically — detects code-entry fields on the page you're on, no setup per site
> • Auto-fill, auto-copy, and notifications can each be turned on or off
> • Privacy-first: your Gmail data never leaves your browser. There's no backend server — the extension talks directly to Gmail using your own Google sign-in, and nothing is ever stored beyond a short-lived local cache used only to avoid re-detecting the same email.
>
> Disconnect anytime from the extension's popup — this revokes access immediately.

**Scope justification (used in Data Access, keep consistent):**
> This is the narrowest available Gmail scope that still includes message body content — the extension needs to read the body/snippet of recent emails to find a verification code, which the more restrictive `gmail.metadata` scope does not expose. No email is ever modified, sent, or deleted; the scope is used read-only, and no email content is ever stored beyond the process of extracting a short code, which is discarded from memory shortly after detection.

**No-server statement (verification "Additional info"):**
> CodeCatch has no backend server — all Gmail API access happens directly from the browser extension using Chrome's built-in `chrome.identity` API for OAuth, with no server-side component that ever touches user data. There is no server through which restricted-scope data passes.

Per-permission justifications: see `frontend/docs/PERMISSION_JUSTIFICATIONS.md` (host permissions, identity, storage, alarms, notifications, clipboardWrite).

---

## 10. Gotchas & lessons learned (read before "fixing" things)

1. **Don't remove the `key` from the manifest** — it's what keeps dev ID == store ID == OAuth Item ID. Only the historical first upload needed it absent.
2. **`gmail.metadata` cannot replace `gmail.readonly`** — metadata excludes body/snippet content; codes live in bodies.
3. **MV3 timers**: `setInterval` in the worker only survives during an open burst port; `chrome.alarms` min ~30s in packed builds (1-min coarse is safe); don't "optimize" burst into an alarm.
4. **`chrome.action.openPopup()`**: fine without a user gesture on Chrome 127+ (was policy-only 118–126); keep the try/catch.
5. **Clipboard**: `clipboardWrite` lets content scripts write without a gesture on secure contexts; http: pages use the execCommand fallback.
6. **Autofill must use the native value setter + dispatched `InputEvent`** or React/Vue forms won't register the value. Segmented groups: per-char native set + focus last box.
7. **Segmented detection before single-field detection** in whole-page scans — otherwise an `autocomplete="one-time-code"` field elsewhere starves the 6-box group (was a real bug).
8. **Phone-glue regex is digit-anchored** (`\d[-.]$` / `^[-.]\d`) — loosening it re-breaks "code is 482913." (was a real bug).
9. **github.io URL-prefix Search Console verification does NOT satisfy Google Cloud branding verification** — that's why codecatch.site exists. Keep the Domain-type property.
10. **fontsource latin-only imports** — full imports triple the bundle.
11. WXT scaffolding: `npx wxt init` (there is no `create-wxt` npm initializer).
12. Chrome DevTools for the worker: chrome://extensions → "service worker" link; popup and content script each have their own consoles — check the right one.
13. The extractor is **pure** — extend it with tests first (`otp-extractor.test.ts`), wire after.

---

## 11. Session-restart quickstart

1. Read this file.
2. `cd "d:\OTP Extension" && git status && git log --oneline -5` — confirm clean tree and see latest work.
3. Check with the user: **did OAuth verification get submitted, and has Google responded?** That gates most next steps.
4. If continuing dev: `cd frontend && npm install && npm run dev`, load `.output/chrome-mv3-dev` unpacked, confirm ID is `fjfaaefhmkdiebabpgkdpplcbjmlpmag`.
5. Next concrete deliverables, in priority order: (a) confirm verification submitted; (b) screenshots for CWS; (c) fill CWS privacy-practices tab from `PERMISSION_JUSTIFICATIONS.md`; (d) submit listing for review; (e) real-world QA pass.
