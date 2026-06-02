from database import engine
from sqlalchemy import text

def fix():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP"))
            conn.commit()
            print("Successfully added updated_at column to users table.")
        except Exception as e:
            print("Failed to alter table:", e)

if __name__ == "__main__":
    fix()
