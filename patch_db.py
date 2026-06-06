from database import engine
from sqlalchemy import text

try:
    with engine.begin() as conn:
        conn.execute(text('ALTER TABLE client_profiles ADD COLUMN "projectId" INTEGER;'))
    print("Successfully added projectId to client_profiles")
except Exception as e:
    print(f"Error: {e}")
