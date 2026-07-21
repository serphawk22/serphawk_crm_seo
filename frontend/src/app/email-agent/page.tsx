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
  company_info?: {
    company_name?: string;
    likely_industry?: string;
    industry?: string;
    what_they_do?: string;
    summary?: string;
    business_model?: string;
    estimated_size?: string;
    target_market?: string;
    geographic_presence?: string;
    linkedin?: string;
    best_conversion_opportunity?: string;
    sales_follow_up_focus?: string;
    website?: string;
    extracted_emails?: string;
    extracted_phone_numbers?: string;
    extracted_linkedin?: string;
    extracted_twitter?: string;
    contacts?: Array<{
      email?: string;
      name?: string;
      role?: string;
      phone_number?: string;
    }>;
  };
  contact?: {
    email?: string;
    name?: string;
    role?: string;
    phone_number?: string;
    whatsapp?: string;
    linkedin?: string;
    twitter?: string;
  };
  recommended_services?: Array<RecommendedService | string>;
  email_hook?: string;
  package_suggestion?: string;
  draft?: {
    english_body?: string;
    spanish_body?: string;
    body?: string;
    subject?: string;
  };
  assigned_sales_manager?: string;
  company_url?: string;
  client_id?: number;
  id?: string;
  extracted_services?: Array<{
    name: string;
    brief: string;
    category: string;
    approx_cost: number;
    cost_is_estimated: boolean;
  }>;
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

