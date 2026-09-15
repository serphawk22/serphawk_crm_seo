"use client";

import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";
import { Loader2, Send, CheckCircle, AlertTriangle, X } from "lucide-react";

interface RfqDetail {
  id: number;
  item_name: string;
  item_code: string;
  supplier_name: string;
  quantity?: number | null;
  notes?: string | null;
  status: string;
}

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SGD"];

export default function RfqResponsePage({ params }: { params: { rfq_id: string } }) {
  const rfqId = params.rfq_id;
  const [detail, setDetail] = useState<RfqDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ unit_price: "", currency: "USD", lead_time_days: "", valid_until: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    fetch(`${API_BASE_URL}/rfq/${rfqId}?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.ok) return res.json();
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `Request failed (${res.status})`);
      })
      .then((data: RfqDetail) => {
        setDetail(data);
        setLoadState("ready");
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Something went wrong");
        setLoadState("error");
      });
  }, [rfqId]);

  const handleSubmit = async () => {
    const price = parseFloat(form.unit_price);
    if (!price || price <= 0) {
      setErrorText("Please enter a valid unit price.");
      return;
    }
    setSaving(true);
    setErrorText("");
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    try {
      const res = await fetch(`${API_BASE_URL}/rfq/${rfqId}/respond?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_price: price,
          currency: form.currency,
          lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days, 10) : null,
          valid_until: form.valid_until || null,
          notes: form.notes,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const detail = d?.detail;
        setErrorText(Array.isArray(detail) ? "Please review your inputs." : detail || "Could not submit. Please try again.");
        return;
      }
      setSubmitted(true);
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] dark:bg-black px-4">
        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
            <CheckCircle className="w-7 h-7 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Quotation submitted</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Thank you! Your quotation has been received. Our team will review it and get back to you shortly.
          </p>
        </div>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] dark:bg-black gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <p className="text-sm text-slate-500">Loading RFQ…</p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] dark:bg-black px-4">
        <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Unable to load RFQ</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] dark:bg-black px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-slate-900 text-white px-6 py-5 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm font-black">S</span>
            <div>
              <div className="font-bold text-sm">SERP Hawk — RFQ</div>
              <div className="text-xs text-slate-400">Supply quotation</div>
            </div>
          </div>

          <div className="p-6">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{detail?.item_name}</h1>
            {detail?.item_code ? (
              <p className="text-xs text-slate-400 font-mono mt-0.5">{detail.item_code}</p>
            ) : null}
            {detail?.quantity ? (
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                We are looking for a quantity of <strong>{detail.quantity}</strong>.
              </p>
            ) : null}
            {detail?.notes ? <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{detail.notes}</p> : null}

            <div className="mt-5 border-t border-slate-200 dark:border-slate-800 pt-5 grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">
                  Unit price <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="w-24 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.unit_price}
                    onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Lead time (days)</label>
                <input
                  type="number" min="0" placeholder="e.g. 14"
                  value={form.lead_time_days}
                  onChange={(e) => setForm((f) => ({ ...f, lead_time_days: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Price valid until</label>
                <input
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            {errorText ? (
              <div className="mt-4 flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2.5">
                <X className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {errorText}
              </div>
            ) : null}

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-all shadow-sm active:scale-[0.99]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit Quotation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}