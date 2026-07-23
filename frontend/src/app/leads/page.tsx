"use client";
import { API_BASE_URL } from "@/config";
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Filter, MoreVertical, Building2, Globe, Mail, Phone, Upload, X, Loader2, ChevronDown, ArrowUpRight, CheckCircle2, Clock, Zap, Edit2, Trash2, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ViewSwitcher, ViewType } from "@/components/ViewSwitcher";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Lead {
  id: number;
  company_name: string;
  website?: string | null;
  industry?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  source?: string | null;
  status: string;
  is_converted: boolean;
  notes?: string | null;
  created_at: string;
}

interface ActivityLogEntry {
  id: number;
  action: string;
  method: string;
  content: string;
  details?: string;
  leadId: number;
  createdAt: string;
}

const INDUSTRIES = [
  "Technology", "Marketing", "E-commerce", "Healthcare", "Finance",
  "Real Estate", "Education", "Manufacturing", "Retail", "Legal",
  "Consulting", "Media", "Hospitality", "Construction", "Other"
];
const SOURCES = ["Website", "Email", "Referral", "LinkedIn", "Cold Call", "Event", "Radar", "Import", "Other"];
const STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];

const STATUS_STYLE: Record<string, string> = {
  New: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  Contacted: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  Qualified: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "Proposal Sent": "bg-orange-500/10 text-orange-600 border-orange-500/20",
  Negotiation: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  Won: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  Lost: "bg-red-500/10 text-red-500 border-red-500/20",
  Converted: "bg-green-500/10 text-green-700 border-green-500/20",
};

