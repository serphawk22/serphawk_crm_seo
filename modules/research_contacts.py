"""Contact parsing for website research; never treat prose or section labels as addresses."""
import re

_EMAIL = re.compile(r"[A-Z0-9._%+-]+@(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,63}", re.I)
_EXCLUDED = {"test@example.com", "support.crm@serphawk.in"}
_ASSET_SUFFIXES = {"png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "css", "js", "woff", "woff2"}


def valid_email(value) -> bool:
    if not isinstance(value, str):
        return False
    value = value.strip()
    return bool(_EMAIL.fullmatch(value)
                and value.rsplit(".", 1)[-1].lower() not in _ASSET_SUFFIXES)


def email_addresses(*values) -> list[str]:
    """Handle strings, address lists and structured contacts; preserve order and deduplicate."""
    found, seen = [], set()

    def visit(value):
        if isinstance(value, (list, tuple)):
            for item in value:
                visit(item)
        elif isinstance(value, dict):
            visit(value.get("email"))
        elif isinstance(value, str):
            for match in _EMAIL.finditer(value):
                address = match.group()
                if valid_email(address) and address.lower() not in _EXCLUDED and address.lower() not in seen:
                    seen.add(address.lower())
                    found.append(address)

    for value in values:
        visit(value)
    return found


def extracted_field(raw_text: str, label: str) -> str:
    """Read one scraper metadata line, including an empty value, without consuming the next line."""
    match = re.search(r"^Extracted " + re.escape(label) + r":[ \t]*([^\r\n]*)", raw_text or "", re.I | re.M)
    return match.group(1).strip() if match else ""
