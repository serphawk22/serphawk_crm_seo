"use client";
import { API_BASE_URL } from "@/config";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Filter, Users as UsersIcon, Mail, Phone, Globe, Linkedin, MoreVertical } from "lucide-react";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContacts();
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

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-[#0f172a] rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b]">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Contacts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage individual decision makers and stakeholders</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors">
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
                    <button className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
