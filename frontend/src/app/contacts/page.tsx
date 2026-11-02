"use client";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Filter, Users as UsersIcon, Mail, Phone, Globe, Linkedin, Twitter, MoreVertical, Tag, ChevronDown, ChevronRight, CornerDownRight, Trash, Edit, AlertCircle } from "lucide-react";

const ContactRow = ({ contact, depth = 0, onAddSubContact, onEdit, onDelete, onAddNote }: any) => {
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
        const res = await fetch(`${API_BASE_URL}/contacts/${contact.id}/children`);
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

  const initials = (contact.full_name || contact.first_name || 'C').charAt(0).toUpperCase();

  return (
    <div className="flex flex-col" style={{ marginLeft: depth > 0 ? `${Math.min(depth * 18, 72)}px` : undefined }}>
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2 px-3 shadow-2xs hover:shadow-xs hover:border-blue-500/60 dark:hover:border-blue-500/50 transition-all duration-150 group mb-1.5 flex items-center justify-between gap-3">
        {/* Left: Expander + Depth Icon + Avatar + Info */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
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

          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/40 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-slate-900 dark:text-white text-[13px] leading-tight truncate">
                {contact.full_name || t("contacts.unknown")}
              </span>
              {contact.children_count > 0 && !isSearchResult && (
                <span className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40 px-1.5 py-0.2 rounded font-semibold whitespace-nowrap">
                  {contact.children_count} {t("contacts.sub_contacts")}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
              {contact.designation || t("contacts.no_title")}
              {contact.department && ` • ${contact.department}`}
              {isSearchResult && contact.hierarchy_path && (
                <span className="text-blue-500 ml-1 font-medium">({contact.hierarchy_path})</span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Contact info (Email & Phone) */}
        <div className="hidden sm:flex flex-col text-[11px] text-slate-600 dark:text-zinc-300 min-w-0 max-w-[200px] shrink-0">
          {contact.email ? (
            <span className="truncate flex items-center gap-1">
              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{contact.email}</span>
            </span>
          ) : null}
          {contact.mobile_number ? (
            <span className="truncate flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
              <Phone className="w-2.5 h-2.5 text-slate-400 shrink-0" />
              <span className="truncate">{contact.mobile_number}</span>
            </span>
          ) : null}
        </div>

        {/* Social Links */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
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
          <button onClick={() => onAddSubContact(contact)} title={t("contacts.add_sub_contact")} className="p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onEdit(contact)} title={t("contacts.edit")} className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors">
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(contact)} title={t("contacts.delete")} className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors">
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
            <div className="text-xs text-slate-400 py-1 px-4 italic" style={{ marginLeft: `${(depth + 1) * 18}px` }}>
              {t("contacts.loading")}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function ContactsPage() {
  const { t } = useLanguage();
  const [contacts, setContacts] = useState<any[]>([]);
  const [allFlatContacts, setAllFlatContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<any>(null);
  
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const emptyForm = {
    id: null,
    first_name: "", last_name: "", email: "", mobile_number: "", designation: "", department: "", linkedin_url: "", twitter_url: "",
    parent_contact_id: null
  };
  const [form, setForm] = useState<any>(emptyForm);

  useEffect(() => {
    fetchContacts();
    fetchAllContactsFlat();
  }, []);

  const fetchContacts = async (query = "") => {
    setLoading(true);
    try {
      const q = query ? `?search=${encodeURIComponent(query)}` : "";
      const res = await fetch(`${API_BASE_URL}/contacts${q}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(Array.isArray(data) ? data : data.contacts || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllContactsFlat = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts?search=`);
      if (res.ok) {
        const data = await res.json();
        setAllFlatContacts(Array.isArray(data) ? data : data.contacts || []);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchContacts(searchQuery);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleAddNote = async (contact: any) => {
    const note = prompt(t("contacts.enter_note"));
    if (note) {
      const newNotes = contact.notes ? contact.notes + "\n" + note : note;
      try {
        await fetch(`${API_BASE_URL}/contacts/${contact.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
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
      parent_contact_id: contact.parent_contact_id || null
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
        method: "DELETE"
      });
      setShowDeleteModal(false);
      setContactToDelete(null);
      fetchContacts(searchQuery);
      fetchAllContactsFlat();
    } catch (e) {
      console.error(e);
      alert(t("contacts.error_deleting"));
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-black rounded-xl overflow-hidden shadow-2xs border border-slate-200/90 dark:border-white/10">
      {/* Compact Executive Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 border-b border-slate-200/90 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <UsersIcon className="w-3.5 h-3.5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">{t("contacts.title")}</h1>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-none mt-0.5 truncate">{t("contacts.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setForm(emptyForm); setShowModal(true); }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-2xs transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("contacts.add_contact")}</span>
          </button>
        </div>
      </div>

      {/* Compact 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50/60 dark:bg-zinc-950/40 border-b border-slate-200/90 dark:border-white/10 shrink-0">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-lg px-2.5 py-1.5 flex items-center gap-2 shadow-2xs">
          <div className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <UsersIcon className="w-3 h-3" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Total Contacts</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{allFlatContacts.length || contacts.length}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-lg px-2.5 py-1.5 flex items-center gap-2 shadow-2xs">
          <div className="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Tag className="w-3 h-3" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Root Contacts</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{contacts.length}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-lg px-2.5 py-1.5 flex items-center gap-2 shadow-2xs">
          <div className="w-6 h-6 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Mail className="w-3 h-3" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">With Email</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{allFlatContacts.filter(c => c.email).length}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-lg px-2.5 py-1.5 flex items-center gap-2 shadow-2xs">
          <div className="w-6 h-6 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Phone className="w-3 h-3" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">With Phone</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{allFlatContacts.filter(c => c.mobile_number).length}</div>
          </div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="px-3 py-2 bg-white dark:bg-zinc-900 border-b border-slate-200/90 dark:border-white/10 flex items-center gap-2 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder={t("contacts.search_placeholder")} 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 rounded-lg border border-slate-200/90 dark:border-white/10 bg-slate-50 dark:bg-zinc-800/60 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-zinc-200"
          />
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600"></div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mb-2">
              <UsersIcon className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t("contacts.no_contacts_found")}</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 max-w-xs">
              {t("contacts.no_contacts_matching")}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
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
              className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xl w-full max-w-md p-5">
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
                  <button onClick={() => executeDelete('move_to_parent')} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-xs transition-colors">
                    {t("contacts.delete_and_move")}
                  </button>
                )}
                <button onClick={() => executeDelete('cascade')} className="w-full px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-colors shadow-2xs">
                  {contactToDelete.children_count > 0 ? t("contacts.delete_contact_and_all") : t("contacts.delete_contact")}
                </button>
                <button onClick={() => setShowDeleteModal(false)} className="w-full px-3 py-2 rounded-lg font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300 text-xs transition-colors">
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
              className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center sticky top-0 bg-white dark:bg-zinc-900 z-10">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {form.id ? t("contacts.edit_contact") : t("contacts.add_new_contact")}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><UsersIcon className="w-4 h-4"/></button>
              </div>
              <div className="p-4 space-y-3.5">
                
                {/* Parent Contact Dropdown for Hierarchy */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.parent_contact")}</label>
                  <select 
                    value={form.parent_contact_id || ""} 
                    onChange={e => setForm({...form, parent_contact_id: e.target.value ? parseInt(e.target.value) : null})} 
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white"
                  >
                    <option value="">{t("contacts.none_root")}</option>
                    {allFlatContacts.map(c => {
                      if (c.id === form.id) return null;
                      return (
                        <option key={c.id} value={c.id}>{c.full_name} {c.hierarchy_path ? `(${c.hierarchy_path})` : ''}</option>
                      )
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.first_name")}</label>
                    <input value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.last_name")}</label>
                    <input value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.email")}</label>
                    <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.mobile_number")}</label>
                    <input value={form.mobile_number} onChange={e => setForm({...form, mobile_number: e.target.value})} className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.designation")}</label>
                    <input value={form.designation} onChange={e => setForm({...form, designation: e.target.value})} placeholder="e.g. CEO" className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.department")}</label>
                    <input value={form.department} onChange={e => setForm({...form, department: e.target.value})} placeholder="e.g. Sales" className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.linkedin_url")}</label>
                    <input type="text" value={form.linkedin_url || ""} onChange={e => setForm({...form, linkedin_url: e.target.value})} className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1 block">{t("contacts.twitter_url")}</label>
                    <input type="text" value={form.twitter_url || ""} onChange={e => setForm({...form, twitter_url: e.target.value})} className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                </div>

              </div>
              <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 flex justify-end gap-2.5 rounded-b-xl sticky bottom-0">
                <button onClick={() => setShowModal(false)} className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">{t("contacts.cancel")}</button>
                <button onClick={async () => {
                  if (!form.first_name.trim()) return;
                  setSaving(true);
                  const payload: any = {
                    first_name: form.first_name,
                    last_name: form.last_name,
                    email: form.email,
                    mobile_number: form.mobile_number,
                    department: form.department,
                    linkedin_url: form.linkedin_url,
                    twitter_url: form.twitter_url,
                    parent_contact_id: form.parent_contact_id
                  };
                  try {
                    const method = form.id ? "PUT" : "POST";
                    const url = form.id ? `${API_BASE_URL}/contacts/${form.id}` : `${API_BASE_URL}/contacts`;
                    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                    if (!res.ok) {
                      const err = await res.json();
                      alert(err.detail || t("contacts.error_saving"));
                      setSaving(false);
                      return;
                    }
                    setShowModal(false);
                    setForm(emptyForm);
                    fetchContacts(searchQuery);
                    fetchAllContactsFlat();
                  } catch (e) { console.error(e); } finally { setSaving(false); }
                }} disabled={saving || !form.first_name} className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-2xs">
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
