from database import engine, User
from sqlmodel import Session, select, text

def wipe_database():
    with Session(engine) as session:
        # First, find all admin and sales manager IDs to preserve them
        preserved_users = session.exec(
            select(User).where(User.role.in_(['Admin', 'SalesManager']))
        ).all()
        preserved_ids = [u.id for u in preserved_users]
        
        print(f"Preserving users with IDs: {preserved_ids}")

        # Execute raw SQL with CASCADE to forcefully truncate tables 
        # PostgreSQL syntax: TRUNCATE table1, table2 CASCADE;
        # Since this is SQLite, we just execute DELETE FROM for all tables
        # But we need to disable foreign keys first in SQLite
        
        # PostgreSQL syntax: TRUNCATE table1, table2 CASCADE;
        
        # All tables to clear
        tables = [
            "client_statuses",
            "service_catalog",
            "service_requests",
            "message_threads",
            "chat_messages",
            "projects",
            "client_profiles",
            "remarks",
            "documents",
            "activity_logs",
            "companies",
            "email_logs",
            "call_logs",
            "sent_emails",
            "social_profiles",
            "seo_audits",
            "competitor_analyses",
            "ranking_tracker",
            "analytics_data",
            "tasks",
            "task_comments",
            "invoices",
            "notifications",
            "milestones",
            "nps_surveys",
            "proposals",
            "client_file_uploads",
            "keyword_rank_entries",
            "client_notes",
            "deals",
            "conversation_logs",
            "conversation_replies",
            "client_research",
            "client_tickets",
            "workspaces",
            "lighthouse_weekly_sheets",
            "workbot_conversations",
            "leave_requests",
            "weekly_progress",
            "payrolls",
            "task_sheets",
            "happy_sheets",
            "dream_projects",
            "learning_focuses",
            "personal_projects",
            "attendance"
        ]
        
        tables_str = ", ".join(tables)
        print(f"Truncating tables: {tables_str}")
        try:
            session.exec(text(f"TRUNCATE {tables_str} CASCADE;"))
        except Exception as e:
            print(f"Error truncating tables: {e}")
                
        # Now delete non-admin users
        print("Clearing non-admin users...")
        if preserved_ids:
            ids_str = ",".join(map(str, preserved_ids))
            session.exec(text(f"DELETE FROM users WHERE id NOT IN ({ids_str});"))
        else:
            # If no admins exist (unlikely), just clear everyone
            session.exec(text("DELETE FROM users;"))
            
        session.commit()
        print("Database wipe complete. Preserved admin accounts.")

if __name__ == "__main__":
    wipe_database()
