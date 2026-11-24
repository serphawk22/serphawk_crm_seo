"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  FileText,
  CheckCircle2,
  Clock,
  Send,
  MessageSquare,
  DollarSign,
  Download,
  Share2,
  Check,
  ArrowLeft,
  Building,
  User,
  Shield,
  FileSignature,
  Loader2,
  Sparkles
} from "lucide-react";
import { API_BASE_URL } from "@/config";

interface LineItem {
  id?: number;
  name: string;
  category?: string;
  unit_price: number;
  quantity: number;
  total?: number;
}

interface ProposalData {
  id: number;
  title: string;
  status: string;
  total_value: number;
  currency: string;
  line_items: LineItem[];
  notes?: string;
  client_name?: string;
  created_at?: string;
  signed_at?: string;
}

interface DiscussionMessage {
  id: string;
  sender: string;
  message: string;
  timestamp: string;
}

export default function ProposalViewAndDiscussionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const token = searchParams.get("token") || "";

  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Discussion state
  const [messages, setMessages] = useState<DiscussionMessage[]>([
    {
      id: "1",
      sender: "SerpHawk Sales Team",
      message: "Hello! Welcome to your custom proposal discussion room. Let us know if you'd like to adjust package quantities or discuss terms.",
      timestamp: new Date().toISOString()
    }
  ]);
  const [newMessage, setNewMessage] = useState<string>("");
  const [senderName, setSenderName] = useState<string>("");
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);

  // Signing state
  const [signing, setSigning] = useState<boolean>(false);
  const [isSigned, setIsSigned] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        try {
          const u = JSON.parse(storedUser);
          setSenderName(u.name || "Team Member");
        } catch (e) {}
      } else {
        setSenderName("Client / Buyer");
      }
    }
  }, []);

  const fetchProposal = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const url = `${API_BASE_URL}/shop/proposals/${id}${token ? `?token=${token}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        // Fallback to internal CRM proposal endpoint
        const fallbackRes = await fetch(`${API_BASE_URL}/proposals/${id}`);
        if (!fallbackRes.ok) throw new Error("Proposal not found.");
        const fbData = await fallbackRes.json();
        setProposal(fbData);
        setIsSigned(fbData.status === "Approved" || Boolean(fbData.signed_at));
        return;
      }
      const data = await res.json();
      setProposal(data.proposal);
      setIsSigned(data.proposal.status === "Approved" || Boolean(data.proposal.signed_at));
    } catch (err: any) {
      setError(err.message || "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposal();
  }, [id, token]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !id) return;

    setSendingMessage(true);
    try {
      const res = await fetch(`${API_BASE_URL}/shop/proposals/${id}/discussion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: senderName || "Buyer",
          message: newMessage.trim()
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message_entry]);
        setNewMessage("");
      }
    } catch (e) {
      console.error("Failed to send message", e);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSignProposal = async () => {
    if (!window.confirm("Do you accept and sign this proposal?")) return;
    setSigning(true);
    try {
      const res = await fetch(`${API_BASE_URL}/proposals/${id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signed_by_name: senderName || "Client",
          signature_data: "Digitally signed on online storefront"
        })
      });
      if (res.ok) {
        setIsSigned(true);
        if (proposal) setProposal({ ...proposal, status: "Approved" });
        alert("Proposal signed and approved! Our team has been notified.");
      } else {
        alert("Failed to sign proposal.");
      }
    } catch (e) {
      alert("Error approving proposal.");
    } finally {
      setSigning(false);
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex items-center justify-center p-4">
        <div className="max-w-md text-center bg-white dark:bg-zinc-900 p-8 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
          <h2 className="text-xl font-bold">Proposal Not Available</h2>
          <p className="text-xs text-slate-500">{error || "Proposal not found or access expired."}</p>
          <Link href="/shop" className="inline-block px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs">
            Back to Store
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 flex flex-col font-sans">
      {/* Top bar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#0c0c10]/90 backdrop-blur-md px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/shop"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-indigo-600 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Store</span>
          </Link>
          <div className="h-4 w-px bg-slate-200 dark:bg-zinc-800" />
          <h1 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate max-w-[280px]">
            {proposal.title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? "Link Copied" : "Share"}</span>
          </button>

          {!isSigned ? (
            <button
              type="button"
              disabled={signing}
              onClick={handleSignProposal}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
            >
              <FileSignature className="w-3.5 h-3.5" />
              <span>Sign &amp; Accept</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approved &amp; Signed</span>
            </span>
          )}
        </div>
      </header>

      {/* Main Content: Split view (Proposal document on left, Discussion on right) */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Proposal Details (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-[#111115] rounded-3xl border border-slate-200/80 dark:border-zinc-800 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-5">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Proposal #{proposal.id}
                </span>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {proposal.title}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Prepared for: <strong className="text-slate-800 dark:text-zinc-200">{proposal.client_name || "Valued Client"}</strong>
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs font-medium text-slate-500">Total Investment</span>
                <div className="text-3xl font-black text-slate-900 dark:text-white">
                  ${(proposal.total_value || 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Line items table */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Included Services &amp; Packages
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-zinc-800/60 text-slate-600 dark:text-zinc-300 font-bold border-b border-slate-200 dark:border-zinc-800">
                    <tr>
                      <th className="p-3">Package / Service</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">Unit Price</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {(proposal.line_items || []).map((item, idx) => {
                      const lineTotal = (item.unit_price || 0) * (item.quantity || 1);
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/30">
                          <td className="p-3">
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {item.name}
                            </span>
                            {item.category && (
                              <span className="text-[10px] text-slate-400">{item.category}</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-semibold">{item.quantity}</td>
                          <td className="p-3 text-right text-slate-600 dark:text-zinc-300">
                            ${(item.unit_price || 0).toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                            ${lineTotal.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {proposal.notes && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400 space-y-1">
                <span className="font-bold block text-slate-800 dark:text-zinc-200">Notes &amp; Scope:</span>
                <p className="whitespace-pre-wrap">{proposal.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Negotiation & Discussion Thread (5 cols) */}
        <div className="lg:col-span-5 flex flex-col h-[600px] bg-white dark:bg-[#111115] rounded-3xl border border-slate-200/80 dark:border-zinc-800 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Proposal Discussion &amp; Negotiation
              </h3>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>

          {/* Messages stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            {messages.map((m) => {
              const isClientMsg = m.sender.toLowerCase().includes("client") || m.sender.toLowerCase().includes("buyer");
              return (
                <div
                  key={m.id}
                  className={`p-3 rounded-2xl text-xs space-y-1 ${
                    isClientMsg
                      ? "bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 ml-4"
                      : "bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 mr-4"
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-slate-700 dark:text-zinc-300">
                    <span>{m.sender}</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-slate-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                    {m.message}
                  </p>
                </div>
              );
            })}
          </div>

          {/* New message input */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 flex gap-2">
            <input
              type="text"
              required
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Ask a question or propose terms..."
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={sendingMessage || !newMessage.trim()}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

