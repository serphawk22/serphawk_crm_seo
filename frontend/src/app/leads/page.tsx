"use client";
import { API_BASE_URL } from "@/config";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Plus, Filter, MoreVertical, Building2, Globe, Mail, Phone, 
  MapPin, CheckCircle, Clock, ChevronDown, Download, Upload
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Lead {
  id: number;
  company_name: string;
  website: string | null;
  industry: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  source: string | null;
  status: string;
  is_converted: boolean;
  created_at: string;
}

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/leads`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLeads = leads.filter(
    (l) =>
      l.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.industry?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-[#0f172a] rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b]">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Leads</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your prospects and opportunities</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/import" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors">
            <Upload className="w-4 h-4" />
            Import
          </Link>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors">
            <Plus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-[#1e293b] border-b border-slate-200 dark:border-slate-800">
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto bg-white dark:bg-[#1e293b]">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No leads found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              We couldn't find any leads matching your criteria. Try adjusting your search or add a new lead.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="px-6 py-4 font-medium">Company Name</th>
                <th className="px-6 py-4 font-medium">Industry</th>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium">Source</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              <AnimatePresence>
                {filteredLeads.map((lead, idx) => (
                  <motion.tr
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={lead.id}
                    onClick={() => router.push(`/leads/${lead.id}`)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer group transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {lead.company_name}
                        </span>
                        {lead.website && (
                          <div className="flex items-center gap-1.5 mt-1 text-[13px] text-slate-500">
                            <Globe className="w-3.5 h-3.5" />
                            <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="hover:text-blue-600 hover:underline truncate max-w-[200px]">
                              {lead.website.replace(/^https?:\/\//, '')}
                            </a>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[13px] text-slate-600 dark:text-slate-300">
                        {lead.industry || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {lead.email ? (
                          <div className="flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-300">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate max-w-[150px]">{lead.email}</span>
                          </div>
                        ) : null}
                        {lead.phone ? (
                          <div className="flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-300">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate max-w-[150px]">{lead.phone}</span>
                          </div>
                        ) : null}
                        {!lead.email && !lead.phone && <span className="text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {lead.source || "Unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                        lead.is_converted 
                          ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" 
                          : lead.status === 'New' 
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400"
                      }`}>
                        {lead.is_converted ? "Converted" : lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={e => e.stopPropagation()} 
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
