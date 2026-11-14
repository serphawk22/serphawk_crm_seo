"""One bounded schema used by the editor, publisher and public submission validator."""
import re
from urllib.parse import urlsplit

BASE_FIELDS = [
    {"key": "name", "label": "Name", "type": "text", "required": True},
    {"key": "email", "label": "Email", "type": "email", "required": False},
    {"key": "phone", "label": "Phone", "type": "tel", "required": False},
    {"key": "company_name", "label": "Company", "type": "text", "required": False},
    {"key": "website", "label": "Your website", "type": "url", "required": False},
    {"key": "interest", "label": "Service / course interest", "type": "text", "required": False},
    {"key": "message", "label": "Message", "type": "textarea", "required": False},
]


def default_form():
    return {"heading": "Get in touch", "description": "Tell us how we can help.", "submit_label": "Send enquiry",
            "success_message": "Thank you. Your enquiry has been received.", "privacy_notice": "",
            "fields": [dict(f) for f in BASE_FIELDS]}


def validate_form(value):
    if not isinstance(value, dict):
        raise ValueError("Form must be an object")
    clean = {}
    for key in ("heading", "description", "submit_label", "success_message", "privacy_notice"):
        text = value.get(key, "")
        if not isinstance(text, str) or len(text) > (2000 if key in {"description", "privacy_notice"} else 255):
            raise ValueError(f"Invalid {key}")
        clean[key] = text.strip()
    fields = value.get("fields")
    if not isinstance(fields, list) or not 3 <= len(fields) <= 17:
        raise ValueError("Choose between 3 and 17 fields (up to 10 custom fields)")
    seen = set()
    clean["fields"] = []
    course_ids = value.get("course_ids", [])
    if not isinstance(course_ids, list) or len(course_ids) > 100 or any(type(v) is not int or v < 1 for v in course_ids):
        raise ValueError("Invalid course selection")
    clean["course_ids"] = list(dict.fromkeys(course_ids))
    core = {f["key"]: f["type"] for f in BASE_FIELDS}
    for f in fields:
        if not isinstance(f, dict):
            raise ValueError("Invalid field")
        key, kind = f.get("key", ""), f.get("type", "text")
        if not isinstance(key, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,49}", key) or key in seen:
            raise ValueError("Field keys must be unique lowercase identifiers")
        if key not in core and not key.startswith("custom_"):
            raise ValueError("Custom keys must start with custom_")
        if kind not in {"text", "textarea", "select", "checkbox", "email", "tel", "url"}:
            raise ValueError("Unsupported field type")
        if key in core and kind != core[key] and not (key == "interest" and kind == "select"):
            raise ValueError("Core field type cannot be changed")
        label = f.get("label", "")
        options = f.get("options", [])
        if not isinstance(label, str) or not 1 <= len(label.strip()) <= 100:
            raise ValueError("Each field needs a label up to 100 characters")
        if not isinstance(options, list) or len(options) > 100 or any(not isinstance(o, str) or not 1 <= len(o) <= 255 for o in options):
            raise ValueError("Invalid select options")
        if kind == "select" and not options:
            raise ValueError("Select fields need options")
        seen.add(key)
        clean["fields"].append({"key": key, "label": label.strip(), "type": kind,
                                "required": bool(f.get("required")) or key == "name", "options": list(dict.fromkeys(options))})
    if not {"name", "email", "phone"} <= seen or len(seen - core.keys()) > 10:
        raise ValueError("Name, email and phone fields are required; allow up to ten custom fields")
    return clean


def validate_fields(form, values):
    if not isinstance(values, dict):
        raise ValueError("Invalid form values")
    clean = {}
    allowed = {f["key"] for f in form["fields"]}
    if values.keys() - allowed:
        raise ValueError("Unexpected form fields")
    for field in form["fields"]:
        key = field["key"]
        value = values.get(key, False if field["type"] == "checkbox" else "")
        if field["type"] == "checkbox":
            if not isinstance(value, bool):
                raise ValueError(f"Invalid {field['label']}")
        else:
            if not isinstance(value, str):
                raise ValueError(f"Invalid {field['label']}")
            value = value.strip()
            limit = 5000 if key == "message" else 2000 if field["type"] == "textarea" else 255
            if len(value) > limit:
                raise ValueError(f"{field['label']} is too long")
            if value and field["type"] == "select" and value not in field["options"]:
                raise ValueError(f"Choose a valid {field['label']}")
        if field["required"] and not value:
            raise ValueError(f"{field['label']} is required")
        clean[key] = value
    if not clean.get("email") and not clean.get("phone"):
        raise ValueError("Enter an email address or phone number")
    if clean.get("email") and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", clean["email"]):
        raise ValueError("Enter a valid email address")
    if clean.get("phone") and (not re.fullmatch(r"[+()\d .-]{7,100}", clean["phone"]) or not 7 <= len(re.sub(r"\D", "", clean["phone"])) <= 15):
        raise ValueError("Enter a valid phone number")
    if clean.get("website") and (urlsplit(clean["website"]).scheme not in {"http", "https"} or not urlsplit(clean["website"]).hostname):
        raise ValueError("Website must be an http(s) URL")
    return clean
