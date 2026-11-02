from sqlmodel import Session
from tests import _support as S
from tests._fixtures import TenantIsolationBase
from modules import features


class HomeModules(TenantIsolationBase):
    def test_overviews_can_be_enabled_independently(self):
        self.addCleanup(features.invalidate)
        for dashboard, command in ((True, False), (False, True), (True, True), (False, False)):
            with self.subTest(dashboard=dashboard, command=command):
                with Session(S.ENGINE) as session:
                    features.set_features(session, 2, {"dashboard": dashboard, "command_center": command})
                headers = self.as_tenant(2)
                config = self.client.get('/me/features', headers=headers).json()['features']
                self.assertEqual(config['dashboard'], dashboard)
                self.assertEqual(config['command_center'], command)
                self.assertEqual(self.client.get('/dashboard-stats', headers=headers).status_code, 200 if dashboard else 403)
                self.assertEqual(self.client.get('/command-center/overview', headers=headers).status_code, 200 if command else 403)
