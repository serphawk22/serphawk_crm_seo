"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  MessageSquare,
  Send,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Download,
  Search,
  Plus,
  Users,
  User,
  Hash,
  Check,
  CheckCheck,
  Clock,
  X,
  Loader2,
  Sparkles,
  Phone,
  Mail,
  Shield,
  Circle,
  Globe2
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import LocalizedText from "@/components/LocalizedText";
import { formatInZone, gmtLabel } from "@/lib/timezone";

function formatRole(r?: string): string {
  if (!r) return "";
  const s = r.trim();
  if (s.toLowerCase() === "salesmanager" || s.toLowerCase() === "sales") return "Salesperson";
  return s;
}

interface TeamUser {
  id: number;
  name: string;
  email: string;
  role: string;
  status?: string;
  avatar_color?: string;
}

interface ChatConversation {
  id?: string;
  type: "channel" | "direct";
  channel_name?: string;
  user_id?: number;
  user?: TeamUser;
  name?: string;
  email?: string;
  role?: string;
  last_message?: any;
  last_message_at?: string;
  unread_count?: number;
}

interface ChatMessage {
  id: number;
  sender_id: number;
  sender_name: string;
  sender_role?: string;
  sender_email?: string;
  recipient_id?: number | null;
  channel_name?: string | null;
  content: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  created_at: string;
  read_at?: string | null;
}

