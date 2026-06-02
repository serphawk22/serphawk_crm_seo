"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Send, Sparkles, Mail, Clock, User, Globe, ChevronDown, ChevronUp,
  CheckCircle, Building2, Briefcase, Target, AtSign, FileText, Copy, Check,
  TrendingUp, Zap, Package, UserPlus
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
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

interface ResearchResult {
  id: string;
  resultData: any;
  companyName: string;
  companyUrl: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded-lg hover:bg-white/20 text-gray-300 hover:text-white transition-all"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function BottomUpFillMail() {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="relative w-12 h-12">
        <Mail className="absolute inset-0 w-12 h-12 text-gray-400" strokeWidth={1} />
        <motion.div
          className="absolute bottom-0 left-0 right-0 overflow-hidden"
          initial={{ height: "0%" }}
          animate={{ height: "100%" }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute bottom-0 left-0 w-12 h-12">
            <Mail className="w-12 h-12 text-white" strokeWidth={1} fill="white" />
          </div>
        </motion.div>
      </div>
      <p className="text-xs font-bold text-gray-300 animate-pulse">Researching & drafting...</p>
    </div>
  );
}

function ResultCard({ result, companyName, companyUrl, onSendManually }: { result: any, companyName: string, companyUrl: string, onSendManually: (r: any, name: string, url: string) => void }) {
  const [activeTab, setActiveTab] = useState<"english" | "spanish">("english");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  const handleSend = async () => {
    setSending(true);
    await onSendManually(result, companyName, companyUrl);
    setSendSuccess("Sent Manually");
    setSending(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 w-full"
    >
      {/* Top row: Company Info + Contact */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Company Info */}
        <div className="bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl p-6 lg:col-span-2 shadow-xl">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-white font-black text-lg shadow-inner">
                {(result.company_info?.company_name || companyName).charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-black text-white">{result.company_info?.company_name || companyName}</h2>
                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                  {result.company_info?.likely_industry || result.company_info?.industry || "Business"}
                </p>
              </div>
            </div>
            {result.package_suggestion && (
              <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <Package className="w-3 h-3" /> {result.package_suggestion}
              </span>
            )}
          </div>

          <p className="text-gray-300 text-sm leading-relaxed mb-5">
            {result.company_info?.summary || result.company_info?.what_they_do || "Company information loading..."}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Model", value: result.company_info?.business_model, icon: Briefcase },
              { label: "Size", value: result.company_info?.estimated_size, icon: Building2 },
              { label: "Market", value: result.company_info?.target_market, icon: Target },
              { label: "Reach", value: result.company_info?.geographic_presence, icon: Globe },
            ].filter(f => f.value).map(({ label, value, icon: Icon }) => (
              <div key={label} className="p-3 bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3 h-3 text-gray-400" />
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                </div>
                <p className="text-sm font-bold text-white truncate">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Contact Card */}
        <div className="bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2 rounded-xl bg-white/10 border border-white/20 text-white">
              <AtSign className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-black text-white uppercase tracking-widest">Business Contact</p>
          </div>

          {result.contact?.email ? (
            <div className="space-y-4">
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Email</p>
                  <p className="text-sm font-black text-white">{result.contact.email}</p>
                </div>
                <CopyButton text={result.contact.email} />
              </div>
              {result.contact.phone_number && (
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Phone</p>
                    <p className="text-sm font-black text-white">{result.contact.phone_number}</p>
                  </div>
                  <CopyButton text={result.contact.phone_number} />
                </div>
              )}
              {result.contact.name && (
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Contact</p>
                  <p className="text-sm font-bold text-white">{result.contact.name}</p>
                  {result.contact.role && <p className="text-xs text-gray-300">{result.contact.role}</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-24 text-gray-400">
              <AtSign className="w-8 h-8 opacity-30" />
              <p className="text-xs mt-2">No contact found</p>
            </div>
          )}
        </div>
      </div>

      {/* Recommended Services */}
      {result.recommended_services?.length > 0 && (
        <div className="bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2 rounded-xl bg-white/10 border border-white/20 text-white">
              <Zap className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-black text-white uppercase tracking-widest">Recommended Services</p>
          </div>
          {result.email_hook && (
            <p className="text-sm text-white italic mb-5 bg-white/5 p-4 rounded-xl border border-white/10">
              &ldquo;{result.email_hook}&rdquo;
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.recommended_services.map((svc: any, i: number) => (
              <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-white/30 hover:bg-white/10 transition-all">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-white/10 text-white shrink-0 mt-0.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">{svc.service_name}</p>
                    <p className="text-xs text-gray-300 mt-1">{svc.why_relevant}</p>
                    {svc.expected_impact && (
                      <p className="text-[10px] text-green-400 font-bold mt-2 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> {svc.expected_impact}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Draft */}
      {result.draft && (
        <div className="bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-white/20 text-white">
                <FileText className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-black text-white uppercase tracking-widest">Generated Email Draft</p>
            </div>
            <CopyButton text={activeTab === "english" ? (result.draft.english_body || result.draft.body || "") : (result.draft.spanish_body || "")} />
          </div>

          {result.draft.subject && (
            <div className="mb-4 p-3 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Subject</p>
                <p className="text-sm font-bold text-white">{result.draft.subject}</p>
              </div>
              <CopyButton text={result.draft.subject} />
            </div>
          )}

          <div className="flex gap-2 mb-4">
            {[
              { key: "english" as const, label: "English" },
              { key: "spanish" as const, label: "Espa\u00f1ol" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                  activeTab === tab.key
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-gray-300 border-white/20 hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-sm text-gray-100 whitespace-pre-wrap leading-relaxed max-h-80 overflow-auto font-mono custom-scrollbar">
            {activeTab === "english"
              ? (result.draft.english_body || result.draft.body || "No English draft generated")
              : (result.draft.spanish_body || "No Spanish draft generated")}
          </div>

          {result.contact?.email && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                <Send className="w-4 h-4 text-gray-300" />
                <span className="text-sm font-bold text-white flex-1">Ready to send to: {result.contact.email}</span>
                <button
                  onClick={handleSend}
                  disabled={sending || !!sendSuccess}
                  className="px-4 py-2 rounded-xl bg-white text-black font-bold text-xs flex items-center gap-2 hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {sending ? (
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                  ) : sendSuccess ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5" />
                  )}
                  {sending ? "Sending..." : sendSuccess ? "Sent" : "Send Manually"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default function EmailAgentPage() {
  const { role } = useRole();
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [inputValue, setInputValue] = useState("");
  
  const [chatStep, setChatStep] = useState<"company_name" | "website_url" | "loading" | "idle">("company_name");
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "msg-1", role: "ai", type: "text", content: "Hello! What company would you like to research today?" }
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
      .then((data) => setSentEmails(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setEmailsLoading(false));
  }, []);

  const handleSendInput = async () => {
    if (chatStep === "company_name") {
      if (!inputValue.trim()) return;
      const name = inputValue.trim();
      setCompanyName(name);
      setInputValue("");
      
      setMessages(prev => [
        ...prev,
        { id: `msg-${Date.now()}`, role: "user", type: "text", content: name },
        { id: `msg-${Date.now()+1}`, role: "ai", type: "text", content: `Great! Do you have ${name}'s website URL? (Optional)` }
      ]);
      setChatStep("website_url");
    } 
    else if (chatStep === "website_url") {
      const url = inputValue.trim();
      setCompanyUrl(url);
      setInputValue("");
      
      setMessages(prev => [
        ...prev,
        { id: `msg-${Date.now()}`, role: "user", type: "text", content: url || "(Skipped)" },
        { id: `msg-${Date.now()+1}`, role: "ai", type: "loading" }
      ]);
      setChatStep("loading");
      
      await performResearch(companyName, url);
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
      setCompanyUrl("");
      setTimeout(() => {
        setMessages(prev => [
          ...prev,
          { id: `msg-${Date.now()+2}`, role: "ai", type: "text", content: "What other company would you like to research next?" }
        ]);
      }, 1000);

    } catch (e: any) {
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

  const handleSendManually = async (result: any, name: string, url: string) => {
    try {
      const serviceNames = (result.recommended_services || []).map((s: any) => s.service_name || s).join(", ");
      const res = await fetch(`${API_BASE_URL}/send-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: result.contact.email,
          company_name: result.company_info?.company_name || name,
          subject: result.draft.subject || "",
          english_body: result.draft.english_body || result.draft.body || "",
          spanish_body: result.draft.spanish_body || "",
          recommended_services: serviceNames,
          contact_name: result.contact.name || null,
          contact_role: result.contact.role || null,
          website_url: result.company_url || result.company_info?.website || url || null,
          phone_number: result.contact.phone_number || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to send");
      
      fetch(`${API_BASE_URL}/sent-emails?limit=30`)
        .then((r) => r.json())
        .then((d) => setSentEmails(Array.isArray(d) ? d : []))
        .catch(() => {});
    } catch (e: any) {
      console.error(e);
    }
  };

  const totalSent = sentEmails.length;
  const manualCount = sentEmails.filter((e) => e.manual).length;
  const autoCount = totalSent - manualCount;

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center overflow-hidden rounded-3xl">
      {/* Video Background - NO BLUR OVERLAY FOR FULL CLARITY */}
      <video 
        autoPlay 
        loop 
        muted 
        playsInline 
        className="fixed inset-0 w-full h-full object-cover z-0 pointer-events-none"
        src="/emailagentanimation.mp4"
      />

      {/* Main Scrolling Container */}
      <div className="relative z-10 w-full max-w-5xl flex flex-col h-full mt-6 px-4 pb-20 overflow-y-auto">
        
        {/* Top Header - completely transparent, NO BLUR, white text */}
        <div className="bg-transparent rounded-2xl px-6 pt-6 pb-2 flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/20 shadow-lg backdrop-blur-sm">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">Email Agent</h1>
              <p className="text-gray-300 text-xs font-medium">Research • Match • Draft</p>
            </div>
          </div>
          <div className="flex gap-4 hidden sm:flex">
            {[
              { label: "Total Sent", value: totalSent },
              { label: "Auto", value: autoCount },
              { label: "Manual", value: manualCount },
            ].map((s) => (
              <div key={s.label} className="px-4 py-2 rounded-xl bg-transparent text-white text-center">
                <p className="text-[9px] font-black uppercase tracking-widest opacity-80">{s.label}</p>
                <p className="text-lg font-black">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-transparent p-0 rounded-2xl mb-2">
          {/* PageGuide components uses white text on dark variants, but we will leave it as is if it handles its own styles, though it floats */}
        </div>

        {/* Chatbot Interface Top Box - HAS BLUR and WHITE TEXT */}
        <div className="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl w-full max-w-4xl mx-auto flex flex-col h-[400px] shadow-2xl">
          <PageGuide
            pageKey="email-agent"
            title="How the Email Agent works"
            description="Our AI researches companies, matches them to your services, and drafts personalized outreach emails."
            buttonClassName="absolute top-3 right-3 z-50 group"
            iconClassName="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white shadow-lg transition-transform group-hover:scale-110"
            steps={[
              { icon: <Building2 />, text: 'Enter a company name and URL — the AI will analyze their website and identify opportunities.' },
              { icon: <Bot />, text: 'The agent matches the company\'s needs to your service catalog and crafts a tailored pitch.' },
              { icon: <Mail />, text: 'Review the generated email in English and Spanish, then send it directly or copy the text.' },
              { icon: <TrendingUp />, text: 'Track all sent emails above — see counts for auto-sent vs. manually-sent outreach.' },
            ]}
          />
          <div className="p-4 border-b border-white/10 font-black text-sm text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-white" /> AI Research Assistant
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
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-white text-black" : "bg-blue-500 text-white"}`}>
                      {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`p-4 rounded-2xl ${
                      msg.role === "user" 
                        ? "bg-white/20 text-white rounded-br-none border border-white/10" 
                        : "bg-black/40 border border-white/10 shadow-sm rounded-bl-none text-white"
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

          <div className="p-4 bg-black/20 rounded-b-2xl border-t border-white/10">
            <div className="flex items-center gap-2 bg-black/40 rounded-xl p-1 border border-white/10">
              {chatStep === "company_name" && <Building2 className="w-5 h-5 ml-3 text-gray-400" />}
              {chatStep === "website_url" && <Globe className="w-5 h-5 ml-3 text-gray-400" />}
              
              <input
                type={chatStep === "website_url" ? "url" : "text"}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={chatStep === "company_name" ? "Type company name..." : "Type website URL (optional)..."}
                className="flex-1 bg-transparent border-none focus:ring-0 outline-none px-2 text-sm font-bold text-white placeholder-gray-400 h-10"
              />
              
              <button
                onClick={handleSendInput}
                disabled={(chatStep === "company_name" && !inputValue.trim()) || chatStep === "loading"}
                className="px-5 py-2.5 rounded-lg bg-white text-black font-bold text-sm flex items-center gap-2 hover:bg-gray-200 disabled:opacity-50 transition-all"
              >
                {chatStep === "website_url" ? (
                  <><Sparkles className="w-4 h-4" /> Research</>
                ) : (
                  <><Send className="w-4 h-4" /> Send</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results Section Down Below */}
        {resultsHistory.length > 0 && (
          <div className="w-full mt-8 space-y-8">
            <h3 className="font-black text-xl text-white bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl inline-block shadow-lg border border-white/10">Research Results</h3>
            {resultsHistory.map(res => (
              <ResultCard key={res.id} result={res.resultData} companyName={res.companyName} companyUrl={res.companyUrl} onSendManually={handleSendManually} />
            ))}
          </div>
        )}

        {/* Recent Outreach Section Down Below */}
        <div className="w-full mt-12 bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-xl">
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white/20 text-white shadow-inner">
                <Mail className="w-4 h-4" />
              </div>
              <h3 className="font-black text-[15px] text-white">Recent Email Outreach</h3>
            </div>
            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
              {totalSent} total
            </span>
          </div>

          {emailsLoading ? (
            <div className="flex justify-center p-8"><Clock className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : sentEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-3">
              <Mail className="w-10 h-10 opacity-30 text-gray-500" />
              <p className="font-bold text-sm text-gray-400">No emails sent yet</p>
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
                    className="border border-white/10 rounded-2xl overflow-hidden hover:border-white/30 transition-all bg-white/5"
                  >
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : email.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-white/10 transition-colors text-left"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          email.manual ? "bg-white/10 text-white" : "bg-blue-500 text-white"
                        }`}>
                          {email.manual ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white text-sm truncate">{email.subject || "(No subject)"}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-gray-300 truncate flex items-center gap-1">
                              <Send className="w-3 h-3 shrink-0" /> {email.to_email}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className={`text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full ${
                          email.manual ? "bg-white/10 text-white" : "bg-blue-500 text-white"
                        }`}>
                          {email.manual ? "Manual" : "Auto"}
                        </span>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        className="border-t border-white/10 bg-black/40 p-5"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {email.english_body && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-black text-white uppercase tracking-widest">English Body</p>
                                <CopyButton text={email.english_body} />
                              </div>
                              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-gray-200 whitespace-pre-wrap max-h-64 overflow-auto leading-relaxed font-mono custom-scrollbar">
                                {email.english_body}
                              </div>
                            </div>
                          )}
                          {email.spanish_body && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-black text-white uppercase tracking-widest">Spanish Body</p>
                                <CopyButton text={email.spanish_body} />
                              </div>
                              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-gray-200 whitespace-pre-wrap max-h-64 overflow-auto leading-relaxed font-mono custom-scrollbar">
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