const emptyForm = {
  company_name: "", website: "", industry: "", email: "",
  phone: "", address: "", source: "Website", status: "New", notes: ""
};

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('list');
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [sortOption, setSortOption] = useState<"recent" | "name">("recent");

  useEffect(() => { fetchLeads(); fetchActivities(); }, []);

  const fetchActivities = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/activities`);
      if (res.ok) {
        const data = await res.json();
        setActivities((data.activities || []).filter((a: any) => a.leadId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/leads`);
      if (res.ok) setLeads((await res.json()).leads || []);
    } catch (e) {
      console.error("Failed to fetch leads", e);
    } finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    let result = leads.filter(l => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || (l.company_name || "").toLowerCase().includes(q)
        || (l.email || "").toLowerCase().includes(q)
        || (l.industry || "").toLowerCase().includes(q)
        || (l.source || "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "All"
        || (statusFilter === "Converted" ? l.is_converted : l.status === statusFilter);
      return matchSearch && matchStatus;
    });

    if (sortOption === "recent") {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortOption === "name") {
      result.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || ""));
    }

    return result;
  }, [leads, searchQuery, statusFilter, sortOption]);

  const openCreate = () => {
    setEditLead(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditLead(lead);
    setForm({
      company_name: lead.company_name,
      website: lead.website || "",
      industry: lead.industry || "",
      email: lead.email || "",
      phone: lead.phone || "",
      address: lead.address || "",
      source: lead.source || "Website",
      status: lead.status,
      notes: lead.notes || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) return;
    setSaving(true);
    try {
      if (editLead) {
        await fetch(`${API_BASE_URL}/leads/${editLead.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else {
        await fetch(`${API_BASE_URL}/leads`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      setShowModal(false);
      fetchLeads();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this lead?")) return;
    await fetch(`${API_BASE_URL}/leads/${id}`, { method: "DELETE" });
    fetchLeads();
  };

  const handleConvert = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Convert this lead to a client?")) return;
    try {
      await fetch(`${API_BASE_URL}/leads/${id}/convert`, { method: "POST" });
      fetchLeads();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddNote = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    const note = prompt("Enter note for this lead:");
    if (note) {
      fetch(`${API_BASE_URL}/leads/${lead.id}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: note })
      }).then(() => fetchLeads());
    }
  };

  const stats = [
    { label: "Total Leads", value: leads.length, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: "New", value: leads.filter(l => l.status === "New").length, color: "text-violet-600", bg: "bg-violet-500/10" },
    { label: "Qualified", value: leads.filter(l => l.status === "Qualified").length, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: "Converted", value: leads.filter(l => l.is_converted).length, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  ];

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-[#0f172a]">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b]">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Leads</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage your prospects and opportunities</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/import" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors">
              <Upload className="w-4 h-4" /> Import
            </Link>
            <button
              id="add-lead-btn"
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-all hover:shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4" /> Add Lead
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {stats.map(s => (
            <div key={s.label} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${s.bg} border border-transparent`}>
              <p className={`text-xl font-black ${s.color}`}>{loading ? "—" : s.value}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-[#1e293b] border-b border-slate-200 dark:border-slate-800 flex-wrap gap-3">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" placeholder="Search leads..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} />
          
          {/* Sort Dropdown */}
          <select 
            value={sortOption} 
            onChange={e => setSortOption(e.target.value as "recent" | "name")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 focus:outline-none border-r-8 border-transparent"
          >
            <option value="recent">Recent</option>
            <option value="name">Name</option>
          </select>

          {["All", ...STATUSES, "Converted"].map(s => {
            const count = s === "All" ? leads.length : (s === "Converted" ? leads.filter(l => l.is_converted).length : leads.filter(l => l.status === s).length);
            return (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${statusFilter === s ? "bg-blue-600 dark:bg-white text-white dark:text-black shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
                {s} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
      {/* Table */}
      <div className="flex-1 overflow-auto bg-white dark:bg-[#1e293b]">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No leads found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">Try adjusting filters or click "Add Lead" to get started.</p>
            <button onClick={openCreate} className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all">
              <Plus className="w-4 h-4" /> Add your first lead
            </button>
          </div>
        ) : currentView === 'kanban' ? (
          <div className="flex gap-4 p-6 overflow-x-auto h-full items-start">
            {STATUSES.map(status => {
              const colLeads = filtered.filter(l => l.status === status);
              return (
                <div key={status} className="w-80 shrink-0 flex flex-col bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-2xl max-h-full">
                  <div className="p-4 font-bold text-slate-800 dark:text-white flex items-center justify-between border-b border-slate-200 dark:border-[#222222]">
                    <span>{status}</span>
                    <span className="px-2.5 py-1 rounded-full bg-slate-200 dark:bg-[#222222] text-xs text-slate-600 dark:text-[#a3a3a3]">{colLeads.length}</span>
                  </div>
                  <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[200px]">
                    {colLeads.map(lead => (
                      <motion.div key={lead.id} layoutId={`lead-${lead.id}`} onClick={() => router.push(`/leads/${lead.id}`)}
                        className="p-4 bg-white dark:bg-[#000000] rounded-xl shadow-sm border border-slate-200 dark:border-[#222222] cursor-pointer hover:border-blue-500 dark:hover:border-white transition-colors group">
                        <div className="font-semibold text-slate-900 dark:text-white text-sm">{lead.company_name}</div>
                        <div className="text-[12px] text-slate-500 mt-1 line-clamp-1">{lead.industry || 'No industry'}</div>
                        {lead.email && <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1"><Mail className="w-3 h-3"/>{lead.email}</div>}
                      </motion.div>
                    ))}
                    {colLeads.length === 0 && <div className="p-4 text-center text-sm text-slate-400 border-2 border-dashed border-slate-200 dark:border-[#222222] rounded-xl">No leads</div>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : currentView === 'graph' ? (
          <div className="p-8 h-full">
            <div className="bg-white dark:bg-[#111111] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-[#222222] h-[500px]">
              <h3 className="text-lg font-bold mb-6 text-slate-900 dark:text-white">Leads by Status</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={STATUSES.map(s => ({ name: s, count: filtered.filter(l => l.status === s).length }))} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis dataKey="name" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#000', borderColor: '#222', color: '#fff'}} />
                  <Bar dataKey="count" fill="currentColor" className="fill-blue-500 dark:fill-white" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : currentView === 'pivot' ? (
          <div className="p-6 h-full overflow-auto">
            <table className="w-full text-left border-collapse bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-2xl overflow-hidden shadow-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#000000] border-b border-slate-200 dark:border-[#222222] text-xs uppercase tracking-wider text-slate-500 dark:text-[#a3a3a3]">
                  <th className="p-4 font-semibold">Industry \ Status</th>
                  {STATUSES.map(s => <th key={s} className="p-4 font-semibold text-center">{s}</th>)}
                  <th className="p-4 font-bold text-center border-l border-slate-200 dark:border-[#222222]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#222222]">
                {Array.from(new Set(filtered.map(l => l.industry || 'Other'))).map(ind => {
                  const indLeads = filtered.filter(l => (l.industry || 'Other') === ind);
                  return (
                    <tr key={ind} className="hover:bg-slate-50 dark:hover:bg-[#0a0a0a]">
                      <td className="p-4 font-medium text-slate-900 dark:text-white">{ind}</td>
                      {STATUSES.map(s => <td key={s} className="p-4 text-center text-slate-600 dark:text-[#a3a3a3]">{indLeads.filter(l => l.status === s).length || '-'}</td>)}
                      <td className="p-4 text-center font-bold text-slate-900 dark:text-white border-l border-slate-200 dark:border-[#222222]">{indLeads.length}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="px-6 py-4 font-medium">Company</th>
                <th className="px-6 py-4 font-medium">Industry</th>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium">Source</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              <AnimatePresence>
                {filtered.map((lead, idx) => (
                  <motion.tr
                    key={lead.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    onClick={() => router.push(`/leads/${lead.id}`)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer group transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1">
                          {lead.company_name}
                          <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                        {lead.website && (
                          <div className="flex items-center gap-1 mt-0.5 text-[12px] text-slate-400">
                            <Globe className="w-3 h-3" />
                            <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                              target="_blank" rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="hover:text-blue-600 hover:underline truncate max-w-[180px]">
                              {lead.website.replace(/^https?:\/\//, '')}
                            </a>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[13px] text-slate-600 dark:text-slate-300">{lead.industry || "—"}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        {lead.email && <div className="flex items-center gap-1 text-[12px] text-slate-500"><Mail className="w-3 h-3" /><span className="truncate max-w-[160px]">{lead.email}</span></div>}
                        {lead.phone && <div className="flex items-center gap-1 text-[12px] text-slate-500"><Phone className="w-3 h-3" /><span>{lead.phone}</span></div>}
                        {!lead.email && !lead.phone && <span className="text-slate-400 text-[12px]">—</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {lead.source || "Unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border ${STATUS_STYLE[lead.is_converted ? "Converted" : lead.status] || STATUS_STYLE.New}`}>
                        {lead.is_converted ? "Converted" : lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!lead.is_converted && (
                          <button onClick={e => handleConvert(lead.id, e)} title="Convert to Client" className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 text-slate-400 hover:text-green-600 transition-colors">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={e => handleAddNote(lead, e)} title="Add Note" className="p-1.5 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-slate-400 hover:text-yellow-600 transition-colors">
                          <Tag className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={e => openEdit(lead, e)} title="Edit Lead" className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={e => handleDelete(lead.id, e)} title="Delete Lead" className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* Activity Sidebar */}
      <motion.div
        initial="hidden" animate="show"
        className="w-full xl:w-[400px] shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b] flex flex-col h-full overflow-hidden"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <div className="p-2 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl"><Zap className="w-5 h-5" /></div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">Recent Activity</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activities.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No activity yet.</p>
          ) : (
            activities.map(act => (
              <Link href={act.leadId ? `/leads/${act.leadId}` : '#'} key={act.id} className="block p-4 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 transition-colors group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold px-2 py-1 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg">{act.action}</span>
                  <span className="text-[10px] text-slate-400 font-medium">{new Date(act.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">{act.content}</p>
                {act.details && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-1">{act.details}</p>
                )}
              </Link>
            ))
          )}
        </div>
      </motion.div>
      </div>

      {/* ADD / EDIT MODAL */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editLead ? "Edit Lead" : "Add New Lead"}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">All incoming records are stored as leads</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <div className="px-6 py-5 space-y-4">
                {/* Company Name — required */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    autoFocus
                    value={form.company_name}
                    onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                    placeholder="e.g. Acme Corp"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@company.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Phone</label>
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Industry</label>
                    <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                      <option value="">Select industry...</option>
                      {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Source</label>
                    <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                      {SOURCES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Website</label>
                    <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://example.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Address</label>
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="City, Country"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    placeholder="Any additional context about this lead..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none" />
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || !form.company_name.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/20">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editLead ? "Save Changes" : "Add Lead"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
