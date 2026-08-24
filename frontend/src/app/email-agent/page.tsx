"use client";

import React, { useState, useEffect, useRef, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Send, Sparkles, Mail, Clock, User, Globe, ChevronDown, ChevronUp,
  CheckCircle, Building2, Briefcase, Target, AtSign, FileText, Copy, Check,
  TrendingUp, Zap, Package, UserPlus, Phone, Store, DollarSign, MessageCircle, Trash2, Youtube
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import PageGuide from "@/components/PageGuide";
import GmailAgentLoop from "./GmailAgentLoop";

interface SentEmail {
  id: number;
  client_id: number | null;
  company_name?: string;
  to_email: string;
  subject: string;
  english_body: string | null;
  spanish_body: string | null;
  recommended_services: string | null;
  manual: boolean;
  draft_json: string | null;
  status: string;
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
    extracted_emails?: string | string[];
    extracted_phone_numbers?: string;
    extracted_linkedin?: string;
    extracted_twitter?: string;
    source_pages?: string[];
    company_social_media?: {
      linkedin?: string;
      twitter?: string;
      instagram?: string;
      facebook?: string;
      youtube?: string;
    };
    contacts?: Array<{
      email?: string;
      name?: string;
      role?: string;
      phone_number?: string;
      personal_social_media?: {
        linkedin?: string;
        twitter?: string;
      };
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
    whatsapp_draft?: string;
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
  lead_id?: number;
  success?: boolean;
  message?: string;
  sent_email_id?: number;
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
  
  const toArray = (val: any) => Array.isArray(val) ? val : (typeof val === 'string' ? val.split(",") : []);
  
  // Extract contact information with fallbacks
  const emails = toArray(result.company_info?.extracted_emails);
  const primaryEmail = result.contact?.email || emails[0]?.trim() || "No email found.";
  const allEmails = emails.length > 0 ? emails.map((e: string) => e.trim()).slice(0, 2).join(", ") : primaryEmail;
  
  const phones = toArray(result.company_info?.extracted_phone_numbers);
  const primaryPhone = result.contact?.phone_number || result.contact?.whatsapp || phones[0]?.trim() || "No phone available.";
  const allPhones = phones.length > 0 ? phones.map((p: string) => p.trim()).slice(0, 2).join(", ") : primaryPhone;
  
  const linkedins = toArray(result.company_info?.extracted_linkedin);
  const linkedinProfile = result.contact?.linkedin || result.company_info?.linkedin || linkedins[0]?.trim() || "No LinkedIn profile found.";
  const allLinkedIn = linkedins.length > 0 ? linkedins.map((l: string) => l.trim()).slice(0, 2).join(", ") : linkedinProfile;
  
  const twitters = toArray(result.company_info?.extracted_twitter);
  const twitterProfile = result.contact?.twitter || twitters[0]?.trim() || "No Twitter/X profile found.";
  const allTwitter = twitters.length > 0 ? twitters.map((t: string) => t.trim()).slice(0, 2).join(", ") : twitterProfile;
  
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

function CopyableEmailItem({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-600 transition-all group/item shadow-sm">
      <span className="text-xs font-mono text-slate-800 dark:text-zinc-200 break-all select-all pr-1">{email}</span>
      <button
        onClick={handleCopy}
        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors shadow-sm bg-slate-50 dark:bg-zinc-950 flex-shrink-0"
        title="Copy email"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function ResultCard({ historyId, result, companyName, companyUrl, onSendManually, onSendAutomatically, onSaveFollowUp, onRemove }: { historyId: string; result: ResearchResultData; companyName: string; companyUrl: string; onSendManually: (r: ResearchResultData, name: string, url: string, skip_send?: boolean, action_type?: string) => Promise<SendEmailResult>; onSendAutomatically: (r: ResearchResultData, name: string, url: string) => Promise<SendEmailResult>; onSaveFollowUp: (r: ResearchResultData, note: string, title: string) => Promise<boolean>; onRemove: (id: string) => void; }) {
  const [activeTab, setActiveTab] = useState<"english" | "spanish" | "whatsapp">("english");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [followUpNote, setFollowUpNote] = useState("");

  const [followUpTitle, setFollowUpTitle] = useState(`Follow up with ${companyName}`);
  const [followUpStatus, setFollowUpStatus] = useState<string | null>(null);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const formatBody = (body: any) => {
    if (typeof body !== 'string') return "";
    return body.replace(/<br\s*\/?>/gi, '\n');
  };

  const [editableSubject, setEditableSubject] = useState(result.draft?.subject || "");
  const [editableEnglishBody, setEditableEnglishBody] = useState(formatBody(result.draft?.english_body || result.draft?.body));
  const [editableSpanishBody, setEditableSpanishBody] = useState(formatBody(result.draft?.spanish_body));
  const [editableWhatsappBody, setEditableWhatsappBody] = useState(formatBody(result.draft?.whatsapp_draft));
  const [fromEmail, setFromEmail] = useState("support.crm@serphawk.in");

  const extractedEmailsArray = (Array.isArray(result.company_info?.extracted_emails) ? result.company_info.extracted_emails : (result.company_info?.extracted_emails?.split(",") || []))
    .filter((e: string) => e.trim().toLowerCase() !== "test@example.com" && e.trim().toLowerCase() !== "support.crm@serphawk.in");
  const extractedEmail = extractedEmailsArray[0]?.trim();
  const directContactEmail = Array.isArray((result.company_info as any)?.contacts) ? (result.company_info as any).contacts[0]?.email : (result.company_info as any)?.email;
  
  let rawInitialEmail = result.contact?.email || directContactEmail || extractedEmail || "";
  if (Array.isArray(rawInitialEmail)) rawInitialEmail = rawInitialEmail[0];
  let initialContactEmail = typeof rawInitialEmail === 'string' ? rawInitialEmail : String(rawInitialEmail || "");
  
  if (initialContactEmail.trim().toLowerCase() === "test@example.com" || initialContactEmail.trim().toLowerCase() === "support.crm@serphawk.in") {
    initialContactEmail = "";
  }

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
      english_body: activeTab === "english" ? editableEnglishBody : "",
      spanish_body: activeTab === "spanish" ? editableSpanishBody : "",
      whatsapp_draft: editableWhatsappBody,
      body: activeTab === "english" ? editableEnglishBody : editableSpanishBody
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

  const handleSendViaSystem = () => {
    if (!toEmail || !toEmail.trim()) {
      setSendError("Please provide a recipient email address in the 'To:' field.");
      return;
    }
    
    // Open the default custom mail app instantly (mailto:)
    const bodyText = activeTab === "english" ? editableEnglishBody : activeTab === "spanish" ? editableSpanishBody : editableWhatsappBody;
    const mailtoLink = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(editableSubject)}&body=${encodeURIComponent(bodyText)}`;
    window.location.href = mailtoLink;
    
    // Log to backend in the background without freezing the UI
    onSendManually(getUpdatedResult(), companyName, companyUrl, true, "System").catch(console.error);
    
    // Show success immediately
    setSendSuccess("Mail sent");
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
              
              <div className="flex items-center gap-2">
                {result.package_suggestion && (
                  <span className="px-3 py-1 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                    <Package className="w-3 h-3" /> {result.package_suggestion}
                  </span>
                )}
                <button onClick={() => onRemove(historyId)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all" title="Delete Result">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

          <p className="text-slate-500 dark:text-zinc-400 text-sm leading-relaxed mb-5">
            {result.company_info?.summary || result.company_info?.what_they_do || "Company information gathered successfully."}
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
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase mb-1.5">Emails</p>
              <div className="flex flex-col gap-1.5">
                {result.company_info?.extracted_emails ? (
                  (Array.isArray(result.company_info.extracted_emails) 
                    ? result.company_info.extracted_emails 
                    : result.company_info.extracted_emails.split(',')
                  )
                  .filter((e: string) => e.trim().toLowerCase() !== "test@example.com" && e.trim().toLowerCase() !== "support.crm@serphawk.in")
                  .map((e: string, i: number) => (
                    <CopyableEmailItem key={i} email={e.trim()} />
                  ))
                ) : (
                  <p className="text-xs text-slate-500 dark:text-zinc-500 font-mono">None</p>
                )}
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
                {result.company_info?.company_social_media?.youtube ? <a href={result.company_info.company_social_media.youtube} target="_blank" rel="noreferrer" className="px-3 py-1 bg-red-600/10 text-red-700 dark:bg-red-600/20 dark:text-red-400 rounded-md text-xs font-bold hover:bg-red-600/20 transition-colors flex items-center gap-1"><Youtube className="w-3 h-3" /> YouTube</a> : null}
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

        {/* Source Pages / Reference URLs */}
        {result.company_info?.source_pages && result.company_info.source_pages.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100">
                <Globe className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-black text-slate-800 dark:text-zinc-100 uppercase tracking-widest">Source Pages / Reference URLs</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {result.company_info.source_pages.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl hover:border-slate-300 dark:hover:border-zinc-600 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-all flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-zinc-300 truncate">
                  <Globe className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{url}</span>
                </a>
              ))}
            </div>
          </div>
        )}

      {/* Extracted Client Services */}
      {result.extracted_services && result.extracted_services.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100">
              <Store className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-black text-slate-800 dark:text-zinc-100 uppercase tracking-widest">Services Offered by This Company</p>
            <span className="ml-auto text-[9px] font-black text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 px-2 py-0.5 rounded-full">
              {result.extracted_services.length} detected
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.extracted_services.map((svc, i) => (
              <div key={i} className="p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl hover:border-slate-300 dark:hover:border-zinc-600 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 px-2 py-0.5 rounded-full">
                    {svc.category}
                  </span>
                  {svc.approx_cost > 0 && (
                    <span className="ml-auto text-[9px] font-black text-amber-500 flex items-center gap-0.5">
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
          <p className="mt-3 text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
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

          {result.email_hook && (
            <div className="mb-6 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Suggested Hook</p>
              <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{result.email_hook}</p>
            </div>
          )}

          {/* Send Box at the top */}
          <div className="mb-6 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl p-4 space-y-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-zinc-100 group relative">
                  <span className="text-slate-500 w-12">From:</span>
                  <input 
                    type="text" 
                    value="vkanjali@serphawk.com"
                    readOnly
                    disabled
                    className="flex-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 px-3 py-1.5 text-sm text-slate-500 cursor-not-allowed focus:outline-none transition-all"
                  />
                  <div className="absolute bottom-full left-14 mb-2 hidden group-hover:block bg-slate-800 text-white text-xs rounded-lg px-3 py-1.5 shadow-lg whitespace-nowrap z-50 font-medium">
                    Automated sending email address
                    <div className="absolute -bottom-1 left-4 w-2 h-2 bg-slate-800 rotate-45"></div>
                  </div>
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
                  <div className="w-full px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 shadow-sm">
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.5 }}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </motion.div>
                    Mail Sent Automatically via AI
                  </div>
                  <button
                    onClick={handleSendViaSystem}
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
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [companyName, setCompanyName] = useState("");
  const [inputValue, setInputValue] = useState("");
  
  const [chatStep, setChatStep] = useState<"website_url" | "loading" | "idle">("website_url");
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "msg-1", role: "ai", type: "text", content: "Hello! Enter a company website URL to generate an outreach strategy and email draft." }
  ]);
  
  const [resultsHistory, setResultsHistory] = useState<ResearchResult[]>([]);

  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [emailTotals, setEmailTotals] = useState({ totalSent: 0, autoCount: 0, manualCount: 0 });
  const [emailsLoading, setEmailsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedCompanies, setExpandedCompanies] = useState<string[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<number[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Added for Gmail Agent Migration: Allows user to dismiss a specific research result and refocuses on the input field seamlessly
  const handleRemoveResult = async (id: string) => {
    setResultsHistory(prev => prev.filter(r => r.id !== id));
    if (!id.startsWith("res-")) {
      try {
        await fetch(`${API_BASE_URL}/email-agent/results/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.error("Failed to delete result from DB", e);
      }
    }
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
    const fetchEmailsData = () => {
      fetch(`${API_BASE_URL}/sent-emails?limit=30`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          if (data && typeof data === 'object' && !Array.isArray(data) && 'totalSent' in data) {
            setEmailTotals({
              totalSent: data.totalSent,
              autoCount: data.autoCount,
              manualCount: data.manualCount
            });
            return setSentEmails(data.emails || []);
          }
          if (Array.isArray(data)) {
            setEmailTotals({
              totalSent: data.length,
              manualCount: data.filter(e => e.manual).length,
              autoCount: data.length - data.filter(e => e.manual).length
            });
            return setSentEmails(data);
          }
          if (data?.emails && Array.isArray(data.emails)) {
            setEmailTotals({
              totalSent: data.emails.length,
              manualCount: data.emails.filter((e: any) => e.manual).length,
              autoCount: data.emails.length - data.emails.filter((e: any) => e.manual).length
            });
            return setSentEmails(data.emails);
          }
          return setSentEmails([]);
        })
        .catch(() => setSentEmails([]))
        .finally(() => setEmailsLoading(false));
    };

    fetchEmailsData();
    const interval = setInterval(fetchEmailsData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const handleDeleteEmail = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    // Optimistic delete
    setSentEmails(prev => prev.filter(email => email.id !== id));
    setEmailTotals(prev => ({
      ...prev,
      totalSent: Math.max(0, prev.totalSent - 1)
    }));
    try {
      await fetch(`${API_BASE_URL}/sent-emails/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error("Failed to delete email", err);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedEmails.length === 0) return;
    const idsToDelete = [...selectedEmails];
    
    // Optimistic UI update
    setSentEmails(prev => prev.filter(email => !idsToDelete.includes(email.id)));
    setEmailTotals(prev => ({
      ...prev,
      totalSent: Math.max(0, prev.totalSent - idsToDelete.length)
    }));
    setSelectedEmails([]);

    // Background delete using bulk endpoint
    try {
      await fetch(`${API_BASE_URL}/sent-emails/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      });
    } catch (err) {
      console.error("Failed to bulk delete emails", err);
    }
  };

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
      const cleanUrl = url.replace(/^https?:\/\//i, "");
      const res = await fetch(`${API_BASE_URL}/smart-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: name,
          company_url: cleanUrl || null,
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
      
      setResultsHistory([
        { id: data.db_id ? String(data.db_id) : `res-${Date.now()}`, resultData: data, companyName: name, companyUrl: url }
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
      setChatStep("website_url");
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
      const extractedEmailsArray = Array.isArray(result.company_info?.extracted_emails) ? result.company_info.extracted_emails : (result.company_info?.extracted_emails?.split(",") || []);
      const extractedEmail = extractedEmailsArray[0]?.trim();
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
      fetch(`${API_BASE_URL}/sent-emails?limit=30`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (d && typeof d === 'object' && !Array.isArray(d) && 'totalSent' in d) {
            setEmailTotals({
              totalSent: d.totalSent,
              autoCount: d.autoCount,
              manualCount: d.manualCount
            });
            return setSentEmails(d.emails || []);
          }
          if (Array.isArray(d)) {
            setEmailTotals({
              totalSent: d.length,
              manualCount: d.filter(e => e.manual).length,
              autoCount: d.length - d.filter(e => e.manual).length
            });
            return setSentEmails(d);
          }
          if (d?.emails && Array.isArray(d.emails)) {
            setEmailTotals({
              totalSent: d.emails.length,
              manualCount: d.emails.filter((e: any) => e.manual).length,
              autoCount: d.emails.length - d.emails.filter((e: any) => e.manual).length
            });
            return setSentEmails(d.emails);
          }
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

  const { totalSent, manualCount, autoCount } = emailTotals;

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
            <div className="flex bg-slate-200 dark:bg-zinc-800 p-1 rounded-lg ml-4">
              <button
                onClick={() => setMode("single")}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${mode === "single" ? "bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 shadow-sm" : "text-slate-500 dark:text-zinc-400 hover:text-slate-700"}`}
              >
                Single
              </button>
              <button
                onClick={() => setMode("bulk")}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${mode === "bulk" ? "bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 shadow-sm" : "text-slate-500 dark:text-zinc-400 hover:text-slate-700"}`}
              >
                Bulk
              </button>
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
        {mode === "single" ? (
          <>
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
          </>
        ) : (
          <div className="w-full max-w-4xl mx-auto">
            <GmailAgentLoop />
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
              {sentEmails.length > 0 && (
                <div className="flex items-center gap-2 ml-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-3 py-1.5 rounded-lg shadow-sm">
                  <input 
                    type="checkbox"
                    checked={selectedEmails.length === sentEmails.length && sentEmails.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedEmails(sentEmails.map(email => email.id));
                      } else {
                        setSelectedEmails([]);
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-600 dark:text-zinc-300">Select All</span>
                </div>
              )}
              {selectedEmails.length > 0 && (
                <button 
                  onClick={handleDeleteSelected}
                  className="ml-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 dark:bg-red-500/20 dark:hover:bg-red-500/30 dark:text-red-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete ({selectedEmails.length})
                </button>
              )}
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
                 <div className="w-full mt-4 space-y-4">
              {Object.entries(
                sentEmails.reduce((acc, email) => {
                  const key = email.company_name && email.company_name !== "Unknown Company" ? email.company_name : "Prospect";
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(email);
                  return acc;
                }, {} as Record<string, SentEmail[]>)
              ).map(([company, emails]) => {
                const isCompanyExpanded = expandedCompanies.includes(company);
                return (
                  <div key={company} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden shadow-sm">
                    <div 
                      className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-zinc-950 border-b border-slate-100 dark:border-zinc-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors"
                      onClick={() => setExpandedCompanies(prev => prev.includes(company) ? prev.filter(c => c !== company) : [...prev, company])}
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-black text-lg text-slate-800 dark:text-zinc-100">{company}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{emails.length} Emails Extracted & Sent</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="flex items-center">
                           <input 
                              type="checkbox" 
                              checked={emails.every(e => selectedEmails.includes(e.id))}
                              onChange={(e) => {
                                e.stopPropagation();
                                if (e.target.checked) setSelectedEmails(prev => [...new Set([...prev, ...emails.map(em => em.id)])]);
                                else setSelectedEmails(prev => prev.filter(id => !emails.map(em => em.id).includes(id)));
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4 mr-4"
                              title="Select all in company"
                           />
                         </div>
                         {isCompanyExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                      </div>
                    </div>

                    {isCompanyExpanded && (
                      <div className="p-6 bg-slate-50/30 dark:bg-zinc-950/30 space-y-4">
                        {emails.map(email => (
                          <div key={email.id} className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl p-5 shadow-sm relative group hover:border-indigo-200 transition-colors">
                            <div className="absolute top-5 right-5 flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                checked={selectedEmails.includes(email.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedEmails(prev => [...prev, email.id]);
                                  else setSelectedEmails(prev => prev.filter(id => id !== email.id));
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                              />
                              <button onClick={(e) => handleDeleteEmail(e, email.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-6 mb-4 pr-20">
                              <div className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-950 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-zinc-800">
                                <Mail className="w-4 h-4 text-slate-400" />
                                <span className="text-sm font-black text-slate-700 dark:text-zinc-200">{email.to_email}</span>
                              </div>
                              <div className="flex flex-col justify-center">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Status</p>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
                                  email.status === "Opened" ? "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400" :
                                  email.status === "Replied" ? "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400" :
                                  "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"
                                }`}>
                                  {email.status || "Sent"}
                                </span>
                              </div>
                              <div className="flex flex-col justify-center">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Subject</p>
                                <span className="text-sm font-bold text-slate-600 dark:text-zinc-300">{email.subject || "(No subject)"}</span>
                              </div>
                            </div>

                            {(email.english_body || email.spanish_body) && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {email.english_body && (
                                  <div>
                                    <div className="flex justify-between items-center mb-1">
                                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">English Draft</p>
                                      <CopyButton text={email.english_body} />
                                    </div>
                                    <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl p-4 text-[13px] text-slate-600 dark:text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar font-sans leading-relaxed">
                                      {email.english_body}
                                    </div>
                                  </div>
                                )}
                                {email.spanish_body && (
                                  <div>
                                    <div className="flex justify-between items-center mb-1">
                                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Spanish Draft</p>
                                      <CopyButton text={email.spanish_body} />
                                    </div>
                                    <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl p-4 text-[13px] text-slate-600 dark:text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar font-sans leading-relaxed">
                                      {email.spanish_body}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
