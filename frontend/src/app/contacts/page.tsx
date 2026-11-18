"use client";

import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Filter, Users as UsersIcon, Mail, Phone, Globe,
  Linkedin, Twitter, MoreVertical, Tag, ChevronDown, ChevronRight,
  CornerDownRight, Trash, Edit, AlertCircle, Building2, ExternalLink,
  Briefcase, Star, Check
} from "lucide-react";

const getAuthHeaders = (extra: Record<string, string> = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const ContactRow = ({ contact, depth = 0, onAddSubContact, onEdit, onDelete, onAddNote }: any) => {
  const { t, language } = useLanguage();
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
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3.5 shadow-2xs hover:shadow-xs hover:border-blue-500/60 dark:hover:border-blue-500/50 transition-all duration-150 group mb-1.5 flex flex-wrap md:flex-nowrap items-center justify-between gap-3">
        {/* Left: Expander + Depth Icon + Avatar + Info */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {!isSearchResult && contact.children_count > 0 ? (
            <button
              onClick={toggleExpand}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 transition-colors shrink-0"
              title={expanded ? "Collapse sub-contacts" : "Expand sub-contacts"}
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <div className="w-5 shrink-0" />
          )}

          {depth > 0 && <CornerDownRight className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-600 shrink-0" />}

          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-900 dark:text-white text-[13px] leading-tight truncate">
                {contactName}
              </span>
              {contact.children_count > 0 && !isSearchResult && (
                <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40 px-1.5 py-0.2 rounded font-semibold whitespace-nowrap">
                  {contact.children_count} {t("contacts.sub_contacts")}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
              <span>{contact.designation || t("contacts.no_title")}</span>
              {contact.department && <span>• {contact.department}</span>}
              {isSearchResult && contact.hierarchy_path && (
                <span className="text-indigo-500 font-medium">({contact.hierarchy_path})</span>
              )}
            </div>

            {/* Linked Companies / Leads Badges */}
            {(linkedLeads.length > 0 || linkedClients.length > 0) && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {linkedLeads.map((lead: any) => (
                  <Link
                    key={`l-${lead.id}`}
                    href={`/leads/${lead.id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-900 hover:bg-blue-100 transition-colors"
                  >
                    <Building2 className="w-2.5 h-2.5" />
                    <span className="truncate max-w-[120px]">{lead.name}</span>
                    {lead.is_primary && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />}
                    <ExternalLink className="w-2 h-2 opacity-60" />
                  </Link>
                ))}
                {linkedClients.map((client: any) => (
                  <Link
                    key={`c-${client.id}`}
                    href={`/admin/clients/${client.id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-900 hover:bg-emerald-100 transition-colors"
                  >
                    <Briefcase className="w-2.5 h-2.5" />
                    <span className="truncate max-w-[120px]">{client.name}</span>
                    {client.is_primary && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />}
                    <ExternalLink className="w-2 h-2 opacity-60" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: Contact info (Email & Phone) */}
        <div className="flex flex-col text-[11px] text-slate-600 dark:text-zinc-300 min-w-[160px] shrink-0">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="truncate flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
            >
              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{contact.email}</span>
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="truncate flex items-center gap-1.5 text-slate-600 dark:text-zinc-300 font-medium hover:text-indigo-600 mt-1"
            >
              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{phone}</span>
            </a>
          )}
        </div>

        {/* Social Links */}
        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          {contact.linkedin_url && (
            <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-500 hover:text-blue-600 transition-colors" title="LinkedIn">
              <Linkedin className="w-3.5 h-3.5" />
            </a>
          )}
          {contact.twitter_url && (
            <a href={contact.twitter_url} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-sky-50 dark:hover:bg-sky-950/40 text-sky-500 hover:text-sky-600 transition-colors" title="Twitter">
              <Twitter className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onAddSubContact(contact)} title={t("contacts.add_sub_contact")} className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onEdit(contact)} title={t("contacts.edit")} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors">
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(contact)} title={t("contacts.delete")} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors">
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
              onAddSubContact={onAddSubContact}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddNote={onAddNote}
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
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    root: 0,
    with_email: 0,
    with_phone: 0
  });
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<any>(null);

  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  // Lazy-load modal options (leads, clients, flat contacts for parent picker) ONLY when modal opens
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

  const fetchContacts = async (query = "") => {
    setLoading(true);
    setErrorMessage(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const q = query && query.trim() ? `?search=${encodeURIComponent(query.trim())}` : "";
      const res = await fetch(`${API_BASE_URL}/contacts${q}`, {
        headers: getAuthHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const contactList = Array.isArray(data) ? data : data.contacts || [];
        setContacts(contactList);
        if (data.stats) {
          setStats(data.stats);
        } else {
          setStats({
            total: contactList.length,
            root: contactList.filter((c: any) => !c.parent_contact_id).length,
            with_email: contactList.filter((c: any) => c.email).length,
            with_phone: contactList.filter((c: any) => c.mobile_number || c.alternate_number).length
          });
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

  // Debounced search effect
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchContacts(searchQuery);
    }, 250);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleAddNote = async (contact: any) => {
    const note = prompt(t("contacts.enter_note"));
    if (note) {
      const newNotes = contact.notes ? contact.notes + "\n" + note : note;
      try {
        await fetch(`${API_BASE_URL}/contacts/${contact.id}`, {
          method: "PUT",
          headers: getAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ notes: newNotes })
        });
        fetchContacts(searchQuery);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleAddSubContact = (parentContact: any) => {
    setForm({ ...emptyForm, parent_contact_id: parentContact.id });
    setShowModal(true);
  };

  const handleEdit = (contact: any) => {
    const linkedLeadIds = (contact.linked_leads || []).map((l: any) => l.id);
    const linkedClientIds = (contact.linked_clients || []).map((c: any) => c.id);
    const hasPrimary = (contact.linked_leads || []).some((l: any) => l.is_primary) || (contact.linked_clients || []).some((c: any) => c.is_primary);

    setForm({
      id: contact.id,
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      email: contact.email || "",
      mobile_number: contact.mobile_number || "",
      designation: contact.designation || "",
      department: contact.department || "",
      linkedin_url: contact.linkedin_url || "",
      twitter_url: contact.twitter_url || "",
      parent_contact_id: contact.parent_contact_id || null,
      lead_ids: linkedLeadIds,
      client_ids: linkedClientIds,
      is_primary: hasPrimary
    });
    setShowModal(true);
  };

  const handleDeletePrompt = (contact: any) => {
    setContactToDelete(contact);
    setShowDeleteModal(true);
  };

  const executeDelete = async (action: 'cascade' | 'move_to_parent') => {
    if (!contactToDelete) return;
    try {
      await fetch(`${API_BASE_URL}/contacts/${contactToDelete.id}?action=${action}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setShowDeleteModal(false);
      setContactToDelete(null);
      fetchContacts(searchQuery);
      fetchAuxiliaryData();
    } catch (e) {
      console.error(e);
      alert(t("contacts.error_deleting"));
    }
  };

  const toggleLeadSelection = (leadId: number) => {
    const cur = [...form.lead_ids];
    const idx = cur.indexOf(leadId);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(leadId);
    setForm({ ...form, lead_ids: cur });
  };

  const toggleClientSelection = (clientId: number) => {
    const cur = [...form.client_ids];
    const idx = cur.indexOf(clientId);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(clientId);
    setForm({ ...form, client_ids: cur });
  };

  const handleSaveContact = async () => {
    if (!form.first_name.trim()) return;
    setSaving(true);
    const payload: any = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || undefined,
      designation: form.designation.trim() || undefined,
      department: form.department.trim() || undefined,
      email: form.email.trim() || undefined,
      mobile_number: form.mobile_number.trim() || undefined,
      linkedin_url: form.linkedin_url.trim() || undefined,
      twitter_url: form.twitter_url.trim() || undefined,
      parent_contact_id: form.parent_contact_id,
      lead_ids: form.lead_ids,
      client_ids: form.client_ids,
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
      {/* Compact Executive Header */}
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
          <button
            onClick={() => { setForm(emptyForm); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("contacts.add_contact")}</span>
          </button>
        </div>
      </div>

      {/* 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-50/60 dark:bg-zinc-950/40 border-b border-slate-200/90 dark:border-white/10 shrink-0">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl px-3 py-2 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <UsersIcon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-bold leading-none truncate">Total Contacts</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{stats.total || allFlatContacts.length || contacts.length}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl px-3 py-2 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Tag className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-bold leading-none truncate">Root Contacts</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{stats.root || contacts.length}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl px-3 py-2 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Mail className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-bold leading-none truncate">With Email</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{stats.with_email || allFlatContacts.filter(c => c.email).length}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl px-3 py-2 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Phone className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-bold leading-none truncate">With Phone</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{stats.with_phone || allFlatContacts.filter(c => c.mobile_number).length}</div>
          </div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="px-4 py-2.5 bg-white dark:bg-zinc-900 border-b border-slate-200/90 dark:border-white/10 flex items-center gap-3 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder={language === 'es' ? "Buscar por nombre, empresa, teléfono o correo..." : "Search by name, company, phone number, or email..."} 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200/90 dark:border-white/10 bg-slate-50 dark:bg-zinc-800/60 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-zinc-200"
          />
        </div>
        {searchQuery && (
          <span className="text-[11px] text-slate-400 font-medium">
            {contacts.length} {language === 'es' ? "resultado(s)" : "result(s)"}
          </span>
        )}
      </div>

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
              {t("contacts.no_contacts_matching")}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {contacts.map((contact) => (
              <ContactRow 
                key={contact.id} 
                contact={contact} 
                onAddSubContact={handleAddSubContact}
                onEdit={handleEdit}
                onDelete={handleDeletePrompt}
                onAddNote={handleAddNote}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && contactToDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-5">
              <div className="flex items-center gap-2.5 mb-3 text-red-600">
                <AlertCircle className="w-5 h-5" />
                <h2 className="text-base font-bold">{t("contacts.delete_contact")}</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-zinc-300 mb-5">
                {t("contacts.delete_confirm_1")} <strong>{contactToDelete.full_name}</strong>{t("contacts.delete_confirm_2")}
                {contactToDelete.children_count > 0 && (
                  <span className="block mt-2 text-amber-600 dark:text-amber-500 font-medium text-xs">
                    {t("contacts.has_sub_contacts")} {contactToDelete.children_count} {t("contacts.sub_contacts_suffix")}
                  </span>
                )}
              </p>
              <div className="flex flex-col gap-2">
                {contactToDelete.children_count > 0 && (
                  <button onClick={() => executeDelete('move_to_parent')} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-xs transition-colors">
                    {t("contacts.delete_and_move")}
                  </button>
                )}
                <button onClick={() => executeDelete('cascade')} className="w-full px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors shadow-2xs">
                  {contactToDelete.children_count > 0 ? t("contacts.delete_contact_and_all") : t("contacts.delete_contact")}
                </button>
                <button onClick={() => setShowDeleteModal(false)} className="w-full px-3 py-2 rounded-xl font-bold text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300 text-xs transition-colors">
                  {t("contacts.cancel")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add / Edit Contact Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 16 }}
              className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center sticky top-0 bg-white dark:bg-zinc-900 z-10">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {form.id ? t("contacts.edit_contact") : t("contacts.add_new_contact")}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                  <UsersIcon className="w-4 h-4"/>
                </button>
              </div>
              <div className="p-5 space-y-4">
                
                {/* Parent Contact Dropdown for Hierarchy */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5 block">{t("contacts.parent_contact")}</label>
                  <select 
                    value={form.parent_contact_id || ""} 
                    onChange={e => setForm({...form, parent_contact_id: e.target.value ? parseInt(e.target.value) : null})} 
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                  >
                    <option value="">{t("contacts.none_root")}</option>
                    {allFlatContacts.map(c => {
                      if (c.id === form.id) return null;
                      return (
                        <option key={c.id} value={c.id}>{c.full_name || `${c.first_name} ${c.last_name || ""}`} {c.hierarchy_path ? `(${c.hierarchy_path})` : ''}</option>
                      )
                    })}
                  </select>
                </div>

                {/* Name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.first_name")} *</label>
                    <input value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="First name" required />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.last_name")}</label>
                    <input value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="Last name" />
                  </div>
                </div>

                {/* Email and Phone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.email")}</label>
                    <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="email@company.com" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.mobile_number")}</label>
                    <input value={form.mobile_number} onChange={e => setForm({...form, mobile_number: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="+1 555-0199" />
                  </div>
                </div>

                {/* Designation and Department */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.designation")}</label>
                    <input value={form.designation} onChange={e => setForm({...form, designation: e.target.value})} placeholder="e.g. CEO / Director" className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.department")}</label>
                    <input value={form.department} onChange={e => setForm({...form, department: e.target.value})} placeholder="e.g. Executive, Sales" className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                </div>

                {/* Connect to Leads / Prospects (Many-to-Many) */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>{language === 'es' ? 'Vincular a Leads / Prospectos' : 'Connect to Leads / Prospects'}</span>
                  </label>
                  <div className="max-h-28 overflow-y-auto rounded-xl border border-slate-200 dark:border-zinc-700 p-2 bg-slate-50/50 dark:bg-zinc-950/40 space-y-1">
                    {leadsList.length === 0 ? (
                      <p className="text-xs text-slate-400 py-1 text-center">No leads available</p>
                    ) : (
                      leadsList.map((ld: any) => {
                        const isSelected = form.lead_ids.includes(ld.id);
                        const label = ld.company_name || ld.contact_person || `Lead #${ld.id}`;
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.linkedin_url")}</label>
                    <input type="text" value={form.linkedin_url || ""} onChange={e => setForm({...form, linkedin_url: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="https://linkedin.com/in/..." />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.twitter_url")}</label>
                    <input type="text" value={form.twitter_url || ""} onChange={e => setForm({...form, twitter_url: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" placeholder="https://twitter.com/..." />
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
