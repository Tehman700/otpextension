# Permission Justifications — for Chrome Web Store "Privacy practices" tab

Chrome Web Store requires a specific (non-generic) justification per requested permission. Use these as the starting text for that form.

## Single purpose description

Detects one-time verification codes in the user's Gmail inbox and fills them into web forms, so the user never has to manually switch to their email to find a code.

## Host permissions (`http://*/*`, `https://*/*`)

This extension fills verification codes into whatever website the user happens to be signing into — which site that is can't be known in advance. Broad host access is used only to: (1) detect a code-entry field already present on the page (via DOM inspection, no data is read from the page otherwise) and (2) fill a code into that field once one is found via Gmail. No page content is read, stored, or transmitted anywhere; the extension only ever writes a short numeric/alphanumeric code into a field it has identified as a one-time-code input.

## `identity`

Used to obtain an OAuth access token for the user's own Gmail account via Chrome's built-in sign-in flow (`chrome.identity`), so the extension can request `gmail.readonly` access. No credentials are ever seen or stored by the extension itself — Chrome manages the token.

## `storage`

Stores the user's feature preferences (auto-fill/auto-copy/notifications on or off), a Gmail sync checkpoint, and a short-lived list of already-processed message IDs (to avoid re-detecting the same email) — all locally on the user's device. No email content is stored.

## `alarms`

Used to periodically check Gmail for new verification codes (about once a minute) even when the user isn't actively on a page with a code field, so a system notification can be shown when a new code arrives.

## `notifications`

Used to show a system notification when a new verification code is detected, so the user notices it even if they're not currently looking at the tab where they'll use it.

## `clipboardWrite`

Used to copy a detected verification code to the clipboard automatically, since the code arrives asynchronously (by email) rather than in response to a user click — this is why the copy can't simply happen inside a click handler.

## OAuth scope: `https://www.googleapis.com/auth/gmail.readonly`

This is the narrowest available Gmail scope that still includes message body content — the extension needs to read the body/snippet of recent emails to find a verification code, which the more restrictive `gmail.metadata` scope does not expose. No email is ever modified, sent, or deleted; the scope is used read-only, and no email content is ever stored beyond the process of extracting a short code, which is discarded from memory shortly after detection.
