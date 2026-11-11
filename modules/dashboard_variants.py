"""Independent dashboard section entitlements; stable legacy feature keys stay valid."""
from modules.dashboard import SECTIONS

B2B_SECTIONS = {
    "attention": "Attention required", "call_pitch": "Call pitch", "kpis": "Performance indicators",
    "charts": "Revenue and pipeline charts", "lead_sources": "Lead sources",
    "billing": "Proposals, negotiations and billing", "team": "Clients and team rankings",
    "work": "Tasks, follow-ups and meetings", "delivery": "Projects and inventory",
}
B2C_SECTIONS = dict(SECTIONS)


def b2b_payload(payload, enabled):
    fields = {
        "attention": ("attention",), "kpis": ("kpis",), "charts": ("series", "pipeline", "costs"),
        "lead_sources": ("lead_sources",), "billing": ("proposals", "negotiations", "billing"),
        "team": ("clients", "team"), "work": ("tasks", "followups", "meetings", "comms"),
        "delivery": ("projects", "inventory"),
    }
    for section, keys in fields.items():
        if not enabled.get(f"command_center_{section}", True):
            for key in keys:
                payload.pop(key, None)
    return payload
