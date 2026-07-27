# Updater signing keys

Updater private keys are generated locally in this directory and ignored by Git.
Store the contents of `lightmarkit.key` in the GitHub Actions secret
`TAURI_SIGNING_PRIVATE_KEY`. The current key has no password, so
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` can be left unset. If the key is rotated
to a password-protected key, configure that password secret as well.

The matching public key is embedded in `src-tauri/tauri.conf.json`.

The release workflow rewrites both `latest.json` and installer downloads to
use `gh-proxy.com`. Package authenticity does not rely on the mirror because
the updater verifies every downloaded installer against the embedded public
key before installation.

Keep a secure backup of the private key. Losing it prevents installed clients
from trusting future updater packages.
