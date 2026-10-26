"""scripts/check_schema.py: the read-only "what would a boot change?" report."""
import os
import unittest
import warnings
from unittest import mock

from sqlalchemy import text
from sqlalchemy.exc import SAWarning
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

import addons  # noqa: F401
from scripts import check_schema


def fresh_engine():
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", SAWarning)
        SQLModel.metadata.create_all(e)
    return e


class CheckSchema(unittest.TestCase):
    def test_an_up_to_date_database_has_nothing_to_do(self):
        r = check_schema.check(fresh_engine())
        self.assertEqual((r["missing_tables"], r["missing_columns_auto"], r["missing_columns_manual"]), ([], [], []))

    def test_old_databases_are_described_without_being_changed(self):
        e = fresh_engine()
        with e.begin() as c:
            c.execute(text("DROP TABLE tenant_assets"))
            c.execute(text("ALTER TABLE follow_ups DROP COLUMN overdue_notified_at"))      # has an ALTER in the boot code
            c.execute(text("ALTER TABLE tenant_features DROP COLUMN config"))               # has none
            c.execute(text("CREATE TABLE legacy_junk (id INTEGER)"))
        before = sorted(r[0] for r in e.connect().execute(text("select name from sqlite_master")))
        r = check_schema.check(e)
        self.assertEqual(r["missing_tables"], ["tenant_assets"])
        self.assertEqual(r["missing_columns_auto"], ["follow_ups.overdue_notified_at"])
        self.assertEqual(r["missing_columns_manual"], ["tenant_features.config"])
        self.assertIn("legacy_junk", r["unknown_tables"])
        after = sorted(r2[0] for r2 in e.connect().execute(text("select name from sqlite_master")))
        self.assertEqual(before, after, "the check must not change the database")

    def test_the_command_line_reports_and_sets_the_exit_code(self):
        self.assertEqual(check_schema.main(["--url-env", "NOT_SET_ANYWHERE"]), 2)
        with mock.patch.dict(os.environ, {"CHECK_URL": "sqlite:///does-not-exist-dir/x/y.db"}):
            self.assertEqual(check_schema.main(["--url-env", "CHECK_URL"]), 2)
        eng = fresh_engine()
        with mock.patch("scripts.check_schema.create_engine", return_value=eng), mock.patch.dict(os.environ, {"CHECK_URL": "sqlite://"}):
            self.assertEqual(check_schema.main(["--url-env", "CHECK_URL"]), 0)
            with eng.begin() as c:
                c.execute(text("ALTER TABLE tenant_features DROP COLUMN config"))
            self.assertEqual(check_schema.main(["--url-env", "CHECK_URL"]), 1)


if __name__ == "__main__":
    unittest.main()
