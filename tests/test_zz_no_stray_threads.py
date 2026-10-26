"""Runs last (the name sorts after every other test module). A background ping thread would share the tests' single
in-memory connection and roll back whatever the running test is saving: an intermittent "could not refresh instance"
error that only shows up on a slow machine."""
import os
import threading
import unittest


class NoStrayThreads(unittest.TestCase):
    def test_the_database_ping_thread_is_off_in_tests(self):
        self.assertEqual(os.environ.get("DB_KEEPALIVE"), "0")
        self.assertEqual([t.name for t in threading.enumerate() if t.name == "db-keepalive"], [])