function buildProspectingPoints(result: ResearchResultData) {
  const hasServices = (result.recommended_services || []).map((s) => typeof s === 'string' ? s : s.service_name).filter(Boolean) as string[];
  
  // Extract contact information with fallbacks
  const primaryEmail = result.contact?.email || result.company_info?.extracted_emails?.split(",")[0]?.trim() || "No email found.";
  const allEmails = result.company_info?.extracted_emails ? result.company_info.extracted_emails.split(",").map(e => e.trim()).slice(0, 2).join(", ") : primaryEmail;
  
  const primaryPhone = result.contact?.phone_number || result.contact?.whatsapp || result.company_info?.extracted_phone_numbers?.split(",")[0]?.trim() || "No phone available.";
  const allPhones = result.company_info?.extracted_phone_numbers ? result.company_info.extracted_phone_numbers.split(",").map(p => p.trim()).slice(0, 2).join(", ") : primaryPhone;
  
  const linkedinProfile = result.contact?.linkedin || result.company_info?.linkedin || result.company_info?.extracted_linkedin?.split(",")[0]?.trim() || "No LinkedIn profile found.";
  const allLinkedIn = result.company_info?.extracted_linkedin ? result.company_info.extracted_linkedin.split(",").map(l => l.trim()).slice(0, 2).join(", ") : linkedinProfile;
  
  const twitterProfile = result.contact?.twitter || result.company_info?.extracted_twitter?.split(",")[0]?.trim() || "No Twitter/X profile found.";
  const allTwitter = result.company_info?.extracted_twitter ? result.company_info.extracted_twitter.split(",").map(t => t.trim()).slice(0, 2).join(", ") : twitterProfile;
  
  return [
    {
      title: "Company Summary",
      body: result.company_info?.what_they_do || result.company_info?.summary || "Company description not available.",
      icon: Briefcase,
    },
    {
      title: "Services Offered",
      body: hasServices.length > 0 ? hasServices.join(", ") : "No service matches available yet.",
      icon: Package,
    },
    {
      title: "Conversion Priority",
      body: result.company_info?.best_conversion_opportunity || "Highest value opportunity not yet identified.",
      icon: Target,
    },
    {
      title: "Primary Contact",
      body: result.contact?.name || "No contact name found.",
      icon: AtSign,
    },
    {
      title: "Email ID",
      body: allEmails,
      icon: Mail,
    },
    {
      title: "Mobile / WhatsApp",
      body: allPhones,
      icon: Phone,
    },
    {
      title: "LinkedIn",
      body: allLinkedIn,
      icon: Globe,
    },
    {
      title: "Twitter / X",
      body: allTwitter,
      icon: Zap,
    },
    {
      title: "Sales Manager",
      body: result.assigned_sales_manager || "Assign a salesperson to this lead.",
      icon: UserPlus,
    },
    {
      title: "Follow-up Focus",
      body: result.company_info?.sales_follow_up_focus || "Capture next steps as notes and turn them into tasks.",
      icon: TrendingUp,
    },
  ];
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

function ResultCard({ historyId, result, companyName, companyUrl, onSendManually, onSendAutomatically, onSaveFollowUp, onRemove }: { historyId: string; result: ResearchResultData; companyName: string; companyUrl: string; onSendManually: (r: ResearchResultData, name: string, url: string, skip_send?: boolean, action_type?: string) => Promise<SendEmailResult>; onSendAutomatically: (r: ResearchResultData, name: string, url: string) => Promise<SendEmailResult>; onSaveFollowUp: (r: ResearchResultData, note: string, title: string) => Promise<boolean>; onRemove: (id: string) => void; }) {
  const [activeTab, setActiveTab] = useState<"english" | "spanish">("english");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [followUpNote, setFollowUpNote] = useState("");

  const [followUpTitle, setFollowUpTitle] = useState(`Follow up with ${companyName}`);
  const [followUpStatus, setFollowUpStatus] = useState<string | null>(null);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [editableSubject, setEditableSubject] = useState(result.draft?.subject || "");
  const [editableEnglishBody, setEditableEnglishBody] = useState(result.draft?.english_body || result.draft?.body || "");
  const [editableSpanishBody, setEditableSpanishBody] = useState(result.draft?.spanish_body || "");
  const [editableWhatsappBody, setEditableWhatsappBody] = useState(result.draft?.whatsapp_draft || "");
  const [fromEmail, setFromEmail] = useState("info@serphawk.com");

  const extractedEmail = result.company_info?.extracted_emails?.split(",")[0]?.trim();
  const directContactEmail = Array.isArray((result.company_info as any)?.contacts) ? (result.company_info as any).contacts[0]?.email : (result.company_info as any)?.email;
  const initialContactEmail = result.contact?.email || directContactEmail || extractedEmail || "";

  const [toEmail, setToEmail] = useState(initialContactEmail);

  useEffect(() => {
    if (sendSuccess) {
      const timer = setTimeout(() => {
        onRemove(historyId);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [sendSuccess, historyId, onRemove]);

  if (sendSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="w-full bg-white dark:bg-zinc-900 border border-emerald-500/30 rounded-2xl p-12 flex flex-col items-center justify-center shadow-sm"
      >
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
          <CheckCircle className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 dark:text-zinc-100 mb-2">Mail Sent Successfully!</h2>
        <p className="text-slate-500 dark:text-zinc-400 text-sm mb-6">Moving this to your recent outreach log...</p>
      </motion.div>
    );
  }

  if (sending) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full bg-white dark:bg-zinc-900 border border-indigo-500/30 rounded-2xl p-12 flex flex-col items-center justify-center shadow-sm h-64"
      >
        <Clock className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <h2 className="text-xl font-black text-slate-800 dark:text-zinc-100 mb-2">Sending Email...</h2>
        <p className="text-slate-500 dark:text-zinc-400 text-sm">Please wait while the system processes your request.</p>
      </motion.div>
    );
  }



  const englishText = editableEnglishBody;
  const spanishText = editableSpanishBody;
  const gmailBodyText = spanishText && !englishText.includes(spanishText) 
    ? `${englishText}\n\n---\n\n${spanishText}`
    : englishText;

  const getUpdatedResult = () => ({
    ...result,
    contact: {
      ...(result.contact || {}),
      email: toEmail
    },
    draft: {
      ...result.draft,
      subject: editableSubject,
      english_body: editableEnglishBody,
      spanish_body: editableSpanishBody,
      whatsapp_draft: editableWhatsappBody,
      body: editableEnglishBody
    }
  });

  const handleSend = async () => {
    if (!toEmail || !toEmail.trim()) {
      setSendError("Please provide a recipient email address in the 'To:' field.");
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await onSendManually(getUpdatedResult(), companyName, companyUrl, false, "System");
      setSendSuccess("Mail sent");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send email";
      setSendError(message);
    }
    setSending(false);
  };

  const handleSendAutomatically = async () => {
    if (!toEmail || !toEmail.trim()) {
      setSendError("Please provide a recipient email address in the 'To:' field.");
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await onSendAutomatically(getUpdatedResult(), companyName, companyUrl);
      setSendSuccess("Sent Automatically");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send email";
      setSendError(message);
    }
    setSending(false);
  };

  const handleSaveFollowUp = async () => {
    if (!followUpNote.trim()) {
      setFollowUpStatus("Add a follow-up note first.");
      return;
    }
    setSavingFollowUp(true);
    setFollowUpStatus(null);
    const saved = await onSaveFollowUp(result, followUpNote.trim(), followUpTitle);
    setSavingFollowUp(false);
    if (saved) {
      setFollowUpStatus("Follow-up note saved successfully.");
      setFollowUpNote("");
    } else {
      setFollowUpStatus("Unable to save follow-up. Please try again.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 w-full"
    >
      {/* Top row: Company Info + Contact */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-800 dark:text-zinc-100 font-black text-lg shadow-inner">
                {(result.company_info?.company_name || companyName).charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 dark:text-zinc-100">{result.company_info?.company_name || companyName}</h2>
                <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
                  {result.company_info?.likely_industry || result.company_info?.industry || "Business"}
                </p>
              </div>
            </div>
            {result.package_suggestion && (
              <span className="px-3 py-1 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <Package className="w-3 h-3" /> {result.package_suggestion}
              </span>
            )}
          </div>

          <p className="text-slate-500 dark:text-zinc-400 text-sm leading-relaxed mb-5">
            {result.company_info?.summary || result.company_info?.what_they_do || "Company information loading..."}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Model", value: result.company_info?.business_model, icon: Briefcase },
              { label: "Size", value: result.company_info?.estimated_size, icon: Building2 },
              { label: "Market", value: result.company_info?.target_market, icon: Target },
              { label: "Reach", value: result.company_info?.geographic_presence, icon: Globe },
            ].filter(f => f.value).map(({ label, value, icon: Icon }) => (
              <div key={label} className="p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3 h-3 text-slate-400" />
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                </div>
                <p className="text-sm font-bold text-slate-800 dark:text-zinc-100 truncate">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Extracted Company Info */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100">
              <AtSign className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-black text-slate-800 dark:text-zinc-100 uppercase tracking-widest">Extracted Company Info</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-lg border border-slate-100 dark:border-zinc-800 shadow-sm">
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase mb-1">Emails</p>
              <div className="flex flex-col gap-1">
                {result.company_info?.extracted_emails ? result.company_info.extracted_emails.split(',').map((e: string, i: number) => (
                  <a key={i} href={`mailto:${e.trim()}`} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-mono break-all">{e.trim()}</a>
                )) : <p className="text-sm text-slate-500 dark:text-zinc-500 font-mono">None</p>}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-lg border border-slate-100 dark:border-zinc-800 shadow-sm">
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase mb-1">Phones</p>
              <div className="flex flex-col gap-1">
                {result.company_info?.extracted_phone_numbers ? result.company_info.extracted_phone_numbers.split(',').map((p: string, i: number) => (
                  <a key={i} href={`tel:${p.trim()}`} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-mono break-all">{p.trim()}</a>
                )) : <p className="text-sm text-slate-500 dark:text-zinc-500 font-mono">None</p>}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-lg border border-slate-100 dark:border-zinc-800 shadow-sm lg:col-span-2">
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase mb-2">Company Socials</p>
              <div className="flex flex-wrap gap-2">
                {result.company_info?.company_social_media?.linkedin ? <a href={result.company_info.company_social_media.linkedin} target="_blank" rel="noreferrer" className="px-3 py-1 bg-[#0a66c2]/10 text-[#0a66c2] dark:bg-[#0a66c2]/20 dark:text-[#60a5fa] rounded-md text-xs font-bold hover:bg-[#0a66c2]/20 transition-colors">LinkedIn</a> : null}
                {result.company_info?.company_social_media?.twitter ? <a href={result.company_info.company_social_media.twitter} target="_blank" rel="noreferrer" className="px-3 py-1 bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-slate-300 rounded-md text-xs font-bold hover:bg-slate-200 transition-colors">X / Twitter</a> : null}
                {result.company_info?.company_social_media?.instagram ? <a href={result.company_info.company_social_media.instagram} target="_blank" rel="noreferrer" className="px-3 py-1 bg-pink-500/10 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400 rounded-md text-xs font-bold hover:bg-pink-500/20 transition-colors">Instagram</a> : null}
                {result.company_info?.company_social_media?.facebook ? <a href={result.company_info.company_social_media.facebook} target="_blank" rel="noreferrer" className="px-3 py-1 bg-blue-600/10 text-blue-700 dark:bg-blue-600/20 dark:text-blue-400 rounded-md text-xs font-bold hover:bg-blue-600/20 transition-colors">Facebook</a> : null}
                {result.company_info?.extracted_linkedin && !result.company_info?.company_social_media?.linkedin ? <a href={result.company_info.extracted_linkedin} target="_blank" rel="noreferrer" className="px-3 py-1 bg-[#0a66c2]/10 text-[#0a66c2] dark:bg-[#0a66c2]/20 dark:text-[#60a5fa] rounded-md text-xs font-bold hover:bg-[#0a66c2]/20 transition-colors">LinkedIn (Fallback)</a> : null}
                {(!result.company_info?.company_social_media || Object.values(result.company_info.company_social_media).every(v => !v)) && !result.company_info?.extracted_linkedin && <span className="text-sm text-slate-500 dark:text-zinc-500">No social profiles detected.</span>}
              </div>
            </div>
          </div>

          {/* Key Decision Makers */}
          {result.company_info?.contacts && Array.isArray(result.company_info.contacts) && result.company_info.contacts.length > 0 ? (
            <div className="bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-100 dark:border-zinc-800 overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-700 text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-widest bg-slate-100 dark:bg-zinc-900/50">
                    <th className="py-3 px-4 font-bold">Name & Role</th>
                    <th className="py-3 px-4 font-bold">Contact</th>
                    <th className="py-3 px-4 font-bold">Socials</th>
                  </tr>
                </thead>
                <tbody>
                  {result.company_info.contacts.map((p: any, i: number) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-white dark:hover:bg-zinc-900 transition-colors">
                      <td className="py-4 px-4 align-top">
                        <div className="font-bold text-sm text-slate-800 dark:text-zinc-100">{p.name || 'Unknown Name'}</div>
                        {p.role && <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{p.role}</div>}
                      </td>
                      <td className="py-4 px-4 align-top">
                        {p.email && (
                          <div className="flex items-center gap-2 mb-1">
                            <Mail size={12} className="text-slate-400" />
                            <a href={`mailto:${p.email}`} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline break-all">{p.email}</a>
                          </div>
                        )}
                        {p.phone_number && (
                          <div className="flex items-center gap-2">
                            <Phone size={12} className="text-slate-400" />
                            <a href={`tel:${p.phone_number}`} className="text-xs text-slate-600 dark:text-zinc-300 hover:underline">{p.phone_number}</a>
                          </div>
                        )}
                        {!p.email && !p.phone_number && <span className="text-xs text-slate-400">Not found</span>}
                      </td>
                      <td className="py-4 px-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          {p.personal_social_media?.linkedin ? (
                            <a href={p.personal_social_media.linkedin} target="_blank" rel="noreferrer" className="px-2 py-1 bg-[#0a66c2]/10 text-[#0a66c2] dark:bg-[#0a66c2]/20 dark:text-[#60a5fa] rounded text-[10px] font-bold hover:bg-[#0a66c2]/20 transition-colors">LinkedIn</a>
                          ) : null}
                          {p.personal_social_media?.twitter ? (
                            <a href={p.personal_social_media.twitter} target="_blank" rel="noreferrer" className="px-2 py-1 bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-slate-300 rounded text-[10px] font-bold hover:bg-slate-200 transition-colors">X/Twitter</a>
                          ) : null}
                          {!p.personal_social_media?.linkedin && !p.personal_social_media?.twitter && <span className="text-xs text-slate-400">-</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-24 text-slate-400">
              <AtSign className="w-8 h-8 opacity-30" />
              <p className="text-xs mt-2">No key decision makers found</p>
            </div>
          )}
        </div>



      {/* Extracted Client Services */}
      {result.extracted_services && result.extracted_services.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-emerald-500/30 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
              <Store className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Services Offered by This Company</p>
            <span className="ml-auto text-[9px] font-black text-emerald-500/60 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              {result.extracted_services.length} detected
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.extracted_services.map((svc, i) => (
              <div key={i} className="p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    {svc.category}
                  </span>
                  {svc.approx_cost > 0 && (
                    <span className="ml-auto text-[9px] font-black text-amber-400 flex items-center gap-0.5">
                      <DollarSign className="w-2.5 h-2.5" />
                      {svc.approx_cost.toLocaleString()}
                      {svc.cost_is_estimated ? ' est.' : ''}
                    </span>
                  )}
                </div>
                <p className="font-bold text-slate-800 dark:text-zinc-100 text-sm mb-1">{svc.name}</p>
                {svc.brief && <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">{svc.brief}</p>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-emerald-500/50 font-medium">
            ✦ These services have been saved to the client profile and Marketplace catalog.
          </p>
        </div>
      )}


      {result.draft && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100">
                <FileText className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-black text-slate-800 dark:text-zinc-100 uppercase tracking-widest">Generated Email Draft</p>
            </div>
            <CopyButton text={activeTab === "english" ? editableEnglishBody : activeTab === "spanish" ? editableSpanishBody : editableWhatsappBody} />
          </div>

          {/* Send Box at the top */}
          <div className="mb-6 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl p-4 space-y-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-zinc-100">
                  <span className="text-slate-500 w-12">From:</span>
                  <input 
                    type="text" 
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-zinc-100">
                  <span className="text-slate-500 w-12">To:</span>
                  <input 
                    type="text" 
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    placeholder="recipient@example.com"
                    className="flex-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleSendAutomatically}
                    disabled={sending || !!sendSuccess}
                    className="w-full px-4 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black font-bold text-xs flex items-center justify-center gap-2 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                  >
                    {sending ? <Clock className="w-3.5 h-3.5 animate-spin" /> : sendSuccess ? <CheckCircle className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                    Send Automatically ( send mail )
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sending || !!sendSuccess}
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-50 dark:bg-zinc-950 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Send via System
                  </button>
                </div>
              </div>
              {sendError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  {sendError}
                </div>
              )}
            </div>
          <div className="mb-4">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Subject</p>
            <input 
              type="text"
              value={editableSubject}
              onChange={(e) => setEditableSubject(e.target.value)}
              className="w-full bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-100 dark:border-zinc-800 p-3 text-sm font-bold text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          <div className="flex gap-2 mb-4">
            {[
              { key: "english" as const, label: "English" },
              { key: "spanish" as const, label: "Español" },
              ...(result.draft?.whatsapp_draft ? [{ key: "whatsapp" as const, label: "WhatsApp" }] : []),
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                  activeTab === tab.key ? "bg-white dark:bg-zinc-900 text-black dark:text-white border-slate-300 dark:border-zinc-600 shadow-sm" : "bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:bg-white dark:bg-zinc-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mb-6">
            <textarea
              value={activeTab === "english" ? editableEnglishBody : activeTab === "spanish" ? editableSpanishBody : editableWhatsappBody}
              onChange={(e) => {
                if (activeTab === "english") setEditableEnglishBody(e.target.value);
                else if (activeTab === "spanish") setEditableSpanishBody(e.target.value);
                else setEditableWhatsappBody(e.target.value);
              }}
              rows={12}
              className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl p-5 text-sm text-slate-700 dark:text-zinc-200 leading-relaxed font-mono custom-scrollbar focus:outline-none focus:border-indigo-500 transition-all resize-y"
            />
          </div>

          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              {buildProspectingPoints(result).map((point, idx) => {
                const Icon = point.icon;
                return (
                  <div key={idx} className="rounded-3xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 p-4 text-sm text-slate-700 dark:text-zinc-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-3 text-slate-500 dark:text-zinc-400">
                      <Icon className="w-4 h-4" />
                      <span className="font-bold uppercase tracking-[0.18em] text-[10px]">{point.title}</span>
                    </div>
                    <p className="leading-snug text-slate-600 dark:text-zinc-300 font-medium">{point.body}</p>
                  </div>
                );
              })}
            </div>

            <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Next Follow-up Note</label>
                <input
                  type="text"
                  value={followUpTitle}
                  onChange={(e) => setFollowUpTitle(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-700 px-3 py-2 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-white"
                  placeholder="Follow-up title"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Note for the sales team</label>
                <textarea
                  value={followUpNote}
                  onChange={(e) => setFollowUpNote(e.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-700 px-3 py-3 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-white resize-none"
                  placeholder="Capture the follow-up summary, next steps, or internal action items."
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={handleSaveFollowUp}
                  disabled={savingFollowUp || !followUpNote.trim()}
                  className="px-4 py-2 rounded-xl bg-sky-500 text-slate-800 dark:text-zinc-100 font-bold text-xs hover:bg-sky-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingFollowUp ? "Saving..." : "Save Follow-Up"}
                </button>
                {followUpStatus && (
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{followUpStatus}</p>
                )}
              </div>
            </div>
          </div>
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
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Added for Gmail Agent Migration: Allows user to dismiss a specific research result and refocuses on the input field seamlessly
  const handleRemoveResult = (id: string) => {
    setResultsHistory(prev => prev.filter(r => r.id !== id));
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const scrollToBottom = () => {
    // Updated for Gmail Agent Migration: Smoothly scrolls the specific chat container to the bottom instead of the whole page
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
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
      
      // Updated for Gmail Agent Migration: Moved step to 'website_url' (previously 'company_name') to enable multi-company sequential searches
      setChatStep("website_url");
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
      const serviceNames = (result.recommended_services || []).map((s) => (typeof s === 'string' ? s : s.service_name || '')).filter(Boolean).join(", ");
      const fallbackEmail = Array.isArray(result.company_info?.contacts) ? result.company_info.contacts[0]?.email : undefined;
      const extractedEmail = result.company_info?.extracted_emails?.split(",")[0]?.trim();
      const emailToSend = result.contact?.email || fallbackEmail || extractedEmail || undefined;
      if (!emailToSend) {
        throw new Error("No recipient email available to send.");
      }
      const res = await fetch(`${API_BASE_URL}/send-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: emailToSend,
          company_name: result.company_info?.company_name || name,
          subject: result.draft?.subject || "",
          english_body: result.draft?.english_body || result.draft?.body || "",
          spanish_body: result.draft?.spanish_body || "",
          recommended_services: serviceNames,
          contact_name: result.contact?.name || null,
          contact_role: result.contact?.role || null,
          website_url: result.company_url || result.company_info?.website || url || null,
          phone_number: result.contact?.phone_number || null,
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
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" ref={chatContainerRef}>
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
                ref={inputRef}
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
              <ResultCard key={res.id} historyId={res.id} result={res.resultData} companyName={res.companyName} companyUrl={res.companyUrl} onSendManually={handleSendManually} onSendAutomatically={handleSendAutomatically} onSaveFollowUp={handleSaveFollowUp} onRemove={handleRemoveResult} />
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
