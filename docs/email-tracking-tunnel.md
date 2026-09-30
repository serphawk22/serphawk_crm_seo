# Local email tracking through Cloudflare

The email sender uses `PUBLIC_BASE_URL` from `.env` to construct
`/webhook/track-email-open?id=<sent-email-id>`. SMTP settings do not change.

## Why ngrok's free warning cannot be fixed in FastAPI

ngrok's [ERR_NGROK_6024 documentation](https://ngrok.com/docs/errors/err_ngrok_6024)
lists three options: the **incoming request** header `ngrok-skip-browser-warning`,
a nonstandard incoming User-Agent, or a paid plan. The
[agent configuration](https://ngrok.com/docs/gateway/agent/config/v3) and
[CLI reference](https://ngrok.com/docs/gateway/agent/cli) provide no supported
free-account switch to disable the interstitial for all clients.

An email `<img>` cannot set Gmail's proxy request headers. Adding the bypass as
a query parameter or response header does not supply that incoming header.
A FastAPI change cannot affect requests intercepted before reaching the app.
Authenticating a free ngrok account does not remove the warning.

## Windows setup

Run from `Scmhub_Crm`. Download Cloudflare's official executable once (the
launcher expects the project-local copy):

```powershell
New-Item -ItemType Directory -Force .local\tunnel | Out-Null
curl.exe --fail --location https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe --output .local\tunnel\cloudflared.exe
```

Keep the existing backend running on port 8000, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-email-tunnel.ps1
```

The launcher starts a hidden background tunnel, waits for its HTTPS URL, and
verifies that browser and GoogleImageProxy User-Agents both receive a 1x1 GIF.
It probes ID 0, which is not a real sent email. Only after successful verification
does it update `PUBLIC_BASE_URL` in `.env`. It uses HTTP/2 for the tunnel transport
so a network blocking QUIC/UDP does not prevent connection. Its explicit empty
config avoids interference from an existing Cloudflare named-tunnel config.

**Restart the FastAPI backend after the `.env` update**, using your usual command.
Environment variables already loaded by Python do not update when `.env` changes.
For example, from your activated virtual environment:

```powershell
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Send a new test email through your normal app flow and open it in Gmail. Its HTML
should contain `https://<new-host>.trycloudflare.com/webhook/track-email-open?id=...`.
The local tunnel check confirms public GIF delivery; the real Gmail check also
depends on Gmail's image loading and caching. A pixel fetch is not proof that a
human read the message.

Runtime information and logs are in ignored `.local/tunnel/`. Running the
launcher again reuses the existing managed tunnel. To stop it:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-email-tunnel.ps1 -Stop
```

For manual operation without automatic configuration or verification, the
equivalent basic tunnel command is:

```powershell
.\.local\tunnel\cloudflared.exe tunnel --url http://127.0.0.1:8000
```

## Lifetime

[Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
are free and do not require an account or your own domain. They assign a random
hostname each time a new tunnel starts. Keep both the tunnel and backend running
for as long as you need to track emails containing that hostname. Updating `.env`
does not change already-sent emails, including those with the old ngrok URL.

Quick Tunnels are for development, have no uptime guarantee, allow up to 200
in-flight requests, and do not support SSE. If tracking must survive tunnel
restarts, use a named Cloudflare Tunnel with a stable hostname on a domain you
control, or another stable public deployment.
