# Privacy Policy — CodeCatch

**Last updated:** July 5, 2026

CodeCatch ("the extension") helps you sign in and verify accounts faster by detecting one-time verification codes in your Gmail inbox and filling them into the web page you're on.

## What data we access

With your explicit permission (via Google's sign-in and consent screen), the extension requests read-only access to your Gmail account (the `gmail.readonly` scope) so it can look at recently received messages and find verification codes.

## What we do with it

- The extension looks only at the **subject and body** of recent messages, searching for text that looks like a one-time code (a short run of digits/letters near a word like "code," "verification," or "OTP").
- When a likely code is found, the extension can: copy it to your clipboard, show it in a small on-page notification, and/or fill it directly into a code-entry field on the page you're viewing — according to the settings you choose in the extension's popup.

## Where your data goes

**Nowhere but your own browser.** This extension has no backend server. All Gmail access happens directly between your browser and Google's servers, using a token that Google's own browser API (`chrome.identity`) manages — we never see, store, or transmit that token ourselves, and no email content is ever sent to any server we control, because no such server exists.

## What we store, and for how long

- **On disk (`chrome.storage.local`), until you disconnect:** a sync checkpoint (Gmail's `historyId`), a short-lived list of message IDs already checked (auto-pruned after 24 hours, used only to avoid re-processing the same email), your connected account's email address (for display), and your feature preferences (auto-fill/auto-copy/notifications on or off).
- **In memory only (`chrome.storage.session`), cleared when the browser closes, and auto-expired after 10 minutes regardless:** the most recently detected code, so the popup can show it to you.
- **Never stored:** full email bodies, raw Gmail API responses, or any OAuth token beyond what Chrome's own identity system already manages internally.

## Third parties

We do not sell, rent, share, or transmit your data to any third party, advertiser, or analytics service. The only external service the extension talks to is the Gmail API itself, directly, on your behalf.

## Your control

You can disconnect your Gmail account at any time from the extension's popup — this revokes the extension's access token with Google and clears all locally stored account data (preferences are kept so you don't have to reconfigure the extension if you reconnect later).

## Compliance

CodeCatch's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Contact

Questions about this policy or the extension's data handling can be sent to: [tehmanhassan@gmail.com](mailto:tehmanhassan@gmail.com)
