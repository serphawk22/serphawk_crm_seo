"use client";
import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";
import {
  Layers, Plus, Trash2, Edit3, Check, X, ChevronDown, ChevronUp,
  Star, Palette, AlertCircle, ArrowUp, ArrowDown, Loader2, Workflow,
  CheckCircle2, Sparkles, Building2
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export interface LeadStage {
  id: string;
  name: string;
  color: string;
  order: number;
  is_won?: boolean;
  is_lost?: boolean;
}

export interface LeadSpace {
  id: number;
  tenant_id?: number | null;
  name: string;
  description?: string | null;
  is_default: boolean;
  sort_order: number;
  stages: LeadStage[];
  leads_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
}

const PRESET_COLORS = [
  { name: "Blue", hex: "#3B82F6" },
  { name: "Sky", hex: "#0EA5E9" },
  { name: "Teal", hex: "#14B8A6" },
  { name: "Emerald", hex: "#10B981" },
  { name: "Amber", hex: "#F59E0B" },
  { name: "Orange", hex: "#F97316" },
  { name: "Indigo", hex: "#6366F1" },
  { name: "Purple", hex: "#8B5CF6" },
  { name: "Rose", hex: "#F43F5E" },
  { name: "Red", hex: "#EF4444" },
  { name: "Slate", hex: "#64748B" },
];

const DEFAULT_NEW_STAGES: LeadStage[] = [
  { id: "new", name: "New", color: "#3B82F6", order: 0, is_won: false, is_lost: false },
  { id: "contacted", name: "Contacted", color: "#0EA5E9", order: 1, is_won: false, is_lost: false },
  { id: "qualified", name: "Qualified", color: "#F59E0B", order: 2, is_won: false, is_lost: false },
  { id: "proposal", name: "Proposal Sent", color: "#F97316", order: 3, is_won: false, is_lost: false },
  { id: "negotiation", name: "Negotiation", color: "#6366F1", order: 4, is_won: false, is_lost: false },
  { id: "won", name: "Won", color: "#10B981", order: 5, is_won: true, is_lost: false },
  { id: "lost", name: "Lost", color: "#EF4444", order: 6, is_won: false, is_lost: true },
];

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return { "Content-Type": "application/json" };
  const token = localStorage.getItem("crm_token") || localStorage.getItem("token");
  const userStr = localStorage.getItem("crm_user") || localStorage.getItem("user");
  let uid = "";
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      if (u?.id) uid = String(u.id);
    } catch {}
  }
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(uid ? { "X-User-ID": uid } : {}),
  };
}

