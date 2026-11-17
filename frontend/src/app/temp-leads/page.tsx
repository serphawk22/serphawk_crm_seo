"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles, CheckCircle2, AlertTriangle, ArrowRight, Trash2, Globe, Phone,
  MapPin, Star, Search, RefreshCw, Loader2, ExternalLink, ShieldCheck, UserCheck
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";

interface TempLead {
  id: number;
  company_name: string;
  city: string | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews_count: number | null;
  place_id: string | null;
  maps_url: string | null;
  verified_with_ai: boolean;
  verification_status: string;
  verification_notes: string | null;
  verified_data: string | null;
  is_promoted: boolean;
  promoted_lead_id: number | null;
  created_at: string;
}

export default function TempLeadsPage() {
  const { t } = useLanguage();
  const [leads, setLeads] = useState<TempLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchTempLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/temp-leads`);
      const data = await res.json();
      setLeads(data.temp_leads || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTempLeads();
  }, [fetchTempLeads]);

  const handleVerify = async (id: number) => {
    setVerifyingId(id);
    setActionMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/temp-leads/${id}/verify`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Verification failed");
      const updated = data.temp_lead;
      setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updated } : l));
      setActionMsg({ ok: true, text: `Verified ${updated.company_name} with ChatGPT!` });
      setTimeout(() => setActionMsg(null), 4000);
    } catch (e: any) {
      setActionMsg({ ok: false, text: e.message || "Verification failed" });
    } finally {
      setVerifyingId(null);
    }
  };

  const handlePromote = async (id: number) => {
    setPromotingId(id);
    setActionMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/temp-leads/${id}/promote`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Promotion failed");
      setLeads(prev => prev.map(l => l.id === id ? { ...l, is_promoted: true, promoted_lead_id: data.lead?.id } : l));
      setActionMsg({ ok: true, text: `Promoted to CRM Lead successfully!` });
      setTimeout(() => setActionMsg(null), 4000);
    } catch (e: any) {
      setActionMsg({ ok: false, text: e.message || "Promotion failed" });
    } finally {
      setPromotingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Remove this temporary lead?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/temp-leads/${id}`, { method: "DELETE" });
      if (res.ok) {
        setLeads(prev => prev.filter(l => l.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = leads.filter(l => {
    const q = search.toLowerCase();
    const matchSearch =
      l.company_name.toLowerCase().includes(q) ||
      (l.city && l.city.toLowerCase().includes(q)) ||
      (l.category && l.category.toLowerCase().includes(q));

    if (!matchSearch) return false;
    if (filterStatus === "all") return true;
    if (filterStatus === "promoted") return l.is_promoted;
    if (filterStatus === "verified") return l.verification_status === "verified";
    if (filterStatus === "unverified") return !l.verified_with_ai || l.verification_status === "unverified";
    return true;
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-black p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Temporary Leads
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                Staging Area
              </span>
            </h1>
            <p className="text-slate-500 text-xs">
              Discovered from Radar Analysis. Reverifty with ChatGPT and promote only qualified targets to avoid cluttering your CRM.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/admin/radar"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition"
          >
            Run Radar Search
          </a>
          <button
            onClick={fetchTempLeads}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className={`p-3 rounded-xl text-xs font-semibold ${actionMsg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {actionMsg.text}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-xs">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search temporary leads by company, city, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {[
            { id: "all", label: "All Leads", count: leads.length },
            { id: "unverified", label: "Unverified", count: leads.filter(l => !l.verified_with_ai).length },
            { id: "verified", label: "Verified", count: leads.filter(l => l.verification_status === "verified").length },
            { id: "promoted", label: "Promoted to CRM", count: leads.filter(l => l.is_promoted).length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterStatus === tab.id
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[800px]">
            <thead className="bg-slate-50 dark:bg-slate-950 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">Company & City</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Contact & Web</th>
                <th className="p-3.5">Google Rating</th>
                <th className="p-3.5">ChatGPT Verification</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                    Loading temporary leads...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    No temporary leads found. Run a search in Radar and click &ldquo;Save to Temp Leads&rdquo;.
                  </td>
                </tr>
              ) : (
                filtered.map((tl) => (
                  <tr key={tl.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900 dark:text-white text-sm">{tl.company_name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin size={11} className="text-slate-400" />
                        {tl.city || tl.address || "Location not set"}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                        {tl.category || "General"}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[11px] space-y-0.5">
                      {tl.phone && (
                        <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                          <Phone size={11} /> {tl.phone}
                        </div>
                      )}
                      {tl.website ? (
                        <a href={tl.website.startsWith("http") ? tl.website : `https://${tl.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline">
                          <Globe size={11} /> {tl.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 24)}
                        </a>
                      ) : (
                        <span className="text-slate-400">No website</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {tl.rating ? (
                        <div className="flex items-center gap-1">
                          <Star size={11} className="text-amber-400 fill-amber-400" />
                          <span className="font-bold text-amber-500">{tl.rating}</span>
                          <span className="text-slate-400">({tl.reviews_count || 0})</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {tl.verified_with_ai ? (
                        <div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                            tl.verification_status === "verified"
                              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                          }`}>
                            <ShieldCheck size={11} />
                            {tl.verification_status}
                          </span>
                          {tl.verification_notes && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 max-w-[200px] truncate" title={tl.verification_notes}>
                              {tl.verification_notes}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">Not yet verified</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        {/* Verify Button */}
                        <button
                          type="button"
                          disabled={verifyingId === tl.id}
                          onClick={() => handleVerify(tl.id)}
                          title="Reverify details with ChatGPT"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold hover:bg-indigo-100 transition disabled:opacity-50"
                        >
                          {verifyingId === tl.id ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                          Verify
                        </button>

                        {/* Promote Button */}
                        {tl.is_promoted ? (
                          <a
                            href={`/leads/${tl.promoted_lead_id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold"
                          >
                            <UserCheck size={11} /> In CRM
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled={promotingId === tl.id}
                            onClick={() => handlePromote(tl.id)}
                            title="Promote to full CRM Lead"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition disabled:opacity-50"
                          >
                            {promotingId === tl.id ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />}
                            Promote
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDelete(tl.id)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

