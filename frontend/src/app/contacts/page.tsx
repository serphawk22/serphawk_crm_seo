"use client";

import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Users as UsersIcon, Mail, Phone,
  Linkedin, Twitter, Tag, ChevronDown, ChevronRight,
  CornerDownRight, Trash, Edit, AlertCircle, Building2, ExternalLink,
  Briefcase, Star, Check, Upload, Calendar, Clock,
  UserCheck, UserPlus, StickyNote, FileText, CheckCircle2, X,
  Filter, ArrowUpDown, SlidersHorizontal, RotateCcw, ChevronUp, CalendarClock
} from "lucide-react";

const getAuthHeaders = (extra: Record<string, string> = {}) => {
  const token = typeof window !== "undefined" ? (localStorage.getItem("crm_token") || localStorage.getItem("token")) : null;
  const userStr = typeof window !== "undefined" ? (localStorage.getItem("crm_user") || localStorage.getItem("user")) : null;
  let uid = "";
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      if (u?.id) uid = String(u.id);
    } catch {}
  }
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(uid ? { "X-User-ID": uid } : {}),
  };
};

const ContactRow = ({
  contact,
  depth = 0,
  onSelectContact,
  onAddSubContact,
  onEdit,
  onDelete,
  onSelectTag,
  selectedTags = []
}: any) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<any[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const isSearchResult = !!contact.hierarchy_path;

  const toggleExpand = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (children.length === 0 && contact.children_count > 0 && !isSearchResult) {
      setLoadingChildren(true);
      try {
        const res = await fetch(`${API_BASE_URL}/contacts/${contact.id}/children`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setChildren(data.children || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingChildren(false);
      }
    }
  };

  const contactName = contact.full_name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || t("contacts.unknown");
  const initials = (contact.first_name || contactName || "C").charAt(0).toUpperCase();
  const phone = contact.mobile_number || contact.alternate_number;
  const linkedLeads = contact.linked_leads || [];
  const linkedClients = contact.linked_clients || [];

  return (
    <div className="flex flex-col" style={{ marginLeft: depth > 0 ? `${Math.min(depth * 18, 72)}px` : undefined }}>
      <div
        onClick={() => onSelectContact(contact, "assign")}
        className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-3 px-4 shadow-2xs hover:shadow-md hover:border-blue-500/70 dark:hover:border-blue-500/60 transition-all duration-150 group mb-2 flex flex-wrap lg:flex-nowrap items-center justify-between gap-3.5 cursor-pointer"
      >
        {/* Left: Expander + Depth Icon + Avatar + Info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {!isSearchResult && contact.children_count > 0 ? (
            <button
              onClick={toggleExpand}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 transition-colors shrink-0"
              title={expanded ? "Collapse sub-contacts" : "Expand sub-contacts"}
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <div className="w-4 shrink-0" />
          )}

          {depth > 0 && <CornerDownRight className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-600 shrink-0" />}

          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/60 dark:to-blue-950/40 border border-indigo-200/70 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs">
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 dark:text-white text-sm leading-tight truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {contactName}
              </span>
              {contact.children_count > 0 && !isSearchResult && (
                <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                  {contact.children_count} {t("contacts.sub_contacts")}
                </span>
              )}
              {/* Assigned Owner Pill */}
              {contact.owner_name ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  <UserCheck className="w-3 h-3 text-purple-600" />
                  <span>{contact.owner_name}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700">
                  <UserPlus className="w-3 h-3 opacity-60" />
                  <span>Unassigned</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              <span>{contact.designation || t("contacts.no_title")}</span>
              {contact.department && <span>• {contact.department}</span>}
              {isSearchResult && contact.hierarchy_path && (
                <span className="text-indigo-500 font-medium">({contact.hierarchy_path})</span>
              )}
            </div>

            {/* Linked Companies / Leads / Business Name Badges */}
            {(linkedLeads.length > 0 || linkedClients.length > 0 || contact.custom_fields?.business_name) && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
                {linkedLeads.map((lead: any) => (
                  <Link
                    key={`l-${lead.id}`}
                    href={`/leads/${lead.id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-900 hover:bg-blue-100 transition-colors"
                  >
                    <Building2 className="w-2.5 h-2.5" />
                    <span className="truncate max-w-[140px]">{lead.name}</span>
                    {lead.is_primary && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />}
                    <ExternalLink className="w-2 h-2 opacity-60" />
                  </Link>
                ))}
                {linkedClients.map((client: any) => (
                  <Link
                    key={`c-${client.id}`}
                    href={`/admin/clients/${client.id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-900 hover:bg-emerald-100 transition-colors"
                  >
                    <Briefcase className="w-2.5 h-2.5" />
                    <span className="truncate max-w-[140px]">{client.name}</span>
                    {client.is_primary && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />}
                    <ExternalLink className="w-2 h-2 opacity-60" />
                  </Link>
                ))}
                {linkedLeads.length === 0 && linkedClients.length === 0 && contact.custom_fields?.business_name && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700">
                    <Building2 className="w-2.5 h-2.5 text-blue-500" />
                    <span className="truncate max-w-[150px]">{contact.custom_fields.business_name}</span>
                  </span>
                )}
              </div>
            )}

            {/* Tags & Mapped Custom Fields Badges */}
            {((contact.tags && contact.tags.length > 0) || (contact.custom_fields && Object.keys(contact.custom_fields).filter(k => k !== 'business_name').length > 0)) && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {contact.tags?.map((tg: string, i: number) => {
                  const isSelected = selectedTags?.includes(tg);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTag?.(tg);
                      }}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                        isSelected
                          ? "bg-indigo-600 text-white shadow-2xs"
                          : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200/50 dark:border-indigo-800/40"
                      }`}
                      title={`Filter by tag: ${tg}`}
                    >
                      <Tag className="w-2 h-2" />
                      <span>{tg}</span>
                      {isSelected && <Check className="w-2.5 h-2.5 ml-0.5" />}
                    </button>
                  );
                })}
                {contact.custom_fields && Object.entries(contact.custom_fields)
                  .filter(([k]) => k !== 'business_name')
                  .slice(0, 4)
                  .map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/60" title={`${k}: ${String(v)}`}>
                      <span className="font-bold opacity-75">{k}:</span> {String(v)}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: PROMINENT PHONE & EMAIL PILLS */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          {/* Phone Badge */}
          {phone ? (
            <a
              href={`tel:${phone}`}
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold shadow-2xs transition-colors shrink-0"
              title={`Call ${phone}`}
            >
              <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-mono">{phone}</span>
            </a>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 text-slate-400 dark:text-zinc-500 border border-dashed border-slate-200 dark:border-zinc-800 text-xs shrink-0">
              <Phone className="w-3.5 h-3.5 opacity-40 shrink-0" />
              <span>No phone</span>
            </div>
          )}

          {/* Email Badge */}
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold shadow-2xs transition-colors shrink-0 max-w-[220px]"
              title={`Email ${contact.email}`}
            >
              <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="truncate">{contact.email}</span>
            </a>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 text-slate-400 dark:text-zinc-500 border border-dashed border-slate-200 dark:border-zinc-800 text-xs shrink-0">
              <Mail className="w-3.5 h-3.5 opacity-40 shrink-0" />
              <span>No email</span>
            </div>
          )}
        </div>

        {/* Social Links */}
        <div className="hidden xl:flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          {contact.linkedin_url && (
            <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-500 hover:text-blue-600 transition-colors" title="LinkedIn">
              <Linkedin className="w-3.5 h-3.5" />
            </a>
          )}
          {contact.twitter_url && (
            <a href={contact.twitter_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/40 text-sky-500 hover:text-sky-600 transition-colors" title="Twitter">
              <Twitter className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onSelectContact(contact, "assign")}
            title="Assign Contact"
            className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/50 text-slate-400 hover:text-purple-600 transition-colors"
          >
            <UserCheck className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSelectContact(contact, "notes")}
            title="Add Notes"
            className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/50 text-slate-400 hover:text-amber-600 transition-colors"
          >
            <StickyNote className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSelectContact(contact, "followup")}
            title="Schedule Follow-up"
            className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-400 hover:text-emerald-600 transition-colors"
          >
            <CalendarClock className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSelectContact(contact, "meeting")}
            title="Schedule Meeting"
            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-400 hover:text-blue-600 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onAddSubContact(contact)}
            title={t("contacts.add_sub_contact")}
            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onEdit(contact)}
            title={t("contacts.edit")}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(contact)}
            title={t("contacts.delete")}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
          >
            <Trash className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Recursive children */}
      {expanded && !isSearchResult && (
        <div className="flex flex-col">
          {children.map(child => (
            <ContactRow
              key={child.id}
              contact={child}
              depth={depth + 1}
              onSelectContact={onSelectContact}
              onAddSubContact={onAddSubContact}
              onEdit={onEdit}
              onDelete={onDelete}
              onSelectTag={onSelectTag}
              selectedTags={selectedTags}
            />
          ))}
          {loadingChildren && (
            <div className="text-xs text-slate-400 py-1.5 px-4 italic" style={{ marginLeft: `${(depth + 1) * 18}px` }}>
              {t("contacts.loading")}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function ContactsPage() {
  const { t, language } = useLanguage();
  const [contacts, setContacts] = useState<any[]>([]);
  const [allFlatContacts, setAllFlatContacts] = useState<any[]>([]);
  const [leadsList, setLeadsList] = useState<any[]>([]);
  const [clientsList, setClientsList] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Statistics from server
  const [stats, setStats] = useState({
    total: 0,
    root: 0,
    with_email: 0,
    with_phone: 0,
    assigned: 0,
    unassigned: 0,
    with_notes: 0,
    with_meetings: 0
  });

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMatching, setTotalMatching] = useState(0);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [emailFilter, setEmailFilter] = useState<"all" | "with" | "without">("all");
  const [phoneFilter, setPhoneFilter] = useState<"all" | "with" | "without">("all");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | "">("");
  const [notesFilter, setNotesFilter] = useState<"all" | "with" | "without">("all");
  const [meetingFilter, setMeetingFilter] = useState<"all" | "with" | "without">("all");
  const [tagsFilter, setTagsFilter] = useState<"all" | "with" | "without">("all");
  const [tagQuery, setTagQuery] = useState("");
  // Tags multi-filter states
  const [availableTags, setAvailableTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagsMode, setTagsMode] = useState<"any" | "all">("any");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"latest" | "oldest" | "name_asc" | "name_desc" | "more_tags" | "less_tags">("latest");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Edit / Add Modal
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<any>(null);

  // Quick Action Modal (Assign, Notes, Schedule Follow-up, Schedule Meeting)
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [quickActionTab, setQuickActionTab] = useState<"assign" | "notes" | "followup" | "meeting">("assign");
  const [assignedOwnerId, setAssignedOwnerId] = useState<number | "">("");
  const [newNoteText, setNewNoteText] = useState("");
  // Follow-up state
  const [followupTitle, setFollowupTitle] = useState("");
  const [followupDueAt, setFollowupDueAt] = useState("");
  const [followupChannel, setFollowupChannel] = useState("Call");
  const [followupPriority, setFollowupPriority] = useState("Medium");
  const [followupOwnerId, setFollowupOwnerId] = useState<number | "">("");
  const [followupNotes, setFollowupNotes] = useState("");
  // Meeting state
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDateTime, setMeetingDateTime] = useState("");
  const [meetingDuration, setMeetingDuration] = useState(30);
  const [meetingHostId, setMeetingHostId] = useState<number | "">("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const auxiliaryLoaded = useRef(false);

  const emptyForm = {
    id: null,
    first_name: "",
    last_name: "",
    email: "",
    mobile_number: "",
    designation: "",
    department: "",
    linkedin_url: "",
    twitter_url: "",
    parent_contact_id: null,
    lead_ids: [] as number[],
    client_ids: [] as number[],
    is_primary: false,
  };
  const [form, setForm] = useState<any>(emptyForm);

  useEffect(() => {
    fetchUsers();
    fetchTagsList();
  }, []);

  const fetchTagsList = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/tags`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tags)) setAvailableTags(data.tags);
      }
    } catch (err) {
      console.error("Failed to load contact tags:", err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUsersList(Array.isArray(data) ? data : data.users || []);
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  // Lazy-load modal options
  useEffect(() => {
    if (showModal && !auxiliaryLoaded.current) {
      fetchAuxiliaryData();
    }
  }, [showModal]);

  const fetchAuxiliaryData = async () => {
    try {
      auxiliaryLoaded.current = true;
      const [leadsRes, clientsRes, flatRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/leads`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/clients`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/contacts?flat=true`, { headers: getAuthHeaders() })
      ]);

      if (leadsRes.status === "fulfilled" && leadsRes.value.ok) {
        const d = await leadsRes.value.json();
        setLeadsList(Array.isArray(d) ? d : d.leads || []);
      }
      if (clientsRes.status === "fulfilled" && clientsRes.value.ok) {
        const d = await clientsRes.value.json();
        setClientsList(Array.isArray(d) ? d : d.clients || []);
      }
      if (flatRes.status === "fulfilled" && flatRes.value.ok) {
        const d = await flatRes.value.json();
        setAllFlatContacts(Array.isArray(d) ? d : d.contacts || []);
      }
    } catch (e) {
      console.error("Aux data fetch error:", e);
    }
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleClearTags = () => {
    setSelectedTags([]);
    setTagQuery("");
  };

  const fetchContacts = async (
    query = searchQuery,
    p = page,
    filters = {
      email: emailFilter,
      phone: phoneFilter,
      assignment: assignmentFilter,
      ownerId: selectedOwnerId,
      notes: notesFilter,
      meeting: meetingFilter,
      tags: tagsFilter,
      tag: tagQuery,
      selectedTags: selectedTags,
      tagsMode: tagsMode,
      sort: sortBy
    }
  ) => {
    setLoading(true);
    setErrorMessage(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(pageSize));
      if (query && query.trim()) params.set("search", query.trim());
      if (filters.email !== "all") params.set("email_filter", filters.email);
      if (filters.phone !== "all") params.set("phone_filter", filters.phone);
      if (filters.assignment !== "all") params.set("assignment_filter", filters.assignment);
      if (filters.ownerId) params.set("owner_id", String(filters.ownerId));
      if (filters.notes !== "all") params.set("notes_filter", filters.notes);
      if (filters.meeting !== "all") params.set("meeting_filter", filters.meeting);
      if (filters.tags !== "all") params.set("tags_filter", filters.tags);
      if (filters.selectedTags && filters.selectedTags.length > 0) {
        params.set("tags", filters.selectedTags.join(","));
        params.set("tags_mode", filters.tagsMode || "any");
      } else if (filters.tag && filters.tag.trim()) {
        params.set("tag", filters.tag.trim());
      }
      if (filters.sort) params.set("sort_by", filters.sort);

      const res = await fetch(`${API_BASE_URL}/contacts?${params.toString()}`, {
        headers: getAuthHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const contactList = Array.isArray(data) ? data : data.contacts || [];
        setContacts(contactList);
        setTotalPages(data.total_pages || 1);
        setTotalMatching(typeof data.total === "number" ? data.total : contactList.length);
        if (data.stats) {
          setStats(data.stats);
        }
        if (data.available_tags && Array.isArray(data.available_tags)) {
          setAvailableTags(data.available_tags);
        }
      } else {
        setErrorMessage(language === 'es' ? `Error al cargar contactos (${res.status})` : `Failed to load contacts (${res.status})`);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error(error);
      if (error?.name === "AbortError") {
        setErrorMessage(language === 'es' ? "Tiempo de espera agotado al cargar contactos." : "Request timed out while loading contacts.");
      } else {
        setErrorMessage(language === 'es' ? "Error de conexión al cargar contactos." : "Network error while loading contacts.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    fetchContacts(searchQuery, newPage);
  };

  // Re-fetch whenever filters, sort or search change (with debounce)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      fetchContacts(searchQuery, 1, {
        email: emailFilter,
        phone: phoneFilter,
        assignment: assignmentFilter,
        ownerId: selectedOwnerId,
        notes: notesFilter,
        meeting: meetingFilter,
        tags: tagsFilter,
        tag: tagQuery,
        selectedTags,
        tagsMode,
        sort: sortBy
      });
    }, 250);
    return () => clearTimeout(delayDebounceFn);
  }, [
    searchQuery, emailFilter, phoneFilter, assignmentFilter,
    selectedOwnerId, notesFilter, meetingFilter, tagsFilter,
    tagQuery, selectedTags, tagsMode, sortBy
  ]);

  // Helper to reset all filters to default
  const handleResetFilters = () => {
    setEmailFilter("all");
    setPhoneFilter("all");
    setAssignmentFilter("all");
    setSelectedOwnerId("");
    setNotesFilter("all");
    setMeetingFilter("all");
    setTagsFilter("all");
    setTagQuery("");
    setSelectedTags([]);
    setTagsMode("any");
    setSortBy("latest");
    setSearchQuery("");
  };

  // Active filter count for badge
  const activeFiltersCount = [
    emailFilter !== "all",
    phoneFilter !== "all",
    assignmentFilter !== "all",
    !!selectedOwnerId,
    notesFilter !== "all",
    meetingFilter !== "all",
    tagsFilter !== "all",
    !!tagQuery.trim(),
    selectedTags.length > 0,
    sortBy !== "latest"
  ].filter(Boolean).length;

  const handleOpenContactActions = (contact: any, tab: "assign" | "notes" | "followup" | "meeting" = "assign") => {
    setSelectedContact(contact);
    setQuickActionTab(tab);
    setAssignedOwnerId(contact.owner_id || "");
    setNewNoteText("");
    const name = contact.full_name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "Contact";
    
    // Follow-up prefill
    setFollowupTitle(`Follow-up with ${name}`);
    const fd = new Date();
    fd.setDate(fd.getDate() + 1);
    fd.setHours(11, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    setFollowupDueAt(`${fd.getFullYear()}-${pad(fd.getMonth() + 1)}-${pad(fd.getDate())}T${pad(fd.getHours())}:${pad(fd.getMinutes())}`);
    setFollowupChannel("Call");
    setFollowupPriority("Medium");
    setFollowupOwnerId(contact.owner_id || "");
    setFollowupNotes("");

    // Meeting prefill
    setMeetingTitle(`Meeting with ${name}`);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    setMeetingDateTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setMeetingDuration(30);
    setMeetingHostId(contact.owner_id || "");
    setMeetingNotes("");
    setActionSuccessMsg(null);
  };

  const handleScheduleFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact || !followupDueAt) return;
    setActionSaving(true);
    setActionSuccessMsg(null);
    try {
      const userTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC";
      const payload = {
        title: followupTitle.trim() || `Follow-up with ${selectedContact.full_name || "Contact"}`,
        due_at: new Date(followupDueAt).toISOString(),
        timezone: userTz,
        channel: followupChannel,
        priority: followupPriority,
        contact_id: selectedContact.id,
        owner_id: followupOwnerId ? Number(followupOwnerId) : (selectedContact.owner_id || undefined),
        notes: followupNotes.trim() || undefined,
        send_notification: true
      };
      const res = await fetch(`${API_BASE_URL}/follow-ups`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setActionSuccessMsg("Follow-up scheduled & assigned successfully! Visible in Follow-ups.");
        setTimeout(() => {
          setSelectedContact(null);
          setActionSuccessMsg(null);
        }, 1200);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to schedule follow-up");
      }
    } catch (e: any) {
      alert("Network error: " + (e?.message || "Failed to schedule follow-up"));
    } finally {
      setActionSaving(false);
    }
  };

  const handleAssignSubmit = async () => {
    if (!selectedContact) return;
    setActionSaving(true);
    setActionSuccessMsg(null);
    try {
      const ownerIdNum = assignedOwnerId ? Number(assignedOwnerId) : null;
      const res = await fetch(`${API_BASE_URL}/contacts/${selectedContact.id}`, {
        method: "PUT",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ owner_id: ownerIdNum })
      });
      if (res.ok) {
        const ownerUser = usersList.find((u: any) => u.id === ownerIdNum);
        const ownerName = ownerUser ? ownerUser.name : null;
        const updatedContact = { ...selectedContact, owner_id: ownerIdNum, owner_name: ownerName };
        setSelectedContact(updatedContact);
        setContacts(prev => prev.map(c => c.id === selectedContact.id ? updatedContact : c));
        setActionSuccessMsg(ownerName ? `Contact assigned to ${ownerName}` : "Contact unassigned");
        setTimeout(() => setActionSuccessMsg(null), 3000);
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to assign contact");
      }
    } catch (e: any) {
      alert("Network error: " + (e?.message || "Failed to assign"));
    } finally {
      setActionSaving(false);
    }
  };

  const handleNoteSubmit = async () => {
    if (!selectedContact || !newNoteText.trim()) return;
    setActionSaving(true);
    setActionSuccessMsg(null);
    try {
      const timeStr = new Date().toLocaleString();
      const formattedNote = `[${timeStr}] ${newNoteText.trim()}`;
      const updatedNotes = selectedContact.notes
        ? `${selectedContact.notes}\n\n${formattedNote}`
        : formattedNote;
      const res = await fetch(`${API_BASE_URL}/contacts/${selectedContact.id}`, {
        method: "PUT",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ notes: updatedNotes })
      });
      if (res.ok) {
        const updatedContact = { ...selectedContact, notes: updatedNotes };
        setSelectedContact(updatedContact);
        setContacts(prev => prev.map(c => c.id === selectedContact.id ? updatedContact : c));
        setNewNoteText("");
        setActionSuccessMsg("Note saved successfully!");
        setTimeout(() => setActionSuccessMsg(null), 3000);
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to save note");
      }
    } catch (e: any) {
      alert("Network error: " + (e?.message || "Failed to save note"));
    } finally {
      setActionSaving(false);
    }
  };

  const handleScheduleSubmit = async () => {
    if (!selectedContact || !meetingDateTime) return;
    setActionSaving(true);
    setActionSuccessMsg(null);
    try {
      const payload = {
        title: meetingTitle.trim() || `Meeting with ${selectedContact.full_name || "Contact"}`,
        scheduled_at: new Date(meetingDateTime).toISOString(),
        duration_minutes: Number(meetingDuration) || 30,
        contact_id: selectedContact.id,
        lead_id: selectedContact.lead_id || undefined,
        client_id: selectedContact.client_id || undefined,
        host_id: meetingHostId ? Number(meetingHostId) : undefined,
        notes: meetingNotes.trim() || undefined
      };
      const res = await fetch(`${API_BASE_URL}/meetings`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setActionSuccessMsg("Meeting scheduled successfully!");
        setTimeout(() => setActionSuccessMsg(null), 3500);
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to schedule meeting");
      }
    } catch (e: any) {
      alert("Network error: " + (e?.message || "Failed to schedule meeting"));
    } finally {
      setActionSaving(false);
    }
  };

  const handleAddSubContact = (parentContact: any) => {
    setForm({
      ...emptyForm,
      parent_contact_id: parentContact.id,
      lead_ids: parentContact.linked_leads?.map((l: any) => l.id) || (parentContact.lead_id ? [parentContact.lead_id] : []),
      client_ids: parentContact.linked_clients?.map((c: any) => c.id) || (parentContact.client_id ? [parentContact.client_id] : [])
    });
    setShowModal(true);
  };

  const handleEdit = (contact: any) => {
    const parts = (contact.full_name || "").split(" ");
    const firstName = contact.first_name || parts[0] || "";
    const lastName = contact.last_name || parts.slice(1).join(" ") || "";
    setForm({
      id: contact.id,
      first_name: firstName,
      last_name: lastName,
      email: contact.email || "",
      mobile_number: contact.mobile_number || "",
      designation: contact.designation || "",
      department: contact.department || "",
      linkedin_url: contact.linkedin_url || "",
      twitter_url: contact.twitter_url || "",
      parent_contact_id: contact.parent_contact_id || null,
      lead_ids: contact.linked_leads?.map((l: any) => l.id) || (contact.lead_id ? [contact.lead_id] : []),
      client_ids: contact.linked_clients?.map((c: any) => c.id) || (contact.client_id ? [contact.client_id] : []),
      is_primary: contact.linked_leads?.some((l: any) => l.is_primary) || contact.linked_clients?.some((c: any) => c.is_primary) || false,
    });
    setShowModal(true);
  };

  const handleDeletePrompt = (contact: any) => {
    setContactToDelete(contact);
    setShowDeleteModal(true);
  };

  const confirmDelete = async (action: "reparent" | "cascade") => {
    if (!contactToDelete) return;
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/${contactToDelete.id}?action=${action}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setShowDeleteModal(false);
        setContactToDelete(null);
        fetchContacts(searchQuery);
      } else {
        alert(t("contacts.error_deleting"));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleLeadSelection = (leadId: number) => {
    setForm((prev: any) => {
      const exists = prev.lead_ids.includes(leadId);
      return {
        ...prev,
        lead_ids: exists ? prev.lead_ids.filter((id: number) => id !== leadId) : [...prev.lead_ids, leadId]
      };
    });
  };

  const toggleClientSelection = (clientId: number) => {
    setForm((prev: any) => {
      const exists = prev.client_ids.includes(clientId);
      return {
        ...prev,
        client_ids: exists ? prev.client_ids.filter((id: number) => id !== clientId) : [...prev.client_ids, clientId]
      };
    });
  };

  const handleSaveContact = async () => {
    if (!form.first_name.trim()) return;
    setSaving(true);

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || undefined,
      email: form.email.trim() || undefined,
      mobile_number: form.mobile_number.trim() || undefined,
      designation: form.designation.trim() || undefined,
      department: form.department.trim() || undefined,
      linkedin_url: form.linkedin_url.trim() || undefined,
      twitter_url: form.twitter_url.trim() || undefined,
      parent_contact_id: form.parent_contact_id || undefined,
      lead_ids: form.lead_ids,
      client_ids: form.client_ids,
      lead_id: form.lead_ids.length > 0 ? form.lead_ids[0] : undefined,
      client_id: form.client_ids.length > 0 ? form.client_ids[0] : undefined,
      role_at_company: form.designation.trim() || undefined,
      is_primary: form.is_primary
    };

    try {
      const method = form.id ? "PUT" : "POST";
      const url = form.id ? `${API_BASE_URL}/contacts/${form.id}` : `${API_BASE_URL}/contacts`;
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || t("contacts.error_saving"));
        setSaving(false);
        return;
      }
      setShowModal(false);
      setForm(emptyForm);
      fetchContacts(searchQuery);
      fetchAuxiliaryData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-black rounded-xl overflow-hidden shadow-2xs border border-slate-200/90 dark:border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-zinc-900 border-b border-slate-200/90 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <UsersIcon className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">{t("contacts.title")}</h1>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-none mt-0.5 truncate">{t("contacts.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/import?target=contacts"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:border-blue-500 hover:text-blue-600 shadow-2xs transition-colors shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-blue-500" />
            <span>Import Contacts</span>
          </Link>
          <button
            onClick={() => { setForm(emptyForm); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("contacts.add_contact")}</span>
          </button>
        </div>
      </div>

      {/* Interactive KPI Metric Strip (Click to Quick Filter) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 p-2.5 bg-slate-50/60 dark:bg-zinc-950/40 border-b border-slate-200/90 dark:border-white/10 shrink-0">
        {/* Total Contacts */}
        <div
          onClick={handleResetFilters}
          className={`bg-white dark:bg-zinc-900 border rounded-xl px-2.5 py-2 flex items-center gap-2 shadow-2xs cursor-pointer transition hover:border-blue-500/80 ${
            activeFiltersCount === 0 ? "border-blue-500 ring-1 ring-blue-500/30" : "border-slate-200/90 dark:border-white/10"
          }`}
          title="Click to reset filters and view all contacts"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <UsersIcon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[9.5px] text-slate-400 dark:text-zinc-500 uppercase font-bold leading-none truncate">Total</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5 truncate">{(stats.total || 0).toLocaleString()}</div>
          </div>
        </div>

        {/* With Phone */}
        <div
          onClick={() => setPhoneFilter(phoneFilter === "with" ? "all" : "with")}
          className={`bg-white dark:bg-zinc-900 border rounded-xl px-2.5 py-2 flex items-center gap-2 shadow-2xs cursor-pointer transition hover:border-emerald-500/80 ${
            phoneFilter === "with" ? "border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500/30" : "border-slate-200/90 dark:border-white/10"
          }`}
          title="Filter contacts with phone number"
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Phone className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[9.5px] text-slate-400 dark:text-zinc-500 uppercase font-bold leading-none truncate">With Phone</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5 truncate">{(stats.with_phone || 0).toLocaleString()}</div>
          </div>
        </div>

        {/* With Email */}
        <div
          onClick={() => setEmailFilter(emailFilter === "with" ? "all" : "with")}
          className={`bg-white dark:bg-zinc-900 border rounded-xl px-2.5 py-2 flex items-center gap-2 shadow-2xs cursor-pointer transition hover:border-blue-500/80 ${
            emailFilter === "with" ? "border-blue-500 bg-blue-50/20 ring-1 ring-blue-500/30" : "border-slate-200/90 dark:border-white/10"
          }`}
          title="Filter contacts with email address"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Mail className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[9.5px] text-slate-400 dark:text-zinc-500 uppercase font-bold leading-none truncate">With Email</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5 truncate">{(stats.with_email || 0).toLocaleString()}</div>
          </div>
        </div>

        {/* Assigned */}
        <div
          onClick={() => setAssignmentFilter(assignmentFilter === "assigned" ? "all" : "assigned")}
          className={`bg-white dark:bg-zinc-900 border rounded-xl px-2.5 py-2 flex items-center gap-2 shadow-2xs cursor-pointer transition hover:border-purple-500/80 ${
            assignmentFilter === "assigned" ? "border-purple-500 bg-purple-50/20 ring-1 ring-purple-500/30" : "border-slate-200/90 dark:border-white/10"
          }`}
          title="Filter assigned contacts"
        >
          <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200/50 dark:border-purple-800/40 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
            <UserCheck className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[9.5px] text-slate-400 dark:text-zinc-500 uppercase font-bold leading-none truncate">Assigned</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5 truncate">{(stats.assigned || 0).toLocaleString()}</div>
          </div>
        </div>

        {/* Unassigned */}
        <div
          onClick={() => setAssignmentFilter(assignmentFilter === "unassigned" ? "all" : "unassigned")}
          className={`bg-white dark:bg-zinc-900 border rounded-xl px-2.5 py-2 flex items-center gap-2 shadow-2xs cursor-pointer transition hover:border-slate-500/80 ${
            assignmentFilter === "unassigned" ? "border-slate-600 bg-slate-100 dark:bg-zinc-800 ring-1 ring-slate-500/30" : "border-slate-200/90 dark:border-white/10"
          }`}
          title="Filter unassigned contacts"
        >
          <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-slate-600 dark:text-zinc-300 shrink-0">
            <UserPlus className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[9.5px] text-slate-400 dark:text-zinc-500 uppercase font-bold leading-none truncate">Unassigned</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5 truncate">{(stats.unassigned || 0).toLocaleString()}</div>
          </div>
        </div>

        {/* With Notes */}
        <div
          onClick={() => setNotesFilter(notesFilter === "with" ? "all" : "with")}
          className={`bg-white dark:bg-zinc-900 border rounded-xl px-2.5 py-2 flex items-center gap-2 shadow-2xs cursor-pointer transition hover:border-amber-500/80 ${
            notesFilter === "with" ? "border-amber-500 bg-amber-50/20 ring-1 ring-amber-500/30" : "border-slate-200/90 dark:border-white/10"
          }`}
          title="Filter contacts with notes recorded"
        >
          <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <StickyNote className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[9.5px] text-slate-400 dark:text-zinc-500 uppercase font-bold leading-none truncate">Notes Made</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5 truncate">{(stats.with_notes || 0).toLocaleString()}</div>
          </div>
        </div>

        {/* With Meetings */}
        <div
          onClick={() => setMeetingFilter(meetingFilter === "with" ? "all" : "with")}
          className={`bg-white dark:bg-zinc-900 border rounded-xl px-2.5 py-2 flex items-center gap-2 shadow-2xs cursor-pointer transition hover:border-blue-500/80 ${
            meetingFilter === "with" ? "border-blue-500 bg-blue-50/20 ring-1 ring-blue-500/30" : "border-slate-200/90 dark:border-white/10"
          }`}
          title="Filter contacts with meetings scheduled"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Calendar className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[9.5px] text-slate-400 dark:text-zinc-500 uppercase font-bold leading-none truncate">Meetings</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5 truncate">{(stats.with_meetings || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Quick Filter Pill Buttons Strip */}
      <div className="px-4 py-2 bg-slate-50/40 dark:bg-zinc-900/60 border-b border-slate-200/80 dark:border-zinc-800/80 flex items-center gap-1.5 overflow-x-auto shrink-0 text-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mr-1 flex items-center gap-1">
          <Filter className="w-3 h-3" /> Filters:
        </span>

        {/* All Pill */}
        <button
          onClick={handleResetFilters}
          className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1 ${
            activeFiltersCount === 0
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100"
          }`}
        >
          <span>All</span>
          <span className="text-[10px] opacity-80">({(stats.total || 0).toLocaleString()})</span>
        </button>

        {/* Phone Pill */}
        <button
          onClick={() => setPhoneFilter(phoneFilter === "with" ? "all" : "with")}
          className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            phoneFilter === "with"
              ? "bg-emerald-600 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100"
          }`}
        >
          <Phone className="w-3 h-3 text-emerald-500" />
          <span>With Phone</span>
          <span className="text-[10px] opacity-80">({(stats.with_phone || 0).toLocaleString()})</span>
        </button>

        {/* Email Pill */}
        <button
          onClick={() => setEmailFilter(emailFilter === "with" ? "all" : "with")}
          className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            emailFilter === "with"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100"
          }`}
        >
          <Mail className="w-3 h-3 text-blue-500" />
          <span>With Email</span>
          <span className="text-[10px] opacity-80">({(stats.with_email || 0).toLocaleString()})</span>
        </button>

        {/* Assigned Pill */}
        <button
          onClick={() => setAssignmentFilter(assignmentFilter === "assigned" ? "all" : "assigned")}
          className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            assignmentFilter === "assigned"
              ? "bg-purple-600 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100"
          }`}
        >
          <UserCheck className="w-3 h-3 text-purple-500" />
          <span>Assigned</span>
          <span className="text-[10px] opacity-80">({(stats.assigned || 0).toLocaleString()})</span>
        </button>

        {/* Unassigned Pill */}
        <button
          onClick={() => setAssignmentFilter(assignmentFilter === "unassigned" ? "all" : "unassigned")}
          className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            assignmentFilter === "unassigned"
              ? "bg-slate-700 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100"
          }`}
        >
          <UserPlus className="w-3 h-3 opacity-60" />
          <span>Not Assigned</span>
          <span className="text-[10px] opacity-80">({(stats.unassigned || 0).toLocaleString()})</span>
        </button>

        {/* Notes Pill */}
        <button
          onClick={() => setNotesFilter(notesFilter === "with" ? "all" : "with")}
          className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            notesFilter === "with"
              ? "bg-amber-600 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100"
          }`}
        >
          <StickyNote className="w-3 h-3 text-amber-500" />
          <span>Note Made</span>
          <span className="text-[10px] opacity-80">({(stats.with_notes || 0).toLocaleString()})</span>
        </button>

        {/* Meetings Pill */}
        <button
          onClick={() => setMeetingFilter(meetingFilter === "with" ? "all" : "with")}
          className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            meetingFilter === "with"
              ? "bg-indigo-600 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100"
          }`}
        >
          <Calendar className="w-3 h-3 text-indigo-500" />
          <span>Meetings Scheduled</span>
          <span className="text-[10px] opacity-80">({(stats.with_meetings || 0).toLocaleString()})</span>
        </button>

        {/* Has Tags Pill */}
        <button
          onClick={() => setTagsFilter(tagsFilter === "with" ? "all" : "with")}
          className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            tagsFilter === "with"
              ? "bg-teal-600 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100"
          }`}
        >
          <Tag className="w-3 h-3 text-teal-500" />
          <span>Has Tags</span>
        </button>

        {/* Clear All Button if any filter is active */}
        {activeFiltersCount > 0 && (
          <button
            onClick={handleResetFilters}
            className="ml-auto px-2 py-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset ({activeFiltersCount})</span>
          </button>
        )}
      </div>

      {/* Search Toolbar & Sort & Advanced Filter Toggle */}
      <div className="px-4 py-2.5 bg-white dark:bg-zinc-900 border-b border-slate-200/90 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Search input */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={language === 'es' ? "Buscar por nombre, empresa, teléfono o correo..." : "Search by name, company, phone number, or email..."}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200/90 dark:border-white/10 bg-slate-50 dark:bg-zinc-800/60 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-zinc-200"
          />
        </div>

        {/* Right: Sort Dropdown & Advanced Filter Toggle */}
        <div className="flex items-center gap-2">
          {/* Tag Dropdown Filter with contact counts */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-2.5 py-1">
            <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <select
              value={selectedTags.length === 1 ? selectedTags[0] : ""}
              onChange={e => {
                if (!e.target.value) {
                  setSelectedTags([]);
                } else {
                  setSelectedTags([e.target.value]);
                }
              }}
              className="bg-transparent text-xs font-semibold text-slate-700 dark:text-zinc-200 focus:outline-none cursor-pointer max-w-[170px] truncate"
            >
              <option value="">🏷️ Tags {availableTags.length > 0 ? `(${availableTags.length})` : ""}</option>
              {availableTags.map(({ tag, count }) => (
                <option key={tag} value={tag}>
                  {tag} ({count.toLocaleString()})
                </option>
              ))}
            </select>
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedTags([])}
                className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 p-0.5 cursor-pointer"
                title="Clear tag filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-2.5 py-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs font-semibold text-slate-700 dark:text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="latest">Latest First (Newest)</option>
              <option value="oldest">Oldest First</option>
              <option value="name_asc">Name (A → Z)</option>
              <option value="name_desc">Name (Z → A)</option>
              <option value="more_tags">More Tags (Most Tags)</option>
              <option value="less_tags">Less Tags (Fewest Tags)</option>
            </select>
          </div>

          {/* Advanced Filter Toggle Button */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
              showAdvancedFilters || activeFiltersCount > 0
                ? "bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                : "bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>All Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
            {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Interactive Tags Filter Bar */}
      {availableTags.length > 0 && (
        <div className="px-4 py-2 bg-slate-50/80 dark:bg-zinc-950/80 border-b border-slate-200/90 dark:border-white/10 flex flex-wrap items-center gap-2 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400 font-bold shrink-0">
            <Tag className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[11px] uppercase tracking-wider">Tags:</span>
          </div>

          {/* Top detected tag chips */}
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {availableTags.slice(0, 8).map(({ tag, count }) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleToggleTag(tag)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    active
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700"
                  }`}
                  title={`${count.toLocaleString()} contacts with tag '${tag}'`}
                >
                  <span>{tag}</span>
                  <span className={`text-[10px] px-1 rounded-full ${active ? "bg-indigo-700 text-white" : "bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400"}`}>
                    {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
                  </span>
                  {active && <Check className="w-3 h-3 ml-0.5" />}
                </button>
              );
            })}

            {/* Dropdown for remaining tags */}
            {availableTags.length > 8 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    tagDropdownOpen || selectedTags.some(t => !availableTags.slice(0, 8).some(at => at.tag === t))
                      ? "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300"
                      : "bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100"
                  }`}
                >
                  <span>+{availableTags.length - 8} more tags</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {tagDropdownOpen && (
                  <div className="absolute left-0 mt-1.5 w-72 max-h-80 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 p-2 overflow-y-auto">
                    <div className="sticky top-0 bg-white dark:bg-zinc-900 pb-2 border-b border-slate-100 dark:border-zinc-800 mb-1 flex items-center gap-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 ml-1" />
                      <input
                        type="text"
                        placeholder="Search all tags..."
                        value={tagSearchQuery}
                        onChange={e => setTagSearchQuery(e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      {tagSearchQuery && (
                        <button onClick={() => setTagSearchQuery("")} className="p-1 text-slate-400 hover:text-slate-600">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {availableTags
                        .filter(t => !tagSearchQuery || t.tag.toLowerCase().includes(tagSearchQuery.toLowerCase()))
                        .map(({ tag, count }) => {
                          const active = selectedTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleToggleTag(tag)}
                              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium text-left transition cursor-pointer ${
                                active
                                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold"
                                  : "hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${active ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-300 dark:border-zinc-600"}`}>
                                  {active && <Check className="w-2.5 h-2.5" />}
                                </span>
                                <span className="truncate">{tag}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 dark:text-zinc-500 shrink-0 ml-2">
                                {count.toLocaleString()}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active Tags Match Mode & Clear */}
          {selectedTags.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0 ml-auto border-l border-slate-200 dark:border-zinc-800 pl-2">
              <span className="text-[10px] font-bold text-slate-400">Match:</span>
              <button
                type="button"
                onClick={() => setTagsMode(tagsMode === "any" ? "all" : "any")}
                className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-200 transition cursor-pointer"
                title="Toggle between matching ANY selected tag vs ALL selected tags"
              >
                {tagsMode.toUpperCase()} ({selectedTags.length})
              </button>
              <button
                type="button"
                onClick={handleClearTags}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer flex items-center gap-0.5"
                title="Clear selected tags"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Advanced Filters Expandable Drawer */}
      <AnimatePresence>
        {showAdvancedFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-slate-50/70 dark:bg-zinc-950/60 border-b border-slate-200 dark:border-zinc-800 px-4 py-3 shrink-0"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Filter 1: Email */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                  Email
                </label>
                <select
                  value={emailFilter}
                  onChange={e => setEmailFilter(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-800 dark:text-zinc-200 font-medium"
                >
                  <option value="all">All Contacts</option>
                  <option value="with">With Email Only</option>
                  <option value="without">Without Email</option>
                </select>
              </div>

              {/* Filter 2: Phone */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                  Phone
                </label>
                <select
                  value={phoneFilter}
                  onChange={e => setPhoneFilter(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-800 dark:text-zinc-200 font-medium"
                >
                  <option value="all">All Contacts</option>
                  <option value="with">With Phone Only</option>
                  <option value="without">Without Phone</option>
                </select>
              </div>

              {/* Filter 3: Assigned Status */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                  Assignment
                </label>
                <select
                  value={assignmentFilter}
                  onChange={e => setAssignmentFilter(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-800 dark:text-zinc-200 font-medium"
                >
                  <option value="all">All (Assigned & Unassigned)</option>
                  <option value="assigned">Assigned Only</option>
                  <option value="unassigned">Not Assigned</option>
                </select>
              </div>

              {/* Filter 4: Assigned Owner Specific */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                  Assigned Team Member
                </label>
                <select
                  value={selectedOwnerId}
                  onChange={e => setSelectedOwnerId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-800 dark:text-zinc-200 font-medium"
                >
                  <option value="">All Team Members</option>
                  {usersList.map((user: any) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter 5: Notes & Meetings */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                  Notes & Meetings
                </label>
                <div className="flex gap-2">
                  <select
                    value={notesFilter}
                    onChange={e => setNotesFilter(e.target.value as any)}
                    className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-800 dark:text-zinc-200 font-medium"
                  >
                    <option value="all">Notes: All</option>
                    <option value="with">With Notes</option>
                    <option value="without">No Notes</option>
                  </select>
                  <select
                    value={meetingFilter}
                    onChange={e => setMeetingFilter(e.target.value as any)}
                    className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-800 dark:text-zinc-200 font-medium"
                  >
                    <option value="all">Meetings: All</option>
                    <option value="with">Scheduled</option>
                    <option value="without">None</option>
                  </select>
                </div>
              </div>

              {/* Filter 6: Tags Filter */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                  Tag Dropdown &amp; Search {selectedTags.length > 0 ? `(${selectedTags.length})` : ""}
                </label>
                {/* Tag Select Dropdown with counts */}
                <select
                  value={selectedTags.length === 1 ? selectedTags[0] : ""}
                  onChange={e => {
                    if (!e.target.value) {
                      setSelectedTags([]);
                    } else {
                      setSelectedTags([e.target.value]);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-800 dark:text-zinc-200 mb-1.5 cursor-pointer font-medium"
                >
                  <option value="">-- Select Tag ({availableTags.length} tags) --</option>
                  {availableTags.map(({ tag, count }) => (
                    <option key={tag} value={tag}>
                      {tag} ({count.toLocaleString()} contacts)
                    </option>
                  ))}
                </select>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={tagQuery}
                    onChange={e => setTagQuery(e.target.value)}
                    placeholder="Or type custom tag search..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-800 dark:text-zinc-200"
                  />
                  {tagQuery && (
                    <button
                      onClick={() => setTagQuery("")}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 max-h-16 overflow-y-auto">
                    {selectedTags.map(tg => (
                      <span key={tg} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200">
                        <span>{tg}</span>
                        <button type="button" onClick={() => handleToggleTag(tg)} className="hover:text-rose-500 cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Clear All Filters Button */}
            {activeFiltersCount > 0 && (
              <div className="flex justify-end mt-2.5 pt-2 border-t border-slate-200/60 dark:border-zinc-800/60">
                <button
                  onClick={handleResetFilters}
                  className="px-3 py-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear All Applied Filters</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* List Content */}
      <div className="flex-1 overflow-auto p-3">
        {errorMessage ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500" />
            <p className="text-xs text-rose-500 font-medium">{errorMessage}</p>
            <button
              onClick={() => fetchContacts(searchQuery)}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              {language === 'es' ? "Reintentar" : "Retry"}
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-blue-600 border-t-transparent"></div>
            <span className="text-xs text-slate-400">{language === 'es' ? "Cargando contactos..." : "Loading contacts..."}</span>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mb-2">
              <UsersIcon className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t("contacts.no_contacts_found")}</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 max-w-xs">
              No contacts match your active filter criteria. Try clearing or relaxing some filters.
            </p>
            {activeFiltersCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="mt-3 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {contacts.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                onSelectContact={handleOpenContactActions}
                onAddSubContact={handleAddSubContact}
                onEdit={handleEdit}
                onDelete={handleDeletePrompt}
                onSelectTag={handleToggleTag}
                selectedTags={selectedTags}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {!loading && !errorMessage && totalMatching > 0 && (
        <div className="px-4 py-2.5 bg-white dark:bg-zinc-900 border-t border-slate-200/90 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="text-slate-500 dark:text-zinc-400 font-medium">
            Showing <span className="font-bold text-slate-800 dark:text-zinc-200">{(page - 1) * pageSize + 1}</span> to <span className="font-bold text-slate-800 dark:text-zinc-200">{Math.min(page * pageSize, totalMatching)}</span> of <span className="font-bold text-slate-800 dark:text-zinc-200">{totalMatching.toLocaleString()}</span> contacts (20 per page)
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 font-semibold text-slate-700 dark:text-zinc-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer disabled:cursor-not-allowed transition"
            >
              Previous
            </button>
            <span className="px-2 text-slate-500 dark:text-zinc-400">
              Page <span className="font-bold text-slate-800 dark:text-zinc-200">{page}</span> of <span className="font-bold text-slate-800 dark:text-zinc-200">{totalPages}</span>
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 font-semibold text-slate-700 dark:text-zinc-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer disabled:cursor-not-allowed transition"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* QUICK ACTIONS MODAL (ON TAP / CLICK CONTACT) */}
      <AnimatePresence>
        {selectedContact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
            onClick={() => setSelectedContact(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-4 px-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-900">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold shrink-0">
                    {(selectedContact.first_name || selectedContact.full_name || "C").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {selectedContact.full_name || `${selectedContact.first_name || ""} ${selectedContact.last_name || ""}`.trim()}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                      {selectedContact.designation || "Contact"} {selectedContact.custom_fields?.business_name ? `• ${selectedContact.custom_fields.business_name}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedContact(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Success Notification Banner */}
              {actionSuccessMsg && (
                <div className="mx-4 mt-3 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{actionSuccessMsg}</span>
                </div>
              )}

              {/* Action Tabs */}
              <div className="flex border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 pt-2">
                <button
                  onClick={() => setQuickActionTab("assign")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    quickActionTab === "assign"
                      ? "border-purple-600 text-purple-600 dark:text-purple-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400"
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Assign Owner</span>
                </button>
                <button
                  onClick={() => setQuickActionTab("notes")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    quickActionTab === "notes"
                      ? "border-amber-600 text-amber-600 dark:text-amber-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400"
                  }`}
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  <span>Notes</span>
                </button>
                <button
                  onClick={() => setQuickActionTab("followup")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    quickActionTab === "followup"
                      ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400"
                  }`}
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span>Schedule Follow-up</span>
                </button>
                <button
                  onClick={() => setQuickActionTab("meeting")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    quickActionTab === "meeting"
                      ? "border-blue-600 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400"
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Schedule Meeting</span>
                </button>
              </div>

              {/* Tab Contents */}
              <div className="p-5 overflow-y-auto max-h-[60vh] space-y-4">
                {/* TAB 1: ASSIGN */}
                {quickActionTab === "assign" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl border border-purple-200/60 dark:border-purple-900/40">
                      <div className="text-[11px] font-bold text-purple-900 dark:text-purple-300 uppercase tracking-wider mb-1">Current Assignment</div>
                      <div className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                        {selectedContact.owner_name ? (
                          <span className="font-bold text-purple-700 dark:text-purple-300">Assigned to: {selectedContact.owner_name}</span>
                        ) : (
                          <span className="text-slate-400 italic">No team member currently assigned</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1.5">
                        Select Team Member to Assign
                      </label>
                      <select
                        value={assignedOwnerId}
                        onChange={e => setAssignedOwnerId(e.target.value ? Number(e.target.value) : "")}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-800 dark:text-zinc-200 focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="">-- Unassigned (None) --</option>
                        {usersList.map((user: any) => (
                          <option key={user.id} value={user.id}>
                            {user.name} ({user.role}) - {user.email}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={handleAssignSubmit}
                      disabled={actionSaving}
                      className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{actionSaving ? "Saving Assignment..." : "Save Assignment"}</span>
                    </button>
                  </div>
                )}

                {/* TAB 2: NOTES */}
                {quickActionTab === "notes" && (
                  <div className="space-y-4">
                    {/* Existing Notes Display */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1.5">
                        Existing Contact Notes
                      </label>
                      {selectedContact.notes ? (
                        <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 rounded-xl text-xs text-slate-800 dark:text-zinc-200 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                          {selectedContact.notes}
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-50 dark:bg-zinc-800/40 border border-dashed border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-400 text-center italic">
                          No notes recorded yet for this contact.
                        </div>
                      )}
                    </div>

                    {/* Add Note Input */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1.5">
                        Add New Note
                      </label>
                      <textarea
                        rows={3}
                        value={newNoteText}
                        onChange={e => setNewNoteText(e.target.value)}
                        placeholder="Type discussion notes, updates, or follow-up details..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <button
                      onClick={handleNoteSubmit}
                      disabled={actionSaving || !newNoteText.trim()}
                      className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
                    >
                      <StickyNote className="w-3.5 h-3.5" />
                      <span>{actionSaving ? "Saving Note..." : "Save Note"}</span>
                    </button>
                  </div>
                )}

                {/* TAB: SCHEDULE FOLLOW-UP */}
                {quickActionTab === "followup" && (
                  <form onSubmit={handleScheduleFollowup} className="space-y-3.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                        Follow-up Title
                      </label>
                      <input
                        type="text"
                        required
                        value={followupTitle}
                        onChange={e => setFollowupTitle(e.target.value)}
                        placeholder="e.g. Call about quotation, WhatsApp check-in"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                          Due Date & Time
                        </label>
                        <input
                          type="datetime-local"
                          required
                          value={followupDueAt}
                          onChange={e => setFollowupDueAt(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                          Channel
                        </label>
                        <select
                          value={followupChannel}
                          onChange={e => setFollowupChannel(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-800 dark:text-zinc-200 focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="Call">📞 Call / Phone</option>
                          <option value="WhatsApp">💬 WhatsApp</option>
                          <option value="Email">✉️ Email</option>
                          <option value="Meeting">📹 Meeting</option>
                          <option value="Walk-in">🏢 Walk-in</option>
                          <option value="Webinar">🎯 Webinar</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                          Priority
                        </label>
                        <select
                          value={followupPriority}
                          onChange={e => setFollowupPriority(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-800 dark:text-zinc-200 focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="High">🔴 High Priority</option>
                          <option value="Medium">🟡 Medium Priority</option>
                          <option value="Low">🟢 Low Priority</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                          Assigned Rep / Owner
                        </label>
                        <select
                          value={followupOwnerId}
                          onChange={e => setFollowupOwnerId(e.target.value ? Number(e.target.value) : "")}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-800 dark:text-zinc-200 focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">{selectedContact.owner_name ? `Auto-assigned to: ${selectedContact.owner_name}` : "-- Assign to me / Unassigned --"}</option>
                          {usersList.map((user: any) => (
                            <option key={user.id} value={user.id}>
                              {user.name} ({user.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                        Follow-up Notes / Agenda
                      </label>
                      <textarea
                        rows={2}
                        value={followupNotes}
                        onChange={e => setFollowupNotes(e.target.value)}
                        placeholder="What to discuss, context from last conversation, reminders..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={actionSaving || !followupDueAt}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      <span>{actionSaving ? "Scheduling Follow-up..." : "Schedule Follow-up"}</span>
                    </button>
                  </form>
                )}

                {/* TAB 3: SCHEDULE MEETING */}
                {quickActionTab === "meeting" && (
                  <div className="space-y-3.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                        Meeting Title
                      </label>
                      <input
                        type="text"
                        value={meetingTitle}
                        onChange={e => setMeetingTitle(e.target.value)}
                        placeholder="e.g. Discovery Call"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                          Date & Time
                        </label>
                        <input
                          type="datetime-local"
                          value={meetingDateTime}
                          onChange={e => setMeetingDateTime(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                          Duration
                        </label>
                        <select
                          value={meetingDuration}
                          onChange={e => setMeetingDuration(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        >
                          <option value={15}>15 minutes</option>
                          <option value={30}>30 minutes</option>
                          <option value={45}>45 minutes</option>
                          <option value={60}>60 minutes (1 hour)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                        Meeting Host
                      </label>
                      <select
                        value={meetingHostId}
                        onChange={e => setMeetingHostId(e.target.value ? Number(e.target.value) : "")}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Assign Host (Self / Current User) --</option>
                        {usersList.map((user: any) => (
                          <option key={user.id} value={user.id}>
                            {user.name} ({user.role})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                        Agenda / Meeting Notes
                      </label>
                      <textarea
                        rows={2}
                        value={meetingNotes}
                        onChange={e => setMeetingNotes(e.target.value)}
                        placeholder="Agenda, meeting link, or discussion points..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <button
                      onClick={handleScheduleSubmit}
                      disabled={actionSaving || !meetingDateTime}
                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{actionSaving ? "Scheduling..." : "Schedule Meeting"}</span>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Contact Modal */}
      <AnimatePresence>
        {showDeleteModal && contactToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-xl"
            >
              <div className="flex items-center gap-3 text-red-600 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/50 flex items-center justify-center">
                  <Trash className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">{t("contacts.delete_contact")}</h3>
                  <p className="text-xs text-slate-500">{contactToDelete.full_name || contactToDelete.first_name}</p>
                </div>
              </div>

              {contactToDelete.children_count > 0 ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-600 dark:text-zinc-400">
                    {t("contacts.has_sub_contacts_warning", { count: contactToDelete.children_count })}
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => confirmDelete("reparent")}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-semibold text-left transition"
                    >
                      {t("contacts.move_to_parent")}
                    </button>
                    <button
                      onClick={() => confirmDelete("cascade")}
                      className="w-full py-2.5 px-4 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-semibold text-left transition"
                    >
                      {t("contacts.delete_all_cascade")}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600 dark:text-zinc-400 mb-6">
                  {t("contacts.confirm_delete_simple")}
                </p>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition"
                >
                  {t("contacts.cancel")}
                </button>
                {contactToDelete.children_count === 0 && (
                  <button
                    onClick={() => confirmDelete("cascade")}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition shadow-xs"
                  >
                    {t("contacts.confirm_delete")}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit / Add Contact Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full shadow-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/50 sticky top-0 z-10">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  {form.id ? t("contacts.edit_contact") : form.parent_contact_id ? t("contacts.add_sub_contact") : t("contacts.add_new_contact")}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Names */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.first_name")} *</label>
                    <input type="text" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="e.g. John" required />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.last_name")}</label>
                    <input type="text" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="e.g. Doe" />
                  </div>
                </div>

                {/* Email & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.email")}</label>
                    <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="john@example.com" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.mobile_number")}</label>
                    <input type="tel" value={form.mobile_number} onChange={e => setForm({ ...form, mobile_number: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="+1 234 567 890" />
                  </div>
                </div>

                {/* Designation & Department */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.designation")}</label>
                    <input type="text" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="e.g. VP of Sales" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.department")}</label>
                    <input type="text" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="e.g. Executive" />
                  </div>
                </div>

                {/* Parent Contact Picker */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.reports_to")}</label>
                  <select
                    value={form.parent_contact_id || ""}
                    onChange={e => setForm({ ...form, parent_contact_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                  >
                    <option value="">{t("contacts.none_root_contact")}</option>
                    {allFlatContacts.filter(c => c.id !== form.id).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.full_name || `${c.first_name || ""} ${c.last_name || ""}`} {c.designation ? `(${c.designation})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Connect to Leads (Many-to-Many) */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>{language === 'es' ? 'Vincular a Leads' : 'Connect to Leads'}</span>
                  </label>
                  <div className="max-h-28 overflow-y-auto rounded-xl border border-slate-200 dark:border-zinc-700 p-2 bg-slate-50/50 dark:bg-zinc-950/40 space-y-1">
                    {leadsList.length === 0 ? (
                      <p className="text-xs text-slate-400 py-1 text-center">No leads available</p>
                    ) : (
                      leadsList.map((ld: any) => {
                        const isSelected = form.lead_ids.includes(ld.id);
                        const label = ld.company_name || ld.name || `Lead #${ld.id}`;
                        return (
                          <div
                            key={ld.id}
                            onClick={() => toggleLeadSelection(ld.id)}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 font-bold"
                                : "hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                            }`}
                          >
                            <span className="truncate">{label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Connect to Clients / Accounts (Many-to-Many) */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{language === 'es' ? 'Vincular a Clientes / Cuentas' : 'Connect to Clients / Accounts'}</span>
                  </label>
                  <div className="max-h-28 overflow-y-auto rounded-xl border border-slate-200 dark:border-zinc-700 p-2 bg-slate-50/50 dark:bg-zinc-950/40 space-y-1">
                    {clientsList.length === 0 ? (
                      <p className="text-xs text-slate-400 py-1 text-center">No clients available</p>
                    ) : (
                      clientsList.map((cl: any) => {
                        const isSelected = form.client_ids.includes(cl.id);
                        const label = cl.companyName || cl.projectName || `Client #${cl.id}`;
                        return (
                          <div
                            key={cl.id}
                            onClick={() => toggleClientSelection(cl.id)}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 font-bold"
                                : "hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                            }`}
                          >
                            <span className="truncate">{label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Primary Contact Toggle */}
                {(form.lead_ids.length > 0 || form.client_ids.length > 0) && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="form_is_primary"
                      checked={form.is_primary}
                      onChange={e => setForm({ ...form, is_primary: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="form_is_primary" className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      {language === 'es' ? 'Marcar como contacto principal para estas cuentas' : 'Mark as primary contact for linked accounts'}
                    </label>
                  </div>
                )}

                {/* Social links */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.linkedin_url")}</label>
                    <input type="text" value={form.linkedin_url || ""} onChange={e => setForm({ ...form, linkedin_url: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="https://linkedin.com/in/..." />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.twitter_url")}</label>
                    <input type="text" value={form.twitter_url || ""} onChange={e => setForm({ ...form, twitter_url: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="https://twitter.com/..." />
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 flex justify-end gap-2.5 rounded-b-2xl sticky bottom-0">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 font-bold text-xs hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                  {t("contacts.cancel")}
                </button>
                <button
                  onClick={handleSaveContact}
                  disabled={saving || !form.first_name.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-50 transition-colors shadow-sm"
                >
                  {saving ? t("contacts.saving") : t("contacts.save_contact")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
