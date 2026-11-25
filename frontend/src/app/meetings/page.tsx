"use client";
import LocalizedText from "@/components/LocalizedText";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Plus, X, Clock, Users, MapPin, CheckCircle2, Filter, Search, Loader2, Video, Phone, Coffee, BarChart2, Trash2, Edit2, Upload, FileText, LayoutGrid, List, ExternalLink, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import TimezonePicker from "@/components/TimezonePicker";
import { detectTimeZone } from "@/lib/timezone";

interface Meeting {
  id: number; title: string; description?: string; location?: string;
  meeting_link?: string; timezone?: string;
  meeting_type: string; status: string;
  scheduled_at?: string; duration_minutes?: number;
  host_name?: string; lead_name?: string; client_name?: string; contact_name?: string;
  client_id?: number; lead_id?: number; contact_id?: number;
  attendees?: string[]; notes?: string; outcome?: string;
  created_at: string;
}

const TYPE_ICONS: Record<string, any> = {
  Meeting: Users, Demo: Video, "Follow-up": Phone, Discovery: Coffee, default: Calendar,
};
const STATUS_COLORS: Record<string, string> = {
  Scheduled: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  Completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  Cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  "No-show": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  Missed: "bg-rose-500/10 text-rose-500 border-rose-500/20",
};
const TYPES = ["Meeting", "Demo", "Follow-up", "Discovery", "Call"];
const STATUSES = ["Scheduled", "Completed", "Cancelled", "No-show", "Missed"];
const FILTER_TABS = ["All", "Today", "Tomorrow", "Missed", "Scheduled", "Completed", "Cancelled", "No-show"];

