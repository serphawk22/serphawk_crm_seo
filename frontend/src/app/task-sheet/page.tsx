"use client";
import LocalizedText from "@/components/LocalizedText";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Download,
  Edit3,
  Plus,
  Save,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  PhoneCall,
  Video,
  GraduationCap,
  Briefcase,
  Share2,
  Trash2,
  Search,
  Check,
  UserCheck,
  Layers,
  ArrowRight,
  Link as LinkIcon,
  Sparkles,
  Send,
  Calendar,
  Loader2,
  Target,
  Mic,
  MicOff,
  Volume2,
  Radio
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { useTenantConfig } from "@/context/TenantConfigContext";

interface Entry {
  id: number;
  user_id: number;
  user_name: string;
  user_email?: string;
  user_role?: string;
  work_date: string;
  area: string;
  summary: string;
  status: string;
  time_spent_minutes?: number;
  blocker?: string;
  follow_up_date?: string;
  completion_date?: string;
  proof_of_work?: string;
  expected_date?: string;
  created_at: string;
  updated_at: string;
  outreaches_count?: number;
  positives_count?: number;
  negatives_count?: number;
  followups_scheduled?: number;
  meetings_scheduled?: number;
  key_focus?: string;
  project_id?: number;
  ticket_id?: number;
}

interface UserOption {
  id: number;
  name: string;
  email: string;
  role: string;
}

const todayStr = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const METRICS = ["outreaches_count", "positives_count", "negatives_count", "followups_scheduled", "meetings_scheduled"] as const;
const METRIC_LABELS = ["Outreaches", "Positive responses", "Negative responses", "Follow-ups scheduled", "Meetings scheduled"];
const emptyMetrics = () => ({ outreaches_count: "0", positives_count: "0", negatives_count: "0", followups_scheduled: "0", meetings_scheduled: "0" });

