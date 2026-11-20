"use client";

import React, { useState, useEffect } from "react";
import { Users, Plus, Star, UserPlus, Phone, Mail, Building2, Trash2, Check, X, ExternalLink } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";

interface LinkedContactsProps {
  leadId?: string;
  clientId?: string;
}

const getAuthHeaders = (extra: Record<string, string> = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export default function LinkedContacts({ leadId, clientId }: LinkedContactsProps) {
  const { language } = useLanguage();
  const [links, setLinks] = useState<any[]>([]);
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<"link" | "create">("create");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Link existing form state
  const [selectedContactId, setSelectedContactId] = useState("");
  const [roleInput, setRoleInput] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  // Create new contact form state
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDesignation, setNewDesignation] = useState("");

  useEffect(() => {
    fetchLinks();
    fetchContactsFlat();
  }, [leadId, clientId]);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const endpoint = leadId ? `/leads/${leadId}/contacts` : `/clients/${clientId}/contacts`;
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setLinks(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Error fetching linked contacts:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchContactsFlat = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts?flat=true`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAllContacts(Array.isArray(data) ? data : data.contacts || []);
      }
    } catch (e) {
      console.error("Error fetching flat contacts:", e);
    }
  };

  const handleLinkExisting = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedContactId) return;
    setSubmitting(true);
    try {
      const endpoint = leadId ? `/leads/${leadId}/contacts` : `/clients/${clientId}/contacts`;
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          contact_id: Number(selectedContactId),
          role_at_company: roleInput.trim() || undefined,
          is_primary: isPrimary
        })
      });
      if (res.ok) {
        setShowAdd(false);
        setSelectedContactId("");
        setRoleInput("");
        setIsPrimary(false);
        fetchLinks();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateNew = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newFirstName.trim()) return;
    setSubmitting(true);
    try {
      const payload: any = {
        first_name: newFirstName.trim(),
        last_name: newLastName.trim() || undefined,
        email: newEmail.trim() || undefined,
        mobile_number: newPhone.trim() || undefined,
        designation: newDesignation.trim() || undefined,
        role_at_company: newDesignation.trim() || undefined,
        is_primary: isPrimary,
      };

      if (leadId) {
        payload.lead_ids = [Number(leadId)];
        payload.lead_id = Number(leadId);
      }
      if (clientId) {
        payload.client_ids = [Number(clientId)];
        payload.client_id = Number(clientId);
      }

      const res = await fetch(`${API_BASE_URL}/contacts`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowAdd(false);
        setNewFirstName("");
        setNewLastName("");
        setNewEmail("");
        setNewPhone("");
        setNewDesignation("");
        setIsPrimary(false);
        fetchLinks();
        fetchContactsFlat();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlink = async (contactId: number) => {
    const confirmMsg = language === "es"
      ? "¿Estás seguro de que deseas desvincular este contacto?"
      : "Are you sure you want to unlink this contact?";
    if (!confirm(confirmMsg)) return;

    try {
      const endpoint = leadId
        ? `/leads/${leadId}/contacts/${contactId}`
        : `/clients/${clientId}/contacts/${contactId}`;
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        fetchLinks();
      }
    } catch (e) {
      console.error("Error unlinking contact:", e);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 shadow-sm mt-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Users size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
              {language === "es" ? "Contactos Asociados" : "Linked Contacts"}
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              {links.length} {language === "es" ? "contacto(s) vinculado(s)" : "contact(s) linked"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
            showAdd
              ? "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
          }`}
        >
          {showAdd ? <X size={14} /> : <Plus size={14} />}
          <span>
            {showAdd
              ? (language === "es" ? "Cerrar" : "Cancel")
              : (language === "es" ? "Añadir Contacto" : "Add Contact")}
          </span>
        </button>
      </div>

      {/* Add / Link Modal Accordion */}
      {showAdd && (
        <div className="mb-5 p-4 bg-slate-50 dark:bg-zinc-950 rounded-2xl border border-indigo-100 dark:border-zinc-800 shadow-inner">
          <div className="flex border-b border-slate-200 dark:border-zinc-800 mb-4 pb-2 gap-2">
            <button
              type="button"
              onClick={() => setAddMode("create")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                addMode === "create"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800"
              }`}
            >
              {language === "es" ? "➕ Crear Nuevo Contacto" : "➕ Create New Contact"}
            </button>
            <button
              type="button"
              onClick={() => setAddMode("link")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                addMode === "link"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800"
              }`}
            >
              {language === "es" ? "🔗 Vincular Existente" : "🔗 Link Existing Contact"}
            </button>
          </div>

          {addMode === "create" ? (
            <form onSubmit={handleCreateNew} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                    {language === "es" ? "Nombre *" : "First Name *"}
                  </label>
                  <input
                    type="text"
                    required
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="e.g. John"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                    {language === "es" ? "Apellido" : "Last Name"}
                  </label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="e.g. Doe"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                    {language === "es" ? "Correo Electrónico" : "Email"}
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="e.g. john@company.com"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                    {language === "es" ? "Teléfono / Móvil" : "Phone / Mobile"}
                  </label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="e.g. +1 555-0199"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                  {language === "es" ? "Cargo / Puesto" : "Designation / Role"}
                </label>
                <input
                  type="text"
                  value={newDesignation}
                  onChange={(e) => setNewDesignation(e.target.value)}
                  placeholder="e.g. Chief Marketing Officer"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="new_is_primary"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="new_is_primary" className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  {language === "es" ? "Marcar como contacto principal" : "Set as primary contact"}
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || !newFirstName.trim()}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <Check size={14} />
                  <span>{submitting ? "Saving..." : (language === "es" ? "Guardar y Vincular" : "Create & Link Contact")}</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLinkExisting} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                  {language === "es" ? "Seleccionar Contacto *" : "Select Contact *"}
                </label>
                <select
                  value={selectedContactId}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">{language === "es" ? "-- Selecciona un contacto existente --" : "-- Select an existing contact --"}</option>
                  {allContacts.map((c) => {
                    const cName = c.full_name || `${c.first_name} ${c.last_name || ""}`.trim();
                    const extra = [c.designation, c.email, c.mobile_number].filter(Boolean).join(" • ");
                    return (
                      <option key={c.id} value={c.id}>
                        {cName} {extra ? `(${extra})` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                  {language === "es" ? "Rol en esta cuenta" : "Role at this company"}
                </label>
                <input
                  type="text"
                  placeholder={language === "es" ? "e.g. Gerente de Compras" : "e.g. Purchasing Manager"}
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="link_is_primary"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="link_is_primary" className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  {language === "es" ? "Marcar como contacto principal" : "Set as primary contact"}
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || !selectedContactId}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <Check size={14} />
                  <span>{submitting ? "Linking..." : (language === "es" ? "Vincular Contacto" : "Link Contact")}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Linked Contacts Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
          <span className="text-xs text-slate-400">{language === "es" ? "Cargando contactos..." : "Loading contacts..."}</span>
        </div>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40">
          <UserPlus size={32} className="text-slate-300 dark:text-zinc-600 mb-2" />
          <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">
            {language === "es" ? "Aún no hay contactos vinculados" : "No contacts linked yet"}
          </p>
          <p className="text-xs text-slate-400 dark:text-zinc-400 mt-1 max-w-sm">
            {language === "es"
              ? "Crea o vincula contactos a esta cuenta para rastrear tomadores de decisiones y partes interesadas."
              : "Create or link contacts to this account to track key decision makers and stakeholders."}
          </p>
          <button
            onClick={() => {
              setShowAdd(true);
              setAddMode("create");
            }}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shadow-sm"
          >
            <Plus size={14} />
            <span>{language === "es" ? "Añadir Primer Contacto" : "Add First Contact"}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const c = link.contact || {};
            const contactName = c.full_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || `Contact #${c.id || link.link_id}`;
            const initials = (c.first_name?.[0] || contactName[0] || "?").toUpperCase();
            const phone = c.mobile_number || c.alternate_number || c.phone;
            const otherLeads = (c.linked_leads || []).filter((l: any) => String(l.id) !== String(leadId));
            const otherClients = (c.linked_clients || []).filter((cl: any) => String(cl.id) !== String(clientId));

            return (
              <div
                key={link.link_id || c.id}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-zinc-950/70 hover:bg-slate-100 dark:hover:bg-zinc-950 rounded-2xl border border-slate-200/80 dark:border-zinc-800 transition-all shadow-xs"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800 flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {contactName}
                      </span>
                      {link.is_primary && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <Star size={10} className="fill-amber-400 text-amber-400" />
                          <span>{language === "es" ? "Principal" : "Primary"}</span>
                        </span>
                      )}
                      {(link.role || c.designation) && (
                        <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                          • {link.role || c.designation}
                        </span>
                      )}
                    </div>

                    {/* Email and Phone */}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs">
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          <Mail size={12} />
                          <span className="truncate max-w-[200px]">{c.email}</span>
                        </a>
                      )}
                      {phone && (
                        <a
                          href={`tel:${phone}`}
                          className="flex items-center gap-1 text-slate-600 dark:text-zinc-300 hover:text-indigo-600 font-medium"
                        >
                          <Phone size={12} />
                          <span>{phone}</span>
                        </a>
                      )}
                    </div>

                    {/* Other Linked Companies / Badges */}
                    {(otherLeads.length > 0 || otherClients.length > 0) && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold">
                          <Building2 size={11} />
                          {language === "es" ? "También en:" : "Also at:"}
                        </span>
                        {otherLeads.map((ol: any) => (
                          <Link
                            key={`lead-${ol.id}`}
                            href={`/leads/${ol.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900 hover:underline"
                          >
                            <span>{ol.name}</span>
                            <ExternalLink size={9} />
                          </Link>
                        ))}
                        {otherClients.map((oc: any) => (
                          <Link
                            key={`client-${oc.id}`}
                            href={`/admin/clients/${oc.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900 hover:underline"
                          >
                            <span>{oc.name}</span>
                            <ExternalLink size={9} />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Link
                    href={`/contacts`}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-zinc-900 transition-colors"
                    title={language === "es" ? "Ver en Directorio de Contactos" : "View in Contacts Directory"}
                  >
                    <ExternalLink size={15} />
                  </Link>
                  <button
                    onClick={() => handleUnlink(c.id)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    title={language === "es" ? "Desvincular contacto" : "Unlink contact"}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
