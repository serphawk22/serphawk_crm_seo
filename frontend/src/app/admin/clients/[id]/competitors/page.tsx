"use client";

import React, { useEffect, useState, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Radar, Loader2, Target, Building2, MapPin, Star,
  CheckCircle2, AlertCircle, BarChart2, Navigation2, Zap
} from 'lucide-react';
import { API_BASE_URL } from '@/config';
import CompetitorTable from '@/app/admin/radar/components/CompetitorTable';

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyAJbAEbE5egi9y-adJ5G804u_vL64We_nc";

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return;
    
    // Suppress Google Maps API auth/billing alerts
    // @ts-ignore
    window.gm_authFailure = () => {
      const errorDiv = document.querySelector('.gm-err-container');
      if (errorDiv) {
        (errorDiv as HTMLElement).style.display = 'none';
      }
    };

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

// Reusing RadarMap loader for dark UI styling
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
      { featureType: "all", elementType: "geometry", stylers: [{ color: "#09090b" }] },
      { featureType: "all", elementType: "labels.text.fill", stylers: [{ color: "#71717a" }] },
      { featureType: "all", elementType: "labels.text.stroke", stylers: [{ color: "#000000" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#18181b" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
    ];

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new g.Map(mapRef.current, {
        center, zoom: radiusKm <= 2 ? 15 : radiusKm <= 5 ? 14 : radiusKm <= 10 ? 13 : 12,
        styles: isDark ? darkStyles : [], mapTypeControl: false, streetViewControl: false,
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

    const tm = new g.Marker({ position: center, map, icon: makePin(PIN_COLORS.blue), title: target.name, zIndex: 1000 });
    tm.addListener("click", () => {
      iwRef.current.setContent(`<div style="background:#18181b;color:#f4f4f5;padding:12px;border-radius:8px;min-width:200px"><div style="font-size:10px;color:#818cf8;font-weight:800;text-transform:uppercase;margin-bottom:6px">TARGET BUSINESS</div><div style="font-size:15px;font-weight:800">${target.name}</div><div style="font-size:11px;color:#a1a1aa;margin-top:4px">${target.address || ""}</div></div>`);
      iwRef.current.open(map, tm);
    });
    markersRef.current.push(tm);

    competitors.forEach((c: any) => {
      const cm = new g.Marker({
        position: { lat: c.lat, lng: c.lng }, map,
        icon: makePin(PIN_COLORS[c.pin_color] || PIN_COLORS.green),
        title: c.name,
      });
      const labelMap: Record<string, string> = { red: "Direct Competitor", orange: "Strong Competitor", yellow: "Moderate", green: "Weak" };
      cm.addListener("click", () => {
        iwRef.current.setContent(`<div style="background:#18181b;color:#f4f4f5;padding:12px;border-radius:8px;min-width:220px"><div style="background:${PIN_COLORS[c.pin_color]};color:white;font-size:9px;font-weight:800;text-transform:uppercase;padding:3px 8px;border-radius:4px;display:inline-block;margin-bottom:8px">${labelMap[c.pin_color] || "Competitor"}</div><div style="font-size:14px;font-weight:800;margin-bottom:4px">${c.name}</div><div style="font-size:11px;color:#a1a1aa;margin-bottom:8px">${c.address || ""}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px"><div style="background:#09090b;border-radius:6px;padding:4px 8px"><div style="font-size:9px;color:#71717a">Distance</div><div style="font-size:13px;font-weight:700">${c.distance_km}km</div></div><div style="background:#09090b;border-radius:6px;padding:4px 8px"><div style="font-size:9px;color:#71717a">Market Score</div><div style="font-size:13px;font-weight:700">${c.market_size_score}/100</div></div></div></div>`);
        iwRef.current.open(map, cm);
      });
      markersRef.current.push(cm);
    });
  }, [target, competitors, radiusKm]);

  return <div ref={mapRef} className="w-full h-full min-h-[500px]" />;
}

export default function CompetitorRadarPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  
  const [client, setClient] = useState<any>(null);
  const [loadingStep, setLoadingStep] = useState<'fetching_client' | 'locating_target' | 'scanning_radar' | 'complete' | 'error'>('fetching_client');
  const [error, setError] = useState<string | null>(null);
  
  const [foundPlace, setFoundPlace] = useState<any>(null);
  const [radarResult, setRadarResult] = useState<any>(null);
  const [addedPlaceIds, setAddedPlaceIds] = useState<Set<string>>(new Set());
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [manualQuery, setManualQuery] = useState("");

  useEffect(() => {
    loadGoogleMapsScript(GOOGLE_MAPS_KEY).then(() => setMapReady(true));
  }, []);

  useEffect(() => {
    if (!id) return;
    const runFullRadarFlow = async (overrideQuery?: string) => {
      try {
        setLoadingStep('fetching_client');
        let clientData = client;
        if (!clientData) {
          const res = await fetch(`${API_BASE_URL}/clients/${id}`);
          if (!res.ok) throw new Error("Failed to load client.");
          const data = await res.json();
          clientData = data.client;
          setClient(clientData);
        }

        // Step 1: Locate Target on Google Maps
        setLoadingStep('locating_target');
        const query = overrideQuery || `${clientData.companyName || clientData.projectName} ${clientData.address || clientData.city || ''}`.trim();
        const searchRes = await fetch(`${API_BASE_URL}/radar/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, location_hint: clientData.city }),
        });
        
        if (!searchRes.ok) throw new Error("Failed to pinpoint client on Google Maps.");
        const searchData = await searchRes.json();
        setFoundPlace(searchData.place);

        // Step 2: Scan Radius
        setLoadingStep('scanning_radar');
        const analyzeRes = await fetch(`${API_BASE_URL}/radar/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            place_id: searchData.place.place_id,
            target_name: searchData.place.name,
            target_lat: searchData.place.lat,
            target_lng: searchData.place.lng,
            target_address: searchData.place.address,
            target_phone: searchData.place.phone,
            target_website: searchData.place.website,
            target_rating: searchData.place.rating,
            target_reviews: searchData.place.reviews,
            target_category: clientData.industry || "Business",
            radius_km: 10, // Default to 10km scan
            client_id: parseInt(id),
          }),
        });

        if (!analyzeRes.ok) throw new Error("Failed to analyze competitors.");
        const analyzeData = await analyzeRes.json();
        setRadarResult(analyzeData);
        setLoadingStep('complete');

      } catch (e: any) {
        console.error(e);
        setError(e.message || "An error occurred.");
        setLoadingStep('error');
      }
    };

    if (id && loadingStep === 'fetching_client') {
       runFullRadarFlow();
    }
  }, [id, client, loadingStep]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQuery.trim()) return;
    setLoadingStep('locating_target');
    setError(null);
  };

  useEffect(() => {
    // If the manual search triggered a re-evaluation
    if (loadingStep === 'locating_target' && manualQuery && client) {
        // We reuse the effect logic above by extracting the function out, but let's just do it directly:
        const doManual = async () => {
            try {
                const searchRes = await fetch(`${API_BASE_URL}/radar/search`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ query: manualQuery, location_hint: client.city }),
                });
                if (!searchRes.ok) throw new Error("Failed to pinpoint on Google Maps.");
                const searchData = await searchRes.json();
                setFoundPlace(searchData.place);
                
                setLoadingStep('scanning_radar');
                const analyzeRes = await fetch(`${API_BASE_URL}/radar/analyze`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    place_id: searchData.place.place_id,
                    target_name: searchData.place.name,
                    target_lat: searchData.place.lat,
                    target_lng: searchData.place.lng,
                    target_address: searchData.place.address,
                    target_phone: searchData.place.phone,
                    target_website: searchData.place.website,
                    target_rating: searchData.place.rating,
                    target_reviews: searchData.place.reviews,
                    target_category: client.industry || "Business",
                    radius_km: 10,
                    client_id: parseInt(id),
                  }),
                });
                if (!analyzeRes.ok) throw new Error("Failed to analyze competitors.");
                const analyzeData = await analyzeRes.json();
                setRadarResult(analyzeData);
                setLoadingStep('complete');
            } catch(e: any) {
                setError(e.message || "Manual search failed");
                setLoadingStep('error');
            }
        };
        doManual();
    }
  }, [loadingStep, manualQuery, client, id]);

  const handleAddToClients = useCallback(async (c: any) => {
    if (!radarResult || !client) return;
    try {
      const res = await fetch(`${API_BASE_URL}/radar/add-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitor: c,
          source_client_id: parseInt(id),
          source_client_name: client.companyName || "Radar Analysis",
          radar_id: radarResult.radar_id,
          websiteUrl: c.website,
          phone: c.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      setAddedPlaceIds(prev => new Set([...prev, c.place_id || c.name]));
      setAddSuccess(`${c.name} added to CRM!`);
      setTimeout(() => setAddSuccess(null), 4000);
    } catch (e: any) {
      console.error(e);
    }
  }, [radarResult, id, client]);

  const colorConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    red:    { bg: "bg-red-500/10",    text: "text-red-400",    dot: "bg-red-500",    label: "Direct Competitor (≥70%)" },
    orange: { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-500", label: "Strong Competitor (50–70%)" },
    yellow: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-500", label: "Moderate (30–50%)" },
    green:  { bg: "bg-green-500/10",  text: "text-green-400",  dot: "bg-green-500",  label: "Weak Competitor (<30%)" },
  };

  return (
    <div className="max-w-[1500px] mx-auto space-y-8 pb-20 dark">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-slate-500 dark:text-zinc-400 hover:text-white transition-colors shadow-sm">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400 flex items-center gap-3">
            Advanced Competitor Radar <Radar className="w-7 h-7 text-indigo-400" />
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 font-medium text-sm mt-1">
            Google Maps Intelligence Scan for {client?.companyName || 'Target Client'}
          </p>
        </div>
      </div>

      {/* Loading States */}
      {loadingStep !== 'complete' && loadingStep !== 'error' && (
        <div className="h-[60vh] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-[2rem] flex flex-col items-center justify-center p-10 text-center shadow-lg relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-zinc-900 to-zinc-900"></div>
          
          <div className="relative mb-8 z-10">
            <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="w-24 h-24 rounded-full border-4 border-gray-200 dark:border-zinc-800 border-t-indigo-500 animate-spin flex items-center justify-center relative">
              <Radar className="w-8 h-8 text-indigo-400" />
            </div>
          </div>
          
          <h2 className="text-2xl font-black text-slate-900 dark:text-zinc-100 mb-2 relative z-10">
            {loadingStep === 'fetching_client' && "Loading Client Profile..."}
            {loadingStep === 'locating_target' && "Pinpointing Target on Google Maps..."}
            {loadingStep === 'scanning_radar' && "Scanning Local Radius via Places API..."}
          </h2>
          <p className="text-slate-500 dark:text-zinc-400 max-w-md relative z-10">
            Our AI is mapping the local competitive landscape using exact Google coordinates, parsing employee records, and calculating market saturation.
          </p>
        </div>
      )}

      {/* Error State with Fallback */}
      {loadingStep === 'error' && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-8 max-w-2xl mx-auto shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-zinc-100 mb-2">Target Not Found</h2>
            <p className="text-slate-500 dark:text-zinc-400 mb-6 max-w-md">
              We couldn't automatically find <strong>{client?.companyName}</strong> on Google Maps. The business might not be registered or the name is ambiguous.
            </p>
            
            <div className="w-full bg-black/40 rounded-2xl p-6 border border-gray-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-300 mb-4 text-left">Manual Override:</h3>
              <form onSubmit={handleManualSearch} className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text" 
                  value={manualQuery}
                  onChange={e => setManualQuery(e.target.value)}
                  placeholder="e.g. SerpHawk Digital Marketing Miami" 
                  className="flex-1 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl transition-colors whitespace-nowrap">
                  Force Search
                </button>
              </form>
              {error && <p className="text-xs font-medium text-red-400 mt-3 text-left">{error}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      <AnimatePresence>
        {addSuccess && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed top-24 right-8 z-50 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-emerald-400 shadow-xl backdrop-blur-md">
            <CheckCircle2 size={16} />
            <span className="text-sm font-bold">{addSuccess}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analysis Results */}
      {loadingStep === 'complete' && radarResult && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Competitors Discovered", value: radarResult.competitor_count, icon: Building2, color: "text-indigo-400", bg: "bg-indigo-500/10" },
              { label: "Market Density", value: `${radarResult.market_density_score}/100`, icon: BarChart2, color: "text-violet-400", bg: "bg-violet-500/10" },
              { label: "Radius Scanned", value: `${radarResult.radius_km} km`, icon: Target, color: "text-blue-400", bg: "bg-blue-500/10" },
              { label: "Exact Coordinates", value: "Verified", icon: MapPin, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            ].map((stat, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-lg ${stat.bg}`}><stat.icon size={16} className={stat.color} /></div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{stat.label}</p>
                </div>
                <p className="text-2xl font-black text-slate-900 dark:text-zinc-100">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Map Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden" style={{ minHeight: "500px" }}>
              {mapReady ? (
                <RadarMapLoader target={radarResult.target} competitors={radarResult.competitors} radiusKm={radarResult.radius_km} />
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-500">
                  <Loader2 className="animate-spin mr-2" size={20} /> Loading Google Maps...
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Target Identification */}
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-4">Target Identified</p>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-black text-lg shrink-0 shadow-lg shadow-indigo-500/20">
                    {foundPlace?.name?.charAt(0) || "T"}
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-zinc-100">{foundPlace?.name}</h2>
                    <p className="text-xs text-zinc-500 mt-1">{foundPlace?.address}</p>
                    {foundPlace?.rating && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Star size={10} className="text-amber-400 fill-amber-400" />
                        <span className="text-[10px] text-amber-400 font-bold">{foundPlace.rating}</span>
                        <span className="text-[10px] text-zinc-600">({foundPlace.reviews} reviews)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Pin Legend */}
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-4">Radar Pin Legend</p>
                <div className="space-y-3">
                  {Object.entries(colorConfig).map(([key, cfg]) => (
                    <div key={key} className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${cfg.dot} shadow-sm shadow-${key}-500/50 shrink-0`} />
                      <span className="text-xs text-slate-700 dark:text-zinc-300 font-medium">{cfg.label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-zinc-800">
                    <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50 shrink-0" />
                    <span className="text-xs text-slate-700 dark:text-zinc-300 font-medium">Target Business</span>
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-500/20">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-2">CRM Attribution</p>
                <p className="text-sm font-bold mb-3 leading-snug">Any competitor added to the CRM from this page will be permanently linked to <strong>{client?.companyName}</strong> in the Discovery Graph.</p>
                <div className="flex items-center gap-2 text-xs font-black text-white/90 bg-white/10 px-3 py-2 rounded-lg backdrop-blur-md">
                   <Zap size={14} className="text-yellow-400" /> Active
                </div>
              </div>
            </div>
          </div>

          {/* Deep Analytics Tables */}
          <div className="pt-4">
             <div className="flex items-center gap-3 mb-6 px-2">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl"><Building2 className="w-5 h-5" /></div>
                <h3 className="text-xl font-black text-slate-900 dark:text-zinc-100">Advanced Competitor Rankings</h3>
             </div>
             
             {/* Using the shared CompetitorTable which handles the 4 sorting modes automatically */}
             <div className="[&>div]:bg-white dark:bg-zinc-900 [&>div]:border-gray-200 dark:border-zinc-800 [&_th]:bg-gray-50 dark:bg-zinc-950 [&_th]:border-gray-200 dark:border-zinc-800 [&_th]:text-zinc-500 [&_td]:border-gray-200 dark:border-zinc-800 [&_td]:text-slate-700 dark:text-zinc-300 [&_button]:bg-zinc-800 [&_button]:border-gray-300 dark:border-zinc-700 [&_button:hover]:bg-zinc-700 [&_button.bg-indigo-600]:bg-indigo-600 [&_button.bg-indigo-600]:text-white [&_button.bg-indigo-600]:border-transparent">
               <CompetitorTable
                  rankings={radarResult.rankings}
                  onAddToClients={handleAddToClients}
                  addedPlaceIds={addedPlaceIds}
               />
             </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
