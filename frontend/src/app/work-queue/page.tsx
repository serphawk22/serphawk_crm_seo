"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Calendar, CheckSquare, PhoneCall, Users, Target, Radar, Briefcase,
  Clock, CheckCircle, Search, Filter, Loader2, Play
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import AdminLayout from "../admin/components/AdminLayout";
import { useLanguage } from "@/context/LanguageContext";
import { useRole } from "@/context/RoleContext";

export default function WorkQueuePage() {
  const { language } = useLanguage();
  const { role, user } = useRole();
  const [dateFilter, setDateFilter] = useState("today"); // yesterday, today, tomorrow
  const [activeTab, setActiveTab] = useState("combined");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({
    tasks: [], meetings: [], calls: [], leads: [], contacts: [], deals: []
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
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const TABS = [
    { id: "combined", label: "Combined Queue", icon: Target, color: "text-indigo-500", bg: "bg-indigo-100" },
    { id: "tasks", label: "Tasks", icon: CheckSquare, color: "text-blue-500", bg: "bg-blue-100" },
    { id: "meetings", label: "Meetings", icon: Calendar, color: "text-purple-500", bg: "bg-purple-100" },
    { id: "calls", label: "Calls", icon: PhoneCall, color: "text-green-500", bg: "bg-green-100" },
    { id: "leads", label: "Leads", icon: Radar, color: "text-amber-500", bg: "bg-amber-100" },
    { id: "contacts", label: "Contacts", icon: Users, color: "text-pink-500", bg: "bg-pink-100" },
    { id: "deals", label: "Deals", icon: Briefcase, color: "text-emerald-500", bg: "bg-emerald-100" },
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
        sub = item.description || "No description";
        time = item.due_date ? new Date(item.due_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.status;
        Icon = CheckSquare;
        badgeColor = "bg-blue-100 text-blue-700";
        break;
      case "meeting":
        title = item.title;
        sub = item.meeting_type || "Meeting";
        time = item.scheduled_at ? new Date(item.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.status;
        Icon = Calendar;
        badgeColor = "bg-purple-100 text-purple-700";
        break;
      case "call":
        title = item.title || "Scheduled Call";
        sub = item.purpose || "Follow up";
        time = item.scheduled_at ? new Date(item.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.status;
        Icon = PhoneCall;
        badgeColor = "bg-green-100 text-green-700";
        break;
      case "lead":
        title = item.company_name;
        sub = item.email || item.phone || "No contact info";
        time = item.created_at ? new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.status;
        Icon = Radar;
        badgeColor = "bg-amber-100 text-amber-700";
        break;
      case "contact":
        title = `${item.first_name} ${item.last_name || ""}`;
        sub = item.designation || item.email || "Contact";
        time = item.created_at ? new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = "Active";
        Icon = Users;
        badgeColor = "bg-pink-100 text-pink-700";
        break;
      case "deal":
        title = item.title || item.deal_name;
        sub = item.value ? `$${item.value}` : "Deal";
        time = item.created_at ? new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
        status = item.stage || item.status;
        Icon = Briefcase;
        badgeColor = "bg-emerald-100 text-emerald-700";
        break;
    }

    return (
      <motion.div 
        key={`${type}-${item.id}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 hover:shadow-lg transition-shadow group flex flex-col md:flex-row gap-4"
      >
        <div className={`w-12 h-12 rounded-full ${badgeColor} flex items-center justify-center shrink-0`}>
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <h4 className="text-15 font-black text-slate-800 dark:text-zinc-100 truncate pr-4">{title}</h4>
            {time && <span className="text-xs font-bold text-slate-400 dark:text-zinc-500 flex items-center gap-1 shrink-0"><Clock size={12}/> {time}</span>}
          </div>
          <p className="text-13 text-slate-500 dark:text-zinc-400 truncate mb-3">{sub}</p>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md ${badgeColor}`}>
              {type}
            </span>
            {status && (
              <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                {status}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center justify-end">
           <button className="w-10 h-10 rounded-full bg-slate-50 dark:bg-zinc-800 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              <Play size={16} className="ml-0.5" />
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
        ...(data.deals || []).map((i:any) => ({...i, _type: 'deal'}))
      ].sort((a, b) => {
        // basic sort by some date field
        const d1 = new Date(a.due_date || a.scheduled_at || a.created_at || 0).getTime();
        const d2 = new Date(b.due_date || b.scheduled_at || b.created_at || 0).getTime();
        return d1 - d2;
      });
    }
    return (data[activeTab] || []).map((i:any) => ({...i, _type: activeTab.slice(0, -1)})); // e.g. 'tasks' -> 'task'
  };

  const filteredItems = getFilteredItems();

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto min-h-screen">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none"><Target size={24} /></div>
              My Work Queue
            </h1>
            <p className="text-slate-500 dark:text-zinc-400 mt-2 font-medium">
              Manage your tasks, meetings, calls, and follow-ups for the selected day.
            </p>
          </div>

          <div className="bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl flex items-center shadow-inner">
            {["yesterday", "today", "tomorrow"].map(d => (
              <button
                key={d}
                onClick={() => setDateFilter(d)}
                className={`px-6 py-2.5 rounded-lg text-sm font-black capitalize transition-all ${
                  dateFilter === d 
                  ? "bg-white dark:bg-zinc-800 text-indigo-600 shadow-sm" 
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto gap-2 pb-4 mb-4 hide-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-13 whitespace-nowrap transition-all ${
                activeTab === tab.id 
                ? "bg-slate-800 text-white dark:bg-white dark:text-zinc-900 shadow-md" 
                : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800"
              }`}
            >
              <tab.icon size={16} className={activeTab === tab.id ? "" : tab.color} />
              {tab.label}
              <span className={`px-2 py-0.5 rounded-md text-[10px] ${
                activeTab === tab.id 
                ? "bg-white/20 dark:bg-black/10 text-white dark:text-zinc-900" 
                : "bg-slate-100 dark:bg-zinc-800 text-slate-500"
              }`}>
                {tab.id === 'combined' 
                  ? Object.values(data).reduce((acc:any, curr:any) => acc + curr.length, 0)
                  : (data[tab.id]?.length || 0)}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="relative min-h-[400px]">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-zinc-950/50 backdrop-blur-sm z-10 rounded-3xl border border-slate-200 dark:border-zinc-800">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="text-sm font-bold text-slate-500">Loading your queue...</p>
              </div>
            </div>
          ) : (
            <>
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-50 dark:bg-zinc-900/50 rounded-3xl border border-dashed border-slate-300 dark:border-zinc-700">
                  <div className="w-20 h-20 bg-slate-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-10 h-10 text-slate-300 dark:text-zinc-600" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-zinc-200 mb-2">All Caught Up!</h3>
                  <p className="text-slate-500 dark:text-zinc-400 font-medium max-w-sm">
                    You have no {activeTab === 'combined' ? 'items' : activeTab} in your queue for {dateFilter}.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredItems.map((item: any, i: number) => renderItemCard(item, item._type))}
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </AdminLayout>
  );
}
