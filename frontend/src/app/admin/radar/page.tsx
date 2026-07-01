"use client";
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radar, MapPin, Search, Loader2, Target, TrendingUp, Users,
  Layers, Building2, Star, Globe, ChevronDown, AlertCircle,
  CheckCircle2, BarChart2, Navigation2, Zap, RefreshCw
} from "lucide-react";
import CompetitorTable from "./components/CompetitorTable";
import { API_BASE_URL } from "@/config";

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyAJbAEbE5egi9y-adJ5G804u_vL64We_nc";
const RADIUS_OPTIONS = [1, 3, 5, 10, 25];

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return;
    if (window.google?.maps) { resolve(); return; }
    const existing = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  reviews?: number;
  phone?: string;
  website?: string;
  types?: string[];
  maps_url?: string;
}

interface Competitor {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance_km: number;
  market_size_score: number;
  team_size_estimate: string;
  overlap_pct: number;
  matched_services: string[];
  missing_services: string[];
  pin_color: string;
  rating?: number;
  reviews?: number;
  maps_url?: string;
  website?: string;
  category?: string;
}

interface RadarResult {
  radar_id: number;
  target: PlaceResult & { category: string };
  radius_km: number;
  competitor_count: number;
  market_density_score: number;
  competitors: Competitor[];
  rankings: {
    nearest: Competitor[];
    largest_market: Competitor[];
    largest_team: Competitor[];
    most_similar: Competitor[];
  };
}