export default function LeadSpacesSettingsTab() {
  const { t } = useLanguage();
  const [spaces, setSpaces] = useState<LeadSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Create Space modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceDesc, setNewSpaceDesc] = useState("");
  const [newSpaceIsDefault, setNewSpaceIsDefault] = useState(false);
  const [newSpaceStages, setNewSpaceStages] = useState<LeadStage[]>(DEFAULT_NEW_STAGES);
  const [creating, setCreating] = useState(false);

  // Edit Space metadata modal
  const [editSpace, setEditSpace] = useState<LeadSpace | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Expanded space for stage editing
  const [expandedSpaceId, setExpandedSpaceId] = useState<number | null>(null);
  const [activeStages, setActiveStages] = useState<Record<number, LeadStage[]>>({});
  const [savingStages, setSavingStages] = useState<Record<number, boolean>>({});

  const fetchSpaces = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/lead-spaces`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load lead spaces");
      const data = await res.json();
      setSpaces(data || []);
      const stagesMap: Record<number, LeadStage[]> = {};
      (data || []).forEach((s: LeadSpace) => {
        stagesMap[s.id] = (s.stages || []).map((st, i) => ({
          ...st,
          order: typeof st.order === "number" ? st.order : i,
        }));
      });
      setActiveStages(stagesMap);
    } catch (err: any) {
      setError(err?.message || "Could not load lead spaces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpaces();
  }, []);

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpaceName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/lead-spaces`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: newSpaceName.trim(),
          description: newSpaceDesc.trim() || null,
          is_default: newSpaceIsDefault,
          stages: newSpaceStages,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to create space");
      }
      setShowCreateModal(false);
      setNewSpaceName("");
      setNewSpaceDesc("");
      setNewSpaceIsDefault(false);
      setNewSpaceStages(DEFAULT_NEW_STAGES);
      setSuccessMsg("Lead space created successfully!");
      setTimeout(() => setSuccessMsg(""), 4000);
      await fetchSpaces();
    } catch (err: any) {
      setError(err?.message || "Failed to create lead space");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEditSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSpace || !editSpace.name.trim()) return;
    setSavingEdit(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/lead-spaces/${editSpace.id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: editSpace.name.trim(),
          description: editSpace.description || null,
          is_default: editSpace.is_default,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to update space");
      }
      setEditSpace(null);
      setSuccessMsg("Space details updated successfully!");
      setTimeout(() => setSuccessMsg(""), 4000);
      await fetchSpaces();
    } catch (err: any) {
      setError(err?.message || "Failed to update space");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSetDefault = async (spaceId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/lead-spaces/${spaceId}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) throw new Error("Failed to set default space");
      setSuccessMsg("Default space updated!");
      setTimeout(() => setSuccessMsg(""), 4000);
      await fetchSpaces();
    } catch (err: any) {
      setError(err?.message || "Failed to update default space");
    }
  };

  const handleDeleteSpace = async (space: LeadSpace) => {
    if (spaces.length <= 1) {
      alert("You cannot delete the only lead space. Each company must have at least one space.");
      return;
    }
    const confirmMsg = space.leads_count && space.leads_count > 0
      ? `Are you sure you want to delete "${space.name}"? Its ${space.leads_count} leads will be safely reassigned to your default space.`
      : `Are you sure you want to delete space "${space.name}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`${API_BASE_URL}/lead-spaces/${space.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to delete space");
      }
      setSuccessMsg(`Space "${space.name}" deleted.`);
      setTimeout(() => setSuccessMsg(""), 4000);
      await fetchSpaces();
    } catch (err: any) {
      setError(err?.message || "Could not delete space");
    }
  };

  // Stage editing functions for a space
  const handleStageChange = (spaceId: number, index: number, field: keyof LeadStage, value: any) => {
    setActiveStages((prev) => {
      const current = [...(prev[spaceId] || [])];
      current[index] = { ...current[index], [field]: value };
      return { ...prev, [spaceId]: current };
    });
  };

  const handleMoveStage = (spaceId: number, index: number, direction: "up" | "down") => {
    setActiveStages((prev) => {
      const current = [...(prev[spaceId] || [])];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return prev;
      const temp = current[index];
      current[index] = current[targetIndex];
      current[targetIndex] = temp;
      const reordered = current.map((st, i) => ({ ...st, order: i }));
      return { ...prev, [spaceId]: reordered };
    });
  };

  const handleAddStage = (spaceId: number) => {
    setActiveStages((prev) => {
      const current = [...(prev[spaceId] || [])];
      const newOrder = current.length;
      const newId = `stage_${Date.now()}`;
      const color = PRESET_COLORS[newOrder % PRESET_COLORS.length].hex;
      current.push({
        id: newId,
        name: `Stage ${newOrder + 1}`,
        color: color,
        order: newOrder,
        is_won: false,
        is_lost: false,
      });
      return { ...prev, [spaceId]: current };
    });
  };

  const handleDeleteStage = (spaceId: number, index: number) => {
    setActiveStages((prev) => {
      const current = [...(prev[spaceId] || [])];
      if (current.length <= 1) {
        alert("A lead space must have at least one stage.");
        return prev;
      }
      current.splice(index, 1);
      const reordered = current.map((st, i) => ({ ...st, order: i }));
      return { ...prev, [spaceId]: reordered };
    });
  };

  const handleSaveStages = async (spaceId: number) => {
    const stagesToSave = activeStages[spaceId];
    if (!stagesToSave || stagesToSave.length === 0) return;
    setSavingStages((prev) => ({ ...prev, [spaceId]: true }));
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/lead-spaces/${spaceId}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ stages: stagesToSave }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to update stages");
      }
      setSuccessMsg("Pipeline stages saved successfully!");
      setTimeout(() => setSuccessMsg(""), 4000);
      await fetchSpaces();
    } catch (err: any) {
      setError(err?.message || "Failed to save stages");
    } finally {
      setSavingStages((prev) => ({ ...prev, [spaceId]: false }));
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Lead Spaces &amp; Pipelines</span>
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40">
              {spaces.length} {spaces.length === 1 ? "Space" : "Spaces"}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl">
            Create custom lead spaces for different divisions (e.g. Sales, Admissions, Partnerships). Each space has its own dedicated stages, custom Kanban columns, and isolated CSV import/export.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs transition-colors shrink-0"
        >
          <Plus size={14} />
          <span>Add New Space</span>
        </button>
      </div>

      {error && (
        <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 text-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/90 dark:border-white/10">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : spaces.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/90 dark:border-white/10">
          <Layers className="w-10 h-10 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">No Lead Spaces defined yet</p>
          <p className="text-[11px] text-slate-400 mt-1">Create your first custom pipeline space to start organizing leads.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-3 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs"
          >
            Create Default Space
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {spaces.map((space) => {
            const isExpanded = expandedSpaceId === space.id;
            const currentStages = activeStages[space.id] || space.stages || [];
            const isSaving = savingStages[space.id] || false;

            return (
              <div
                key={space.id}
                className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xs overflow-hidden transition-all"
              >
                {/* Space Card Header */}
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50 dark:bg-zinc-800/30 border-b border-slate-100 dark:border-white/5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                        {space.name}
                      </span>
                      {space.is_default && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Default Space
                        </span>
                      )}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                        {space.leads_count ?? 0} Leads
                      </span>
                    </div>
                    {space.description && (
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                        {space.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!space.is_default && (
                      <button
                        onClick={() => handleSetDefault(space.id)}
                        className="px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-zinc-700 rounded-lg transition-colors border border-slate-200 dark:border-zinc-700"
                        title="Make this the default pipeline for new leads"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => setEditSpace(space)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Edit space name/description"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteSpace(space)}
                      disabled={spaces.length <= 1}
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-slate-400"
                      title={spaces.length <= 1 ? "Cannot delete the only space" : "Delete space"}
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={() => setExpandedSpaceId(isExpanded ? null : space.id)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors border border-indigo-200/60 dark:border-indigo-800/40 ml-1"
                    >
                      <span>{isExpanded ? "Hide Stages" : "Configure Stages"}</span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Pipeline Stages Mini Visual Strip */}
                <div className="px-4 py-3 overflow-x-auto">
                  <div className="flex items-center gap-2 min-w-max">
                    {currentStages.map((st, i) => (
                      <div key={st.id || i} className="flex items-center gap-1.5">
                        <div
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium shadow-2xs"
                          style={{
                            borderColor: `${st.color}55`,
                            backgroundColor: `${st.color}15`,
                            color: st.color,
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: st.color }}
                          />
                          <span className="font-semibold text-slate-800 dark:text-zinc-200">{st.name}</span>
                          {st.is_won && (
                            <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 uppercase">
                              Won
                            </span>
                          )}
                          {st.is_lost && (
                            <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 uppercase">
                              Lost
                            </span>
                          )}
                        </div>
                        {i < currentStages.length - 1 && (
                          <span className="text-slate-300 dark:text-zinc-600 font-bold">→</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expanded Stage Customization Workspace */}
                {isExpanded && (
                  <div className="p-4 bg-slate-50/80 dark:bg-zinc-950/40 border-t border-slate-200/80 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Workflow className="w-3.5 h-3.5 text-indigo-600" />
                        <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                          Custom Pipeline Stages for {space.name}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddStage(space.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
                        >
                          <Plus size={13} />
                          <span>Add Stage</span>
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSaveStages(space.id)}
                          className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          <span>{isSaving ? "Saving…" : "Save Stages"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Stage Rows */}
                    <div className="space-y-2">
                      {currentStages.map((stage, idx) => (
                        <div
                          key={stage.id || idx}
                          className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-xl shadow-2xs"
                        >
                          {/* Order / Reorder buttons */}
                          <div className="flex items-center gap-1">
                            <span className="w-5 text-center text-xs font-bold text-slate-400 dark:text-zinc-500">
                              {idx + 1}
                            </span>
                            <div className="flex flex-col">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveStage(space.id, idx, "up")}
                                className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 disabled:opacity-20"
                                title="Move up"
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                type="button"
                                disabled={idx === currentStages.length - 1}
                                onClick={() => handleMoveStage(space.id, idx, "down")}
                                className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 disabled:opacity-20"
                                title="Move down"
                              >
                                <ArrowDown size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Stage Name Input */}
                          <div className="flex-1 min-w-[140px]">
                            <input
                              type="text"
                              value={stage.name}
                              onChange={(e) => handleStageChange(space.id, idx, "name", e.target.value)}
                              placeholder="Stage name (e.g. Qualified)"
                              className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>

                          {/* Color Palette Selector */}
                          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                            {PRESET_COLORS.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => handleStageChange(space.id, idx, "color", c.hex)}
                                className={`w-5 h-5 rounded-full border transition-transform ${
                                  stage.color === c.hex ? "scale-115 ring-2 ring-indigo-500" : "hover:scale-105"
                                }`}
                                style={{ backgroundColor: c.hex, borderColor: "rgba(0,0,0,0.15)" }}
                                title={c.name}
                              />
                            ))}
                          </div>

                          {/* Stage Type Toggle (Won / Lost / Regular) */}
                          <div className="flex items-center gap-1.5 shrink-0 text-xs">
                            <label className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 cursor-pointer text-[11px] text-slate-700 dark:text-zinc-300">
                              <input
                                type="checkbox"
                                checked={!!stage.is_won}
                                onChange={(e) => {
                                  handleStageChange(space.id, idx, "is_won", e.target.checked);
                                  if (e.target.checked) handleStageChange(space.id, idx, "is_lost", false);
                                }}
                                className="rounded text-emerald-600 focus:ring-0"
                              />
                              <span className={stage.is_won ? "font-bold text-emerald-600" : ""}>Won</span>
                            </label>

                            <label className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 cursor-pointer text-[11px] text-slate-700 dark:text-zinc-300">
                              <input
                                type="checkbox"
                                checked={!!stage.is_lost}
                                onChange={(e) => {
                                  handleStageChange(space.id, idx, "is_lost", e.target.checked);
                                  if (e.target.checked) handleStageChange(space.id, idx, "is_won", false);
                                }}
                                className="rounded text-rose-600 focus:ring-0"
                              />
                              <span className={stage.is_lost ? "font-bold text-rose-600" : ""}>Lost</span>
                            </label>

                            {/* Delete Stage */}
                            <button
                              type="button"
                              onClick={() => handleDeleteStage(space.id, idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors ml-1"
                              title="Delete stage"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create New Space */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 w-full max-w-lg shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create New Lead Space</h3>
                  <p className="text-[11px] text-slate-400">Add an independent pipeline with its own customized stages</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSpace} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Space Name *
                </label>
                <input
                  type="text"
                  required
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  placeholder="e.g. Real Estate Sales, University Admissions, B2B Enterprise"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newSpaceDesc}
                  onChange={(e) => setNewSpaceDesc(e.target.value)}
                  placeholder="Brief summary of who works in this space and what leads are tracked here..."
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-700">
                <input
                  type="checkbox"
                  id="newSpaceDefault"
                  checked={newSpaceIsDefault}
                  onChange={(e) => setNewSpaceIsDefault(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <label htmlFor="newSpaceDefault" className="text-xs font-medium text-slate-700 dark:text-zinc-300 cursor-pointer">
                  Set as default space for newly created and imported leads
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Initial Stages ({newSpaceStages.length})
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Starts with standard stages; you can rename, reorder, or add more anytime after creation.
                </p>
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 dark:bg-zinc-800/50 rounded-lg border border-slate-200/80 dark:border-zinc-700 max-h-32 overflow-y-auto">
                  {newSpaceStages.map((st, i) => (
                    <span
                      key={st.id || i}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold border"
                      style={{
                        borderColor: `${st.color}55`,
                        backgroundColor: `${st.color}15`,
                        color: st.color,
                      }}
                    >
                      {st.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
                >
                  {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  <span>{creating ? "Creating…" : "Create Space"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Space Metadata */}
      {editSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Edit Space Details</h3>
              <button
                onClick={() => setEditSpace(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditSpace} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Space Name *
                </label>
                <input
                  type="text"
                  required
                  value={editSpace.name}
                  onChange={(e) => setEditSpace({ ...editSpace, name: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editSpace.description || ""}
                  onChange={(e) => setEditSpace({ ...editSpace, description: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-700">
                <input
                  type="checkbox"
                  id="editSpaceDefault"
                  checked={editSpace.is_default}
                  onChange={(e) => setEditSpace({ ...editSpace, is_default: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <label htmlFor="editSpaceDefault" className="text-xs font-medium text-slate-700 dark:text-zinc-300 cursor-pointer">
                  Default lead space for new leads
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setEditSpace(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
                >
                  {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  <span>{savingEdit ? "Saving…" : "Save Changes"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