const CATEGORIES = [
  { id: "Lead Follow-up", label: "Lead Calling & Follow-up", icon: PhoneCall, color: "text-blue-500 bg-blue-50 dark:bg-blue-500/10" },
  { id: "Demo Conducted", label: "Demo Scheduled / Conducted", icon: Video, color: "text-purple-500 bg-purple-50 dark:bg-purple-500/10" },
  { id: "Student Admission", label: "Student Admission & Fees", icon: GraduationCap, color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" },
  { id: "Client Outreach", label: "Client Outreach & Pitch", icon: Share2, color: "text-amber-500 bg-amber-50 dark:bg-amber-500/10" },
  { id: "Operations", label: "Operations & Admin", icon: Briefcase, color: "text-sky-500 bg-sky-50 dark:bg-sky-500/10" },
  { id: "Other", label: "Other Daily Activity", icon: Layers, color: "text-slate-500 bg-slate-50 dark:bg-slate-500/10" },
];

export default function TaskSheetPage() {
  const { role, user } = useRole();
  const { isOn } = useTenantConfig();
  const isAdmin = role === "Admin" || role === "SuperAdmin";

  const [entries, setEntries] = useState<Entry[]>([]);
  const [usersList, setUsersList] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const loadVersion = useRef(0);
  const [saving, setSaving] = useState(false);
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [keyFocus, setKeyFocus] = useState("");
  const [teamSummary, setTeamSummary] = useState("");
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Active view tab for Admin: "oversight" (view all) or "entry" (log a task)
  const [activeTab, setActiveTab] = useState<"oversight" | "entry">(isAdmin ? "oversight" : "entry");

  // Filters for Admin view
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterDatePreset, setFilterDatePreset] = useState<"today" | "yesterday" | "all" | "custom">("today");
  const [customDate, setCustomDate] = useState<string>(todayStr());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Form State (Question-Based)
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [formCategory, setFormCategory] = useState("Lead Follow-up");
  const [formSummary, setFormSummary] = useState("");
  const [formIsDone, setFormIsDone] = useState<boolean>(true); // true = Done, false = Not Done
  const [formProofOfWork, setFormProofOfWork] = useState("");
  const [formExpectedDate, setFormExpectedDate] = useState(todayStr());
  const [formBlocker, setFormBlocker] = useState("");
  const [formWorkDate, setFormWorkDate] = useState(todayStr());
  const [formTimeSpent, setFormTimeSpent] = useState<string>("30");
  const [formAssignedUserId, setFormAssignedUserId] = useState<number>(user?.id || 0);

  // AI Task Sheet Generator State
  const [aiGenerating, setAiGenerating] = useState(false);
  const [todayActivityData, setTodayActivityData] = useState<any | null>(null);
  const [taskSheetDate, setTaskSheetDate] = useState<string>(todayStr());
  const [submittedToday, setSubmittedToday] = useState(false);

  // Voice Recording & Mapping State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceMappingBusy, setVoiceMappingBusy] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startVoiceRecording = () => {
    const SpeechRecognition = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SpeechRecognition) {
      alert("Voice speech recognition is not supported in this browser. Please use Chrome or Edge, or type your update directly.");
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event: any) => {
        let current = "";
        for (let i = 0; i < event.results.length; i++) {
          current += event.results[i][0].transcript + " ";
        }
        setVoiceTranscript(current.trim());
      };
      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsRecordingVoice(false);
      };
      recognition.onend = () => {
        setIsRecordingVoice(false);
      };
      recognitionRef.current = recognition;
      recognition.start();
      setIsRecordingVoice(true);
    } catch (e) {
      console.error(e);
      alert("Could not start microphone recording. Please allow microphone permissions in your browser.");
    }
  };

  const stopVoiceRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecordingVoice(false);
  };

  const handleMapVoiceToCRM = async () => {
    if (!voiceTranscript.trim()) {
      alert("Please record or speak your update first.");
      return;
    }
    setVoiceMappingBusy(true);
    try {
      const uId = isAdmin && formAssignedUserId ? formAssignedUserId : user?.id;
      const res = await fetch(`${API_BASE_URL}/task-sheet/voice-map`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          transcript: voiceTranscript,
          work_date: taskSheetDate || todayStr(),
          user_id: uId,
        }),
      });
      if (!res.ok) throw new Error("Failed to map voice to CRM activity");
      const data = await res.json();
      if (data.summary) setFormSummary(data.summary);
      if (data.proof_of_work) setFormProofOfWork(data.proof_of_work);
      if (data.today_activities?.metrics) {
        setTodayActivityData({ metrics: data.today_activities.metrics });
      }
      setMessage({
        type: "success",
        text: "Voice successfully transcribed and mapped to verified CRM activities! You can edit the text below before submitting.",
      });
    } catch (err) {
      console.error(err);
      setMessage({
        type: "error",
        text: "Could not synthesize voice with CRM activities.",
      });
    } finally {
      setVoiceMappingBusy(false);
    }
  };

  const getAuthHeaders = useCallback((extra: Record<string, string> = {}) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  }, []);

  const generateAiTaskSheet = useCallback(async (dateOverride?: string, userIdOverride?: number) => {
    setAiGenerating(true);
    setMessage(null);
    try {
      const d = dateOverride || taskSheetDate || todayStr();
      const uId = userIdOverride || (isAdmin && formAssignedUserId ? formAssignedUserId : user?.id);
      const params = new URLSearchParams({ work_date: d, date: d });
      if (uId) params.append("user_id", String(uId));
      const res = await fetch(`${API_BASE_URL}/task-sheet/today-activity?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to compile activities for today.");
      const data = await res.json();
      setTodayActivityData(data);
      setFormSummary(data.summary || "");
      setFormProofOfWork(data.proof_of_work || "");
      setFormWorkDate(data.work_date || d);
      setFormTimeSpent(String(data.metrics?.time_spent_minutes || 60));
      setSubmittedToday(Boolean(data.is_submitted));
      if (data.metrics) {
        setMetrics({
          outreaches_count: String(data.metrics.calls_count || 0),
          positives_count: String(data.metrics.converted_leads_count || 0),
          negatives_count: "0",
          followups_scheduled: String(data.metrics.followups_count || 0),
          meetings_scheduled: String(data.metrics.meetings_count || 0),
        });
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Could not fetch today's activity", type: "error" });
    } finally {
      setAiGenerating(false);
    }
  }, [taskSheetDate, isAdmin, formAssignedUserId, user?.id]);

  useEffect(() => {
    if (user?.id) {
      generateAiTaskSheet();
    }
  }, [user?.id, generateAiTaskSheet]);

  const handleAiSubmitTasksheet = async () => {
    if (!formSummary.trim()) {
      setMessage({ text: "Please generate or enter work summary first.", type: "error" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const targetUserId = isAdmin && formAssignedUserId ? formAssignedUserId : (user?.id || 0);
      const payload = {
        user_id: targetUserId,
        work_date: formWorkDate || todayStr(),
        area: "AI Daily Task Sheet",
        summary: formSummary.trim(),
        status: "Submitted",
        proof_of_work: formProofOfWork.trim() || "Activities verified from CRM activity log.",
        completion_date: formWorkDate || todayStr(),
        time_spent_minutes: Number(formTimeSpent) || 60,
        outreaches_count: Number(metrics.outreaches_count || 0),
        positives_count: Number(metrics.positives_count || 0),
        negatives_count: Number(metrics.negatives_count || 0),
        followups_scheduled: Number(metrics.followups_scheduled || 0),
        meetings_scheduled: Number(metrics.meetings_scheduled || 0),
      };

      const existingId = todayActivityData?.existing_entry_id;
      const url = existingId ? `${API_BASE_URL}/task-sheet/${existingId}` : `${API_BASE_URL}/task-sheet`;
      const method = existingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to submit task sheet.");
      }

      setMessage({ text: "Tasksheet submitted to Admin successfully! 🚀", type: "success" });
      setSubmittedToday(true);
      loadEntries();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to submit task sheet", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // Load Users for filters & assignment
  useEffect(() => {
    if (!isAdmin) return;
    fetch(`${API_BASE_URL}/users`)
      .then((r) => r.json())
      .then((d) => {
        const uList = (d.users || []).map((u: UserOption) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        }));
        setUsersList(uList);
      })
      .catch(() => { });
  }, [isAdmin]);

  // Update assigned user id default when user logs in
  useEffect(() => {
    if (user?.id && !formAssignedUserId) {
      setFormAssignedUserId(user.id);
    }
  }, [user?.id, formAssignedUserId]);

  // Load Task Sheet Entries
  const loadEntries = useCallback(async () => {
    if (!user?.id) return;
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Date filter
      if (filterDatePreset === "today") {
        params.set("work_date", todayStr());
      } else if (filterDatePreset === "yesterday") {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        params.set("work_date", y.toISOString().slice(0, 10));
      } else if (filterDatePreset === "custom" && customDate) {
        params.set("work_date", customDate);
      }
      // User filter: Non-admins only see their own tasks
      if (!isAdmin && user?.id) {
        params.set("user_id", String(user.id));
      } else if (isAdmin && filterUser !== "all") {
        params.set("user_id", filterUser);
      }

      if (filterStatus !== "all" && filterStatus !== "overdue") {
        params.set("status", filterStatus);
      }

      const res = await fetch(`${API_BASE_URL}/task-sheet?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (version === loadVersion.current) setEntries(data.entries || []);
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Could not load task entries");
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Could not load entries", type: "error" });
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [user?.id, isAdmin, filterDatePreset, customDate, filterUser, filterStatus]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Calculate filtered entries for search / overdue filter
  const displayedEntries = useMemo(() => {
    return entries.filter((e) => {
      // Overdue filter: status != "Done" and expected_date < today
      if (filterStatus === "overdue") {
        if (e.status === "Done" || e.status === "Completed") return false;
        if (!e.expected_date) return false;
        return e.expected_date < todayStr();
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = e.user_name?.toLowerCase().includes(q);
        const matchSummary = e.summary?.toLowerCase().includes(q);
        const matchArea = e.area?.toLowerCase().includes(q);
        const matchProof = e.proof_of_work?.toLowerCase().includes(q);
        return matchName || matchSummary || matchArea || matchProof;
      }
      return true;
    });
  }, [entries, filterStatus, searchQuery]);

  // Overall metrics
  const stats = useMemo(() => {
    const total = entries.length;
    const done = entries.filter((e) => e.status === "Done" || e.status === "Completed").length;
    const notDone = total - done;
    const overdue = entries.filter((e) => {
      if (e.status === "Done" || e.status === "Completed") return false;
      return e.expected_date && e.expected_date < todayStr();
    }).length;
    const doneRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const uniqueRepCount = new Set(entries.map((e) => e.user_id)).size;
    return { total, done, notDone, overdue, doneRate, uniqueRepCount };
  }, [entries]);

  // Reset form to defaults
  const resetForm = () => {
    setMetrics(emptyMetrics());
    setKeyFocus("");
    setEditingEntryId(null);
    setFormCategory("Lead Follow-up");
    setFormSummary("");
    setFormIsDone(true);
    setFormProofOfWork("");
    setFormExpectedDate(todayStr());
    setFormBlocker("");
    setFormWorkDate(todayStr());
    setFormTimeSpent("30");
    setFormAssignedUserId(user?.id || 0);
  };

  // Open Edit
  const openEdit = (e: Entry) => {
    setMetrics(Object.fromEntries(METRICS.map(key => [key, String(e[key] || 0)])) as ReturnType<typeof emptyMetrics>);
    setKeyFocus(e.key_focus || "");
    setEditingEntryId(e.id);
    setFormCategory(e.area || "Lead Follow-up");
    setFormSummary(e.summary || "");
    const isDoneVal = e.status === "Done" || e.status === "Completed";
    setFormIsDone(isDoneVal);
    setFormProofOfWork(e.proof_of_work || "");
    setFormExpectedDate(e.expected_date || e.follow_up_date || todayStr());
    setFormBlocker(e.blocker || "");
    setFormWorkDate(e.work_date || todayStr());
    setFormTimeSpent(e.time_spent_minutes ? String(e.time_spent_minutes) : "30");
    setFormAssignedUserId(e.user_id);
    setActiveTab("entry");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Quick mark as done from table
  const handleQuickMarkDone = async (e: Entry) => {
    const proofPrompt = window.prompt("Enter Proof of Work / Outcome for this task:", e.proof_of_work || "Completed successfully");
    if (proofPrompt === null) return;
    try {
      const payload = {
        ...e,
        user_id: e.user_id,
        work_date: e.work_date,
        area: e.area,
        summary: e.summary,
        status: "Done",
        proof_of_work: proofPrompt.trim(),
        expected_date: null,
        blocker: null,
        completion_date: todayStr(),
        time_spent_minutes: e.time_spent_minutes || 30,
      };
      const res = await fetch(`${API_BASE_URL}/task-sheet/${e.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setMessage({ text: "Task marked as done with recorded proof.", type: "success" });
        loadEntries();
      }
    } catch {
      setMessage({ text: "Failed to update task", type: "error" });
    }
  };

  // Delete entry
  const handleDeleteEntry = async (id: number) => {
    if (!confirm("Are you sure you want to delete this task entry?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/task-sheet/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMessage({ text: "Task entry deleted", type: "success" });
        loadEntries();
      }
    } catch {
      setMessage({ text: "Error deleting entry", type: "error" });
    }
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSummary.trim()) {
      setMessage({ text: "Please describe what work was done.", type: "error" });
      return;
    }

    if (!user?.id || saving) return;
    setSaving(true);
    const targetUserId = isAdmin && formAssignedUserId ? formAssignedUserId : user.id;

    const payload = {
      ...Object.fromEntries(METRICS.map(key => [key, Number(metrics[key] || 0)])),
      key_focus: keyFocus,
      project_id: entries.find(entry => entry.id === editingEntryId)?.project_id || null,
      ticket_id: entries.find(entry => entry.id === editingEntryId)?.ticket_id || null,
      user_id: targetUserId,
      work_date: formWorkDate || todayStr(),
      area: formCategory,
      summary: formSummary.trim(),
      status: formIsDone ? "Done" : "Not Done",
      proof_of_work: formIsDone ? (formProofOfWork.trim() || "Work completed as reported") : null,
      expected_date: !formIsDone ? formExpectedDate : null,
      blocker: !formIsDone ? (formBlocker.trim() || "In progress") : null,
      completion_date: formIsDone ? (formWorkDate || todayStr()) : null,
      follow_up_date: !formIsDone ? formExpectedDate : null,
      time_spent_minutes: formTimeSpent ? Number(formTimeSpent) : null,
    };

    try {
      const url = editingEntryId ? `${API_BASE_URL}/task-sheet/${editingEntryId}` : `${API_BASE_URL}/task-sheet`;
      const method = editingEntryId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setMessage({ text: errData.detail || "Unable to save task entry.", type: "error" });
        return;
      }

      setMessage({
        text: editingEntryId ? "Task-sheet entry updated." : "Task-sheet entry saved.",
        type: "success",
      });
      resetForm();
      loadEntries();
      if (isAdmin) setActiveTab("oversight");
    } catch {
      setMessage({ text: "Connection error. Please try again.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // CSV Export
  const downloadCSV = () => {
    const headers = [
      "ID",
      "Date",
      "Salesperson",
      "Role",
      "Category",
      "Task Summary",
      "Status",
      "Proof of Work",
      "Expected Date",
      "Blocker / Next Steps",
      "Time (Minutes)",
      "Created At",
    ];
    const rows = displayedEntries.map((e) => [
      e.id,
      e.work_date,
      e.user_name,
      e.user_role || "Staff",
      e.area,
      e.summary,
      e.status,
      e.proof_of_work || "None",
      e.expected_date || "N/A",
      e.blocker || "None",
      e.time_spent_minutes || 0,
      e.created_at,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => { const text = String(cell); return `"${(/^[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`; }).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `task_sheet_report_${filterDatePreset}_${todayStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const summarize = async () => {
    setSummaryBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/task-sheet/ai-summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: filterDatePreset === "custom" ? "all" : filterDatePreset, ...(filterDatePreset === "custom" ? { work_date: customDate } : {}), ...(filterUser !== "all" ? { user_id: Number(filterUser) } : {}) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not generate summary");
      setTeamSummary(data.executive_summary);
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not generate summary", type: "error" }); }
    finally { setSummaryBusy(false); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              Operations &amp; Delivery
            </span>
            <span className="text-xs text-slate-400 font-semibold">• Traceable Proof System</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
            Sales &amp; Staff Task Sheet
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Record daily work, sales activity, outcomes and expected completion dates.
          </p>
        </div>

        {/* View Switcher for Admins & Users */}
        <div className="flex items-center gap-2">
          {isAdmin && <button type="button" onClick={summarize} disabled={summaryBusy} className="rounded-xl border border-indigo-200 px-3 py-2 text-xs font-bold text-indigo-600 disabled:opacity-50">{summaryBusy ? "Preparing…" : "AI summary"}</button>}
          <div className="bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("entry")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === "entry"
                  ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900"
                }`}
            >
              <Sparkles size={14} className="text-indigo-500" /> ✨ AI Daily Tasksheet
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("oversight")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === "oversight"
                  ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900"
                }`}
            >
              <UserCheck size={14} /> {isAdmin ? "Team Submissions & Oversight" : "Submission History"}
            </button>
          </div>

          {isAdmin && activeTab === "oversight" && (
            <button
              onClick={downloadCSV}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Download size={14} /> <LocalizedText text={"Export CSV"} />
            </button>
          )}

          {!isAdmin && (
            <button
              onClick={() => setActiveTab("entry")}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              <Sparkles size={14} className="text-amber-300" /> Generate Today's Tasksheet
            </button>
          )}
        </div>
      </div>

      {/* FEEDBACK BANNER */}
      {teamSummary && <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/30"><h2 className="font-bold">AI summary</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{teamSummary}</p></section>}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-semibold transition-all ${message.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
              : "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
            }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {/* EXECUTIVE KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wider">Total Tasks</span>
            <Layers size={16} className="text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</p>
          <p className="text-[11px] text-slate-400 mt-1">{stats.uniqueRepCount} active team members</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-500 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Completed (Done)</span>
            <CheckCircle2 size={16} />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.done}</p>
            <span className="text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
              {stats.doneRate}% rate
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Outcomes recorded by staff</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-500 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">In Progress / Pending</span>
            <Clock size={16} />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{stats.notDone}</p>
          <p className="text-[11px] text-slate-400 mt-1">Expected dates tracked</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-rose-500 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Overdue Follow-ups</span>
            <AlertTriangle size={16} />
          </div>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{stats.overdue}</p>
          <p className="text-[11px] text-slate-400 mt-1">Past expected date</p>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: ADMIN EXECUTIVE OVERSIGHT VIEW                                     */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === "oversight" && (
        <div className="space-y-4">
          {/* FILTER CONTROL BAR */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Salesperson Filter */}
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && <><label className="text-xs font-bold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <UserCheck size={14} className="text-indigo-500" /> Team member:
              </label>
                <select
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">👥 All team members ({usersList.length})</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select></>}

              {/* Date Presets */}
              <div className="flex items-center bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-xl ml-1">
                {(["today", "yesterday", "all", "custom"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setFilterDatePreset(preset)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg capitalize transition-all ${filterDatePreset === preset
                        ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                        : "text-slate-500 hover:text-slate-900 dark:text-zinc-400"
                      }`}
                  >
                    {preset === "all" ? "All Time" : preset}
                  </button>
                ))}
              </div>

              {filterDatePreset === "custom" && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-2.5 py-1 text-xs font-bold outline-none"
                />
              )}
            </div>

            {/* Status & Search */}
            <div className="flex items-center gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-zinc-200 outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="Done">✅ Done (Completed)</option>
                <option value="Not Done">⏳ Not Done / In Progress</option>
                <option value="overdue">🚨 Overdue Only</option>
              </select>

              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-medium w-40 sm:w-52 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* TABLE OF SALES PERSONS TASK SHEETS */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-800/30">
              <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-zinc-300">
                Logged Task Updates ({displayedEntries.length})
              </span>
              <span className="text-[11px] text-slate-400 font-semibold">
                Click any task proof link or mark done directly
              </span>
            </div>

            {loading ? <p role="status" className="p-12 text-center text-sm text-slate-500">Loading entries…</p> : displayedEntries.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Layers size={36} className="mx-auto text-slate-300 dark:text-zinc-700 mb-3" />
                <p className="text-base font-bold text-slate-700 dark:text-zinc-300">No task sheet entries found</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  No sales updates match the selected filters. Change the date or ask sales reps to submit their daily question sheet.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {displayedEntries.map((e) => {
                  const isDone = e.status === "Done" || e.status === "Completed";
                  const isOverdue = !isDone && e.expected_date && e.expected_date < todayStr();
                  const cat = CATEGORIES.find((c) => c.id === e.area) || CATEGORIES[5];
                  const IconComp = cat.icon;

                  return (
                    <div
                      key={e.id}
                      className="p-4 sm:p-5 hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-4"
                    >
                      {/* Left: Rep info & Category */}
                      <div className="space-y-2 md:w-1/4 shrink-0">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                            {(e.user_name || "S").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                              {e.user_name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-semibold">{e.user_role || "Sales Rep"}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 ${cat.color}`}>
                            <IconComp size={11} /> {cat.label}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">📅 {e.work_date}</span>
                        </div>
                      </div>

                      {/* Middle: Work Description & Verification (Proof vs Expected Date) */}
                      <div className="flex-1 space-y-2">
                        <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200 leading-relaxed">
                          {e.summary}
                        </p>

                        {/* Proof of Work Card (If Done) */}
                        {isDone ? (
                          <div className="bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-800/40 rounded-xl p-2.5 flex items-start gap-2 text-xs">
                            <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider text-[10px] block">
                                Recorded proof of work:
                              </span>
                              <p className="text-emerald-900 dark:text-emerald-200 font-medium break-all mt-0.5">
                                {e.proof_of_work || "Completed according to sales record"}
                              </p>
                              {e.proof_of_work && (e.proof_of_work.startsWith("http") || e.proof_of_work.includes("www.")) && (
                                <a
                                  href={e.proof_of_work.startsWith("http") ? e.proof_of_work : `https://${e.proof_of_work}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-emerald-700 hover:underline"
                                >
                                  Open Proof Link <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* Expected Date & Blocker (If Not Done) */
                          <div
                            className={`border rounded-xl p-2.5 flex items-start gap-2 text-xs ${isOverdue
                                ? "bg-rose-50/70 dark:bg-rose-500/10 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
                                : "bg-amber-50/70 dark:bg-amber-500/10 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                              }`}
                          >
                            {isOverdue ? (
                              <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                            ) : (
                              <Clock size={15} className="text-amber-600 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold uppercase tracking-wider text-[10px]">
                                  {isOverdue ? "🚨 Overdue Completion Date:" : "📅 Expected Completion Date:"}
                                </span>
                                <span className="font-black px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[11px]">
                                  {e.expected_date || "No date set"}
                                </span>
                              </div>
                              {e.blocker && (
                                <p className="mt-1 text-[11px] font-medium opacity-90">
                                  <span className="font-bold">Next Action / Blocker:</span> {e.blocker}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: Status badge & Actions */}
                      <div className="flex md:flex-col items-center md:items-end justify-between gap-2 shrink-0">
                        {isDone ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 flex items-center gap-1 shadow-xs">
                            <Check size={12} strokeWidth={3} /> <LocalizedText text={"Done"} /> </span>
                        ) : isOverdue ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300 flex items-center gap-1 shadow-xs">
                            <AlertTriangle size={12} /> <LocalizedText text={"Overdue"} /> </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 flex items-center gap-1 shadow-xs">
                            <Clock size={12} /> <LocalizedText text={"In Progress"} /> </span>
                        )}

                        {e.time_spent_minutes && (
                          <span className="text-[11px] text-slate-400 font-semibold">
                            ⏱️ {e.time_spent_minutes} min
                          </span>
                        )}

                        <div className="flex items-center gap-1 mt-1">
                          {!isDone && (
                            <button
                              onClick={() => handleQuickMarkDone(e)}
                              title="Mark as Done with Proof"
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all"
                            >
                              <Check size={11} /> Verify Done
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(e)}
                            title="Edit task"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          >
                            <Edit3 size={14} />
                          </button>
                          {isAdmin && <button
                            onClick={() => handleDeleteEntry(e.id)}
                            title="Delete task"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: AI-POWERED DAILY TASK SHEET (SALES & STAFF INSTANCE)               */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === "entry" && (
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Hero Generator Card */}
          <div className="relative overflow-hidden rounded-3xl border border-indigo-200/90 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/50 dark:from-zinc-900 dark:via-zinc-900 dark:to-indigo-950/30 p-6 sm:p-8 shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-indigo-100 dark:border-zinc-800">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Instant Activity Synthesis
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  Today's AI Task Sheet
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 max-w-xl">
                  Automatically extracts every action performed today across your CRM instance: calls logged, meetings & demos, prospect follow-ups, new leads added, student admissions converted, and notes.
                </p>
              </div>

              {/* Date & Trigger Button */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 shadow-2xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={taskSheetDate}
                    onChange={(e) => {
                      const d = e.target.value;
                      setTaskSheetDate(d);
                      generateAiTaskSheet(d);
                    }}
                    className="bg-transparent text-xs font-bold text-slate-800 dark:text-zinc-200 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => generateAiTaskSheet()}
                  disabled={aiGenerating}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 hover:opacity-95 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md disabled:opacity-50 transition-all cursor-pointer"
                >
                  {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                  {aiGenerating ? "Compiling..." : "Generate Tasksheet for Today"}
                </button>
              </div>
            </div>

            {/* Admin Logging selector */}
            {isAdmin && (
              <div className="mt-4 pt-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="font-bold text-slate-500 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                  Inspecting Team Member:
                </span>
                <select
                  value={formAssignedUserId}
                  onChange={(e) => {
                    const uid = Number(e.target.value);
                    setFormAssignedUserId(uid);
                    generateAiTaskSheet(taskSheetDate, uid);
                  }}
                  className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 font-bold text-slate-800 dark:text-zinc-200 shadow-2xs outline-none cursor-pointer"
                >
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Live Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
              <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur-xs rounded-2xl border border-slate-200/80 dark:border-white/5 p-3.5 shadow-xs">
                <div className="flex items-center justify-between text-blue-500 mb-1">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Calls Logged</span>
                  <PhoneCall size={16} />
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  {todayActivityData?.metrics?.calls_count || 0}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Phone & AI calls</p>
              </div>

              <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur-xs rounded-2xl border border-slate-200/80 dark:border-white/5 p-3.5 shadow-xs">
                <div className="flex items-center justify-between text-purple-500 mb-1">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Meetings & Demos</span>
                  <Video size={16} />
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  {todayActivityData?.metrics?.meetings_count || 0}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Sessions conducted</p>
              </div>

              <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur-xs rounded-2xl border border-slate-200/80 dark:border-white/5 p-3.5 shadow-xs">
                <div className="flex items-center justify-between text-indigo-500 mb-1">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">New Leads</span>
                  <Target size={16} />
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  {todayActivityData?.metrics?.new_leads_count || 0}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Pipeline additions</p>
              </div>

              <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur-xs rounded-2xl border border-slate-200/80 dark:border-white/5 p-3.5 shadow-xs">
                <div className="flex items-center justify-between text-emerald-500 mb-1">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Conversions</span>
                  <GraduationCap size={16} />
                </div>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {todayActivityData?.metrics?.converted_leads_count || 0}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Students / Won clients</p>
              </div>

              <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur-xs rounded-2xl border border-slate-200/80 dark:border-white/5 p-3.5 shadow-xs col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-amber-500 mb-1">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Follow-ups</span>
                  <Clock size={16} />
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  {todayActivityData?.metrics?.followups_count || 0}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Walkins, notes & tasks</p>
              </div>
            </div>
          </div>

          {/* Submission Status Notice */}
          {submittedToday && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 p-4 flex items-center justify-between gap-3 text-emerald-800 dark:text-emerald-300 shadow-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold">Tasksheet Submitted for {formWorkDate}</h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Your daily tasksheet has been submitted and recorded for Admin inspection. You can update and re-submit if new activities occur.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-2xs whitespace-nowrap">
                Verified Submitted
              </span>
            </div>
          )}

          {/* Voice Activity Dictation & CRM Activity Matcher Card */}
          <div className="bg-white dark:bg-zinc-900 border border-violet-200/80 dark:border-violet-900/50 rounded-3xl p-5 sm:p-7 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${isRecordingVoice ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-violet-100 text-violet-600 dark:bg-violet-950/60'}`}>
                  {isRecordingVoice ? <Radio className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    Voice Dictation & CRM Activity Mapping
                    {isRecordingVoice && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500 text-white animate-pulse">
                        Listening...
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Speak what you did today. We transcribe your speech and automatically cross-verify it against your actual CRM calls, demos, follow-ups, and student admissions.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isRecordingVoice ? (
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-md shadow-violet-500/20 transition cursor-pointer active:scale-95"
                  >
                    <Mic className="w-4 h-4" /> Speak Work Done
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-500/25 transition cursor-pointer animate-pulse"
                  >
                    <MicOff className="w-4 h-4" /> Stop Recording
                  </button>
                )}
              </div>
            </div>

            {/* Live Dictation Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-violet-500" />
                  Your Voice Dictation / Live Transcript:
                </label>
                {voiceTranscript && (
                  <button
                    type="button"
                    onClick={() => setVoiceTranscript("")}
                    className="text-[11px] text-slate-400 hover:text-red-500 transition"
                  >
                    Clear
                  </button>
                )}
              </div>
              <textarea
                rows={3}
                value={voiceTranscript}
                onChange={(e) => setVoiceTranscript(e.target.value)}
                placeholder="Click 'Speak Work Done' above and speak freely: e.g. 'Today I called 5 leads, closed 1 student admission for Fullstack with 5000 advance, and scheduled 2 demos for tomorrow'..."
                className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl p-3.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500 leading-relaxed font-sans"
              />
            </div>

            {/* Synthesize Button */}
            {voiceTranscript.trim() && (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleMapVoiceToCRM}
                  disabled={voiceMappingBusy}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 hover:opacity-95 shadow-md shadow-indigo-500/25 transition cursor-pointer disabled:opacity-50"
                >
                  {voiceMappingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                  {voiceMappingBusy ? "Mapping with CRM..." : "Map Voice with CRM Activities & Synthesize Report"}
                </button>
              </div>
            )}
          </div>

          {/* Review & Edit Sheet Content */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Work Summary & Major Accomplishments
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  AI-compiled overview of today's activities. You may edit or add personal remarks before submitting.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Clock className="w-3.5 h-3.5" />
                <span>Working time:</span>
                <input
                  type="number"
                  value={formTimeSpent}
                  onChange={(e) => setFormTimeSpent(e.target.value)}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-center font-bold text-slate-800 dark:text-zinc-200"
                />
                <span>mins</span>
              </div>
            </div>

            {/* Summary Text Area */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                Summary Narrative:
              </label>
              <textarea
                rows={5}
                value={formSummary}
                onChange={(e) => setFormSummary(e.target.value)}
                placeholder="Click 'Generate Tasksheet for Today' above to auto-populate your activities..."
                className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-sans leading-relaxed"
              />
            </div>

            {/* Proof of Work Area */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-indigo-500" />
                  Verifiable Proof of Work & Concrete Action Items:
                </label>
                <span className="text-[11px] text-slate-400">Directly visible to Admin</span>
              </div>
              <textarea
                rows={5}
                value={formProofOfWork}
                onChange={(e) => setFormProofOfWork(e.target.value)}
                placeholder="Specific calls, meeting summaries, student admissions slips, receipts, and client links..."
                className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs leading-relaxed"
              />
            </div>

            {/* Big Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleAiSubmitTasksheet}
                disabled={saving || !formSummary.trim()}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 hover:opacity-95 text-white rounded-2xl font-black text-sm sm:text-base shadow-lg hover:shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {saving ? "Submitting..." : submittedToday ? "Re-Submit Updated Tasksheet to Admin" : "Submit Tasksheet to Admin"}
              </button>
            </div>
          </div>

          {/* User's Recently Logged Tasks */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xs space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
              Your Recent Tasksheet Submissions
            </h3>
            {entries.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No tasksheet submissions found yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {entries.slice(0, 5).map((e) => (
                  <div key={e.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-zinc-200 line-clamp-1">{e.summary}</p>
                        {e.proof_of_work && <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1 mt-0.5 font-mono">{e.proof_of_work}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {e.status}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">{e.work_date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
