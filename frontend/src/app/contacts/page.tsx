"use client";
import { API_BASE_URL } from "@/config";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Filter, Users as UsersIcon, Mail, Phone, Globe, Linkedin, MoreVertical, Tag } from "lucide-react";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  
  const emptyForm = {
    first_name: "", last_name: "", email: "", mobile_number: "", designation: "", department: "",
    assignment_type: "none", // none, client, lead, create_lead
    client_id: "", lead_id: ""
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchContacts();
    fetch(`${API_BASE_URL}/leads`).then(r => r.json()).then(data => setLeads(data.leads || []));
    fetch(`${API_BASE_URL}/clients`).then(r => r.json()).then(data => setClients(data.clients || []));
  }, []);

  const fetchContacts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (contact: any) => {
    const note = prompt("Enter note for this contact:");
    if (note) {
      const newNotes = contact.notes ? contact.notes + "\n" + note : note;
      try {
        await fetch(`${API_BASE_URL}/contacts/${contact.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: newNotes })
        });
        fetchContacts();
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-[#0f172a] rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b]">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Contacts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage individual decision makers and stakeholders</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors">
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white dark:bg-[#1e293b]">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
              <UsersIcon className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No contacts found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              We couldn't find any contacts. Try adjusting your search or add a new contact.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="px-6 py-4 font-medium">Name & Title</th>
                <th className="px-6 py-4 font-medium">Contact Details</th>
                <th className="px-6 py-4 font-medium">Social</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {contacts.map((contact, idx) => (
                <tr key={contact.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900 dark:text-white text-sm">
                        {contact.full_name || "Unknown"}
                      </span>
                      <span className="text-[13px] text-slate-500 mt-0.5">{contact.designation || "No title"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {contact.email && (
                        <div className="flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-300">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{contact.email}</span>
                        </div>
                      )}
                      {contact.mobile_number && (
                        <div className="flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-300">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{contact.mobile_number}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {contact.linkedin_url && (
                      <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700">
                        <Linkedin className="w-4 h-4" />
                      </a>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleAddNote(contact)} title="Add Note" className="p-1.5 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-slate-400 hover:text-yellow-600 transition-colors">
                        <Tag className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 16 }}
              className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Add New Contact</h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><UsersIcon className="w-5 h-5"/></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">First Name *</label>
                    <input value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Last Name</label>
                    <input value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Mobile Number</label>
                    <input value={form.mobile_number} onChange={e => setForm({...form, mobile_number: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Designation</label>
                    <input value={form.designation} onChange={e => setForm({...form, designation: e.target.value})} placeholder="e.g. CEO" className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Department</label>
                    <input value={form.department} onChange={e => setForm({...form, department: e.target.value})} placeholder="e.g. Sales" className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2 block">Assignment Options</label>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <label className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer text-slate-900 dark:text-white">
                      <input type="radio" name="assignment" checked={form.assignment_type === 'none'} onChange={() => setForm({...form, assignment_type: 'none'})} /> Standalone Contact
                    </label>
                    <label className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer text-slate-900 dark:text-white">
                      <input type="radio" name="assignment" checked={form.assignment_type === 'create_lead'} onChange={() => setForm({...form, assignment_type: 'create_lead'})} /> Create new Lead
                    </label>
                    <label className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer text-slate-900 dark:text-white">
                      <input type="radio" name="assignment" checked={form.assignment_type === 'lead'} onChange={() => setForm({...form, assignment_type: 'lead'})} /> Assign to Lead
                    </label>
                    <label className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer text-slate-900 dark:text-white">
                      <input type="radio" name="assignment" checked={form.assignment_type === 'client'} onChange={() => setForm({...form, assignment_type: 'client'})} /> Assign to Client
                    </label>
                  </div>

                  {form.assignment_type === 'lead' && (
                    <select value={form.lead_id} onChange={e => setForm({...form, lead_id: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white">
                      <option value="">Select a Lead...</option>
                      {leads.map(l => <option key={l.id} value={l.id}>{l.company_name}</option>)}
                    </select>
                  )}
                  {form.assignment_type === 'client' && (
                    <select value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white">
                      <option value="">Select a Client...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.companyName || c.projectName || c.email}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 rounded-b-2xl">
                <button onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
                <button onClick={async () => {
                  if (!form.first_name.trim()) return;
                  setSaving(true);
                  const payload: any = {
                    first_name: form.first_name,
                    last_name: form.last_name,
                    email: form.email,
                    mobile_number: form.mobile_number,
                    designation: form.designation,
                    department: form.department,
                  };
                  if (form.assignment_type === 'create_lead') payload.create_new_lead = true;
                  if (form.assignment_type === 'lead' && form.lead_id) payload.lead_id = parseInt(form.lead_id);
                  if (form.assignment_type === 'client' && form.client_id) payload.client_id = parseInt(form.client_id);
                  
                  try {
                    await fetch(`${API_BASE_URL}/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                    setShowModal(false);
                    setForm(emptyForm);
                    fetchContacts();
                  } catch (e) { console.error(e); } finally { setSaving(false); }
                }} disabled={saving || !form.first_name} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
