import os
from sqlmodel import Session, SQLModel, create_engine
import bcrypt

# The user provided this URL
new_db_url = "postgresql://neondb_owner:npg_J2xABRGuH0bY@ep-square-darkness-b4fxb99v.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require"
# Adjust for SQLAlchemy psycopg2 driver
engine_url = new_db_url.replace("postgresql://", "postgresql+psycopg2://")
engine = create_engine(engine_url)

# Import models from main.py and database.py to ensure all tables are registered
# We'll just import create_db_and_tables from main
from main import create_db_and_tables, User, Tenant

def seed():
    print("Creating tables in the new database...")
    SQLModel.metadata.create_all(engine)
    print("Tables created.")

    with Session(engine) as session:
        # Create a generic admin tenant and user
        tenant = session.query(Tenant).filter(Tenant.name == "Serphawk HQ").first()
        if not tenant:
            tenant = Tenant(name="Serphawk HQ")
            session.add(tenant)
            session.commit()
            session.refresh(tenant)
            print(f"Created Tenant: {tenant.name}")

        admin_email = "admin@serphawk.com"
        admin_password = "AdminPassword123!"
        
        user = session.query(User).filter(User.email == admin_email).first()
        if not user:
            # Hash password
            salt = bcrypt.gensalt()
            hashed_pw = bcrypt.hashpw(admin_password.encode('utf-8'), salt).decode('utf-8')
            
            user = User(
                name="Generic Admin",
                email=admin_email,
                password_hash=hashed_pw,
                role="Admin",
                tenant_id=tenant.id,
                email_verified=True,
                status="Active"
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            print(f"Created Admin User: {user.email}")
            print(f"Password: {admin_password}")
        else:
            print(f"User {admin_email} already exists.")

if __name__ == "__main__":
    seed()
