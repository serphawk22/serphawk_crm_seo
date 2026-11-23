"use client";
import LocalizedText from "@/components/LocalizedText";
import { API_BASE_URL } from "@/config";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, DollarSign, Clock, Edit2, CheckCircle, Loader2, X,
  AlertTriangle, Star, ShoppingCart, BarChart2, Save, Plus, Send, Truck, FileText, CreditCard
} from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { useLanguage } from "@/context/LanguageContext";

interface SupplierItem {
  id: number;
  code: string;
  name: string;
  description?: string;
  category?: string;
  tags: string[];
  photo_url?: string;
  unit?: string;
  min_stock: number;
  current_stock: number;
  my_supplier_id: number;
  my_unit_cost?: number;
  my_currency: string;
  my_lead_time_days?: number;
  my_lot_number?: string;
  my_min_order_qty?: number;
  my_notes?: string;
  is_preferred: boolean;
  total_suppliers: number;
}

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SGD"];

export default function SupplierPortalPage() {
  const { t } = useLanguage();
  const { user } = useRole();
  const [activeTab, setActiveTab] = useState<"products" | "rfqs" | "orders" | "payments">("products");
  const [items, setItems] = useState<SupplierItem[]>([]);
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [editItem, setEditItem] = useState<SupplierItem | null>(null);
  const [editForm, setEditForm] = useState({
    unit_cost: 0, currency: "USD", lead_time_days: 0,
    lot_number: "", min_order_qty: 0, notes: ""
  });
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemForm, setAddItemForm] = useState({
    code: "", name: "", description: "", category: "", tags: "",
    unit: "pcs", min_stock: 0, current_stock: 0, unit_cost: 0,
    currency: "USD", lead_time_days: 0
  });

  // RFQ Response modal
  const [respondRfqModal, setRespondRfqModal] = useState<any | null>(null);
  const [rfqRespForm, setRfqRespForm] = useState({
    unit_price: "", currency: "USD", min_order_qty: "1",
    lead_time_days: "7", availability: "In Stock", valid_until: "", notes: ""
  });

  // PO Confirm / Invoice modals
  const [confirmPoModal, setConfirmPoModal] = useState<any | null>(null);
  const [confirmDeliveryDate, setConfirmDeliveryDate] = useState("");
  const [confirmNotes, setConfirmNotes] = useState("");
  const [invoicePoModal, setInvoicePoModal] = useState<any | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ invoice_number: "", invoice_amount: "", notes: "" });

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const emailParam = encodeURIComponent(user.email);
      const [invRes, dashRes, rfqRes, poRes] = await Promise.all([
        fetch(`${API_BASE_URL}/supplier/inventory?email=${emailParam}`),
        fetch(`${API_BASE_URL}/supplier/dashboard?email=${emailParam}`),
        fetch(`${API_BASE_URL}/supplier/rfqs?email=${emailParam}`),
        fetch(`${API_BASE_URL}/supplier/purchase-orders?email=${emailParam}`),
      ]);
      if (invRes.ok) setItems((await invRes.json()).items || []);
      if (dashRes.ok) setDashboard(await dashRes.json());
      if (rfqRes.ok) setRfqs((await rfqRes.json()).rfqs || []);
      if (poRes.ok) {
        const poData = await poRes.json();
        setPurchaseOrders(poData.orders || []);
        setPayments(poData.payments || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [user?.email]);

  const openEdit = (item: SupplierItem) => {
    setEditItem(item);
    setEditForm({
      unit_cost: item.my_unit_cost || 0,
      currency: item.my_currency || "USD",
      lead_time_days: item.my_lead_time_days || 0,
      lot_number: item.my_lot_number || "",
      min_order_qty: item.my_min_order_qty || 0,
      notes: item.my_notes || "",
    });
  };

  const handleSave = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      const updateRes = await fetch(`${API_BASE_URL}/supplier/inventory/${editItem.my_supplier_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_name: user?.name || "",
          supplier_email: user?.email || "",
          unit_cost: editForm.unit_cost,
          currency: editForm.currency,
          lead_time_days: editForm.lead_time_days,
          lot_number: editForm.lot_number,
          min_order_qty: editForm.min_order_qty,
          notes: editForm.notes,
          is_preferred: editItem.is_preferred,
        })
      });

      if (updateRes.ok) {
        setEditItem(null);
        fetchAll();
        showToast(t("supplier.updated_ok"));
      }
    } finally { setSaving(false); }
  };

  const handleAddItem = async () => {
    if (!addItemForm.name || !addItemForm.code) {
      showToast("Name and Code are required", "err");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/supplier/inventory/add-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_name: user?.name || user?.email || "Unknown",
          supplier_email: user?.email || "",
          code: addItemForm.code,
          name: addItemForm.name,
          description: addItemForm.description,
          category: addItemForm.category,
          tags: addItemForm.tags.split(",").map(t => t.trim()).filter(Boolean),
          unit: addItemForm.unit,
          min_stock: addItemForm.min_stock,
          current_stock: addItemForm.current_stock,
          unit_cost: addItemForm.unit_cost,
          currency: addItemForm.currency,
          lead_time_days: addItemForm.lead_time_days
        })
      });
      if (res.ok) {
        setShowAddItem(false);
        fetchAll();
        showToast("Item added successfully");
      } else {
        showToast("Failed to add item", "err");
      }
    } catch {
      showToast("Network error", "err");
    } finally { setSaving(false); }
  };

  const handleRespondRFQ = async () => {
    if (!respondRfqModal || !rfqRespForm.unit_price || !user?.email) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/supplier/rfqs/${respondRfqModal.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_email: user.email,
          unit_price: parseFloat(rfqRespForm.unit_price),
          currency: rfqRespForm.currency,
          min_order_qty: parseFloat(rfqRespForm.min_order_qty) || 1,
          lead_time_days: parseInt(rfqRespForm.lead_time_days) || null,
          availability: rfqRespForm.availability,
          valid_until: rfqRespForm.valid_until || null,
          notes: rfqRespForm.notes || null,
        }),
      });
      if (res.ok) {
        setRespondRfqModal(null);
        fetchAll();
        showToast("Quotation submitted successfully");
      } else {
        showToast("Failed to submit quotation", "err");
      }
    } finally { setSaving(false); }
  };

  const handleConfirmPO = async (action: "confirm" | "reject") => {
    if (!confirmPoModal || !user?.email) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/supplier/purchase-orders/${confirmPoModal.id}/confirm`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_email: user.email,
          action,
          confirmed_delivery: confirmDeliveryDate || null,
          notes: confirmNotes || null,
        }),
      });
      if (res.ok) {
        setConfirmPoModal(null);
        fetchAll();
        showToast(action === "confirm" ? "Purchase Order confirmed" : "Purchase Order rejected");
      }
    } finally { setSaving(false); }
  };

  const handleSubmitInvoice = async () => {
    if (!invoicePoModal || !invoiceForm.invoice_number.trim() || !user?.email) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/supplier/purchase-orders/${invoicePoModal.id}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_email: user.email,
          invoice_number: invoiceForm.invoice_number,
          invoice_amount: parseFloat(invoiceForm.invoice_amount) || Number(invoicePoModal.total_amount || invoicePoModal.grand_total || 0),
          notes: invoiceForm.notes || null,
        }),
      });
      if (res.ok) {
        setInvoicePoModal(null);
        fetchAll();
        showToast("Invoice submitted to company");
      }
    } finally { setSaving(false); }
  };

  const stockStatus = (item: SupplierItem) => {
    if (item.current_stock <= 0) return { label: t("supplier.stock_out"), color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" };
    if (item.current_stock <= item.min_stock) return { label: t("supplier.stock_low"), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" };
    return { label: t("supplier.stock_in"), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" };
  };

  const stats = [
    { label: t("supplier.stat_assigned") || "Assigned Products", value: dashboard?.total_assigned_products ?? items.length, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20", icon: Package },
    { label: "Pending RFQs", value: dashboard?.pending_rfqs ?? rfqs.filter(r => r.status === "Pending").length, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20", icon: Send },
    { label: "Submitted Quotes", value: dashboard?.submitted_quotations ?? rfqs.filter(r => r.status !== "Pending").length, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20", icon: FileText },
    { label: "Pending POs", value: dashboard?.pending_purchase_orders ?? purchaseOrders.filter(p => p.status === "Sent" || p.status === "Approved").length, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-900/20", icon: Truck },
    { label: "Confirmed Orders", value: dashboard?.confirmed_orders ?? purchaseOrders.filter(p => p.status === "Confirmed" || p.status === "Received").length, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", icon: CheckCircle },
    { label: "Outstanding Balance", value: `$${(dashboard?.outstanding_payments ?? 0).toLocaleString()}`, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-900/20", icon: CreditCard },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-black">
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-[200] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold ${toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
            {toast.type === "ok" ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white dark:bg-black border-b border-slate-200 dark:border-slate-800 px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t("supplier.title")}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {t("supplier.welcome")} <span className="font-semibold text-slate-700 dark:text-slate-200">{user?.name || user?.email}</span>
              {" · "}{t("supplier.manage_inventory")}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowAddItem(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-sm hover:-translate-y-0.5 transition-transform">
              <Plus className="w-4 h-4" /> {t("supplier.add_item") || "Add Item"}
            </button>
            <div className="text-right">
              <p className="text-xs text-slate-400">{t("supplier.logged_in_as")}</p>
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {stats.map(s => (
            <div key={s.label} className={`flex items-center gap-3 p-3.5 rounded-2xl ${s.bg} border border-transparent`}>
              <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
              <div>
                <p className={`text-xl font-black ${s.color}`}>{loading ? "—" : s.value}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Supplier Portal Tabs */}
        <div className="flex bg-slate-100 dark:bg-zinc-900 p-1 rounded-2xl w-fit gap-1 mb-6">
          {[
            { id: "products", label: `Assigned Products (${items.length})`, icon: Package },
            { id: "rfqs", label: `RFQ Invitations (${rfqs.length})`, icon: Send },
            { id: "orders", label: `Purchase Orders (${purchaseOrders.length})`, icon: Truck },
            { id: "payments", label: `Payments (${payments.length})`, icon: CreditCard },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === tab.id ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-sm" : "text-slate-500"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: ASSIGNED PRODUCTS */}
        {activeTab === "products" && (
          loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center bg-white dark:bg-[#111] rounded-2xl border border-slate-200 dark:border-slate-800">
              <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="font-bold text-slate-700 dark:text-slate-200">{t("supplier.no_items")}</h3>
              <p className="text-sm text-slate-400 mt-1">{t("supplier.no_items_desc")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, idx) => {
                const stock = stockStatus(item);
                return (
                  <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                    className="bg-white dark:bg-[#111] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                    <div className="p-5 flex gap-4 items-start">
                      <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0 overflow-hidden flex items-center justify-center">
                        {item.photo_url ? (
                          <img src={item.photo_url.startsWith("/") ? `${API_BASE_URL}${item.photo_url}` : item.photo_url} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-7 h-7 text-slate-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {item.is_preferred && <Star className="w-4 h-4 text-violet-500 fill-violet-500" />}
                              <h3 className="font-bold text-slate-900 dark:text-white">{item.name}</h3>
                              <span className="font-mono text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{item.code}</span>
                            </div>
                            {item.description && <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">{item.description}</p>}
                            <div className="flex flex-wrap gap-1 mb-3">
                              {item.tags.map(tag => (
                                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium">{tag}</span>
                              ))}
                            </div>
                          </div>
                          <button onClick={() => openEdit(item)}
                            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all">
                            <Edit2 className="w-3.5 h-3.5" /> {t("supplier.update")}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className={`p-3 rounded-xl border ${stock.bg}`}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <BarChart2 className={`w-3.5 h-3.5 ${stock.color}`} />
                              <span className={`text-[11px] font-bold uppercase tracking-wide ${stock.color}`}>{stock.label}</span>
                            </div>
                            <p className="text-lg font-black text-slate-900 dark:text-white">{item.current_stock}</p>
                            <p className="text-[11px] text-slate-500">{t("supplier.min")} {item.min_stock} {item.unit || t("supplier.units")}</p>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-1.5 mb-1">
                              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("supplier.my_price")}</span>
                            </div>
                            <p className="text-lg font-black text-slate-900 dark:text-white">
                              {item.my_unit_cost ? `${item.my_currency} ${item.my_unit_cost}` : "—"}
                            </p>
                            <p className="text-[11px] text-slate-500">{t("supplier.per_unit")} {item.unit || t("supplier.units")}</p>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("supplier.lead_time")}</span>
                            </div>
                            <p className="text-lg font-black text-slate-900 dark:text-white">
                              {item.my_lead_time_days ? `${item.my_lead_time_days}d` : "—"}
                            </p>
                            <p className="text-[11px] text-slate-500">{t("supplier.delivery")}</p>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-1.5 mb-1">
                              <ShoppingCart className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("supplier.lot")}</span>
                            </div>
                            <p className="text-lg font-black text-slate-900 dark:text-white font-mono">{item.my_lot_number || "—"}</p>
                            <p className="text-[11px] text-slate-500">{item.total_suppliers} {item.total_suppliers !== 1 ? t("supplier.supplier_total") : t("supplier.supplier_total_one")}</p>
                          </div>
                        </div>

                        {item.my_notes && (
                          <div className="mt-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 text-xs text-slate-500">
                            <b>{t("supplier.notes")}</b> {item.my_notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )
        )}

        {/* TAB 2: RFQ INVITATIONS & QUOTATIONS */}
        {activeTab === "rfqs" && (
          <div className="space-y-4">
            {rfqs.length === 0 ? (
              <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
                <Send className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No RFQ invitations yet</p>
              </div>
            ) : (
              rfqs.map(r => (
                <div key={r.id} className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{r.item_name}</span>
                      <span className="font-mono text-xs text-slate-400">({r.item_code})</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === "Pending" ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                        {r.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Requested Quantity: <b>{r.quantity || 1} {r.unit}</b>
                      {r.deadline ? ` · Deadline: ${r.deadline}` : ""}
                      {r.notes ? ` · Note: ${r.notes}` : ""}
                    </p>
                    {r.my_responses && r.my_responses.length > 0 && (
                      <p className="text-xs text-emerald-600 font-semibold mt-1">
                        Your Quote: {r.my_responses[0].currency} {r.my_responses[0].unit_price}/unit · MOQ: {r.my_responses[0].min_order_qty} · Lead Time: {r.my_responses[0].lead_time_days}d
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setRespondRfqModal(r);
                      setRfqRespForm({
                        unit_price: r.my_responses?.[0]?.unit_price ? String(r.my_responses[0].unit_price) : "",
                        currency: r.my_responses?.[0]?.currency || "USD",
                        min_order_qty: String(r.quantity || 1),
                        lead_time_days: "7",
                        availability: "In Stock",
                        valid_until: "",
                        notes: "",
                      });
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                  >
                    {r.my_responses && r.my_responses.length > 0 ? "Submit Updated Quote" : "Submit Quotation"}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: PURCHASE ORDERS & INVOICE SUBMISSION */}
        {activeTab === "orders" && (
          <div className="space-y-4">
            {purchaseOrders.length === 0 ? (
              <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
                <Truck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No purchase orders assigned yet</p>
              </div>
            ) : (
              purchaseOrders.map(po => (
                <div key={po.id} className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-base text-slate-900 dark:text-white">{po.po_number}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600">{po.status}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600">{po.payment_status || "Unpaid"}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Total Amount: <b>{po.currency} {Number(po.total_amount || po.grand_total || 0).toLocaleString()}</b> · Paid: <b>{po.currency} {Number(po.paid_amount || 0).toLocaleString()}</b>
                        {po.expected_delivery ? ` · Expected Delivery: ${po.expected_delivery}` : ""}
                      </p>
                      {po.supplier_invoice_number && (
                        <p className="text-xs text-indigo-600 font-semibold mt-1">
                          Submitted Invoice: {po.supplier_invoice_number} (${po.supplier_invoice_amount})
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {(po.status === "Sent" || po.status === "Approved") && (
                        <button
                          onClick={() => {
                            setConfirmPoModal(po);
                            setConfirmDeliveryDate(po.expected_delivery || "");
                            setConfirmNotes("");
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                        >
                          Confirm / Respond to Order
                        </button>
                      )}
                      {po.status !== "Cancelled" && (
                        <button
                          onClick={() => {
                            setInvoicePoModal(po);
                            setInvoiceForm({
                              invoice_number: po.supplier_invoice_number || "",
                              invoice_amount: String(po.total_amount || po.grand_total || 0),
                              notes: "",
                            });
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                        >
                          Submit Invoice
                        </button>
                      )}
                    </div>
                  </div>
                  {po.items && po.items.length > 0 && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl">
                      {po.items.map((li: any, i: number) => (
                        <div key={i} className="flex justify-between py-1">
                          <span>{li.product_name} ({li.product_code})</span>
                          <span className="font-bold">Ordered: {li.ordered_qty} · Unit Cost: {po.currency} {li.unit_cost}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: PAYMENTS */}
        {activeTab === "payments" && (
          <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white mb-3">Payment History</h3>
            {payments.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No payments recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {payments.map(pay => (
                  <div key={pay.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold">{pay.payment_number}</span>
                      <span className="text-slate-500 ml-2">{pay.payment_method} · Ref: {pay.transaction_reference || "—"}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-emerald-600">{pay.currency} {pay.amount}</span>
                      <p className="text-[11px] text-slate-400">{pay.payment_date}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Supplier Pricing Modal */}
      <AnimatePresence>
        {editItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setEditItem(null); }}>
            <motion.div initial={{ scale: 0.94, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
              className="bg-white dark:bg-black rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t("supplier.modal_title")}</h2>
                  <p className="text-xs text-slate-500">{editItem.name} · {editItem.code}</p>
                </div>
                <button onClick={() => setEditItem(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("supplier.label_price")}</label>
                    <input type="number" value={editForm.unit_cost} onChange={e => setEditForm(f => ({ ...f, unit_cost: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("supplier.label_currency")}</label>
                    <select value={editForm.currency} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white">
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("supplier.label_lead_time")}</label>
                    <input type="number" value={editForm.lead_time_days} onChange={e => setEditForm(f => ({ ...f, lead_time_days: parseInt(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("supplier.label_lot")}</label>
                    <input value={editForm.lot_number} onChange={e => setEditForm(f => ({ ...f, lot_number: e.target.value }))} placeholder="LOT-2024-001"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("supplier.label_notes")}</label>
                  <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    placeholder={t("supplier.notes_placeholder")}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white resize-none" />
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
                <button onClick={() => setEditItem(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm">
                  {t("supplier.cancel")}
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t("supplier.save_changes")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RFQ Respond Modal */}
      <AnimatePresence>
        {respondRfqModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Submit Quotation — {respondRfqModal.item_name}</h2>
                <button onClick={() => setRespondRfqModal(null)}><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Unit Price *" value={rfqRespForm.unit_price} onChange={e => setRfqRespForm(f => ({ ...f, unit_price: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
                <select value={rfqRespForm.currency} onChange={e => setRfqRespForm(f => ({ ...f, currency: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm">
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="MOQ" value={rfqRespForm.min_order_qty} onChange={e => setRfqRespForm(f => ({ ...f, min_order_qty: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
                <input type="number" placeholder="Lead Time (days)" value={rfqRespForm.lead_time_days} onChange={e => setRfqRespForm(f => ({ ...f, lead_time_days: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              </div>
              <textarea rows={2} placeholder="Quotation terms / notes" value={rfqRespForm.notes} onChange={e => setRfqRespForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              <div className="flex gap-3">
                <button onClick={() => setRespondRfqModal(null)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleRespondRFQ} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Send Quotation</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PO Confirmation Modal */}
      <AnimatePresence>
        {confirmPoModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Respond to {confirmPoModal.po_number}</h2>
                <button onClick={() => setConfirmPoModal(null)}><X className="w-4 h-4" /></button>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Confirmed Delivery Date</label>
                <input type="date" value={confirmDeliveryDate} onChange={e => setConfirmDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              </div>
              <textarea rows={2} placeholder="Confirmation notes..." value={confirmNotes} onChange={e => setConfirmNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              <div className="flex gap-2">
                <button onClick={() => handleConfirmPO("reject")} disabled={saving} className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-bold">Reject Order</button>
                <button onClick={() => handleConfirmPO("confirm")} disabled={saving} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Confirm Order</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit Invoice Modal */}
      <AnimatePresence>
        {invoicePoModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Submit Invoice — {invoicePoModal.po_number}</h2>
                <button onClick={() => setInvoicePoModal(null)}><X className="w-4 h-4" /></button>
              </div>
              <input placeholder="Supplier Invoice Number *" value={invoiceForm.invoice_number} onChange={e => setInvoiceForm(f => ({ ...f, invoice_number: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              <input type="number" placeholder="Invoice Amount *" value={invoiceForm.invoice_amount} onChange={e => setInvoiceForm(f => ({ ...f, invoice_amount: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              <div className="flex gap-3">
                <button onClick={() => setInvoicePoModal(null)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleSubmitInvoice} disabled={saving} className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">Submit Invoice</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Item Modal */}
      <AnimatePresence>
        {showAddItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowAddItem(false); }}>
            <motion.div initial={{ scale: 0.94, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
              className="bg-white dark:bg-black rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700 shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white"><LocalizedText text={"Add New Inventory Item"} /></h2>
                  <p className="text-xs text-slate-500"><LocalizedText text={"Register a product you supply"} /></p>
                </div>
                <button onClick={() => setShowAddItem(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block"><LocalizedText text={"Item Name *"} /></label>
                    <input type="text" value={addItemForm.name} onChange={e => setAddItemForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block"><LocalizedText text={"SKU / Code *"} /></label>
                    <input type="text" value={addItemForm.code} onChange={e => setAddItemForm(f => ({ ...f, code: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block"><LocalizedText text={"Your Unit Cost"} /></label>
                    <input type="number" value={addItemForm.unit_cost} onChange={e => setAddItemForm(f => ({ ...f, unit_cost: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block"><LocalizedText text={"Lead Time (Days)"} /></label>
                    <input type="number" value={addItemForm.lead_time_days} onChange={e => setAddItemForm(f => ({ ...f, lead_time_days: parseInt(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl shrink-0">
                <button onClick={() => setShowAddItem(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm">
                  {t("supplier.cancel")}
                </button>
                <button onClick={handleAddItem} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <LocalizedText text={"Add Item"} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
