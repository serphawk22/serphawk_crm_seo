"""Runs last (the name sorts after every other test module)."""
import threading
import unittest


class NoStrayThreads(unittest.TestCase):
    def test_scheduled_database_and_mail_threads_are_not_started(self):
        forbidden = {"db-keepalive", "inbox-sync", "reply-checker", "followup-scheduler"}
        self.assertTrue(forbidden.isdisjoint(t.name for t in threading.enumerate()))
