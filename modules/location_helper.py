import re
from typing import Optional, Tuple

COUNTRY_MAP = {
    "usa": "United States", "united states": "United States", "us": "United States", "u.s.": "United States", "u.s.a.": "United States",
    "mexico": "Mexico", "méxico": "Mexico", "mx": "Mexico",
    "qatar": "Qatar", "qa": "Qatar",
    "spain": "Spain", "españa": "Spain", "es": "Spain",
    "uk": "United Kingdom", "united kingdom": "United Kingdom", "great britain": "United Kingdom",
    "uae": "United Arab Emirates", "united arab emirates": "United Arab Emirates", "dubai": "United Arab Emirates",
    "india": "India", "in": "India",
    "canada": "Canada", "ca": "Canada",
    "germany": "Germany", "deutschland": "Germany", "de": "Germany",
    "france": "France", "fr": "France",
    "italy": "Italy", "italia": "Italy", "it": "Italy",
    "australia": "Australia", "au": "Australia",
    "brazil": "Brazil", "brasil": "Brazil", "br": "Brazil",
    "argentina": "Argentina", "ar": "Argentina",
    "colombia": "Colombia", "co": "Colombia",
    "chile": "Chile", "cl": "Chile",
    "peru": "Peru", "perú": "Peru", "pe": "Peru",
}

KNOWN_CITIES = {
    "doha": ("Doha", "Qatar"),
    "mexico city": ("Ciudad de México", "Mexico"),
    "ciudad de méxico": ("Ciudad de México", "Mexico"),
    "cdmx": ("Ciudad de México", "Mexico"),
    "monterrey": ("Monterrey", "Mexico"),
    "guadalajara": ("Guadalajara", "Mexico"),
    "querétaro": ("Querétaro", "Mexico"),
    "puebla": ("Puebla", "Mexico"),
    "cancún": ("Cancún", "Mexico"),
    "miami": ("Miami", "United States"),
    "new york": ("New York", "United States"),
    "los angeles": ("Los Angeles", "United States"),
    "chicago": ("Chicago", "United States"),
    "houston": ("Houston", "United States"),
    "dallas": ("Dallas", "United States"),
    "austin": ("Austin", "United States"),
    "london": ("London", "United Kingdom"),
    "madrid": ("Madrid", "Spain"),
    "barcelona": ("Barcelona", "Spain"),
    "dubai": ("Dubai", "United Arab Emirates"),
    "abu dhabi": ("Abu Dhabi", "United Arab Emirates"),
    "toronto": ("Toronto", "Canada"),
    "vancouver": ("Vancouver", "Canada"),
    "mumbai": ("Mumbai", "India"),
    "delhi": ("Delhi", "India"),
    "bangalore": ("Bengaluru", "India"),
    "hyderabad": ("Hyderabad", "India"),
}


def extract_city_country_from_address(addr: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Extracts a clean (city, country) tuple from Google Maps formatted addresses.
    """
    if not addr or not str(addr).strip():
        return None, None
    raw = str(addr).strip()
    lower_raw = raw.lower()

    # 1. Check known country mentions anywhere in string
    detected_country = None
    for c_key, c_val in COUNTRY_MAP.items():
        if re.search(r'\b' + re.escape(c_key) + r'\b', lower_raw):
            detected_country = c_val
            break

    # 2. Check for known city occurrences in raw string
    for k_city, (c_name, c_country) in KNOWN_CITIES.items():
        if re.search(r'\b' + re.escape(k_city) + r'\b', lower_raw):
            return c_name, detected_country or c_country

    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not parts:
        return None, detected_country

    # Determine country from last part if not already found
    country = detected_country
    if not country:
        last_part = parts[-1]
        clean_last = re.sub(r'[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]', '', last_part).strip().lower()
        country = COUNTRY_MAP.get(clean_last, last_part.strip())

    # Determine city from parts
    city = None
    for part in reversed(parts[:-1] if len(parts) > 1 else parts):
        c_clean = re.sub(r'\b\d{4,6}\b', '', part)
        c_clean = re.sub(r'\b[A-Z]{2}\b', '', c_clean)
        # Strip trailing country name if attached with hyphen (e.g. 'WESTWALK - Qatar')
        for c_key in COUNTRY_MAP:
            c_clean = re.sub(r'[-–—]\s*' + re.escape(c_key) + r'\b', '', c_clean, flags=re.IGNORECASE)
        c_clean = c_clean.strip(" ,.-–—")
        if c_clean and len(c_clean) > 1 and not any(p in c_clean.lower() for p in ["road", "street", "st", "ave", "bldg", "floor", "zone", "blvd"]):
            city = c_clean
            break

    if not city and len(parts) >= 2:
        candidate = parts[-2]
        c_clean = re.sub(r'\b\d{4,6}\b', '', candidate).strip(" ,.-–—")
        for c_key in COUNTRY_MAP:
            c_clean = re.sub(r'[-–—]\s*' + re.escape(c_key) + r'\b', '', c_clean, flags=re.IGNORECASE)
        city = c_clean.strip(" ,.-–—")

    return city or None, country or None
