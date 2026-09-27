# emcs-dashboard
## 2FA (TOTP) Setup

Environment variables required in Vercel:
- `MASTER_PASSWORD` (or `APP_PASSWORD`) — dashboard login password
- `SESSION_SECRET` — cookie signing secret
- `TURSO_URL` / `TURSO_AUTH_TOKEN` — database
- `TOTP_SECRET` — 32-char base32 secret for 2FA (created below)

To enable 2FA:
1. Open the dashboard login page, enter your password, click **Setup 2FA**.
2. Scan the QR code (or type the secret) into Google Authenticator / Authy / 1Password.
3. Enter the current 6-digit code and click **Verify and Enable 2FA**.
4. Copy the displayed secret into Vercel → Settings → Environment Variables as `TOTP_SECRET`, then redeploy.
5. The login screen will now show the "6-digit 2FA code" box (it polls `/api/totp-status`). Logins are blocked (fail-closed) until `TOTP_SECRET` is set.
