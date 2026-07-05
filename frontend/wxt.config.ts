import { defineConfig } from 'wxt';
import fs from 'node:fs';
import path from 'node:path';

// Pinned so the extension ID stays stable across dev/build/reload —
// required for the Google Cloud OAuth client (type "Chrome Extension")
// to keep working. Private key lives in keys/extension-key.pem (gitignored).
//
// Chrome Web Store rejects a manually-set `key` on an item's very first
// upload (it assigns its own), so `SKIP_MANIFEST_KEY=1 npm run zip` produces
// a keyless build for that one-time draft upload. Every other build keeps
// the pinned key so local dev/testing has a stable ID.
const publicKeyPath = path.resolve(__dirname, 'keys/extension-public-key.b64.txt');
const extensionPublicKey =
  !process.env.SKIP_MANIFEST_KEY && fs.existsSync(publicKeyPath)
    ? fs.readFileSync(publicKeyPath, 'utf8').trim()
    : undefined;

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'CodeCatch',
    description:
      'Automatically detects and fills one-time verification codes from Gmail into web forms.',
    key: extensionPublicKey,
    permissions: ['identity', 'storage', 'alarms', 'notifications', 'clipboardWrite'],
    // *.googleapis.com covers both www.googleapis.com (Gmail API) and
    // oauth2.googleapis.com (token revocation on disconnect).
    host_permissions: ['https://*.googleapis.com/*', 'http://*/*', 'https://*/*'],
    oauth2: {
      client_id: '510126417367-0sfs6ab8e9uq61n50dcck11eqvu9niep.apps.googleusercontent.com',
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    },
  },
});
