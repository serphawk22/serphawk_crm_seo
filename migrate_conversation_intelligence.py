
from dotenv import load_dotenv

load_dotenv()

import database  # noqa: E402  (loads DATABASE_URL and creates the engine)
from modules.conversation_store import ensure_conversation_schema  # noqa: E402


def main() -> int:
    result = ensure_conversation_schema(database.engine)
    if result["columns"]:
        print("Added columns:")
        for column in result["columns"]:
            print(f"  - {column}")
    else:
        print("All conversation/follow-up columns already present.")
    if result["indexes"]:
        print("Ensured indexes:")
        for index in result["indexes"]:
            print(f"  - {index}")
    if result["errors"]:
        print("Warnings (the app keeps running):")
        for error in result["errors"]:
            print(f"  - {error}")
        return 1
    print("Conversation intelligence migration complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
