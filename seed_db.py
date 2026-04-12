import hashlib
from database import engine, User, Session, create_db_and_tables
from sqlmodel import select

def _hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def seed_admin():
    create_db_and_tables()
    
    with Session(engine) as session:
        statement = select(User).where(User.email == "admin@example.com")
        existing_admin = session.exec(statement).first()
        
        if not existing_admin:
            admin = User(
                email="admin@example.com",
                password=_hash_password("Admin@123"),
                name="System Admin",
                role="Admin"
            )
            session.add(admin)
            session.commit()
            print("✅ Admin user created successfully!")
            print("   Email: admin@example.com")
            print("   Password: Admin@123")
        else:
            print("⚠️ Admin user already exists.")

if __name__ == "__main__":
    seed_admin()
