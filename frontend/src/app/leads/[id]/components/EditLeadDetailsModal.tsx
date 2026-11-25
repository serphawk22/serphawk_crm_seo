"use client";

import React, { useState, useEffect } from "react";
import {
  X, Check, Loader2, Phone, Mail, Globe, MapPin, Building2,
  DollarSign, Tag, Linkedin, Twitter, Instagram, Facebook
} from "lucide-react";
import { API_BASE_URL } from "@/config";

interface EditLeadDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: any;
  onSaved: (updatedLead: any) => void;
}

export default function EditLeadDetailsModal({
  isOpen,
  onClose,
  lead,
  onSaved,
}: EditLeadDetailsModalProps) {
  const [phone, setPhone] = useState(lead?.phone || "");
  const [email, setEmail] = useState(lead?.email || "");
  const [industry, setIndustry] = useState(lead?.industry || "");
  const [city, setCity] = useState(lead?.city || "");
  const [country, setCountry] = useState(lead?.country || "");
  const [address, setAddress] = useState(lead?.address || "");
  const [website, setWebsite] = useState(lead?.website || "");
  const [dealValue, setDealValue] = useState(lead?.deal_value != null ? String(lead.deal_value) : "");
  const [linkedinUrl, setLinkedinUrl] = useState(lead?.linkedin_url || "");
  const [twitterUrl, setTwitterUrl] = useState(lead?.twitter_url || "");
  const [instagramUrl, setInstagramUrl] = useState(lead?.instagram_url || "");
  const [facebookUrl, setFacebookUrl] = useState(lead?.facebook_url || "");

  const initialCustomFields = () => {
    const cf = lead?.custom_fields || lead?.customFields || {};
    if (typeof cf === "object" && cf !== null && !Array.isArray(cf)) {
      return Object.entries(cf)
        .filter(([k]) => k !== "sheet_data")
        .map(([k, v]) => ({ key: k, value: String(v) }));
    }
    return [];
  };
  const [customFields, setCustomFields] = useState<{ key: string; value: string }[]>(initialCustomFields);

  useEffect(() => {
    if (isOpen && lead) {
      setPhone(lead?.phone || "");
      setEmail(lead?.email || "");
      setIndustry(lead?.industry || "");
      setCity(lead?.city || "");
      setCountry(lead?.country || "");
      setAddress(lead?.address || "");
      setWebsite(lead?.website || "");
      setDealValue(lead?.deal_value != null ? String(lead.deal_value) : "");
      setLinkedinUrl(lead?.linkedin_url || "");
      setTwitterUrl(lead?.twitter_url || "");
      setInstagramUrl(lead?.instagram_url || "");
      setFacebookUrl(lead?.facebook_url || "");
      const cf = lead?.custom_fields || lead?.customFields || {};
      if (typeof cf === "object" && cf !== null && !Array.isArray(cf)) {
        setCustomFields(
          Object.entries(cf)
            .filter(([k]) => k !== "sheet_data" && k !== "is_sample")
            .map(([k, v]) => ({ key: k, value: String(v) }))
        );
      } else {
        setCustomFields([]);
      }
    }
  }, [isOpen, lead?.id, lead?.custom_fields, lead?.customFields]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const cfObj = customFields.reduce((acc, curr) => {
        if (curr.key.trim()) acc[curr.key.trim()] = curr.value.trim();
        return acc;
      }, {} as Record<string, string>);

      const payload: Record<string, any> = {
        company_name: lead.company_name,
        phone: phone.trim() || null,
        email: email.trim() || null,
        industry: industry.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        address: address.trim() || null,
        website: website.trim() || null,
        deal_value: dealValue.trim() ? parseFloat(dealValue) : null,
        linkedin_url: linkedinUrl.trim() || null,
        twitter_url: twitterUrl.trim() || null,
        instagram_url: instagramUrl.trim() || null,
        facebook_url: facebookUrl.trim() || null,
        status: lead.status || "New",
        custom_fields: cfObj,
        customFields: cfObj,
      };

      const res = await fetch(`${API_BASE_URL}/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to update lead details");
      }

      const updated = await res.json();
      onSaved(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update lead details");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/50 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <Building2 size={18} className="text-indigo-600" />
              Edit Lead Details & Socials
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Update contact info, location, category, and social handles for <span className="font-semibold text-slate-700 dark:text-zinc-200">{lead?.company_name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl">
              {error}
            </div>
          )}

          {/* Section 1: Contact Essentials */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-2.5">
              Contact Essentials
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Phone size={12} className="text-indigo-500" /> Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Mail size={12} className="text-indigo-500" /> Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@company.com"
                  className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Business & Valuation */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-2.5">
              Business & Industry
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Tag size={12} className="text-indigo-500" /> Category / Industry
                </label>
                <input
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. Coworking, SEO Agency"
                  className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Globe size={12} className="text-indigo-500" /> Website URL
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://company.com"
                  className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <DollarSign size={12} className="text-emerald-500" /> Deal Value
                </label>
                <input
                  type="number"
                  step="any"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  placeholder="e.g. 15000"
                  className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Geographic Location */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-2.5">
              Geographic Location (Place & Country)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <MapPin size={12} className="text-rose-500" /> City / Place
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Mexico City, Miami, Monterrey"
                  className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Globe size={12} className="text-rose-500" /> Country
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. Mexico, United States, Spain"
                  className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1">
                Full Physical Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Av. Patriotismo 201, Colonia San Pedro..."
                className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Section 4: Social Media Handles */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-2.5">
              Social Media Handles & Links
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Linkedin size={12} className="text-sky-600" /> LinkedIn URL
                </label>
                <input
                  type="text"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/company/..."
                  className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Twitter size={12} className="text-cyan-500" /> Twitter / X URL
                </label>
                <input
                  type="text"
                  value={twitterUrl}
                  onChange={(e) => setTwitterUrl(e.target.value)}
                  placeholder="https://x.com/..."
                  className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Instagram size={12} className="text-pink-500" /> Instagram URL
                </label>
                <input
                  type="text"
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                  placeholder="https://instagram.com/..."
                  className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Facebook size={12} className="text-blue-600" /> Facebook URL
                </label>
                <input
                  type="text"
                  value={facebookUrl}
                  onChange={(e) => setFacebookUrl(e.target.value)}
                  placeholder="https://facebook.com/..."
                  className="w-full text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Custom / Additional Fields */}
            <div className="border border-slate-200 dark:border-zinc-700 rounded-2xl p-3 sm:p-4 bg-slate-50/50 dark:bg-zinc-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    Custom / Additional Fields
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Extra attributes displayed prominently in the lead header
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomFields(prev => [...prev, { key: "", value: "" }])}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition flex items-center gap-1 cursor-pointer"
                >
                  <Tag size={11} /> + Add Field
                </button>
              </div>

              {customFields.length > 0 && (
                <div className="space-y-2 pt-1">
                  {customFields.map((cf, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Field Name (e.g. Budget, Priority)"
                        value={cf.key}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomFields(prev => prev.map((item, i) => i === idx ? { ...item, key: val } : item));
                        }}
                        className="w-1/2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={cf.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomFields(prev => prev.map((item, i) => i === idx ? { ...item, value: val } : item));
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setCustomFields(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-500/25 transition-all disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Check size={14} /> Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