export default function MeetingsPage() {
  const { t } = useLanguage();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"cards" | "list" | "calendar">("cards");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarSubView, setCalendarSubView] = useState<"month" | "day">("month");
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [attendeeTab, setAttendeeTab] = useState<"clients" | "leads" | "contacts">("clients");
  const userTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC";
  const [form, setForm] = useState({
    title: "", description: "", location: "", meeting_link: "", timezone: userTz,
    meeting_type: "Meeting", status: "Scheduled", scheduled_at: "", duration_minutes: "60",
    attendees: "", notes: "", linked: "",
  });

  const load = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/meetings`)
      .then(r => r.json())
      .then(d => setMeetings(Array.isArray(d.meetings) ? d.meetings : []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/clients?per_page=100`)
      .then(r => r.json())
      .then(d => setClients(Array.isArray(d.clients) ? d.clients : []))
      .catch(() => {});
    fetch(`${API_BASE_URL}/leads?limit=100`)
      .then(r => r.json())
      .then(d => setLeads(Array.isArray(d.leads) ? d.leads : []))
      .catch(() => {});
    fetch(`${API_BASE_URL}/contacts?limit=100`)
      .then(r => r.json())
      .then(d => setContacts(Array.isArray(d.contacts) ? d.contacts : []))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 86400000;
    const tomorrowEnd = todayEnd + 86400000;

    return meetings.filter(m => {
      const q = search.toLowerCase();
      const matchSearch = !q || m.title.toLowerCase().includes(q) ||
        (m.client_name || "").toLowerCase().includes(q) ||
        (m.lead_name || "").toLowerCase().includes(q) ||
        (m.location || "").toLowerCase().includes(q) ||
        (m.meeting_link || "").toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (statusFilter === "All") return true;

      const mTime = m.scheduled_at ? new Date(m.scheduled_at).getTime() : 0;

      if (statusFilter === "Today") {
        return mTime >= todayStart && mTime < todayEnd;
      }
      if (statusFilter === "Tomorrow") {
        return mTime >= todayEnd && mTime < tomorrowEnd;
      }
      if (statusFilter === "Missed") {
        return m.status === "Missed" || (m.status === "Scheduled" && mTime > 0 && mTime < now.getTime());
      }
      return m.status === statusFilter;
    });
  }, [meetings, search, statusFilter]);

  const handleStatusChange = async (meetingId: number, newStatus: string) => {
    setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: newStatus } : m));
    try {
      await fetch(`${API_BASE_URL}/meetings/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (e) {
      console.error("Failed to update meeting status", e);
      load();
    }
  };

  const openCreate = (defaultDateStr?: string, defaultTimeStr?: string) => {
    setEditMeeting(null);
    let sched = "";
    if (defaultDateStr) {
      sched = `${defaultDateStr}T${defaultTimeStr || "09:00"}`;
    }
    setForm({
      title: "", description: "", location: "", meeting_link: "", timezone: userTz,
      meeting_type: "Meeting", status: "Scheduled",
      scheduled_at: sched,
      duration_minutes: "60",
      attendees: "", notes: "", linked: "",
    });
    setShowModal(true);
  };
  const openEdit = (m: Meeting) => {
    setEditMeeting(m);
    setForm({
      title: m.title, description: m.description || "", location: m.location || "",
      meeting_link: m.meeting_link || "", timezone: m.timezone || userTz,
      meeting_type: m.meeting_type, status: m.status,
      scheduled_at: m.scheduled_at ? m.scheduled_at.slice(0, 16) : "",
      duration_minutes: m.duration_minutes?.toString() || "60",
      attendees: (m.attendees || []).join(", "), notes: m.notes || "",
      linked: m.client_id ? `client:${m.client_id}` : m.lead_id ? `lead:${m.lead_id}` : m.contact_id ? `contact:${m.contact_id}` : "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const [linkType, linkId] = form.linked ? form.linked.split(":") : [];
    const linkIdNum = linkId ? parseInt(linkId) : null;
    const payload = {
      title: form.title, description: form.description || null, location: form.location || null,
      meeting_link: form.meeting_link || null, timezone: form.timezone || userTz,
      meeting_type: form.meeting_type, status: form.status,
      scheduled_at: form.scheduled_at || null,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      attendees: form.attendees ? form.attendees.split(",").map(s => s.trim()).filter(Boolean) : [],
      notes: form.notes || null,
      client_id: linkType === "client" ? linkIdNum : null,
      lead_id: linkType === "lead" ? linkIdNum : null,
      contact_id: linkType === "contact" ? linkIdNum : null,
    };
    const url = editMeeting ? `${API_BASE_URL}/meetings/${editMeeting.id}` : `${API_BASE_URL}/meetings`;
    const method = editMeeting ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    setShowModal(false);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("meetings.confirm_delete"))) return;
    await fetch(`${API_BASE_URL}/meetings/${id}`, { method: "DELETE" });
    load();
  };

  const attendeeArray = () => (form.attendees || "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAttendee = (email: string) => !!email && attendeeArray().some((a) => a.toLowerCase() === email.toLowerCase());
  const toggleAttendee = (email: string) => {
    if (!email) return;
    const current = attendeeArray();
    const exists = current.some((a) => a.toLowerCase() === email.toLowerCase());
    setForm((f) => ({
      ...f,
      attendees: exists ? current.filter((a) => a.toLowerCase() !== email.toLowerCase()).join(", ") : current.concat(email).join(", "),
    }));
  };
  const attendeeItems = () => {
    if (attendeeTab === "clients") return clients.map((c) => ({ id: c.id, name: c.companyName || c.projectName || c.contact_person || `Client #${c.id}`, email: c.email || "" }));
    if (attendeeTab === "leads") return leads.map((l) => ({ id: l.id, name: l.company_name || `Lead #${l.id}`, email: l.email || "" }));
    return contacts.map((c) => ({ id: c.id, name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || `Contact #${c.id}`, email: c.email || "" }));
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", importFile);
    await fetch(`${API_BASE_URL}/meetings/import`, { method: "POST", body: fd });
    setImporting(false);
    setShowImport(false);
    setImportFile(null);
    load();
  };

  const stats = [
    { label: t("meetings.total"), value: meetings.length, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { label: t("meetings.scheduled"), value: meetings.filter(m => m.status === "Scheduled").length, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: t("meetings.completed"), value: meetings.filter(m => m.status === "Completed").length, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: t("meetings.this_week"), value: meetings.filter(m => {
      if (!m.scheduled_at) return false;
      const d = new Date(m.scheduled_at), now = new Date();
      const diff = (d.getTime() - now.getTime()) / 86400000;
      return diff >= 0 && diff <= 7;
    }).length, color: "text-violet-500", bg: "bg-violet-500/10" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-zinc-100">{t("meetings.title")}</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400">{t("meetings.subtitle")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-sm font-bold hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all">
            <Upload className="w-4 h-4" /> {t("meetings.import")}
          </button>
          <button onClick={() => openCreate()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold hover:opacity-90 transition-all shadow-md">
            <Plus className="w-4 h-4" /> {t("meetings.schedule_meeting")}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mb-2`}>
              <Calendar className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-2xl font-black text-slate-800 dark:text-zinc-100">{loading ? "—" : s.value}</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("meetings.search_placeholder")}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0 mr-1" />
          {FILTER_TABS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === s ? "bg-violet-600 text-white shadow-sm" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 p-0.5 sm:ml-auto">
          <button
            onClick={() => setViewMode("cards")}
            className={`p-1.5 rounded-lg transition-all ${viewMode === "cards" ? "bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"}`}
            title="Cards View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-lg transition-all ${viewMode === "list" ? "bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"}`}
            title="List View"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={`p-1.5 rounded-lg transition-all ${viewMode === "calendar" ? "bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"}`}
            title="Calendar View"
          >
            <Calendar className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Meetings Content: Cards or List View */}
      {viewMode === "list" ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-violet-500 w-8 h-8" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-violet-500 opacity-60" />
              </div>
              <p className="text-base font-bold text-slate-700 dark:text-zinc-200">{t("meetings.no_meetings")}</p>
              <p className="text-sm text-slate-400 mt-1">{t("meetings.click_schedule")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-zinc-950/50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-5 py-3.5">Meeting / Title</th>
                    <th className="px-5 py-3.5">Client / Lead</th>
                    <th className="px-5 py-3.5"><LocalizedText text={"Scheduled Date & Time"} /></th>
                    <th className="px-5 py-3.5">Host / Attendees</th>
                    <th className="px-5 py-3.5"><LocalizedText text={"Location / Link"} /></th>
                    <th className="px-5 py-3.5"><LocalizedText text={"Status"} /></th>
                    <th className="px-5 py-3.5 text-center"><LocalizedText text={"Actions"} /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                  {filtered.map(m => {
                    const Icon = TYPE_ICONS[m.meeting_type] || TYPE_ICONS.default;
                    const statusCls = STATUS_COLORS[m.status] || "bg-slate-100 text-slate-500";
                    return (
                      <tr key={m.id} className="hover:bg-violet-50/30 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 dark:text-zinc-100">{m.title}</p>
                              <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400">{m.meeting_type}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                            {m.client_name || m.lead_name || m.contact_name || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{m.scheduled_at ? new Date(m.scheduled_at).toLocaleString() : "Date not set"}</span>
                          </div>
                          {m.duration_minutes && (
                            <span className="text-[10px] text-slate-400 mt-0.5 block">{m.duration_minutes} mins</span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-600 dark:text-zinc-400 font-medium">
                          <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{m.host_name || "Host"}</span>
                            {m.attendees && m.attendees.length > 0 && (
                              <span className="text-[10px] bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.2 rounded-md font-bold text-slate-500">
                                +{m.attendees.length}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {m.meeting_link ? (
                            <a
                              href={m.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-xs font-bold hover:bg-violet-200 transition-colors"
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>Join</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : m.location ? (
                            <span className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span className="truncate max-w-[120px]">{m.location}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <select
                            value={m.status}
                            onChange={e => handleStatusChange(m.id, e.target.value)}
                            className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-xl border cursor-pointer focus:outline-none transition-all shadow-sm ${statusCls}`}
                          >
                            {STATUSES.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openEdit(m)}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(m.id)}
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 dark:bg-red-950/40 dark:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : viewMode === "calendar" ? (
        <div className="bg-white dark:bg-[#111111]/90 border border-slate-200/90 dark:border-white/10 rounded-2xl p-4 sm:p-6 shadow-sm">
          {/* Calendar Header with Sub-View Switcher */}
          {(() => {
            const todayNow = new Date();
            const isViewingToday = calendarDate.toDateString() === todayNow.toDateString();
            const tomorrowNow = new Date();
            tomorrowNow.setDate(tomorrowNow.getDate() + 1);
            const isViewingTomorrow = calendarDate.toDateString() === tomorrowNow.toDateString();
            const yesterdayNow = new Date();
            yesterdayNow.setDate(yesterdayNow.getDate() - 1);
            const isViewingYesterday = calendarDate.toDateString() === yesterdayNow.toDateString();

            const targetDateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, "0")}-${String(calendarDate.getDate()).padStart(2, "0")}`;
            const dayMeetings = filtered.filter(m => m.scheduled_at && m.scheduled_at.startsWith(targetDateStr));

            const handlePrev = () => {
              if (calendarSubView === "day") {
                const next = new Date(calendarDate);
                next.setDate(next.getDate() - 1);
                setCalendarDate(next);
              } else {
                setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
              }
            };

            const handleNext = () => {
              if (calendarSubView === "day") {
                const next = new Date(calendarDate);
                next.setDate(next.getDate() + 1);
                setCalendarDate(next);
              } else {
                setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
              }
            };

            const handleTodayClick = () => {
              setCalendarDate(new Date());
              setCalendarSubView("day");
            };

            return (
              <>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold shrink-0">
                      {calendarSubView === "day" ? <Clock className="w-5 h-5" /> : <CalendarDays className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                          {calendarSubView === "day"
                            ? calendarDate.toLocaleDateString("default", { weekday: "long", month: "short", day: "numeric", year: "numeric" })
                            : calendarDate.toLocaleString("default", { month: "long", year: "numeric" })}
                        </h2>
                        {calendarSubView === "day" && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isViewingToday
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : isViewingTomorrow
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                : isViewingYesterday
                                ? "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"
                                : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
                            }`}
                          >
                            {isViewingToday
                              ? "Today"
                              : isViewingTomorrow
                              ? "Tomorrow"
                              : isViewingYesterday
                              ? "Yesterday"
                              : `${calendarDate.toLocaleDateString("default", { month: "short", day: "numeric" })}`}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        {calendarSubView === "day"
                          ? `${dayMeetings.length} ${dayMeetings.length === 1 ? "meeting" : "meetings"} scheduled on this date`
                          : `${filtered.length} total meetings scheduled this month`}
                      </p>
                    </div>
                  </div>

                  {/* Calendar Navigation & Mode Switcher */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* View Switcher: Month / Day Intervals */}
                    <div className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-white/10 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setCalendarSubView("month")}
                        className={`px-3 py-1.5 rounded-lg transition ${
                          calendarSubView === "month"
                            ? "bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-xs"
                            : "text-slate-500 hover:text-slate-800 dark:text-zinc-400"
                        }`}
                      >
                        Month
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalendarSubView("day")}
                        className={`px-3 py-1.5 rounded-lg transition ${
                          calendarSubView === "day"
                            ? "bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-xs"
                            : "text-slate-500 hover:text-slate-800 dark:text-zinc-400"
                        }`}
                      >
                        Day Intervals
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handlePrev}
                        className="p-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition"
                        title={calendarSubView === "day" ? "Previous Day" : "Previous Month"}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleTodayClick}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                          isViewingToday && calendarSubView === "day"
                            ? "bg-violet-600 text-white border-violet-600 shadow-xs"
                            : "border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-700"
                        }`}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={handleNext}
                        className="p-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition"
                        title={calendarSubView === "day" ? "Next Day (Tomorrow / Forward)" : "Next Month"}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => openCreate(targetDateStr)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-sm transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Schedule</span>
                    </button>
                  </div>
                </div>

                {/* DAY TIME INTERVALS SCHEDULE VIEW */}
                {calendarSubView === "day" ? (
                  <div className="space-y-4">
                    {/* Day Summary Numbers Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Meetings Today</p>
                          <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">{dayMeetings.length}</p>
                        </div>
                        <Calendar className="w-5 h-5 text-violet-500 opacity-60" />
                      </div>

                      <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Scheduled</p>
                          <p className="text-xl font-black text-blue-700 dark:text-blue-300 tabular-nums mt-0.5">
                            {dayMeetings.filter(m => m.status === "Scheduled").length}
                          </p>
                        </div>
                        <Clock className="w-5 h-5 text-blue-500 opacity-60" />
                      </div>

                      <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Completed</p>
                          <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums mt-0.5">
                            {dayMeetings.filter(m => m.status === "Completed").length}
                          </p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 opacity-60" />
                      </div>

                      <div className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Booked Duration</p>
                          <p className="text-xl font-black text-purple-700 dark:text-purple-300 tabular-nums mt-0.5">
                            {(() => {
                              const mins = dayMeetings.reduce((acc, m) => acc + (m.duration_minutes || 60), 0);
                              if (mins === 0) return "0m";
                              if (mins < 60) return `${mins}m`;
                              return `${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ""}`;
                            })()}
                          </p>
                        </div>
                        <BarChart2 className="w-5 h-5 text-purple-500 opacity-60" />
                      </div>
                    </div>

                    {/* Hourly Time Intervals Timeline (05:00 AM to 11:00 PM) */}
                    <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800/80 bg-white dark:bg-zinc-950">
                      {Array.from({ length: 19 }, (_, i) => i + 5).map((hour) => {
                        const hourStr = String(hour).padStart(2, "0");
                        const timeLabel = new Date(2000, 0, 1, hour, 0).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });

                        const slotMeetings = dayMeetings.filter(m => {
                          if (!m.scheduled_at) return false;
                          const mHour = new Date(m.scheduled_at).getHours();
                          return mHour === hour;
                        });

                        return (
                          <div
                            key={hour}
                            className={`group flex items-start min-h-[64px] transition-colors ${
                              slotMeetings.length > 0
                                ? "bg-violet-50/20 dark:bg-violet-950/10"
                                : "hover:bg-slate-50/60 dark:hover:bg-zinc-900/40"
                            }`}
                          >
                            {/* Time Interval Label */}
                            <div className="w-24 sm:w-28 p-3 text-right shrink-0 border-r border-slate-100 dark:border-zinc-800 select-none">
                              <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 block tabular-nums">
                                {timeLabel}
                              </span>
                            </div>

                            {/* Meeting slot content */}
                            <div className="flex-1 p-2.5 sm:px-4">
                              {slotMeetings.length > 0 ? (
                                <div className="space-y-2">
                                  {slotMeetings.map(m => {
                                    const Icon = TYPE_ICONS[m.meeting_type] || TYPE_ICONS.default;
                                    const statusCls = STATUS_COLORS[m.status] || "bg-violet-50 text-violet-700 border-violet-200";
                                    const timeStr = m.scheduled_at
                                      ? new Date(m.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                      : "";

                                    return (
                                      <div
                                        key={m.id}
                                        className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs hover:border-violet-400 dark:hover:border-violet-600 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                      >
                                        <div className="flex items-start gap-3 min-w-0">
                                          <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                                            <Icon className="w-4 h-4" />
                                          </div>
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                              <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                                {m.title}
                                              </p>
                                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusCls}`}>
                                                {m.status}
                                              </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-zinc-400 mt-1">
                                              <span className="font-semibold text-slate-700 dark:text-zinc-300">
                                                {timeStr} ({m.duration_minutes || 60}m)
                                              </span>
                                              {(m.client_name || m.lead_name || m.contact_name) && (
                                                <span className="flex items-center gap-1">
                                                  <Users className="w-3.5 h-3.5 text-slate-400" />
                                                  <span>{m.client_name || m.lead_name || m.contact_name}</span>
                                                </span>
                                              )}
                                              {m.meeting_link && (
                                                <a
                                                  href={m.meeting_link.startsWith("http") ? m.meeting_link : `https://${m.meeting_link}`}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline font-semibold"
                                                >
                                                  <Video className="w-3.5 h-3.5" />
                                                  <span>Join Meeting</span>
                                                </a>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                          <button
                                            type="button"
                                            onClick={() => openEdit(m)}
                                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 transition"
                                            title="Edit meeting"
                                          >
                                            <Edit2 className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDelete(m.id)}
                                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 dark:bg-rose-950/40 dark:text-rose-400 transition"
                                            title="Delete meeting"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openCreate(targetDateStr, `${hourStr}:00`)}
                                  className="w-full py-2 px-3 rounded-lg border border-dashed border-transparent hover:border-slate-300 dark:hover:border-zinc-700 text-left text-xs text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition flex items-center justify-between opacity-0 group-hover:opacity-100"
                                >
                                  <span>+ Schedule meeting at {timeLabel}</span>
                                  <span className="text-[10px] font-semibold text-slate-400">Available</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* MONTH CALENDAR VIEW */
                  <>
                    {/* Days of week header */}
                    <div className="grid grid-cols-7 gap-px mb-2 text-center text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, idx) => (
                        <div key={day} className={`py-2 ${idx === 0 || idx === 6 ? "text-slate-400 dark:text-zinc-500" : ""}`}>
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Calendar Month Grid */}
                    {(() => {
                      const year = calendarDate.getFullYear();
                      const month = calendarDate.getMonth();
                      const firstDayIndex = new Date(year, month, 1).getDay();
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const prevMonthDays = new Date(year, month, 0).getDate();
                      const today = new Date();
                      const isCurrentYearMonth = today.getFullYear() === year && today.getMonth() === month;

                      const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;
                      const cells = [];

                      for (let i = 0; i < totalCells; i++) {
                        if (i < firstDayIndex) {
                          const dayNum = prevMonthDays - firstDayIndex + i + 1;
                          const prevM = month === 0 ? 12 : month;
                          const prevY = month === 0 ? year - 1 : year;
                          const cellDateStr = `${prevY}-${String(prevM).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                          cells.push({ day: dayNum, isCurrentMonth: false, isToday: false, dateStr: cellDateStr });
                        } else if (i < firstDayIndex + daysInMonth) {
                          const dayNum = i - firstDayIndex + 1;
                          const cellDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                          cells.push({
                            day: dayNum,
                            isCurrentMonth: true,
                            isToday: isCurrentYearMonth && today.getDate() === dayNum,
                            dateStr: cellDateStr,
                          });
                        } else {
                          const dayNum = i - (firstDayIndex + daysInMonth) + 1;
                          const nextM = month === 11 ? 1 : month + 2;
                          const nextY = month === 11 ? year + 1 : year;
                          const cellDateStr = `${nextY}-${String(nextM).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                          cells.push({ day: dayNum, isCurrentMonth: false, isToday: false, dateStr: cellDateStr });
                        }
                      }

                      const meetingsByDay: Record<string, Meeting[]> = {};
                      filtered.forEach(m => {
                        if (m.scheduled_at) {
                          const dStr = m.scheduled_at.slice(0, 10);
                          if (!meetingsByDay[dStr]) meetingsByDay[dStr] = [];
                          meetingsByDay[dStr].push(m);
                        }
                      });

                      return (
                        <div className="grid grid-cols-7 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-slate-200 dark:border-zinc-800 dark:bg-zinc-800 gap-[1px]">
                          {cells.map((cell, idx) => {
                            const dayMeetings = meetingsByDay[cell.dateStr] || [];
                            return (
                              <div
                                key={idx}
                                onClick={() => {
                                  if (cell.isCurrentMonth) {
                                    const [y, m, d] = cell.dateStr.split("-").map(Number);
                                    setCalendarDate(new Date(y, m - 1, d));
                                    setCalendarSubView("day");
                                  }
                                }}
                                className={`group min-h-[110px] sm:min-h-[125px] p-2 flex flex-col justify-between transition-colors cursor-pointer ${
                                  cell.isCurrentMonth
                                    ? "bg-white dark:bg-zinc-950/90 hover:bg-slate-50/80 dark:hover:bg-zinc-900/50"
                                    : "bg-slate-50/60 dark:bg-zinc-900/40 text-slate-400 dark:text-zinc-600"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                                      cell.isToday
                                        ? "bg-violet-600 text-white shadow-xs"
                                        : cell.isCurrentMonth
                                        ? "text-slate-800 dark:text-zinc-200"
                                        : "text-slate-400 dark:text-zinc-600"
                                    }`}
                                  >
                                    {cell.day}
                                  </span>
                                  {cell.isCurrentMonth && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openCreate(cell.dateStr);
                                      }}
                                      className="w-5 h-5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                      title={`Schedule meeting on ${cell.dateStr}`}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>

                                <div className="mt-1 space-y-1 flex-1 overflow-y-auto max-h-[80px]">
                                  {dayMeetings.map((m) => {
                                    const timeStr = m.scheduled_at ? new Date(m.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                                    const statusCls = STATUS_COLORS[m.status] || "bg-violet-50 text-violet-700 border-violet-200";
                                    return (
                                      <div
                                        key={m.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openEdit(m);
                                        }}
                                        className={`cursor-pointer px-1.5 py-1 rounded-md text-[11px] font-medium border transition hover:scale-[1.02] shadow-2xs ${statusCls}`}
                                        title={`${m.title} (${m.meeting_type}) - ${m.status}`}
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="font-bold truncate">{m.title}</span>
                                          {timeStr && <span className="text-[9px] opacity-80 shrink-0">{timeStr}</span>}
                                        </div>
                                        {(m.client_name || m.lead_name || m.contact_name) && (
                                          <p className="text-[10px] opacity-75 truncate">{m.client_name || m.lead_name || m.contact_name}</p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-3 flex justify-center py-20"><Loader2 className="animate-spin text-violet-500 w-8 h-8" /></div>
          ) : filtered.length === 0 ? (
            <div className="col-span-3 flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-violet-500 opacity-60" />
              </div>
              <p className="text-base font-bold text-slate-700 dark:text-zinc-200">{t("meetings.no_meetings")}</p>
              <p className="text-sm text-slate-400 mt-1">{t("meetings.click_schedule")}</p>
            </div>
          ) : filtered.map((m, i) => {
          const Icon = TYPE_ICONS[m.meeting_type] || TYPE_ICONS.default;
          const statusCls = STATUS_COLORS[m.status] || "bg-slate-100 text-slate-500";
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800 dark:text-zinc-100 line-clamp-1">{m.title}</p>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">{m.meeting_type}</p>
                  </div>
                </div>
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <select
                    value={m.status}
                    onChange={e => handleStatusChange(m.id, e.target.value)}
                    className={`text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-lg border cursor-pointer focus:outline-none transition-all shadow-sm ${statusCls}`}
                    title="Click to change meeting status"
                  >
                    <option value="Scheduled" className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100"><LocalizedText text={"Scheduled"} /></option>
                    <option value="Completed" className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100"><LocalizedText text={"Completed"} /></option>
                    <option value="Cancelled" className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100"><LocalizedText text={"Cancelled"} /></option>
                    <option value="No-show" className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100">No-show</option>
                    <option value="Missed" className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100">Missed</option>
                  </select>
                </div>
              </div>
              {m.scheduled_at && (() => {
                const start = new Date(m.scheduled_at);
                const end = m.duration_minutes ? new Date(start.getTime() + m.duration_minutes * 60000) : null;
                return (
                  <div className="flex flex-col gap-0.5 mb-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-slate-600 dark:text-zinc-300">
                        {start.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {end && ` – ${end.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" })}`}
                        {m.duration_minutes && ` (${m.duration_minutes}m)`}
                      </span>
                    </div>
                    {m.timezone && (
                      <span className="text-[10px] text-slate-400 pl-5">TZ: {m.timezone}</span>
                    )}
                  </div>
                );
              })()}
              {m.meeting_link && (
                <div className="mb-2">
                  <a
                    href={m.meeting_link.startsWith("http") ? m.meeting_link : `https://${m.meeting_link}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-sm"
                  >
                    <Video className="w-3.5 h-3.5" /> <LocalizedText text={"Join Meeting"} /></a>
                </div>
              )}
              {m.location && (
                <div className="flex items-center gap-1.5 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {m.location.startsWith("http") ? (
                    <a href={m.location} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline truncate">
                      {m.location}
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-zinc-400 truncate">{m.location}</span>
                  )}
                </div>
              )}
              {(m.client_name || m.lead_name || m.contact_name) && (
                <div className="flex items-center gap-1.5 mb-3">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-500 dark:text-zinc-400">{m.client_name || m.lead_name || m.contact_name}</span>
                </div>
              )}
              <div className="flex gap-2 mt-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(m)} className="flex-1 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-1 active:scale-95">
                  <Edit2 className="w-3 h-3" /> {t("meetings.edit")}
                </button>
                <button onClick={() => handleDelete(m.id)} className="flex-1 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-bold hover:bg-red-500/20 transition-all flex items-center justify-center gap-1 active:scale-95">
                  <Trash2 className="w-3 h-3" /> {t("meetings.delete")}
                </button>
              </div>
            </motion.div>
          );
        })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-zinc-700">
                <h2 className="text-lg font-black text-slate-800 dark:text-zinc-100">{editMeeting ? t("meetings.edit_meeting") : t("meetings.schedule_meeting")}</h2>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("meetings.title_label")} *</label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t("meetings.title_placeholder")}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest block">Meeting Link</label>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setForm(f => ({ ...f, meeting_link: "https://meet.google.com/new" }))}
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 hover:bg-violet-200 transition-colors">
                        + Google Meet
                      </button>
                      <button type="button" onClick={() => setForm(f => ({ ...f, meeting_link: "https://zoom.us/start/videomeeting" }))}
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-200 transition-colors">
                        + Zoom
                      </button>
                    </div>
                  </div>
                  <input value={form.meeting_link} onChange={e => setForm(f => ({ ...f, meeting_link: e.target.value }))} placeholder="https://meet.google.com/... or https://zoom.us/..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block"><LocalizedText text={"Type"} /></label>
                    <select value={form.meeting_type} onChange={e => setForm(f => ({ ...f, meeting_type: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500">
                      {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block"><LocalizedText text={"Status"} /></label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500">
                      {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("meetings.location_label")}</label>
                  <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder={t("meetings.location_placeholder")}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>

                {/* Timezone Handling with Automatic Confirmation */}
                <TimezonePicker
                  value={form.timezone}
                  onChange={tz => setForm(f => ({ ...f, timezone: tz }))}
                  localTime={form.scheduled_at}
                  label="Meeting Timezone"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">{t("meetings.date_time")} *</label>
                    <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">{t("meetings.duration_min")}</label>
                    <input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} placeholder="60"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {[15, 30, 45, 60, 90].map(dur => (
                        <button key={dur} type="button" onClick={() => setForm(f => ({ ...f, duration_minutes: String(dur) }))}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors ${form.duration_minutes === String(dur) ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"}`}>
                          {dur}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">{t("meetings.attendees_label")}</label>
                  <input value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))} placeholder={t("meetings.attendees_placeholder")}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />

                  {/* Picker: select attendees from clients / leads / contacts */}
                  <div className="mt-2 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
                    <div className="flex border-b border-slate-200 dark:border-zinc-700">
                      {(["clients", "leads", "contacts"] as const).map((tab) => (
                        <button key={tab} onClick={() => setAttendeeTab(tab)}
                          className={`flex-1 px-2 py-2 text-xs font-bold transition-all ${attendeeTab === tab ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300" : "text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800"}`}>
                          {tab === "clients" ? "Clients" : tab === "leads" ? "Leads" : "Contacts"}
                          <span className="ml-1 text-[10px] opacity-70">({({ clients: clients.length, leads: leads.length, contacts: contacts.length })[tab]})</span>
                        </button>
                      ))}
                    </div>
                    <div className="max-h-44 overflow-y-auto p-1.5 space-y-1">
                      {attendeeItems().length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-4">{t("meetings.no_items")}</p>
                      ) : attendeeItems().map((item) => {
                        const selected = isAttendee(item.email);
                        return (
                          <button key={`${attendeeTab}-${item.id}`} onClick={() => toggleAttendee(item.email)} disabled={!item.email}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left transition-all text-xs disabled:opacity-40 ${selected ? "bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800" : "bg-slate-50 dark:bg-zinc-800 border border-transparent hover:border-slate-200 dark:hover:border-zinc-700"}`}>
                            <span className="font-bold text-slate-700 dark:text-zinc-200 truncate">{item.name}</span>
                            <span className="flex items-center gap-1.5 text-slate-400 dark:text-zinc-500 shrink-0">
                              <span className="max-w-[140px] truncate">{item.email || "—"}</span>
                              {selected ? <CheckCircle2 className="w-4 h-4 text-violet-500" /> : <Plus className="w-3.5 h-3.5" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">{t("meetings.notes")}</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder={t("meetings.notes_placeholder")}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 p-4 sm:p-6 pt-0">
                <button onClick={() => setShowModal(false)} className="w-full sm:flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-bold text-sm hover:bg-slate-200 transition-all cursor-pointer">{t("meetings.cancel")}</button>
                <button onClick={handleSave} disabled={saving || !form.title.trim()}
                  className="w-full sm:flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editMeeting ? t("meetings.update") : t("meetings.schedule")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import Modal */}
      <AnimatePresence>
        {showImport && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-slate-800 dark:text-zinc-100">{t("meetings.import_meetings")}</h2>
                <button onClick={() => setShowImport(false)}><X className="w-4 h-4" /></button>
              </div>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mb-4">{t("meetings.import_desc")}</p>
              <label className="block w-full border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 transition-colors">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-600 dark:text-zinc-300">{importFile ? importFile.name : t("meetings.click_select")}</p>
                <p className="text-xs text-slate-400 mt-1">.csv, .xlsx, .xls</p>
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => setImportFile(e.target.files?.[0] || null)} />
              </label>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowImport(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-all">{t("meetings.cancel")}</button>
                <button onClick={handleImport} disabled={!importFile || importing}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {importing && <Loader2 className="w-4 h-4 animate-spin" />} {t("meetings.import")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
