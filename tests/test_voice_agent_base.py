"""
The AI voice agent's public webhook base (the URL Twilio fetches its TwiML from).

Production incident this guards against: the deployment's VOICE_AGENT_BASE_URL still pointed at a
developer's local ngrok tunnel, so the pre-call check answered "HTTP 404 - that address does not
serve this app's voice-agent routes" and every call was refused.

The rules under test:

* a configured base is only used after it has been VERIFIED to serve this app's routes;
* a stale base (a dead tunnel) is skipped in favour of one that works - it never breaks the
  voice agent for good;
* when NO base works the pre-call check still fails (it is never bypassed);
* the base a call was dialed with is kept on the call, so every webhook and audio URL of that
  call keeps pointing at the same working server.
"""
import os
import unittest
from unittest import mock

from tests import _support as S  # noqa: F401  (points the app at an in-memory database)

from modules import public_url
from modules import voice_agent as va


def _reset_base_state():
    va._RESOLVED_BASE.update({"base": None, "at": 0.0})
    va._VOICE_BASE_PROBE.update({"base": None, "problem": "", "at": 0.0})


def _fake_probe(results):
    """A probe that answers per base URL: results maps a base to (problem, retryable)."""
    calls = []

    def _probe(base):
        calls.append(base)
        return results.get(base, (None, False))

    return _probe, calls


class VoiceAgentBaseUrl(unittest.TestCase):
    def setUp(self):
        self._env = {k: os.environ.get(k) for k in ("VOICE_AGENT_BASE_URL", "PUBLIC_BASE_URL")}
        for key in self._env:
            os.environ.pop(key, None)
        public_url.set_request_base("")
        _reset_base_state()

    def tearDown(self):
        for key, value in self._env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        public_url.set_request_base("")
        _reset_base_state()

    def test_a_stale_base_is_skipped_for_one_that_serves_the_app(self):
        os.environ["VOICE_AGENT_BASE_URL"] = "https://dead-tunnel.ngrok-free.dev"
        os.environ["PUBLIC_BASE_URL"] = "https://crm.example.com/"
        # The request reached this deployment through its own public address.
        public_url.set_request_base("https://crm.example.com")
        probe, calls = _fake_probe({
            "https://dead-tunnel.ngrok-free.dev": ("does not serve this app's voice-agent routes (HTTP 404)", False),
        })
        with mock.patch.object(va, "_probe_webhook_base", side_effect=probe):
            self.assertIsNone(va.voice_base_problem(force=True))
        self.assertEqual(calls, ["https://dead-tunnel.ngrok-free.dev", "https://crm.example.com"])
        # The healthy base is the one every webhook URL is built from.
        self.assertEqual(va.public_base(), "https://crm.example.com")
        self.assertEqual(va.twilio_config()["public_base"], "https://crm.example.com")

    def test_the_pre_call_check_still_fails_when_no_base_works(self):
        os.environ["VOICE_AGENT_BASE_URL"] = "https://dead-tunnel.ngrok-free.dev"
        public_url.set_request_base("https://crm.example.com")
        probe, calls = _fake_probe({
            "https://dead-tunnel.ngrok-free.dev": ("does not serve this app's voice-agent routes (HTTP 404)", False),
            "https://crm.example.com": ("does not serve this app's voice-agent routes (HTTP 404)", False),
        })
        with mock.patch.object(va, "_probe_webhook_base", side_effect=probe):
            problem = va.voice_base_problem(force=True)
        self.assertTrue(problem)
        self.assertIn("HTTP 404", problem)
        self.assertEqual(calls, ["https://dead-tunnel.ngrok-free.dev", "https://crm.example.com"])
        # Nothing works, so no base is advertised for the webhook URLs.
        self.assertIsNone(va._RESOLVED_BASE["base"])

    def test_a_url_of_another_installation_is_never_used(self):
        # A developer's .env carries the production URL while running locally: falling back to
        # it would send Twilio to a server that does not hold this call's state.
        os.environ["PUBLIC_BASE_URL"] = "https://crm.example.com"
        probe, calls = _fake_probe({})
        with mock.patch.object(va, "_probe_webhook_base", side_effect=probe):
            problem = va.voice_base_problem(force=True)
        self.assertTrue(problem)
        self.assertEqual(calls, [])
        self.assertIsNone(va._RESOLVED_BASE["base"])

    def test_the_deployment_own_address_is_used_when_nothing_is_configured(self):
        public_url.set_request_base("https://crm.example.com")
        probe, calls = _fake_probe({})
        with mock.patch.object(va, "_probe_webhook_base", side_effect=probe):
            self.assertIsNone(va.voice_base_problem(force=True))
        self.assertEqual(calls, ["https://crm.example.com"])
        self.assertEqual(va.public_base(), "https://crm.example.com")

    def test_the_tunnel_override_is_used_even_without_a_public_request_address(self):
        # Local development: the app runs on 127.0.0.1 and Twilio reaches it through the tunnel.
        os.environ["VOICE_AGENT_BASE_URL"] = "https://tunnel.ngrok-free.dev"
        probe, calls = _fake_probe({})
        with mock.patch.object(va, "_probe_webhook_base", side_effect=probe):
            self.assertIsNone(va.voice_base_problem(force=True))
        self.assertEqual(calls, ["https://tunnel.ngrok-free.dev"])
        self.assertEqual(va.public_base(), "https://tunnel.ngrok-free.dev")

    def test_a_loopback_address_is_never_used_as_the_webhook_base(self):
        # The local development server must be reached through the tunnel, never through
        # 127.0.0.1 - Twilio cannot fetch that.
        self.assertEqual(public_url.from_request({"host": "127.0.0.1:8000"}), "")
        self.assertEqual(public_url.from_request({"host": "localhost:8000"}), "")
        self.assertEqual(public_url.from_request({"host": "crm.example.com"}), "https://crm.example.com")
        self.assertEqual(
            public_url.from_request({"host": "crm.example.com", "x-forwarded-proto": "https"}),
            "https://crm.example.com")

    def test_a_call_keeps_the_base_it_was_dialed_with(self):
        from routers import voice_agent as rva

        class _Call:
            context = {"public_base": "https://crm.example.com"}

        self.assertEqual(rva._call_base(_Call()), "https://crm.example.com")
        # Without a stored base the verified deployment base is used.
        os.environ["PUBLIC_BASE_URL"] = "https://other.example.com"
        self.assertEqual(rva._call_base(None), "https://other.example.com")

    def test_hook_and_audio_urls_use_the_verified_base(self):
        from routers import voice_agent as rva

        class _Call:
            id = 7
            webhook_token = "abc"
            context = {"public_base": "https://crm.example.com"}

        call = _Call()
        self.assertEqual(
            rva._hook_url(call, "answer"),
            "https://crm.example.com/voice-agent/twilio/answer/7?t=abc")
        self.assertEqual(
            rva._public_audio("/static/audio/x.mp3", call),
            "https://crm.example.com/static/audio/x.mp3")


if __name__ == "__main__":
    unittest.main()
