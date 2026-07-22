from database import engine, SQLModel
from sqlalchemy import text

def fix_db():
    print("Creating tables...")
    SQLModel.metadata.create_all(engine)
    print("Tables created.")
    
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN sidebar_preferences JSON;"))
            conn.commit()
            print("Added sidebar_preferences to users.")
        except Exception as e:
            print("Failed to alter users table (maybe column already exists or syntax differs):", e)

if __name__ == "__main__":
    fix_db()
