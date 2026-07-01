"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Send, Sparkles, Mail, Clock, User, Globe, ChevronDown, ChevronUp,
  CheckCircle, Building2, Briefcase, Target, AtSign, FileText, Copy, Check,
  TrendingUp, Zap, Package, UserPlus, Phone, Store, DollarSign, MessageCircle
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import PageGuide from "@/components/PageGuide";

interface SentEmail {
  id: number;
  client_id: number | null;
  to_email: string;
  subject: string;
  english_body: string | null;
  spanish_body: string | null;
  recommended_services: string | null;
  manual: boolean;
  draft_json: string | null;
  sent_at: string | null;
}

interface ChatMessage {
  id: string;
  role: "ai" | "user";
  type: "text" | "loading";
  content?: string;
}

type RecommendedService = {
  service_name?: string;
  why_relevant?: string;
  expected_impact?: string;
};


interface ResearchResultData {
  emails?: string;
  phone?: string;
  social_links?: {
    linkedin?: string;
    instagram?: string;
    facebook?: string;
  };
  company_services?: string[];
  cold_email_english?: string;
  cold_email_spanish?: string;
  
  // Legacy fields
  company_info?: any;
  contact?: any;
  recommended_services?: any;
  draft?: any;
  extracted_services?: any;
  assigned_sales_manager?: string;
  company_url?: string;
  client_id?: number;
  id?: string;
}

interface ResearchResult {
  id: string;
  resultData: ResearchResultData;
  companyName: string;
  companyUrl: string;
}

type SendEmailResult = {
  client_id?: number;
} | null;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded-lg hover:bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:text-zinc-100 transition-all"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-slate-800 dark:text-zinc-100" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function BottomUpFillMail() {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="relative w-12 h-12">
        <Mail className="absolute inset-0 w-12 h-12 text-slate-400" strokeWidth={1} />
        <motion.div
          className="absolute bottom-0 left-0 right-0 overflow-hidden"
          initial={{ height: "0%" }}
          animate={{ height: "100%" }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute bottom-0 left-0 w-12 h-12">
            <Mail className="w-12 h-12 text-slate-800 dark:text-zinc-100" strokeWidth={1} fill="white" />
          </div>
        </motion.div>
      </div>
      <p className="text-xs font-bold text-slate-500 dark:text-zinc-400 animate-pulse">Researching & drafting...</p>
    </div>
  );
}

