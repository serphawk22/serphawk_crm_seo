# The AI voice agent in production

The voice agent dials through Twilio and answers the prospect live. Twilio fetches the TwiML of
every call from a **public HTTPS URL** that this backend owns, so the single most important
setting of the whole feature is *which URL Twilio is told to use*.

---

## The one setting that matters

| Variable | What it is | Production value |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | The app's own public URL (email tracking pixels use it too) | `https://crmbackend.serphawk.in` |
| `VOICE_AGENT_BASE_URL` | Overrides the above **for the voice agent only** | `https://crmbackend.serphawk.in` (or unset) |
| `NEXT_PUBLIC_API_BASE_URL` | The backend the **frontend** calls (Vercel) | `https://crmbackend.serphawk.in` |

Locally, `VOICE_AGENT_BASE_URL` points at an ngrok tunnel, because Twilio cannot reach
`127.0.0.1`:

```env
# .env (local development only)
PUBLIC_BASE_URL="http://localhost:8000"
VOICE_AGENT_BASE_URL="https://<your-subdomain>.ngrok-free.dev"
```

> **Never copy the local `.env` into a deployment.** A developer's tunnel URL outlives the
> tunnel, and the voice agent then points Twilio at a server that no longer serves the app.

The backend loads the `.env` file only on a developer machine (`modules/runtime_env.py`). In a
deployment the file is ignored and the platform's environment variables are the only source of
truth, so a stray file can never shadow production configuration.

---

## The pre-call check

Before every call the backend verifies the base URL it is about to use:

1. it requests `{base}/voice-agent/options` on the candidate URL;
2. a healthy answer (**401** - the route exists, a login is required) means the URL serves this
   app and is accepted;
3. **404** (or an HTML page, or a dead tunnel) means it does not, and the candidate is skipped;
4. the first candidate that works is used for every webhook and audio URL of that call.

Candidates are tried in this order:

1. `VOICE_AGENT_BASE_URL`
2. `PUBLIC_BASE_URL`
3. the address the deployment itself answers on (taken from the incoming request)

So a stale `VOICE_AGENT_BASE_URL` can no longer break the voice agent for good - it is skipped
automatically and the next candidate takes over. **If no candidate works the call is still
refused**: the check is never bypassed, it only stops pointing at the wrong server.

The base that was verified is stored on the call record (`context.public_base`), so all the
webhook and audio URLs of a running call keep pointing at the same working server even if the
configuration changes mid-call.

### Reading the result

`GET /voice-agent/options` reports the state:

```json
{
  "twilio": {
    "ready": true,
    "missing": [],
    "webhook_base": "https://crmbackend.serphawk.in",
    "webhook_problem": null
  }
}
```

`webhook_problem` is `null` when everything is fine; otherwise it explains what is wrong (which
URL failed and why). The "Pre-call check failed" banner in the UI shows that text, and the
frontend re-checks every few seconds so the warning disappears on its own once the tunnel is
back.

---

## The webhook URLs Twilio calls

The app passes all of them per call, so the Twilio number's own default webhook is never used
for outbound calls:

| Twilio parameter | URL |
| --- | --- |
| `Url` (the TwiML) | `{base}/voice-agent/twilio/answer/{call_id}?t={token}` |
| `StatusCallback` | `{base}/voice-agent/twilio/status/{call_id}?t={token}` |
| `RecordingStatusCallback` | `{base}/voice-agent/twilio/recording/{call_id}?t={token}` |
| `<Play>` audio | `{base}/static/audio/....mp3` |

Every webhook is authenticated by the per-call `webhook_token` in the query string. Set
`TWILIO_VALIDATE_WEBHOOKS=true` to additionally verify Twilio's `X-Twilio-Signature` (the
signature is computed over the URL built from the **call's** base, so it always matches).

> The Twilio number `+18158890425` has a Vapi.ai URL configured for **inbound** calls. That is
> unrelated to this feature: outbound calls carry their own `Url`.

---

## Checklist for a deployment

- [ ] `PUBLIC_BASE_URL` = the deployed backend URL (no trailing slash needed)
- [ ] `VOICE_AGENT_BASE_URL` = the same URL, or not set at all
- [ ] `NEXT_PUBLIC_API_BASE_URL` (Vercel) = the deployed backend URL
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VOICE_NUMBER`/`TWILIO_PHONE_NUMBER` set
- [ ] `GET {base}/voice-agent/options` answers **401** without a token (the route exists)
- [ ] `GET /voice-agent/options` with a session token reports `webhook_problem: null`
- [ ] `GET {base}/voice-agent/openapi.json` lists every `/voice-agent/twilio/...` route
