"""Shared fixture: three tenants (1 = owner, 2, 3), each with one Admin, one lead and one client."""
import unittest

from sqlmodel import Session, select

from tests import _support as S
from database import Tenant, User, Lead, ClientProfile


class TenantIsolationBase(unittest.TestCase):
    def setUp(self):
        S.reset_db()
        self.client = S.main_client(self)
        self.main = S.load_main()
        with Session(S.ENGINE) as s:
            for tid, name in ((1, "owner"), (2, "alpha"), (3, "beta")):
                s.add(Tenant(id=tid, name=name))
            s.commit()
            self.users, self.leads, self.clients = {}, {}, {}
            for tid in (1, 2, 3):
                u = User(email=f"admin{tid}@t{tid}.test", password="x", name=f"Admin {tid}",
                         role="Admin", tenant_id=tid)
                s.add(u)
                s.commit()
                s.refresh(u)
                self.users[tid] = u.id
                lead = Lead(company_name=f"Lead of {tid}", email=f"lead{tid}@x.test", tenant_id=tid, owner_id=u.id)
                cp = ClientProfile(companyName=f"Client of {tid}", tenant_id=tid)
                s.add(lead)
                s.add(cp)
                s.commit()
                s.refresh(lead)
                s.refresh(cp)
                self.leads[tid] = lead.id
                self.clients[tid] = cp.id

    def as_tenant(self, tid):
        return {"X-User-ID": str(self.users[tid])}

    def lead_row(self, tid):
        """Ground truth read that bypasses the tenant filter (and any tenant context set by the test)."""
        with Session(S.ENGINE) as s:
            return s.exec(select(Lead).where(Lead.id == self.leads[tid]).execution_options(skip_tenant=True)).first()

    def client_row(self, tid):
        with Session(S.ENGINE) as s:
            return s.exec(select(ClientProfile).where(ClientProfile.id == self.clients[tid])
                          .execution_options(skip_tenant=True)).first()




def brand_as_dapros(session, tenant_id=1):
    """Make a tenant behave like the DaPros deployment: the design-agency preset with the DaPros brand."""
    from modules import presets, tenant_settings
    tenant_settings.invalidate()
    presets.apply_preset(session, tenant_id, "design-agency", {"brand_name": "DaPros"})
