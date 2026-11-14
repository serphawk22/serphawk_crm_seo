from urllib.parse import urlsplit

PARAMS = {"utm_source", "utm_medium", "utm_campaign", "utm_id", "utm_content", "utm_term", "gclid", "gbraid", "wbraid", "fbclid"}
ALIASES = {"fb": "facebook", "ig": "instagram", "gads": "google", "adwords": "google"}


def touch(raw):
    raw = raw if isinstance(raw, dict) else {}
    data = {k: str(raw[k])[:500] for k in PARAMS if isinstance(raw.get(k), str)}
    source = data.get("utm_source", "").lower()
    source = ALIASES.get(source, source)
    medium = data.get("utm_medium", "").lower()
    paid = medium in {"cpc", "ppc", "paid", "paid_search", "paid_social", "paidsocial", "display"}
    ref = ""
    try:
        ref = (urlsplit(str(raw.get("referrer", ""))).hostname or "").lower()
    except ValueError:
        pass
    platform = "google" if ref == "google.com" or ref.endswith(".google.com") else "facebook" if ref == "facebook.com" or ref.endswith(".facebook.com") else "instagram" if ref == "instagram.com" or ref.endswith(".instagram.com") else ""
    google_id = any(data.get(k) for k in ("gclid", "gbraid", "wbraid"))
    conflict = bool(source in {"facebook", "instagram"} and google_id)
    if source and paid:
        channel = "paid_search" if source == "google" else "paid_social" if source in {"facebook", "instagram"} else "other"
    elif google_id:
        source, channel = "google", "paid_search"
    else:
        source = source or platform or ("facebook" if data.get("fbclid") else "")
        channel = "organic_search" if source == "google" else "organic_social" if source in {"facebook", "instagram"} else "referral" if ref or source else "direct_unknown"
    data.update(source=(source or (ref if ref else "direct_unknown"))[:100], channel=channel, referrer_host=ref, conflict=conflict)
    for key in ("path", "timestamp"):
        value = raw.get(key)
        if isinstance(value, str):
            data[key] = value.split("?")[0].split("#")[0][:500]
    return data


def attribution(raw, consent, hostname=""):
    raw = raw if isinstance(raw, dict) else {}
    def clean(value):
        value = dict(value) if isinstance(value, dict) else {}
        try:
            if urlsplit(str(value.get("referrer", ""))).hostname == hostname:
                value.pop("referrer", None)
        except ValueError:
            value.pop("referrer", None)
        return touch(value)
    current = clean(raw.get("current"))
    return {"current": current, "first": clean(raw.get("first")) if consent else current,
            "latest_campaign": clean(raw.get("latest_campaign")) if consent and raw.get("latest_campaign") else current}