export default function TeamMessagesPage() {
  const { user: currentUser, role } = useRole();
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeChat, setActiveChat] = useState<{
    type: "channel" | "direct";
    channel_name?: string;
    other_user?: TeamUser;
  }>({ type: "channel", channel_name: "general" });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  // Timezone state (persisted in localStorage and synchronized)
  const [messagesTz, setMessagesTz] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("crm_messages_timezone") || "Asia/Kolkata";
    }
    return "Asia/Kolkata";
  });
  const [showTzDropdown, setShowTzDropdown] = useState(false);

  const handleTimezoneSelect = (tz: string) => {
    setMessagesTz(tz);
    if (typeof window !== "undefined") {
      localStorage.setItem("crm_messages_timezone", tz);
    }
    setShowTzDropdown(false);
  };

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Active chat key reference to guard against out-of-order race conditions
  const activeChatKey =
    activeChat.type === "channel"
      ? `chan_${activeChat.channel_name || "general"}`
      : `dm_${activeChat.other_user?.id || 0}`;
  const activeChatKeyRef = useRef(activeChatKey);
  activeChatKeyRef.current = activeChatKey;

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch Team Directory Colleagues
  const fetchTeamUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/team-chat/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setTeamUsers(data.users || []);
      }
    } catch (err) {
      console.error("Failed to load team members:", err);
    }
  };

  // Fetch Conversations list
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/team-chat/conversations`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.direct_chats || data.conversations || [];
        setConversations(list);
        if (typeof data.total_unread === "number") {
          window.dispatchEvent(new CustomEvent("chat-unread-changed", { detail: { unread: data.total_unread } }));
        }
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  };

  // Fetch Messages for active chat
  const fetchActiveMessages = async (silent = false) => {
    const targetKey = activeChatKey;
    if (!silent) setLoadingMessages(true);
    try {
      let url = `${API_BASE_URL}/team-chat/messages?`;
      if (activeChat.type === "channel") {
        url += `channel_name=${encodeURIComponent(activeChat.channel_name || "general")}`;
      } else if (activeChat.other_user?.id) {
        url += `other_user_id=${activeChat.other_user.id}&recipient_id=${activeChat.other_user.id}`;
      }
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        // Guard against race conditions: only update if active chat hasn't changed while request was in-flight
        if (activeChatKeyRef.current === targetKey) {
          setMessages(data.messages || []);
          if (!silent) scrollToBottom();
        }
        // If we fetched direct chat messages, unread messages are marked read, refresh conversations list
        if (activeChat.type === "direct" && activeChat.other_user?.id) {
          fetchConversations();
        }
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      if (!silent && activeChatKeyRef.current === targetKey) {
        setLoadingMessages(false);
      }
    }
  };

  // Initial load
  useEffect(() => {
    fetchTeamUsers();
    fetchConversations();
  }, []);

  // When active chat changes, clear existing messages immediately and fetch active chat messages
  useEffect(() => {
    setMessages([]);
    fetchActiveMessages(false);
  }, [activeChat.type, activeChat.channel_name, activeChat.other_user?.id]);

  // Periodic polling every 3 seconds for live chat
  useEffect(() => {
    const timer = setInterval(() => {
      fetchActiveMessages(true);
      fetchConversations();
    }, 3000);
    return () => clearInterval(timer);
  }, [activeChat.type, activeChat.channel_name, activeChat.other_user?.id]);

  // Messages strictly belonging to the currently active conversation
  const currentMessages = useMemo(() => {
    if (activeChat.type === "channel") {
      const chan = (activeChat.channel_name || "general").toLowerCase();
      return messages.filter(
        (m) =>
          !m.recipient_id &&
          (!m.channel_name ||
            m.channel_name.toLowerCase() === chan ||
            (chan === "general" && m.channel_name === "team-general"))
      );
    }
    if (activeChat.type === "direct" && activeChat.other_user?.id) {
      const otherId = activeChat.other_user.id;
      const myId = currentUser?.id;
      return messages.filter(
        (m) =>
          (m.sender_id === myId && m.recipient_id === otherId) ||
          (m.sender_id === otherId && m.recipient_id === myId)
      );
    }
    return [];
  }, [messages, activeChat, currentUser?.id]);

  // Scroll on message list change
  useEffect(() => {
    scrollToBottom();
  }, [currentMessages.length]);

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    setSending(true);
    let attachmentUrl = null;
    let attachmentName = null;
    let attachmentType = null;

    try {
      // 1. If file attached, upload first
      if (selectedFile) {
        setFileUploading(true);
        const formData = new FormData();
        formData.append("file", selectedFile);
        const upRes = await fetch(`${API_BASE_URL}/team-chat/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        if (upRes.ok) {
          const upData = await upRes.json();
          attachmentUrl = upData.url;
          attachmentName = upData.filename;
          attachmentType = upData.type;
        }
        setFileUploading(false);
      }

      // 2. Post message
      const payload: any = {
        content: inputText.trim() || (selectedFile ? `Shared file: ${selectedFile.name}` : ""),
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        attachment_type: attachmentType,
      };

      if (activeChat.type === "channel") {
        payload.channel_name = activeChat.channel_name || "general";
      } else {
        payload.recipient_id = activeChat.other_user?.id;
      }

      const res = await fetch(`${API_BASE_URL}/team-chat/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setInputText("");
        setSelectedFile(null);
        await fetchActiveMessages(true);
        fetchConversations();
      }
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setSending(false);
      setFileUploading(false);
    }
  };

  // Filtered colleagues for new chat modal & search
  const filteredTeamUsers = useMemo(() => {
    return teamUsers.filter((u) => {
      if (u.id === currentUser?.id) return false;
      const q = searchQuery.toLowerCase();
      return (
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [teamUsers, currentUser, searchQuery]);

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col md:flex-row rounded-3xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#0d0d11] shadow-xl overflow-hidden">
      {/* ── LEFT SIDEBAR: CHANNELS & DIRECT CHATS ── */}
      <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-slate-200/80 dark:border-white/10 flex flex-col bg-slate-50/60 dark:bg-[#121217]/90 shrink-0">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-xs">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Team Chat</h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Directory Teammates Only</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowNewChatModal(true)}
            title="Start new conversation with teammate"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3.5 py-2.5 border-b border-slate-200/60 dark:border-white/5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search chats or colleagues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-white/10 text-slate-800 dark:text-zinc-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Chats List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
          {/* Channels */}
          <div>
            <span className="px-2 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-1">
              Channels
            </span>
            <button
              type="button"
              onClick={() => setActiveChat({ type: "channel", channel_name: "general" })}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition ${activeChat.type === "channel" && activeChat.channel_name === "general"
                ? "bg-indigo-600 text-white font-bold shadow-xs"
                : "text-slate-700 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-white/5"
                }`}
            >
              <Hash className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="truncate block"># Team General</span>
                <span
                  className={`text-[10px] truncate block ${activeChat.type === "channel" ? "text-indigo-100" : "text-slate-400 dark:text-zinc-500"
                    }`}
                >
                  Company-wide discussions
                </span>
              </div>
            </button>
          </div>

          {/* Direct Messages */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                Direct Messages ({teamUsers.filter((u) => u.id !== currentUser?.id).length})
              </span>
            </div>

            <div className="space-y-0.5">
              {teamUsers
                .filter((u) => u.id !== currentUser?.id)
                .map((member) => {
                  const isSelected = activeChat.type === "direct" && activeChat.other_user?.id === member.id;
                  const conv = conversations.find(
                    (c) => c.type === "direct" && (c.user?.id === member.id || c.user_id === member.id || c.id === `dm_${member.id}`)
                  );
                  const unread = conv?.unread_count || 0;

                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setActiveChat({ type: "direct", other_user: member })}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition ${isSelected
                        ? "bg-indigo-600 text-white font-bold shadow-xs"
                        : "text-slate-700 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-white/5"
                        }`}
                    >
                      <div className="relative shrink-0">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-xs"
                          style={{
                            backgroundColor: member.avatar_color || "#6366f1",
                          }}
                        >
                          {member.name[0]?.toUpperCase() || "U"}
                        </div>
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold truncate">{member.name}</span>
                            {unread > 0 && (
                              <span
                                className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-200 dark:ring-blue-900 animate-pulse shrink-0"
                                title={`${unread} unread`}
                              />
                            )}
                          </div>
                          {unread > 0 && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] truncate ${isSelected ? "text-indigo-200" : "text-slate-400 dark:text-zinc-500"
                              }`}
                          >
                            {formatRole(member.role) || "Team Member"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT MAIN CHAT AREA ── */}
      <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#0c0c10] overflow-hidden">
        {/* Active Chat Header */}
        <div className="h-16 px-4 md:px-6 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between shrink-0 bg-white/90 dark:bg-[#0c0c10]/90 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            {activeChat.type === "channel" ? (
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                <Hash className="w-5 h-5" />
              </div>
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0 shadow-xs"
                style={{
                  backgroundColor: activeChat.other_user?.avatar_color || "#6366f1",
                }}
              >
                {activeChat.other_user?.name[0]?.toUpperCase() || "U"}
              </div>
            )}

            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                {activeChat.type === "channel"
                  ? `# ${activeChat.channel_name || "general"}`
                  : activeChat.other_user?.name}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate flex items-center gap-2">
                {activeChat.type === "channel" ? (
                  <span>All team directory members have access</span>
                ) : (
                  <>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {formatRole(activeChat.other_user?.role)}
                    </span>
                    <span>·</span>
                    <span>{activeChat.other_user?.email}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Timezone Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTzDropdown(!showTzDropdown)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 border border-slate-200/80 dark:border-white/10 transition-colors shadow-xs cursor-pointer"
                title="Select timezone for messages"
              >
                <Globe2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>{messagesTz.split("/").pop()?.replace(/_/g, " ")} ({gmtLabel(messagesTz)})</span>
              </button>
              {showTzDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-xl z-50 p-2 text-xs">
                  <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-slate-100 dark:border-zinc-800 px-1 font-bold text-slate-800 dark:text-white">
                    <span className="flex items-center gap-1.5">
                      <Globe2 className="w-3.5 h-3.5 text-indigo-500" /> Messages Timezone
                    </span>
                    <button onClick={() => setShowTzDropdown(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-0.5">
                    {[
                      { value: "Asia/Kolkata", label: "India Standard Time (IST)" },
                      { value: "UTC", label: "UTC (Universal Time)" },
                      { value: "America/New_York", label: "US Eastern (EST/EDT)" },
                      { value: "America/Chicago", label: "US Central (CST/CDT)" },
                      { value: "America/Denver", label: "US Mountain (MST/MDT)" },
                      { value: "America/Los_Angeles", label: "US Pacific (PST/PDT)" },
                      { value: "Europe/London", label: "London / UK (GMT/BST)" },
                      { value: "Europe/Berlin", label: "Central Europe (CET)" },
                      { value: "Asia/Dubai", label: "Dubai / Gulf (GST)" },
                      { value: "Asia/Singapore", label: "Singapore (SGT)" },
                      { value: "Asia/Tokyo", label: "Tokyo (JST)" },
                      { value: "Australia/Sydney", label: "Sydney (AEST)" },
                    ].map(tz => (
                      <button
                        key={tz.value}
                        type="button"
                        onClick={() => handleTimezoneSelect(tz.value)}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer ${
                          messagesTz === tz.value
                            ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold"
                            : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
                        }`}
                      >
                        <span>{tz.label}</span>
                        {messagesTz === tz.value && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
              <Circle className="w-2 h-2 fill-current" /> Live CRM Chat
            </span>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {loadingMessages ? (
            <div className="h-full flex items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              <span className="text-xs font-semibold">Loading conversation...</span>
            </div>
          ) : currentMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-sm mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center mb-3">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                Start this conversation
              </h4>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                Send messages, updates, client lead briefs, and files directly to your teammate.
              </p>
            </div>
          ) : (
            currentMessages.map((m) => {
              const isMe = m.sender_id === currentUser?.id;

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[85%] sm:max-w-[70%] ${isMe ? "ml-auto" : "mr-auto"
                    }`}
                >
                  {!isMe && (
                    <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 mb-1 ml-1">
                      {m.sender_name} {m.sender_role ? `(${formatRole(m.sender_role)})` : ""}
                    </span>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs ${isMe
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-xs"
                      : "bg-slate-100 dark:bg-[#18181f] text-slate-900 dark:text-zinc-100 border border-slate-200/80 dark:border-white/5 rounded-tl-xs"
                      }`}
                  >
                    {/* Attachment Preview */}
                    {m.attachment_url && (
                      <div className="mb-2">
                        {m.attachment_type === "image" ? (
                          <a
                            href={m.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-xl overflow-hidden border border-black/10 dark:border-white/10 hover:opacity-95 transition"
                          >
                            <img
                              src={m.attachment_url}
                              alt={m.attachment_name || "Attachment"}
                              className="max-h-60 max-w-full object-cover rounded-xl"
                            />
                          </a>
                        ) : (
                          <a
                            href={m.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            download={m.attachment_name || "file"}
                            className={`flex items-center gap-2 p-2 rounded-xl text-xs font-semibold border ${isMe
                              ? "bg-white/10 border-white/20 text-white hover:bg-white/20"
                              : "bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 hover:border-indigo-500"
                              } transition`}
                          >
                            <FileText className="w-4 h-4 shrink-0 text-indigo-400" />
                            <span className="truncate max-w-[180px]">{m.attachment_name || "Download file"}</span>
                            <Download className="w-3.5 h-3.5 shrink-0 ml-auto" />
                          </a>
                        )}
                      </div>
                    )}

                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>

                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 dark:text-zinc-500 px-1">
                    <span>
                      {formatInZone(m.created_at, messagesTz, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {isMe && <CheckCheck className="w-3 h-3 text-indigo-400" />}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input & Upload Bar */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 md:p-4 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-[#111116] shrink-0 space-y-2"
        >
          {/* File Selected Badge */}
          {selectedFile && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/40 text-xs text-indigo-700 dark:text-indigo-300">
              <div className="flex items-center gap-2 truncate">
                <Paperclip className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate font-semibold">{selectedFile.name}</span>
                <span className="text-[10px] opacity-75">
                  ({(selectedFile.size / 1024).toFixed(0)} KB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setSelectedFile(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach File or Image"
              className="p-2.5 rounded-xl border border-slate-200/80 dark:border-white/10 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/5 transition shrink-0"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              type="text"
              placeholder={`Message ${activeChat.type === "channel" ? "#Team General" : activeChat.other_user?.name || "teammate"
                }...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-white/10 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition"
            />

            <button
              type="submit"
              disabled={sending || (!inputText.trim() && !selectedFile)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-indigo-500/20 disabled:opacity-40 transition active:scale-95 shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </form>
      </div>

      {/* ── NEW CHAT MODAL (Restricted to Team Directory Only) ── */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121217] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Start Chat with Teammate
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Only employees and colleagues enrolled in your Team Directory are available for internal messaging.
            </p>

            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {filteredTeamUsers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setActiveChat({ type: "direct", other_user: m });
                    setShowNewChatModal(false);
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-200/80 dark:border-white/5 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs"
                      style={{ backgroundColor: m.avatar_color || "#6366f1" }}
                    >
                      {m.name[0]?.toUpperCase() || "U"}
                    </div>
                    <div>
                      <p className="font-extrabold text-xs text-slate-900 dark:text-white">{m.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">{m.email}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                    {formatRole(m.role)}
                  </span>
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
