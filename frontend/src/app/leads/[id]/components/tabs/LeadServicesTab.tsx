"use client";

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import {
  Sparkles, Store, Globe, CheckCircle2, Loader2, Send, Mail,
  Check, Copy, ArrowRight, ExternalLink, RefreshCw, FileText,
  DollarSign, ShieldCheck, Zap, AlertCircle, Layers, Plus
} from "lucide-react";

interface LeadServicesTabProps {
  leadId: string | number;
  lead: any;
  onRefresh?: () => void;
}

const getAuthHeaders = (extra: Record<string, string> = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export default function LeadServicesTab({ leadId, lead, onRefresh }: LeadServicesTabProps) {
  const { language } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [savingProposal, setSavingProposal] = useState(false);

  const [clientServices, setClientServices] = useState<any[]>([]);
  const [ourServices, setOurServices] = useState<any[]>([]);
  const [selectedServiceNames, setSelectedServiceNames] = useState<string[]>([]);

  // Proposal Draft State
  const [proposalDraft, setProposalDraft] = useState<any>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [draftLang, setDraftLang] = useState<"en" | "es">(language === "es" ? "es" : "en");
  const [copied, setCopied] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const fetchServicesData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/leads/${leadId}/services`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setClientServices(data.client_services || []);
        setOurServices(data.our_services || []);

        // Pre-select recommended services
        const recommended = (data.our_services || [])
          .filter((s: any) => s.recommended)
          .map((s: any) => s.name);
        setSelectedServiceNames(recommended.length > 0 ? recommended : (data.our_services || []).slice(0, 3).map((s: any) => s.name));

        if (data.lead?.email) {
          setRecipientEmail(data.lead.email);
        }

        if (data.latest_draft) {
          setProposalDraft(data.latest_draft);
          setEmailSubject(data.latest_draft.subject || "");
          setEmailBody(draftLang === "es" ? (data.latest_draft.spanish_body || data.latest_draft.english_body) : data.latest_draft.english_body);
        }
      }
    } catch (e) {
      console.error("Error loading lead services:", e);
    } finally {
      setLoading(false);
    }
  }, [leadId, draftLang]);

  useEffect(() => {
    fetchServicesData();
  }, [fetchServicesData]);

  // Handle service extraction
  const handleExtractServices = async () => {
    setExtracting(true);
    setStatusMessage("");
    try {
      const res = await fetch(`${API_BASE_URL}/leads/${leadId}/extract-services`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatusMessage(
          language === "es"
            ? `¡${data.extracted_count} servicios extraídos y añadidos al Marketplace!`
            : `Extracted ${data.extracted_count} services & synced to Marketplace!`
        );
        await fetchServicesData();
        onRefresh?.();
      } else {
        alert(data.message || (language === "es" ? "No se pudieron extraer los servicios" : "Could not extract services"));
      }
    } catch (e) {
      console.error("Extract services error:", e);
      alert(language === "es" ? "Error al conectar con el extractor" : "Extraction connection error");
    } finally {
      setExtracting(false);
    }
  };

  // Toggle selection of our offered services
  const toggleOfferedService = (name: string) => {
    setSelectedServiceNames(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  // Calculate estimated proposal value
  const totalProposalValue = ourServices
    .filter(s => selectedServiceNames.includes(s.name))
    .reduce((sum, s) => sum + (Number(s.price) || 0), 0);

  // Generate Proposal Email Draft
  const handleGenerateProposalDraft = async () => {
    setGeneratingDraft(true);
    setSendSuccessMessage("");
    try {
      const res = await fetch(`${API_BASE_URL}/leads/${leadId}/generate-proposal-draft`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          selected_offered_services: selectedServiceNames,
          client_services: clientServices.map(s => s.name),
          recipient_email: recipientEmail || lead?.email || "",
          recipient_name: lead?.company_name || "",
          tone: "consultative"
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to generate proposal draft");
      }
      const data = await res.json();
      setProposalDraft(data);
      setEmailSubject(data.subject || `Growth Proposal for ${lead?.company_name || "Partner"}`);
      setEmailBody(draftLang === "es" ? (data.spanish_body || data.english_body) : data.english_body);
      if (data.to_email) setRecipientEmail(data.to_email);
    } catch (err: any) {
      alert(err.message || "Failed to generate proposal draft");
    } finally {
      setGeneratingDraft(false);
    }
  };

  // Switch proposal draft language
  const handleSwitchDraftLanguage = (lang: "en" | "es") => {
    setDraftLang(lang);
    if (proposalDraft) {
      if (lang === "es") {
        setEmailBody(proposalDraft.spanish_body || proposalDraft.english_body);
      } else {
        setEmailBody(proposalDraft.english_body || proposalDraft.spanish_body);
      }
    }
  };

  // Send the generated proposal email
  const handleSendProposalEmail = async () => {
    if (!recipientEmail.trim() || !emailSubject.trim() || !emailBody.trim()) {
      alert(language === "es" ? "Por favor completa el destinatario, asunto y cuerpo del correo." : "Please provide recipient email, subject, and body.");
      return;
    }
    setSendingEmail(true);
    setSendSuccessMessage("");
    try {
      const res = await fetch(`${API_BASE_URL}/leads/${leadId}/email-composer/send`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          to: recipientEmail.trim(),
          subject: emailSubject.trim(),
          body: emailBody.trim(),
          purpose: "deal_update",
          log_conversation: true
        })
      });
      if (res.ok) {
        setSendSuccessMessage(
          language === "es"
            ? `✓ ¡Propuesta enviada exitosamente a ${recipientEmail}!`
            : `✓ Proposal email sent successfully to ${recipientEmail}!`
        );
        onRefresh?.();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || (language === "es" ? "Error al enviar el correo." : "Failed to send email."));
      }
    } catch (err) {
      console.error(err);
      alert(language === "es" ? "Error al enviar la propuesta" : "Error sending proposal");
    } finally {
      setSendingEmail(false);
    }
  };

  // Save proposal as an official contract proposal
  const handleSaveOfficialProposal = async () => {
    setSavingProposal(true);
    try {
      const res = await fetch(`${API_BASE_URL}/leads/${leadId}/save-proposal`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: emailSubject || `Strategic Proposal for ${lead?.company_name}`,
          amount: totalProposalValue,
          notes: emailBody,
          recipient_email: recipientEmail
        })
      });
      if (res.ok) {
        alert(language === "es" ? "Propuesta oficial guardada en el módulo de Propuestas." : "Official proposal saved to Proposals module!");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingProposal(false);
    }
  };

  const handleCopyDraft = () => {
    const fullText = `Subject: ${emailSubject}\n\n${emailBody}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
        <span className="text-xs text-slate-500 font-medium">
          {language === "es" ? "Cargando catálogo de servicios..." : "Loading services hub..."}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Top Header Banner ── */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-violet-900 rounded-2xl p-5 text-white shadow-sm border border-indigo-800/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-300" />
              </div>
              <h2 className="text-base font-black tracking-tight">
                {language === "es" ? "Servicios del Prospecto y Propuesta de Valor" : "Prospect Services & Value Proposal Hub"}
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 uppercase tracking-wider">
                {language === "es" ? "Marketplace B2B" : "B2B Marketplace"}
              </span>
            </div>
            <p className="text-xs text-indigo-100 max-w-2xl leading-relaxed">
              {language === "es"
                ? "Extrae los servicios que ofrece la empresa desde su sitio web, agrégalos automáticamente al Marketplace B2B y genera propuestas personalizadas con nuestros servicios complementarios."
                : "Extract services offered on their website, sync them automatically to the B2B Marketplace, and generate tailor-made proposal emails combining your matching services."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExtractServices}
              disabled={extracting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-indigo-900 font-bold text-xs shadow-sm hover:bg-indigo-50 active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>{language === "es" ? "Escaneando Sitio..." : "Scanning Website..."}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{language === "es" ? "Escanear Servicios del Sitio" : "Extract Services from Website"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-300 bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-500/30">
            <CheckCircle2 className="w-4 h-4" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* ── Two-Column Main Deck ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* COLUMN 1: Their Services (Extracted from Website & Synced to Marketplace) */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                  {language === "es" ? "Sus Servicios (Sitio Web)" : "Their Services (From Website)"}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {lead?.website ? lead.website : "No website URL provided"}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/40">
              {clientServices.length} {language === "es" ? "Detectados" : "Detected"}
            </span>
          </div>

          {clientServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-zinc-950/50 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800">
              <Store className="w-8 h-8 text-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1">
                {language === "es" ? "No se han extraído servicios aún" : "No services extracted yet"}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 max-w-xs mb-3">
                {language === "es"
                  ? "Haz clic en 'Escanear Servicios del Sitio' para consultar su página web y cargar sus ofertas en el Marketplace."
                  : "Click 'Extract Services from Website' to analyze their web offerings and sync them to your B2B Marketplace."}
              </p>
              <button
                onClick={handleExtractServices}
                disabled={extracting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{language === "es" ? "Escanear Ahora" : "Extract Services Now"}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {clientServices.map((svc: any, idx: number) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-zinc-950/40 border border-slate-200/70 dark:border-zinc-800/80 hover:border-blue-400/60 transition-all duration-150 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {svc.name}
                        </span>
                        {svc.category && (
                          <span className="text-[10px] font-semibold px-2 py-0.2 rounded-md bg-slate-200/80 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                            {svc.category}
                          </span>
                        )}
                      </div>
                      {svc.brief && (
                        <p className="text-[11px] text-slate-600 dark:text-zinc-400 mt-1 leading-snug">
                          {svc.brief}
                        </p>
                      )}
                    </div>
                    {svc.approx_cost && Number(svc.approx_cost) > 0 && (
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                        ${Number(svc.approx_cost).toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/40 dark:border-zinc-800/40 text-[10px]">
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/40 dark:border-emerald-900/40">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{language === "es" ? "En Marketplace B2B" : "In B2B Marketplace"}</span>
                    </span>
                    <span className="text-slate-400">
                      Provider: {lead?.company_name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COLUMN 2: Services We Can Offer Them (Our Service Catalog) */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                  {language === "es" ? "Servicios Que Podemos Ofrecerles" : "Services We Can Offer Them"}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {language === "es" ? "Selecciona los servicios a incluir en la propuesta" : "Select services to include in the proposal"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/40 px-2.5 py-0.5 rounded-full">
                {selectedServiceNames.length} {language === "es" ? "Seleccionados" : "Selected"}
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            {ourServices.map((svc: any) => {
              const isSelected = selectedServiceNames.includes(svc.name);
              return (
                <div
                  key={svc.id}
                  onClick={() => toggleOfferedService(svc.name)}
                  className={`p-3.5 rounded-xl border transition-all duration-150 cursor-pointer space-y-2 ${
                    isSelected
                      ? "bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-500/70 shadow-xs"
                      : "bg-slate-50/60 dark:bg-zinc-950/40 border-slate-200/70 dark:border-zinc-800/80 opacity-80 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by parent onClick
                        className="mt-0.5 h-4 w-4 rounded accent-indigo-600 cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {svc.name}
                          </span>
                          {svc.category && (
                            <span className="text-[10px] font-semibold px-2 py-0.2 rounded-md bg-indigo-100/70 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                              {svc.category}
                            </span>
                          )}
                        </div>
                        {svc.description && (
                          <p className="text-[11px] text-slate-600 dark:text-zinc-400 mt-0.5 leading-snug">
                            {svc.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        ${Number(svc.price).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-medium">USD</span>
                    </div>
                  </div>

                  {svc.pitch_angle && (
                    <div className="flex items-start gap-1.5 p-2 rounded-lg bg-white/70 dark:bg-zinc-900/80 border border-slate-200/50 dark:border-zinc-800 text-[10.5px] text-slate-700 dark:text-zinc-300 leading-snug">
                      <Zap className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span><strong>Pitch Hook:</strong> {svc.pitch_angle}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Proposal Summary & Generation Trigger */}
          <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {language === "es" ? "Valor Estimado del Paquete" : "Total Package Value"}
              </span>
              <span className="text-base font-black text-indigo-600 dark:text-indigo-400">
                ${totalProposalValue.toLocaleString()} USD
              </span>
            </div>

            <button
              onClick={handleGenerateProposalDraft}
              disabled={generatingDraft || selectedServiceNames.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {generatingDraft ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{language === "es" ? "Generando Propuesta..." : "Generating Proposal..."}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{language === "es" ? "Generar Correo de Propuesta" : "Generate Proposal Email"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Generated Proposal Email Editor & Outbound Hub ── */}
      {(proposalDraft || emailBody) && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{language === "es" ? "Borrador de Propuesta Personalizada" : "Tailored Proposal Email Draft"}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50">
                    AI Ready
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {language === "es"
                    ? "Revisa, edita y envía la propuesta directamente por correo electrónico al prospecto."
                    : "Review, customize, and deliver this proposal directly to the prospect's inbox."}
                </p>
              </div>
            </div>

            {/* Language Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleSwitchDraftLanguage("en")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  draftLang === "en" ? "bg-white dark:bg-zinc-900 text-indigo-600 shadow-xs" : "text-slate-500"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => handleSwitchDraftLanguage("es")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  draftLang === "es" ? "bg-white dark:bg-zinc-900 text-indigo-600 shadow-xs" : "text-slate-500"
                }`}
              >
                ES
              </button>
            </div>
          </div>

          {sendSuccessMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{sendSuccessMessage}</span>
            </div>
          )}

          <div className="space-y-3">
            {/* Recipient */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                {language === "es" ? "Destinatario (Correo)" : "Recipient Email"}
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
                placeholder="contact@company.com"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Subject */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                {language === "es" ? "Asunto del Correo" : "Subject Line"}
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                placeholder="Proposal Subject"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
              />
            </div>

            {/* Proposal Body */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                {language === "es" ? "Cuerpo de la Propuesta" : "Proposal Email Content"}
              </label>
              <textarea
                rows={9}
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed font-mono"
              />
            </div>

            {/* Key Deliverables Pills */}
            {proposalDraft?.key_deliverables && proposalDraft.key_deliverables.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1.5">
                  {language === "es" ? "Entregables Clave Incluidos" : "Key Deliverables Included"}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {proposalDraft.key_deliverables.map((d: string, i: number) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40"
                    >
                      <Check className="w-3 h-3 text-indigo-500" />
                      <span>{d}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyDraft}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? (language === "es" ? "Copiado" : "Copied!") : (language === "es" ? "Copiar Borrador" : "Copy Draft")}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveOfficialProposal}
                disabled={savingProposal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-bold text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer"
              >
                {savingProposal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                <span>{language === "es" ? "Guardar como Propuesta Oficial" : "Save as Official Proposal"}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleSendProposalEmail}
              disabled={sendingEmail || !recipientEmail.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {sendingEmail ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{language === "es" ? "Enviando Propuesta..." : "Sending Proposal..."}</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>{language === "es" ? "Enviar Propuesta por Correo" : "Send Proposal Email"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
