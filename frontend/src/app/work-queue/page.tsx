"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Calendar, CheckSquare, PhoneCall, Users, Target, Radar, Briefcase,
  Clock, CheckCircle, Search, Filter, Loader2, Play, AlertCircle
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import { useRole } from "@/context/RoleContext";

export default function WorkQueuePage() {
  const { language, t } = useLanguage();
  const { role, user } = useRole();
  const [dateFilter, setDateFilter] = useState("today");
  const [activeTab, setActiveTab] = useState("combined");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({
    tasks: [], meetings: [], calls: [], leads: [], contacts: [], deals: [], clients: [], tickets: [], ticket_due: [], ticket_ongoing: [], ticket_completed: [], cases: []
  });

  useEffect(() => {
    fetchWorkQueue();
  }, [dateFilter]);

  const fetchWorkQueue = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/work-queue?date_filter=${dateFilter}&user_id=${user?.id || 0}&role=${role || 'Employee'}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.ok) {
        if (json.tasks) json.tasks = json.tasks.map((i:any) => ({...i, _type: 'task'}));
        if (json.meetings) json.meetings = json.meetings.map((i:any) => ({...i, _type: 'meeting'}));
        if (json.calls) json.calls = json.calls.map((i:any) => ({...i, _type: 'call'}));
        if (json.leads) json.leads = json.leads.map((i:any) => ({...i, _type: 'lead'}));
        if (json.contacts) json.contacts = json.contacts.map((i:any) => ({...i, _type: 'contact'}));
        if (json.deals) json.deals = json.deals.map((i:any) => ({...i, _type: 'deal'}));
        if (json.tickets) json.tickets = json.tickets.map((i:any) => ({...i, _type: 'ticket'}));
        if (json.ticket_due) json.ticket_due = json.ticket_due.map((i:any) => ({...i, _type: 'ticket_due'}));
        if (json.ticket_ongoing) json.ticket_ongoing = json.ticket_ongoing.map((i:any) => ({...i, _type: 'ticket_ongoing'}));
        if (json.ticket_completed) json.ticket_completed = json.ticket_completed.map((i:any) => ({...i, _type: 'ticket_completed'}));
        if (json.cases) json.cases = json.cases.map((i:any) => ({...i, _type: 'case'}));
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const TABS = [
    { id: "combined", label: t("work_queue.tab_combined"), icon: Target, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/50 dark:border-indigo-800/40" },
    { id: "tasks", label: t("work_queue.tab_tasks"), icon: CheckSquare, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200/50 dark:border-blue-800/40" },
    { id: "tickets", label: t("work_queue.tab_tickets") || "Tickets", icon: Play, color: "text-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200/50 dark:border-cyan-800/40" },
    { id: "ticket_due", label: "Tickets Due", icon: Clock, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200/50 dark:border-amber-800/40" },
    { id: "ticket_ongoing", label: "In Development", icon: Play, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950/40 border-violet-200/50 dark:border-violet-800/40" },
    { id: "ticket_completed", label: "Completed", icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/50 dark:border-emerald-800/40" },
    { id: "cases", label: "Support Cases", icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-950/40 border-rose-200/50 dark:border-rose-800/40" },
    { id: "clients", label: "My Clients", icon: Briefcase, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/50 dark:border-indigo-800/40" },
    { id: "meetings", label: t("work_queue.tab_meetings"), icon: Calendar, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200/50 dark:border-purple-800/40" },
    { id: "calls", label: t("work_queue.tab_calls"), icon: PhoneCall, color: "text-green-500", bg: "bg-green-50 dark:bg-green-950/40 border-green-200/50 dark:border-green-800/40" },
    { id: "leads", label: t("work_queue.tab_leads"), icon: Radar, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200/50 dark:border-amber-800/40" },
    { id: "contacts", label: t("work_queue.tab_contacts"), icon: Users, color: "text-pink-500", bg: "bg-pink-50 dark:bg-pink-950/40 border-pink-200/50 dark:border-pink-800/40" },
    { id: "deals", label: t("work_queue.tab_deals"), icon: Briefcase, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/50 dark:border-emerald-800/40" },
  ];

  const renderItemCard = (item: any, type: string) => {
    let title = "";
    let sub = "";
    let time = "";
    let status = "";
    let Icon = Target;
    let badgeColor = "";

    switch(type) {
      case "task":
        title = item.title;
        sub = item.description || t("work_queue.no_description");
        time = item.due_date ? new Date(item.due_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.status;
        Icon = CheckSquare;
        badgeColor = "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/40";
        break;
      case "meeting":
        title = item.title;
        sub = item.meeting_type || t("work_queue.meeting");
        time = item.scheduled_at ? new Date(item.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.status;
        Icon = Calendar;
        badgeColor = "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200/60 dark:border-purple-800/40";
        break;
      case "call":
        title = item.title || t("work_queue.scheduled_call");
        sub = item.purpose || t("work_queue.follow_up");
        time = item.scheduled_at ? new Date(item.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.status;
        Icon = PhoneCall;
        badgeColor = "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/40";
        break;
      case "lead":
        title = item.company_name;
        sub = item.email || item.phone || t("work_queue.no_contact_info");
        time = item.created_at ? new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.status;
        Icon = Radar;
        badgeColor = "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/40";
        break;
      case "contact":
        title = `${item.first_name} ${item.last_name || ""}`;
        sub = item.designation || item.email || t("work_queue.contact");
        time = item.created_at ? new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = "Active";
        Icon = Users;
        badgeColor = "bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border-pink-200/60 dark:border-pink-800/40";
        break;
      case "deal":
        title = item.title || item.deal_name;
        sub = item.value ? `$${item.value}` : t("work_queue.deal");
        time = item.created_at ? new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.stage || item.status;
        Icon = Briefcase;
        badgeColor = "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/40";
        break;
      case "ticket":
        title = item.task;
        sub = item.project_id ? `Project #${item.project_id}` : "Dev Ticket";
        time = item.created_at ? new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.current_state;
        Icon = Play;
        badgeColor = "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200/60 dark:border-cyan-800/40";
        break;
      case "ticket_due":
      case "ticket_ongoing":
      case "ticket_completed":
        title = item.task;
        sub = item.project_id ? `Project #${item.project_id}` : "Development ticket";
        time = item.requested_date || item.date_release_prod || "";
        status = item.current_state;
        Icon = type === "ticket_completed" ? CheckCircle : type === "ticket_ongoing" ? Play : Clock;
        badgeColor = type === "ticket_completed" ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/40" : type === "ticket_ongoing" ? "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-800/40" : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/40";
        break;
      case "client":
        title = item.companyName || item.projectName || "Client";
        sub = item.email || item.phone || "Assigned client";
        time = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "";
        status = item.status;
        Icon = Briefcase;
        badgeColor = "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/40";
        break;
      case "case":
        title = item.subject;
        sub = item.description || "Support case";
        time = item.created_at ? new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.status;
        Icon = AlertCircle;
        badgeColor = "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/40";
        break;
    }

    return (
      <motion.div 
        key={`${type}-${item.id}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 shadow-2xs hover:shadow-xs hover:border-indigo-500/60 dark:hover:border-indigo-500/50 transition-all duration-150 group flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={`w-8 h-8 rounded-lg ${badgeColor} border flex items-center justify-center shrink-0`}>
            <Icon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-semibold text-slate-800 dark:text-zinc-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{title}</h4>
              {time && <span className="text-[10px] text-slate-400 dark:text-zinc-500 flex items-center gap-1 shrink-0"><Clock size={11}/> {time}</span>}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">{sub}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider rounded border ${badgeColor}`}>
                {type.replace("_", " ")}
              </span>
              {status && (
                <span className="px-1.5 py-0.2 text-[9px] font-semibold rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200/60 dark:border-zinc-700 truncate">
                  {status}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 flex items-center justify-end">
          <button className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-zinc-800/80 border border-slate-200/60 dark:border-zinc-700 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors">
            <Play size={12} className="ml-0.5" />
          </button>
        </div>
      </motion.div>
    );
  };

  const getFilteredItems = () => {
    if (activeTab === "combined") {
      return [
        ...(data.tasks || []).map((i:any) => ({...i, _type: 'task'})),
        ...(data.meetings || []).map((i:any) => ({...i, _type: 'meeting'})),
        ...(data.calls || []).map((i:any) => ({...i, _type: 'call'})),
        ...(data.leads || []).map((i:any) => ({...i, _type: 'lead'})),
        ...(data.contacts || []).map((i:any) => ({...i, _type: 'contact'})),
        ...(data.deals || []).map((i:any) => ({...i, _type: 'deal'})),
        ...(data.ticket_due || []).map((i:any) => ({...i, _type: 'ticket_due'})),
        ...(data.ticket_ongoing || []).map((i:any) => ({...i, _type: 'ticket_ongoing'})),
        ...(data.ticket_completed || []).map((i:any) => ({...i, _type: 'ticket_completed'})),
        ...(data.clients || []).map((i:any) => ({...i, _type: 'client'})),
        ...(data.cases || []).map((i:any) => ({...i, _type: 'case'}))
      ].sort((a, b) => {
        const d1 = new Date(a.due_date || a.scheduled_at || a.created_at || 0).getTime();
        const d2 = new Date(b.due_date || b.scheduled_at || b.created_at || 0).getTime();
        return d1 - d2;
      });
    }
    const typeMap: Record<string, string> = {
      ticket_due: "ticket_due",
      ticket_ongoing: "ticket_ongoing",
      ticket_completed: "ticket_completed",
      clients: "client",
      cases: "case",
    };
    return (data[activeTab] || []).map((i:any) => ({...i, _type: typeMap[activeTab] || activeTab.slice(0, -1)}));
  };

  const filteredItems = getFilteredItems();
  const combinedCount = ["tasks", "meetings", "calls", "leads", "contacts", "deals", "clients", "ticket_due", "ticket_ongoing", "ticket_completed", "cases"]
    .reduce((total, key) => total + (data[key]?.length || 0), 0);
  const emptyTabLabel = activeTab === 'combined' ? t("work_queue.empty_items_plural") : TABS.find(tab => tab.id === activeTab)?.label || activeTab;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-16">
      {/* Compact Executive Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Target className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">{t("work_queue.title")}</h1>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700">
                {combinedCount} items
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-none mt-0.5 truncate">{t("work_queue.subtitle")}</p>
          </div>
        </div>

        {/* Date Filter Pills */}
        <div className="bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-slate-200/80 dark:border-white/5 flex items-center shrink-0">
          {(["yesterday", "today", "tomorrow"] as const).map(d => (
            <button
              key={d}
              onClick={() => setDateFilter(d)}
              className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-all ${
                dateFilter === d 
                ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-2xs" 
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Compact 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <CheckSquare className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Tasks</div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{data.tasks?.length || 0}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Tickets Due</div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{data.ticket_due?.length || 0}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200/50 dark:border-purple-800/40 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
            <Calendar className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Meetings</div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{data.meetings?.length || 0}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <PhoneCall className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Calls</div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{data.calls?.length || 0}</div>
          </div>
        </div>
      </div>

      {/* Scrollable Tabs Toolbar */}
      <div className="flex overflow-x-auto gap-1.5 p-1 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xs hide-scrollbar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === tab.id 
              ? "bg-indigo-600 text-white shadow-2xs" 
              : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
            }`}
          >
            <tab.icon size={13} className={activeTab === tab.id ? "" : tab.color} />
            <span>{tab.label}</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
              activeTab === tab.id 
              ? "bg-white/20 text-white" 
              : "bg-slate-100 dark:bg-zinc-800 text-slate-500"
            }`}>
              {tab.id === 'combined' 
                ? combinedCount
                : (data[tab.id]?.length || 0)}
            </span>
          </button>
        ))}
      </div>

      {/* Main Work Queue Content */}
      <div className="relative min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center h-48 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/90 dark:border-white/10">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
              <p className="text-xs font-semibold text-slate-500">{t("work_queue.loading_queue")}</p>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800">
            <div className="w-12 h-12 bg-slate-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center mb-2 shadow-2xs">
              <CheckCircle className="w-6 h-6 text-slate-400 dark:text-zinc-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-zinc-200 mb-0.5">{t("work_queue.empty_title")}</h3>
            <p className="text-xs text-slate-400 dark:text-zinc-500 max-w-sm">
              {t("work_queue.empty_items")} {emptyTabLabel} {t("work_queue.empty_items_end")} {dateFilter}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredItems.map((item: any) => renderItemCard(item, item._type))}
          </div>
        )}
      </div>
    </div>
  );
}
