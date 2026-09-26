from database import engine, Tenant, User
from sqlmodel import Session, select
from datetime import datetime, timezone

def fix_tenants():
    with Session(engine) as session:
        # Check if tenant 1 exists
        tenant = session.get(Tenant, 1)
        if not tenant:
            tenant = Tenant(
                id=1,
                name="Default Tenant",
                created_at=datetime.now(timezone.utc),
                is_active=True
            )
            session.add(tenant)
            session.commit()
            print("Created Default Tenant with id=1")
            
        users = session.exec(select(User)).all()
        for u in users:
            if u.role != "SuperAdmin":
                u.tenant_id = 1
                session.add(u)
        session.commit()
        print("Updated users with tenant_id=1")

if __name__ == "__main__":
    fix_tenants()
