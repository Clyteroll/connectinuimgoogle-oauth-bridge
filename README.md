# Google OAuth Bridge for Bubble (Next.js)

This project is a small Next.js App Router API bridge for Google OAuth, designed to send Google profile details into a Bubble SSO-style endpoint.

## Routes

- `GET /api/auth/google/start?user_id=<bubble-user-id>&return_to=<encoded-url>`
  - Redirects to Google OAuth with state that includes:
    - Bubble user id
    - Optional `return_to` URL (for returning users to test branch/page)
    - Any extra query params on `/start` (restored on callback redirect)
- `GET /api/auth/google/callback`
  - Exchanges `code` for token, fetches Google user info, then redirects to Bubble.
- `POST /api/auth/google/revoke`
  - Revokes a Google access token or refresh token using Google revoke API.

Example `return_to`:

`https://connectiumai.com/version-test/sso_sample_login`

Example revoke request:

```bash
curl -X POST "https://connectinuimgoogle-oauth-bridge.vercel.app/api/auth/google/revoke" \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_GOOGLE_ACCESS_OR_REFRESH_TOKEN"}'
```

Callback redirect now also includes:

- `google_access_token`
- `google_refresh_token` (when Google returns one)
- `google_first_name` (when available)
- `google_last_name` (when available)
- `google_full_name` (when available)
- `google_photo` (when available)
- `google_verified`
- `google_company` (Google Workspace domain via `hd`, otherwise email domain)

## Required Environment Variables

Create `.env.local` for local development:

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
BUBBLE_APP_URL=https://your-bubble-app-domain
```

For production on Vercel, set the same variables in **Project Settings -> Environment Variables**.

## Security Notes

- Never commit real secret values to GitHub.
- Keep real values only in:
  - local `.env.local` (ignored)
  - Vercel Environment Variables
  - GitHub Secrets (only if needed for GitHub Actions)

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Google OAuth Redirect URI

Your Google OAuth app must include the callback URI exactly:

- Local: `http://localhost:3000/api/auth/google/callback`
- Production: `https://connectinuimgoogle-oauth-bridge.vercel.app/api/auth/google/callback`
