"""Switching a module off closes the module, not only its menu entry."""
import re
from pathlib import Path

from sqlmodel import Session

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from modules import features

ROUTES_TS = Path(__file__).resolve().parent.parent / "frontend" / "src" / "lib" / "moduleRoutes.ts"
PRIVATE_APIS = {"work_queue": "/work-queue", "task_sheet": "/task-sheet", "meetings": "/meetings", "leaderboard": "/leaderboard"}


class ModuleApisAreClosed(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate()
        self.addCleanup(features.invalidate)

    def test_a_module_that_is_off_refuses_its_own_api_whatever_the_address(self):
        with Session(S.ENGINE) as s:
            features.set_features(s, 3, {k: False for k in PRIVATE_APIS})
        for key, path in PRIVATE_APIS.items():
            r = self.client.get(path, headers=self.as_tenant(3))
            self.assertEqual(r.status_code, 403, path)
            self.assertEqual(r.json().get("feature"), key, path)

    def test_the_same_modules_stay_open_for_a_company_that_has_them(self):
        for path in PRIVATE_APIS.values():
            self.assertNotEqual(self.client.get(path, headers=self.as_tenant(2)).status_code, 403, path)

    def test_other_companies_modules_are_not_affected(self):
        with Session(S.ENGINE) as s:
            features.set_features(s, 3, {k: False for k in PRIVATE_APIS})
        for path in PRIVATE_APIS.values():
            self.assertNotEqual(self.client.get(path, headers=self.as_tenant(2)).status_code, 403, path)

    def test_switching_a_module_off_and_on_again_takes_effect_at_once(self):
        path = "/task-sheet"
        for enabled, expect_blocked in ((False, True), (True, False), (False, True), (True, False)):
            with Session(S.ENGINE) as s:
                features.set_features(s, 3, {"task_sheet": enabled})
            blocked = self.client.get(path, headers=self.as_tenant(3)).status_code == 403
            self.assertEqual(blocked, expect_blocked, f"task_sheet enabled={enabled}")
            self.assertEqual(self.client.get("/me/features", headers=self.as_tenant(3)).json()["features"]["task_sheet"], enabled)

    def test_the_more_specific_rule_wins(self):
        f = features.feature_for_path
        self.assertEqual(f("/meetings/history"), "meeting_history")      # not "meetings"
        self.assertEqual(f("/meetings"), "meetings")
        self.assertEqual(f("/deals/3/negotiations"), "finance_suite")    # an id-pattern beats a plain prefix
        self.assertEqual(f("/deals/3/proposals"), "proposals_portal")
        self.assertEqual(f("/reports/ai/generate"), "ai_reports")
        self.assertEqual(f("/me/timezone"), None)

    def test_shared_data_endpoints_are_deliberately_not_gated(self):
        # the dashboard, lead research, the calls bar, the developer dashboard and the analytics pages read these
        for path in ("/clients", "/clients/5/research", "/contacts", "/deals", "/projects", "/calls", "/reports/summary", "/users"):
            self.assertIsNone(features.feature_for_path(path), path)


class PageTableMatchesTheRegistry(TenantIsolationBase):
    """frontend/src/lib/moduleRoutes.ts must only name real modules, or a typo would silently leave a page open."""

    def test_every_module_named_for_a_page_exists(self):
        text = ROUTES_TS.read_text(encoding="utf8")
        table = text[text.index("PAGE_MODULES"):text.index("export function moduleForPath")]
        named = set(re.findall(r'\["/[^"]+",\s*"([a-z_]+)"\]', table))
        self.assertGreater(len(named), 25)
        self.assertEqual(named - set(features.FEATURES), set())

    def test_no_page_prefix_is_listed_twice_with_different_modules(self):
        text = ROUTES_TS.read_text(encoding="utf8")
        pairs = re.findall(r'\["(/[^"]+)",\s*"([a-z_]+)"\]', text[text.index("PAGE_MODULES"):text.index("export function moduleForPath")])
        seen = {}
        for prefix, key in pairs:
            self.assertEqual(seen.setdefault(prefix, key), key, prefix)
