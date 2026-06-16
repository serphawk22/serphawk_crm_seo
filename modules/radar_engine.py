"""
Google Maps Radar Analysis Engine
Wraps the Google Maps Places API for competitor intelligence.
"""
import math
import os
import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
PLACES_BASE = "https://maps.googleapis.com/maps/api/place"

SERVICE_KEYWORDS = {
    "SEO": ["seo", "search engine", "organic", "ranking", "serp"],
    "PPC": ["ppc", "google ads", "paid ads", "adwords", "paid search", "sem"],
    "Web Design": ["web design", "website", "web development", "wordpress", "ui/ux", "landing page"],
    "Branding": ["branding", "brand identity", "logo", "design", "graphic"],
    "Marketing": ["marketing", "digital marketing", "growth", "campaign", "advertising"],
    "Social Media": ["social media", "instagram", "facebook", "tiktok", "twitter", "social"],
    "Content": ["content", "blog", "copywriting", "content marketing", "writing"],
    "Automation": ["automation", "crm", "workflow", "ai", "chatbot"],
    "Development": ["app development", "mobile app", "software", "development", "custom"],
    "Consulting": ["consulting", "strategy", "advisory", "agency", "consulting"],
}

def _haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def score_market_size(place):
    score = 0
    reviews = place.get("user_ratings_total", 0) or 0
    rating = place.get("rating", 0) or 0
    if reviews > 0:
        score += min(50, int(math.log(reviews + 1, 10) * 17))
    score += min(20, int(rating * 4))
    if place.get("website"):
        score += 10
    score += min(20, len(place.get("types", [])) * 3)
    return min(100, score)

def estimate_team_size(place):
    score = score_market_size(place)
    if score >= 80: return "101-250"
    elif score >= 65: return "51-100"
    elif score >= 50: return "26-50"
    elif score >= 35: return "11-25"
    else: return "1-10"

def calculate_service_overlap(target_category, competitor_types, competitor_name=""):
    combined = " ".join([target_category.lower(), " ".join(competitor_types).lower(), competitor_name.lower()])
    matched = [s for s, kws in SERVICE_KEYWORDS.items() if any(k in combined for k in kws)]
    missing = [s for s in SERVICE_KEYWORDS if s not in matched]
    overlap_pct = round((len(matched) / len(SERVICE_KEYWORDS)) * 100) if SERVICE_KEYWORDS else 0
    return {"overlap_pct": overlap_pct, "matched_services": matched, "missing_services": missing}

def get_competitor_color(overlap_pct):
    if overlap_pct >= 70: return "red"
    elif overlap_pct >= 50: return "orange"
    elif overlap_pct >= 30: return "yellow"
    else: return "green"

def calculate_market_density(competitor_count, radius_km):
    area = math.pi * (radius_km ** 2)
    return min(100, int((competitor_count / max(area, 1)) * 20))

async def find_place(query, location_hint=None):
    search_query = f"{query} {location_hint}" if location_hint else query
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{PLACES_BASE}/textsearch/json", params={"query": search_query, "key": GOOGLE_MAPS_API_KEY})
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return None
        return await get_place_details(results[0]["place_id"])

async def get_place_details(place_id):
    async with httpx.AsyncClient(timeout=15.0) as client:
        params = {
            "place_id": place_id,
            "fields": "place_id,name,formatted_address,geometry,website,formatted_phone_number,rating,user_ratings_total,types,url,business_status",
            "key": GOOGLE_MAPS_API_KEY,
        }
        resp = await client.get(f"{PLACES_BASE}/details/json", params=params)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") != "OK":
            return None
        r = data.get("result", {})
        geo = r.get("geometry", {}).get("location", {})
        return {
            "place_id": r.get("place_id"),
            "name": r.get("name"),
            "address": r.get("formatted_address"),
            "lat": geo.get("lat"),
            "lng": geo.get("lng"),
            "website": r.get("website"),
            "phone": r.get("formatted_phone_number"),
            "rating": r.get("rating"),
            "reviews": r.get("user_ratings_total"),
            "types": r.get("types", []),
            "maps_url": r.get("url"),
            "business_status": r.get("business_status"),
        }

async def find_nearby_competitors(lat, lng, radius_m, keyword, target_name=""):
    import asyncio
    async with httpx.AsyncClient(timeout=30.0) as client:
        params = {"location": f"{lat},{lng}", "radius": radius_m, "keyword": keyword, "key": GOOGLE_MAPS_API_KEY}
        resp = await client.get(f"{PLACES_BASE}/nearbysearch/json", params=params)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        next_page = data.get("next_page_token")
        if next_page:
            await asyncio.sleep(2)
            resp2 = await client.get(f"{PLACES_BASE}/nearbysearch/json", params={"pagetoken": next_page, "key": GOOGLE_MAPS_API_KEY})
            if resp2.status_code == 200:
                results += resp2.json().get("results", [])

    competitors = []
    for r in results:
        if target_name and r.get("name", "").lower() == target_name.lower():
            continue
        geo = r.get("geometry", {}).get("location", {})
        r_lat = geo.get("lat", lat)
        r_lng = geo.get("lng", lng)
        dist = round(_haversine(lat, lng, r_lat, r_lng), 2)
        types = r.get("types", [])
        overlap = calculate_service_overlap(keyword, types, r.get("name", ""))
        competitors.append({
            "place_id": r.get("place_id"),
            "name": r.get("name"),
            "address": r.get("vicinity") or r.get("formatted_address"),
            "lat": r_lat,
            "lng": r_lng,
            "rating": r.get("rating"),
            "reviews": r.get("user_ratings_total"),
            "types": types,
            "category": types[0].replace("_", " ").title() if types else "Business",
            "distance_km": dist,
            "market_size_score": score_market_size(r),
            "team_size_estimate": estimate_team_size(r),
            "overlap_pct": overlap["overlap_pct"],
            "matched_services": overlap["matched_services"],
            "missing_services": overlap["missing_services"],
            "pin_color": get_competitor_color(overlap["overlap_pct"]),
            "maps_url": f"https://www.google.com/maps/place/?q=place_id:{r.get('place_id')}",
            "website": r.get("website"),
        })
    return competitors

def sort_nearest(competitors): return sorted(competitors, key=lambda c: c.get("distance_km", 999))[:5]
def sort_largest_market(competitors): return sorted(competitors, key=lambda c: c.get("market_size_score", 0), reverse=True)[:5]
def sort_largest_team(competitors):
    ORDER = {"500+": 7, "251-500": 6, "101-250": 5, "51-100": 4, "26-50": 3, "11-25": 2, "1-10": 1}
    return sorted(competitors, key=lambda c: ORDER.get(c.get("team_size_estimate", "1-10"), 0), reverse=True)[:5]
def sort_most_similar(competitors): return sorted(competitors, key=lambda c: c.get("overlap_pct", 0), reverse=True)[:5]