function ResultCard({ result, companyName, companyUrl, onSendManually, onSendAutomatically, onSaveFollowUp }: { result: ResearchResultData; companyName: string; companyUrl: string; onSendManually: (r: ResearchResultData, name: string, url: string, skip_send?: boolean, action_type?: string) => Promise<SendEmailResult>; onSendAutomatically: (r: ResearchResultData, name: string, url: string) => Promise<SendEmailResult>; onSaveFollowUp: (r: ResearchResultData, note: string, title: string) => Promise<boolean>; }) {
  const [activeTab, setActiveTab] = useState<"english" | "spanish">("english");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const contactEmail = result.emails?.split(",")[0]?.trim() || result.contact?.email || result.company_info?.extracted_emails?.split(",")[0]?.trim();

  let englishText = result.cold_email_english || result.draft?.english_body || result.draft?.body || "";
  let spanishText = result.cold_email_spanish || result.draft?.spanish_body || "";
  
  const subjectMatch = englishText.match(/^Subject:\s*(.+)$/m);
  const subject = subjectMatch ? subjectMatch[1].trim() : (result.draft?.subject || "Outreach Proposal");
  englishText = englishText.replace(/^Subject:\s*.+\n+/m, "");
  spanishText = spanishText.replace(/^Asunto:\s*.+\n+/m, "").replace(/^Subject:\s*.+\n+/m, "");

  const gmailBodyText = spanishText && !englishText.includes(spanishText) 
    ? `${englishText}\n\n---\n\n${spanishText}`
    : englishText;

  const handleSend = async () => {
    setSending(true);
    setSendError(null);
    try {
      await onSendManually(result, companyName, companyUrl, false, "System");
      setSendSuccess("Mail sent");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send email";
      setSendError(message);
    }
    setSending(false);
  };

  const handleSendAutomatically = async () => {
    setSending(true);
    setSendError(null);
    try {
      await onSendAutomatically(result, companyName, companyUrl);
      setSendSuccess("Mail sent");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send email";
      setSendError(message);
    }
    setSending(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 w-full"
    >
      {/* Contact Details & Socials */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-lg shadow-inner">
              {companyName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 dark:text-zinc-100">{companyName}</h2>
              <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
                Target Company
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-100 dark:border-zinc-800">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-slate-400" />
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-widest">Emails Found</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {result.emails && result.emails !== "Not Found" ? result.emails.split(',').map((e, i) => (
                <a key={i} href={`mailto:${e.trim()}`} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{e.trim()}</a>
              )) : <p className="text-sm text-slate-500">No emails found.</p>}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-100 dark:border-zinc-800">
            <div className="flex items-center gap-2 mb-3">
              <Phone className="w-4 h-4 text-slate-400" />
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-widest">Phone Numbers</p>
            </div>
            {result.phone && result.phone !== "Not Found" ? (
              <a href={`tel:${result.phone}`} className="text-sm font-bold text-slate-700 dark:text-zinc-200 hover:underline">{result.phone}</a>
            ) : (
              <p className="text-sm text-slate-500">Not Found</p>
            )}
          </div>
        </div>

        <div className="mt-4 bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-slate-400" />
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-widest">Social Links</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.social_links?.linkedin && result.social_links.linkedin !== "Not Found" && (
              <a href={result.social_links.linkedin} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#0a66c2]/10 text-[#0a66c2] rounded-md text-xs font-bold hover:bg-[#0a66c2]/20 transition-colors">LinkedIn</a>
            )}
            {result.social_links?.instagram && result.social_links.instagram !== "Not Found" && (
              <a href={result.social_links.instagram} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-pink-500/10 text-pink-600 rounded-md text-xs font-bold hover:bg-pink-500/20 transition-colors">Instagram</a>
            )}
            {result.social_links?.facebook && result.social_links.facebook !== "Not Found" && (
              <a href={result.social_links.facebook} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-blue-600/10 text-blue-700 rounded-md text-xs font-bold hover:bg-blue-600/20 transition-colors">Facebook</a>
            )}
            {(!result.social_links || Object.values(result.social_links).every(v => !v || v === "Not Found")) && (
              <span className="text-sm text-slate-500">No social profiles detected.</span>
            )}
          </div>
        </div>
      </div>

      {/* Services List */}
      {result.company_services && result.company_services.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100">
              <Package className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-black text-slate-800 dark:text-zinc-100 uppercase tracking-widest">Company Services & Products</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.company_services.map((svc, i) => (
              <div key={i} className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-slate-700 dark:text-zinc-200 shadow-sm">
                {svc}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drafts Section */}
      {(result.cold_email_english || result.cold_email_spanish || result.draft) && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100">
                <FileText className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-black text-slate-800 dark:text-zinc-100 uppercase tracking-widest">Generated Email Draft</p>
            </div>
            <CopyButton text={activeTab === "english" ? englishText : spanishText} />
          </div>

          {subject && (
            <div className="mb-4 p-3 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Subject</p>
                <p className="text-sm font-bold text-slate-800 dark:text-zinc-100">{subject}</p>
              </div>
              <CopyButton text={subject} />
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab("english")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                activeTab === "english" ? "bg-white dark:bg-zinc-900 text-black dark:text-white border-slate-300 dark:border-zinc-600 shadow-sm" : "bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:bg-white dark:bg-zinc-900"
              }`}
            >
              English
            </button>
            <button
              onClick={() => setActiveTab("spanish")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                activeTab === "spanish" ? "bg-white dark:bg-zinc-900 text-black dark:text-white border-slate-300 dark:border-zinc-600 shadow-sm" : "bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:bg-white dark:bg-zinc-900"
              }`}
            >
              Español
            </button>
          </div>

          <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl p-5 text-sm text-slate-700 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-80 overflow-auto font-mono custom-scrollbar">
            {activeTab === "english" ? (englishText || "No English draft generated") : (spanishText || "No Spanish draft generated")}
          </div>

          {contactEmail && (
            <div className="mt-6 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl p-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-zinc-100">
                    <Send className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                    <span>Ready to send to: {contactEmail}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Trigger webhook or send via Gmail manually.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSendAutomatically}
                    disabled={sending || !!sendSuccess}
                    className="px-4 py-2 rounded-xl bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 hover:bg-indigo-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {sending ? <Clock className="w-3.5 h-3.5 animate-spin" /> : sendSuccess ? <CheckCircle className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                    Trigger Webhook
                  </button>
                  <a
                    href={`https://mail.google.com/mail/?view=cm&fs=1&to=${contactEmail || ''}&su=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(gmailBodyText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onSendManually(result, companyName, companyUrl, true, "Gmail").catch(console.error)}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs flex items-center gap-2 hover:bg-amber-600 transition-all shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send through Gmail
                  </a>
                </div>
              </div>
              
              {sendError && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  {sendError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default function EmailAgentPage() {
  const [companyName, setCompanyName] = useState("");
  const [inputValue, setInputValue] = useState("");
  
  const [chatStep, setChatStep] = useState<"website_url" | "loading" | "idle">("website_url");
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "msg-1", role: "ai", type: "text", content: "Hello! Enter a company website URL to generate an outreach strategy and email draft." }
  ]);
  
  const [resultsHistory, setResultsHistory] = useState<ResearchResult[]>([]);

  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, chatStep]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/sent-emails?limit=30`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) return setSentEmails(data);
        if (data?.emails && Array.isArray(data.emails)) return setSentEmails(data.emails);
        return setSentEmails([]);
      })
      .catch(() => setSentEmails([]))
      .finally(() => setEmailsLoading(false));
  }, []);

  const handleSendInput = async () => {
    if (chatStep === "website_url") {
      const url = inputValue.trim();
      if (!url) return;
      setInputValue("");
      
      setMessages(prev => [
        ...prev,
        { id: `msg-${Date.now()}`, role: "user", type: "text", content: url },
        { id: `msg-${Date.now()+1}`, role: "ai", type: "loading" }
      ]);
      setChatStep("loading");
      
      const derivedName = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0];
      await performResearch(derivedName, url);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendInput();
    }
  };

  const performResearch = async (name: string, url: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/smart-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: name,
          company_url: url || null,
        }),
      });
      
      if (!res.ok) {
        throw new Error("Research failed");
      }
      
      const data = await res.json();
      
      setMessages(prev => {
        const filtered = prev.filter(m => m.type !== "loading");
        return [
          ...filtered,
          { id: `msg-${Date.now()}`, role: "ai", type: "text", content: `Research for ${name} complete! I've placed the results in the section below.` }
        ];
      });
      
      setResultsHistory(prev => [
        { id: `res-${Date.now()}`, resultData: data, companyName: name, companyUrl: url },
        ...prev
      ]);
      
      setChatStep("company_name");
      setCompanyName("");
      setTimeout(() => {
        setMessages(prev => [
          ...prev,
          { id: `msg-${Date.now()+2}`, role: "ai", type: "text", content: "What other company would you like to research next?" }
        ]);
      }, 1000);

    } catch {
      setMessages(prev => {
        const filtered = prev.filter(m => m.type !== "loading");
        return [
          ...filtered,
          { id: `msg-${Date.now()}`, role: "ai", type: "text", content: `Error: Something went wrong. Please try again.` }
        ];
      });
      setChatStep("company_name");
    }
  };

  const handleSendManually = async (result: ResearchResultData, name: string, url: string, skip_send: boolean = false, action_type: string = "System"): Promise<SendEmailResult> => {
    const data = await sendEmail(result, name, url, true, skip_send, action_type);
    if (data?.lead_id) {
      setResultsHistory(prev => prev.map(item => item.resultData === result ? { ...item, resultData: { ...item.resultData, lead_id: data.lead_id } } : item));
    }
    return data;
  };

  const handleSendAutomatically = async (result: ResearchResultData, name: string, url: string): Promise<SendEmailResult> => {
    const data = await sendEmail(result, name, url, false, false, "System Auto");
    if (data?.lead_id) {
      setResultsHistory(prev => prev.map(item => item.resultData === result ? { ...item, resultData: { ...item.resultData, lead_id: data.lead_id } } : item));
    }
    return data;
  };

  const sendEmail = async (result: ResearchResultData, name: string, url: string, manual: boolean, skip_send: boolean = false, action_type: string = "System"): Promise<SendEmailResult> => {
    try {
      const serviceNames = result.company_services ? result.company_services.join(", ") : "";
      
      const emailToSend = result.emails?.split(",")[0]?.trim() || result.contact?.email || result.company_info?.extracted_emails?.split(",")[0]?.trim();
      if (!emailToSend || emailToSend === "Not Found") {
        throw new Error("No recipient email available to send.");
      }
      
      let englishText = result.cold_email_english || result.draft?.english_body || result.draft?.body || "";
      let spanishText = result.cold_email_spanish || result.draft?.spanish_body || "";
      const subjectMatch = englishText.match(/^Subject:\s*(.+)$/m);
      const subject = subjectMatch ? subjectMatch[1].trim() : (result.draft?.subject || "Outreach Proposal");
      englishText = englishText.replace(/^Subject:\s*.+\n+/m, "");
      spanishText = spanishText.replace(/^Asunto:\s*.+\n+/m, "").replace(/^Subject:\s*.+\n+/m, "");

      const res = await fetch(`${API_BASE_URL}/send-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: emailToSend,
          company_name: result.company_info?.company_name || name,
          subject: subject,
          english_body: englishText,
          spanish_body: spanishText,
          recommended_services: serviceNames,
          contact_name: null,
          contact_role: null,
          website_url: url,
          phone_number: result.phone !== "Not Found" ? result.phone : null,
          manual,
          skip_send,
          action_type,
          email_agent_data: JSON.stringify(result),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to send email");
      }

      const data = await res.json();
      fetch(`${API_BASE_URL}/sent-emails?limit=30`)
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) return setSentEmails(d);
          if (d?.emails && Array.isArray(d.emails)) return setSentEmails(d.emails);
          return setSentEmails([]);
        })
        .catch(() => setSentEmails([]));
      return data;
    } catch (error: unknown) {
      console.error(error);
      throw error instanceof Error ? error : new Error("Email send failed");
    }
  };

  const handleSaveFollowUp = async (result: ResearchResultData, note: string, title: string): Promise<boolean> => {
    try {
      const leadId = (result as any).lead_id || (result.company_info as any)?.lead_id || (result as any).id;
      if (!leadId) {
        console.error("Cannot save follow-up without lead ID");
        return false;
      }
      const response = await fetch(`${API_BASE_URL}/leads/${leadId}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: note,
          authorId: 1,
          isInternal: false,
          task_title: title,
          task_description: note,
          due_date: null,
          assigned_to: null,
          email_agent_data: JSON.stringify(result),
        }),
      });
      return response.ok;
    } catch (error: unknown) {
      console.error(error);
      return false;
    }
  };

  const totalSent = sentEmails.length;
  const manualCount = sentEmails.filter((e) => e.manual).length;
  const autoCount = totalSent - manualCount;

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center overflow-hidden rounded-3xl">
      {/* Video Background - NO BLUR OVERLAY FOR FULL CLARITY */}
      

      {/* Main Scrolling Container */}
      <div className="relative z-10 w-full max-w-5xl flex flex-col h-full mt-6 px-4 pb-20 overflow-y-auto">
        
        {/* Top Header - completely transparent, NO BLUR, white text */}
        <div className="bg-slate-50 dark:bg-zinc-950 rounded-2xl px-6 pt-6 pb-2 flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 shadow-lg backdrop-blur-sm">
              <Bot className="w-5 h-5 text-slate-800 dark:text-zinc-100" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 dark:text-zinc-100">Email Agent</h1>
              <p className="text-slate-500 dark:text-zinc-400 text-xs font-medium">Research • Match • Draft</p>
            </div>
          </div>
          <div className="flex gap-4 hidden sm:flex">
            {[
              { label: "Total Sent", value: totalSent },
              { label: "Auto", value: autoCount },
              { label: "Manual", value: manualCount },
            ].map((s) => (
              <div key={s.label} className="px-4 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 text-center">
                <p className="text-[9px] font-black uppercase tracking-widest opacity-80">{s.label}</p>
                <p className="text-lg font-black">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-zinc-950 p-0 rounded-2xl mb-2">
          {/* PageGuide components uses white text on dark variants, but we will leave it as is if it handles its own styles, though it floats */}
        </div>

        {/* Chatbot Interface Top Box - HAS BLUR and WHITE TEXT */}
        <div className="relative bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl w-full max-w-4xl mx-auto flex flex-col h-[400px] shadow-sm">
          <PageGuide
            pageKey="email-agent"
            title="How the Email Agent works"
            description="Our AI researches companies, matches them to your services, and drafts personalized outreach emails."
            buttonClassName="absolute top-3 right-3 z-50 group"
            iconClassName="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-slate-800 dark:text-zinc-100 shadow-lg transition-transform group-hover:scale-110"
            steps={[
              { icon: <Building2 />, text: 'Enter a company name and URL — the AI will analyze their website and identify opportunities.' },
              { icon: <Bot />, text: 'The agent matches the company\'s needs to your service catalog and crafts a tailored pitch.' },
              { icon: <Mail />, text: 'Review the generated email in English and Spanish, then send it directly or copy the text.' },
              { icon: <TrendingUp />, text: 'Track all sent emails above — see counts for auto-sent vs. manually-sent outreach.' },
            ]}
          />
          <div className="p-4 border-b border-slate-100 dark:border-zinc-800 font-black text-sm text-slate-800 dark:text-zinc-100 flex items-center gap-2">
            <Bot className="w-4 h-4 text-slate-800 dark:text-zinc-100" /> AI Research Assistant
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex items-end gap-2 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-white dark:bg-zinc-900 text-black dark:text-white" : "bg-blue-500 text-slate-800 dark:text-zinc-100"}`}>
                      {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`p-4 rounded-2xl ${
                      msg.role === "user" 
                        ? "bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-br-none border border-slate-100 dark:border-zinc-800" 
                        : "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-700 border border-slate-100 dark:border-zinc-800 shadow-sm rounded-bl-none text-slate-800 dark:text-zinc-100"
                    }`}>
                      {msg.type === "text" && <p className="text-sm font-medium">{msg.content}</p>}
                      {msg.type === "loading" && <BottomUpFillMail />}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          <div className="p-5 bg-slate-50 dark:bg-zinc-950/80 rounded-b-2xl border-t border-slate-100 dark:border-zinc-800 backdrop-blur-md">
            <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 rounded-2xl p-2 border shadow-sm focus-within:ring-4 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all">
              <div className="p-2 bg-indigo-50 rounded-xl">
                <Globe className="w-6 h-6 text-indigo-500" />
              </div>
              
              <input
                type="url"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://example.com"
                className="flex-1 bg-transparent border-none focus:ring-0 outline-none px-2 text-base font-bold text-slate-800 dark:text-zinc-100 placeholder-slate-400 h-12"
              />
              
              <button
                onClick={handleSendInput}
                disabled={!inputValue.trim() || chatStep === "loading"}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-indigo-500/30 disabled:opacity-50 transition-all hover:-translate-y-0.5"
              >
                <Sparkles className="w-4 h-4" /> Start AI Agent
              </button>
            </div>
          </div>
        </div>

        {/* Results Section Down Below */}
        {resultsHistory.length > 0 && (
          <div className="w-full mt-8 space-y-8">
            <h3 className="font-black text-xl text-slate-800 dark:text-zinc-100 bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-700 backdrop-blur-md px-4 py-2 rounded-xl inline-block shadow-lg border border-slate-100 dark:border-zinc-800">Research Results</h3>
            {resultsHistory.map(res => (
              <ResultCard key={res.id} result={res.resultData} companyName={res.companyName} companyUrl={res.companyUrl} onSendManually={handleSendManually} onSendAutomatically={handleSendAutomatically} onSaveFollowUp={handleSaveFollowUp} />
            ))}
          </div>
        )}

        {/* Recent Outreach Section Down Below */}
        <div className="w-full mt-12 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 shadow-inner">
                <Mail className="w-4 h-4" />
              </div>
              <h3 className="font-black text-[15px] text-slate-800 dark:text-zinc-100">Recent Email Outreach</h3>
            </div>
            <span className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
              {totalSent} total
            </span>
          </div>

          {emailsLoading ? (
            <div className="flex justify-center p-8"><Clock className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : sentEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400 gap-3">
              <Mail className="w-10 h-10 opacity-30 text-gray-500" />
              <p className="font-bold text-sm text-slate-400">No emails sent yet</p>
            </div>
          ) : (
            <div className="space-y-2 relative z-10">
              {sentEmails.map((email, index) => {
                const isExpanded = expandedId === email.id;
                return (
                  <motion.div
                    key={email.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="border border-slate-100 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-slate-300 dark:border-zinc-600 transition-all bg-slate-50 dark:bg-zinc-950"
                  >
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : email.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 transition-colors text-left"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          email.manual ? "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100" : "bg-blue-500 text-slate-800 dark:text-zinc-100"
                        }`}>
                          {email.manual ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 dark:text-zinc-100 text-sm truncate">{email.subject || "(No subject)"}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-slate-500 dark:text-zinc-400 truncate flex items-center gap-1">
                              <Send className="w-3 h-3 shrink-0" /> {email.to_email}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className={`text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full ${
                          email.manual ? "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100" : "bg-blue-500 text-slate-800 dark:text-zinc-100"
                        }`}>
                          {email.manual ? "Manual" : "Auto"}
                        </span>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-800 dark:text-zinc-100" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        className="border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-700 p-5"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {email.english_body && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-black text-slate-800 dark:text-zinc-100 uppercase tracking-widest">English Body</p>
                                <CopyButton text={email.english_body} />
                              </div>
                              <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl p-4 text-sm text-slate-600 dark:text-zinc-300 whitespace-pre-wrap max-h-64 overflow-auto leading-relaxed font-mono custom-scrollbar">
                                {email.english_body}
                              </div>
                            </div>
                          )}
                          {email.spanish_body && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-black text-slate-800 dark:text-zinc-100 uppercase tracking-widest">Spanish Body</p>
                                <CopyButton text={email.spanish_body} />
                              </div>
                              <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl p-4 text-sm text-slate-600 dark:text-zinc-300 whitespace-pre-wrap max-h-64 overflow-auto leading-relaxed font-mono custom-scrollbar">
                                {email.spanish_body}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
