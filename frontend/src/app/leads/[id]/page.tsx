"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Building2, Globe, Mail, Phone, MapPin, CheckCircle, Clock, 
  ArrowLeft, ArrowRightLeft, Edit, MoreVertical, FileText, 
  MessageSquare, History, UserPlus
} from "lucide-react";
import Link from "next/link";

export default function LeadDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;
  
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [activeTab, setActiveTab] = useState("timeline");

  useEffect(() => {
    if (leadId) fetchLeadDetails();
  }, [leadId]);

  const fetchLeadDetails = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/leads/${leadId}`);
      if (res.ok) {
        const data = await res.json();
        setLead(data);
      }
    } catch (error) {
      console.error("Error fetching lead:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!confirm("Are you sure you want to convert this lead to a Client?")) return;
    
    try {
      setConverting(true);
      const res = await fetch(`/api/leads/${leadId}/convert`, {
        method: "POST"
      });
      
      if (res.ok) {
        const data = await res.json();
        alert("Lead successfully converted to Client!");
        router.push(`/clients/${data.client_id}`);
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to convert lead");
      }
    } catch (error) {
      console.error("Conversion error:", error);
      alert("Error converting lead");
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc] dark:bg-[#0f172a]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#f8fafc] dark:bg-[#0f172a]">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Lead Not Found</h2>
        <button onClick={() => router.push('/leads')} className="text-blue-600 hover:underline">
          Return to Leads
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-[#0f172a] overflow-hidden">
      {/* Top Banner */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-[#1e293b] border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/leads" className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{lead.company_name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                lead.is_converted 
                  ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" 
                  : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
              }`}>
                {lead.is_converted ? "Converted" : lead.status}
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
              <Globe className="w-3.5 h-3.5" />
              {lead.website || "No website"}
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
              {lead.industry || "No industry specified"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!lead.is_converted && (
            <button 
              onClick={handleConvert}
              disabled={converting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 shadow-sm transition-all disabled:opacity-50"
            >
              <ArrowRightLeft className="w-4 h-4" />
              {converting ? "Converting..." : "Convert to Client"}
            </button>
          )}
          <button className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors">
            <Edit className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar (Profile) */}
        <div className="w-80 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b] overflow-y-auto">
          <div className="p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">Lead Details</h3>
            
            <div className="space-y-5">
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Email</label>
                <div className="flex items-center gap-2 mt-1">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{lead.email || "—"}</span>
                </div>
              </div>
              
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Phone</label>
                <div className="flex items-center gap-2 mt-1">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{lead.phone || "—"}</span>
                </div>
              </div>
              
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Address</label>
                <div className="flex items-start gap-2 mt-1">
                  <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                  <span className="text-sm font-medium text-slate-900 dark:text-white leading-relaxed">
                    {lead.address || "—"}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Source</label>
                <div className="mt-1">
                  <span className="inline-flex items-center px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300">
                    {lead.source || "Unknown"}
                  </span>
                </div>
              </div>
            </div>

            <hr className="my-6 border-slate-200 dark:border-slate-800" />
            
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">System Info</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">Created</span>
                <span className="text-xs font-medium text-slate-900 dark:text-white">
                  {new Date(lead.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">Lead Owner</span>
                <span className="text-xs font-medium text-slate-900 dark:text-white">Admin User</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-[#0f172a]">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-6 pt-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b]">
            {[
              { id: 'timeline', icon: History, label: 'Timeline' },
              { id: 'notes', icon: FileText, label: 'Notes' },
              { id: 'contacts', icon: UserPlus, label: 'Contacts' },
              { id: 'emails', icon: Mail, label: 'Emails' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id 
                    ? "border-blue-600 text-blue-600 dark:text-blue-400" 
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'timeline' && (
              <div className="max-w-2xl">
                <div className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800 space-y-8">
                  <div className="relative">
                    <span className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-green-500 border-4 border-white dark:border-[#0f172a]"></span>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Lead Created</p>
                    <p className="text-xs text-slate-500 mt-1">{new Date(lead.created_at).toLocaleString()}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                      Lead added via {lead.source || 'Manual Entry'}.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'notes' && (
              <div className="max-w-3xl">
                <div className="bg-white dark:bg-[#1e293b] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6">
                  <textarea 
                    className="w-full bg-transparent border-none resize-none outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400" 
                    rows={3} 
                    placeholder="Add a note to this lead..."
                  ></textarea>
                  <div className="flex justify-end mt-2">
                    <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">Save Note</button>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'contacts' && (
              <div className="max-w-4xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Associated Contacts</h3>
                  <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">
                    <Plus className="w-4 h-4" /> Add Contact
                  </button>
                </div>
                <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center">
                  <UserPlus className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">No contacts added yet. Add key decision makers here.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