export default function RadarAnalysisPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [category, setCategory] = useState("digital marketing agency");
  const [radiusKm, setRadiusKm] = useState(5);
  const [searchLoading, setSearchLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [foundPlace, setFoundPlace] = useState<PlaceResult | null>(null);
  const [radarResult, setRadarResult] = useState<RadarResult | null>(null);
  const [addedPlaceIds, setAddedPlaceIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [sourceClientId, setSourceClientId] = useState<number | null>(null);
  const [clients, setClients] = useState<{ id: number; companyName: string }[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Load Google Maps Script
  useEffect(() => {
    loadGoogleMapsScript(GOOGLE_MAPS_KEY).then(() => setMapReady(true));
  }, []);

  // Load clients for source selection
  useEffect(() => {
    fetch(`${API_BASE_URL}/clients?limit=100`)
      .then(r => r.json())
      .then(d => setClients(Array.isArray(d.clients) ? d.clients : []))
      .catch(() => {});
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setError(null);
    setFoundPlace(null);
    setRadarResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/radar/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, location_hint: locationHint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Search failed");
      setFoundPlace(data.place);
    } catch (e: any) {
      setError(e.message || "Search failed");
    }
    setSearchLoading(false);
  };

  const handleAnalyze = async () => {
    if (!foundPlace) return;
    setAnalyzeLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/radar/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: foundPlace.place_id,
          target_name: foundPlace.name,
          target_lat: foundPlace.lat,
          target_lng: foundPlace.lng,
          target_address: foundPlace.address,
          target_phone: foundPlace.phone,
          target_website: foundPlace.website,
          target_rating: foundPlace.rating,
          target_reviews: foundPlace.reviews,
          target_category: category,
          radius_km: radiusKm,
          client_id: sourceClientId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Analysis failed");
      setRadarResult(data);
    } catch (e: any) {
      setError(e.message || "Analysis failed");
    }
    setAnalyzeLoading(false);
  };

  const handleAddToClients = useCallback(async (c: Competitor) => {
    if (!radarResult) return;
    try {
      const res = await fetch(`${API_BASE_URL}/radar/add-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitor: c,
          source_client_id: sourceClientId || radarResult.radar_id,
          source_client_name: foundPlace?.name || "Radar Analysis",
          radar_id: radarResult.radar_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      setAddedPlaceIds(prev => new Set([...prev, c.place_id || c.name]));
      setAddSuccess(`${c.name} added as Lead! View in CRM → Leads`);
      setTimeout(() => setAddSuccess(null), 4000);
    } catch (e: any) {
      setError(e.message || "Failed to add lead");
    }
  }, [radarResult, sourceClientId, foundPlace]);

  const colorConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    red:    { bg: "bg-red-500/10",    text: "text-red-400",    dot: "bg-red-500",    label: "Direct Competitor (≥70%)" },
    orange: { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-500", label: "Strong Competitor (50–70%)" },
    yellow: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-500", label: "Moderate (30–50%)" },
    green:  { bg: "bg-green-500/10",  text: "text-green-400",  dot: "bg-green-500",  label: "Weak Competitor (<30%)" },
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/20">
          <Radar className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-zinc-100">Radar Analysis Engine</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">Google Maps competitor intelligence &amp; geo-market analysis</p>
        </div>
      </div>

      {/* Search Form */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-4">Phase 1 — Target Business Search</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="lg:col-span-2">
            <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">Business Name / Website</label>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="e.g. DaPros, Marketing Agency Guadalajara"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 text-sm placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">City / Region</label>
            <input
              value={locationHint}
              onChange={e => setLocationHint(e.target.value)}
              placeholder="e.g. Guadalajara, Mexico"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 text-sm placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">Business Category</label>
            <input
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="digital marketing agency"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 text-sm placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSearch}
            disabled={searchLoading || !searchQuery.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md active:scale-95">
            {searchLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Find on Google Maps
          </button>
          {foundPlace && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {RADIUS_OPTIONS.map(r => (
                  <button key={r} onClick={() => setRadiusKm(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${radiusKm === r ? "bg-indigo-600 text-white shadow" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"}`}>
                    {r} km
                  </button>
                ))}
              </div>
              <button
                onClick={handleAnalyze}
                disabled={analyzeLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-bold text-sm hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg active:scale-95">
                {analyzeLoading ? <Loader2 size={16} className="animate-spin" /> : <Radar size={16} />}
                {analyzeLoading ? "Scanning..." : "Run Radar Analysis"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-500">
            <AlertCircle size={16} />
            <span className="text-sm font-medium">{error}</span>
          </motion.div>
        )}
        {addSuccess && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-500">
            <CheckCircle2 size={16} />
            <span className="text-sm font-medium">{addSuccess}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Found Place Card */}
      <AnimatePresence>
        {foundPlace && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 border border-indigo-500/30 rounded-2xl p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-4">Target Business Located</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-lg shrink-0">
                  {foundPlace.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-zinc-100">{foundPlace.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{foundPlace.address}</p>
                  {foundPlace.rating && (
                    <div className="flex items-center gap-1 mt-1">
                      <Star size={11} className="text-amber-400 fill-amber-400" />
                      <span className="text-xs text-amber-400 font-bold">{foundPlace.rating}</span>
                      <span className="text-xs text-slate-400">({foundPlace.reviews || 0} reviews)</span>
                    </div>
                  )}
                </div>
              </div>
              {[
                { label: "Latitude", value: foundPlace.lat?.toFixed(6), icon: Navigation2 },
                { label: "Longitude", value: foundPlace.lng?.toFixed(6), icon: Navigation2 },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="p-3 bg-slate-50 dark:bg-zinc-800 rounded-xl border border-slate-100 dark:border-zinc-700">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon size={10} className="text-slate-400" />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                  </div>
                  <p className="text-sm font-mono font-bold text-slate-800 dark:text-zinc-100">{value}</p>
                </div>
              ))}
            </div>
            {foundPlace.place_id && (
              <div className="mt-3 flex flex-wrap gap-3">
                <div className="px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 rounded-lg">
                  <span className="text-[9px] text-slate-500 dark:text-zinc-400 uppercase font-bold">Place ID </span>
                  <span className="text-xs font-mono text-slate-600 dark:text-zinc-300">{foundPlace.place_id}</span>
                </div>
                {foundPlace.maps_url && (
                  <a href={foundPlace.maps_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold hover:bg-indigo-500/20 transition-colors">
                    <MapPin size={11} /> View on Google Maps
                  </a>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Radar Results */}
      <AnimatePresence>
        {radarResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Competitors Found", value: radarResult.competitor_count, icon: Building2, color: "text-indigo-500" },
                { label: "Market Density", value: `${radarResult.market_density_score}/100`, icon: BarChart2, color: "text-violet-500" },
                { label: "Radius Scanned", value: `${radarResult.radius_km} km`, icon: Target, color: "text-blue-500" },
                { label: "Analysis ID", value: `#${radarResult.radar_id}`, icon: Zap, color: "text-amber-500" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} className={color} />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                  </div>
                  <p className="text-2xl font-black text-slate-800 dark:text-zinc-100">{value}</p>
                </div>
              ))}
            </div>

            {/* Map + Legend */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Map */}
              <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-sm overflow-hidden" style={{ minHeight: "520px" }}>
                {mapReady ? (
                  <div id="radar-google-map" className="w-full h-full" style={{ minHeight: "520px" }}>
                    <RadarMapLoader target={radarResult.target} competitors={radarResult.competitors} radiusKm={radarResult.radius_km} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <Loader2 className="animate-spin mr-2" size={20} /> Loading map...
                  </div>
                )}
              </div>

              {/* Legend + Source */}
              <div className="space-y-4">
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-3">Pin Legend</p>
                  <div className="space-y-2.5">
                    {Object.entries(colorConfig).map(([key, cfg]) => (
                      <div key={key} className="flex items-center gap-2.5">
                        <div className={`w-3 h-3 rounded-full ${cfg.dot} shrink-0`} />
                        <span className="text-xs text-slate-600 dark:text-zinc-300">{cfg.label}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-indigo-500 shrink-0" />
                      <span className="text-xs text-slate-600 dark:text-zinc-300">Target Business</span>
                    </div>
                  </div>
                </div>

                {/* Source Client Attribution */}
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-3">Attribution Source</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mb-2">Link discoveries to a CRM client (optional)</p>
                  <select
                    value={sourceClientId || ""}
                    onChange={e => setSourceClientId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">No attribution</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.companyName}</option>
                    ))}
                  </select>
                </div>

                {/* Market Summary */}
                <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-4 text-white shadow-lg">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-2">Market Overview</p>
                  <p className="text-3xl font-black mb-1">{radarResult.competitors.filter(c => c.pin_color === "red" || c.pin_color === "orange").length}</p>
                  <p className="text-xs text-indigo-200">Strong/Direct competitors in {radarResult.radius_km}km radius</p>
                </div>
              </div>
            </div>

            {/* Competitor Rankings Table */}
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-3">Competitor Rankings — Top 5 per Category</p>
              <CompetitorTable
                rankings={radarResult.rankings}
                onAddToClients={handleAddToClients}
                addedPlaceIds={addedPlaceIds}
              />
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!foundPlace && !searchLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-600/20 to-violet-600/20 border border-indigo-500/20 flex items-center justify-center mb-6">
            <Radar className="w-10 h-10 text-indigo-500 opacity-60" />
          </div>
          <h2 className="text-xl font-black text-slate-800 dark:text-zinc-100 mb-2">Start Your Radar Scan</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 max-w-md">
            Enter a business name and city above to locate it on Google Maps, then run a radar scan to discover all nearby competitors with full market intelligence.
          </p>
        </div>
      )}
    </div>
  );
}

// Lazy-loaded map component using vanilla Google Maps API
function RadarMapLoader({ target, competitors, radiusKm }: { target: any; competitors: any[]; radiusKm: number }) {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<any>(null);
  const markersRef = React.useRef<any[]>([]);
  const circleRef = React.useRef<any>(null);
  const iwRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!mapRef.current || !window.google || !target) return;
    const g = window.google.maps;
    const center = { lat: target.lat, lng: target.lng };
    const darkStyles = [
      { featureType: "all", elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
      { featureType: "all", elementType: "labels.text.fill", stylers: [{ color: "#a0aec0" }] },
      { featureType: "all", elementType: "labels.text.stroke", stylers: [{ color: "#000000" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d3748" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
    ];

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new g.Map(mapRef.current, {
        center, zoom: radiusKm <= 2 ? 15 : radiusKm <= 5 ? 14 : radiusKm <= 10 ? 13 : 12,
        styles: darkStyles, mapTypeControl: false, streetViewControl: false,
      });
    } else {
      mapInstanceRef.current.panTo(center);
    }

    const map = mapInstanceRef.current;
    markersRef.current.forEach((m: any) => m.setMap(null));
    markersRef.current = [];
    if (circleRef.current) circleRef.current.setMap(null);
    if (!iwRef.current) iwRef.current = new g.InfoWindow();

    circleRef.current = new g.Circle({
      map, center, radius: radiusKm * 1000,
      strokeColor: "#6366f1", strokeOpacity: 0.6, strokeWeight: 2,
      fillColor: "#6366f1", fillOpacity: 0.06,
    });

    const makePin = (color: string) => ({
      path: "M 12 0 C 5.37 0 0 5.37 0 12 c 0 9 12 18 12 18 s 12 -9 12 -18 C 24 5.37 18.63 0 12 0 z",
      fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1.5,
      scale: 1.5, anchor: new g.Point(12, 30),
    });

    const PIN_COLORS: Record<string, string> = { red: "#ef4444", orange: "#f97316", yellow: "#eab308", green: "#22c55e", blue: "#6366f1" };

    // Target marker
    const tm = new g.Marker({ position: center, map, icon: makePin(PIN_COLORS.blue), title: target.name, zIndex: 1000 });
    tm.addListener("click", () => {
      iwRef.current.setContent(`<div style="background:#1e293b;color:#f1f5f9;padding:12px;border-radius:8px;min-width:200px"><div style="font-size:10px;color:#818cf8;font-weight:800;text-transform:uppercase;margin-bottom:6px">TARGET BUSINESS</div><div style="font-size:15px;font-weight:800">${target.name}</div><div style="font-size:11px;color:#94a3b8;margin-top:4px">${target.address || ""}</div>${target.rating ? `<div style="font-size:12px;color:#fbbf24;margin-top:4px">⭐ ${target.rating} (${target.reviews || 0} reviews)</div>` : ""}</div>`);
      iwRef.current.open(map, tm);
    });
    markersRef.current.push(tm);

    // Competitor markers
    competitors.forEach((c: any) => {
      const cm = new g.Marker({
        position: { lat: c.lat, lng: c.lng }, map,
        icon: makePin(PIN_COLORS[c.pin_color] || PIN_COLORS.green),
        title: c.name,
      });
      const labelMap: Record<string, string> = { red: "Direct Competitor", orange: "Strong Competitor", yellow: "Moderate", green: "Weak" };
      cm.addListener("click", () => {
        iwRef.current.setContent(`<div style="background:#1e293b;color:#f1f5f9;padding:12px;border-radius:8px;min-width:220px"><div style="background:${PIN_COLORS[c.pin_color]};color:white;font-size:9px;font-weight:800;text-transform:uppercase;padding:3px 8px;border-radius:4px;display:inline-block;margin-bottom:8px">${labelMap[c.pin_color] || "Competitor"}</div><div style="font-size:14px;font-weight:800;margin-bottom:4px">${c.name}</div><div style="font-size:11px;color:#94a3b8;margin-bottom:8px">${c.address || ""}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px"><div style="background:#0f172a;border-radius:6px;padding:4px 8px"><div style="font-size:9px;color:#64748b">Distance</div><div style="font-size:13px;font-weight:700">${c.distance_km}km</div></div><div style="background:#0f172a;border-radius:6px;padding:4px 8px"><div style="font-size:9px;color:#64748b">Market Score</div><div style="font-size:13px;font-weight:700">${c.market_size_score}/100</div></div><div style="background:#0f172a;border-radius:6px;padding:4px 8px"><div style="font-size:9px;color:#64748b">Team</div><div style="font-size:13px;font-weight:700">${c.team_size_estimate}</div></div><div style="background:#0f172a;border-radius:6px;padding:4px 8px"><div style="font-size:9px;color:#64748b">Overlap</div><div style="font-size:13px;font-weight:700">${c.overlap_pct}%</div></div></div>${c.maps_url ? `<a href="${c.maps_url}" target="_blank" style="color:#818cf8;font-size:11px">View on Maps ↗</a>` : ""}</div>`);
        iwRef.current.open(map, cm);
      });
      markersRef.current.push(cm);
    });
  }, [target, competitors, radiusKm]);

  return <div ref={mapRef} style={{ width: "100%", height: "520px" }} />;
}
