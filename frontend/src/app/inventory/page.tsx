"use client";
import LocalizedText from "@/components/LocalizedText";
import { API_BASE_URL } from "@/config";
import React, { useState, useEffect, useRef } from "react";
import { ExportActions } from "@/components/ExportActions";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, Plus, Search, Trash2, Edit2, X, ChevronDown, ChevronUp,
  Loader2, Tag, Building2, DollarSign, Clock, ShoppingCart, Send,
  CheckCircle, AlertTriangle, Upload, Star, ArrowLeftRight, Warehouse as WarehouseIcon,
  ClipboardCheck, FileSpreadsheet, History, Truck, CreditCard, BarChart3, Layers, Barcode, CheckSquare, Download, Eye
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

interface Supplier {
  id: number;
  supplier_name: string;
  supplier_brand?: string;
  supplier_email?: string;
  lot_number?: string;
  unit_cost?: number;
  currency: string;
  lead_time_days?: number;
  min_order_qty?: number;
  is_preferred: boolean;
  notes?: string;
  supplier_user_id?: number | null;
  credentials_ready?: boolean;
  credentials_sent?: boolean;
}

interface ProductVariant {
  sku: string;
  name: string;
  cost_price?: number;
  selling_price?: number;
  stock?: number;
  barcode?: string;
}

interface WarehouseBalance {
  warehouse_id: number;
  warehouse_name: string;
  quantity: number;
  reserved_qty?: number;
  damaged_qty?: number;
}

interface InventoryItem {
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
  total_stock?: number;
  barcode?: string;
  brand?: string;
  cost_price?: number;
  selling_price?: number;
  tax_rate?: number;
  status?: string;
  variants?: ProductVariant[];
  currency?: string;
  stock_status?: string;
  warehouse_balances?: WarehouseBalance[];
  created_at: string;
  suppliers: Supplier[];
}

interface DashboardStats {
  total_products: number;
  total_stock_quantity: number;
  total_inventory_value: number;
  total_selling_value: number;
  in_stock_products: number;
  low_stock_products: number;
  out_of_stock_products: number;
  total_suppliers: number;
  total_supplier_links: number;
  pending_purchase_orders: number;
  pending_goods_receipts: number;
  total_warehouses: number;
  recent_movements: any[];
}

const emptyItem = {
  code: "", name: "", description: "", category: "",
  tags: [] as string[], photo_url: "", unit: "pcs", min_stock: 0, current_stock: 0,
  barcode: "", brand: "", cost_price: 0, selling_price: 0, tax_rate: 0,
  status: "Active", currency: "USD", variants: [] as ProductVariant[],
  warehouse_id: null as number | null, adjustment_reason: ""
};

const emptySupplier = {
  supplier_user_id: null as number | null, existing_supplier_id: null as number | null,
  supplier_name: "", supplier_brand: "", supplier_email: "", lot_number: "",
  unit_cost: 0, currency: "USD", lead_time_days: 0, min_order_qty: 0,
  is_preferred: false, notes: ""
};

const CATEGORIES = ["Electronics", "Raw Materials", "Packaging", "Tools", "Office Supplies", "Chemical", "Food & Beverage", "Textile", "Machinery", "Other"];
const UNITS = ["pcs", "kg", "g", "L", "mL", "m", "cm", "box", "pack", "pair", "roll", "set"];
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SGD"];
const MOVEMENT_TYPE_LIST = [
  "OPENING_STOCK", "PURCHASE_IN", "SALE_OUT", "PURCHASE_RETURN", "SALE_RETURN",
  "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE_OUT"
];
const REPORT_TYPES = [
  { id: "current-inventory", label: "Current Inventory" },
  { id: "low-stock", label: "Low-Stock Alert" },
  { id: "out-of-stock", label: "Out-of-Stock" },
  { id: "stock-valuation", label: "Stock Valuation" },
  { id: "stock-movements", label: "Stock Movements" },
  { id: "purchase-orders", label: "Purchase Orders" },
  { id: "supplier-performance", label: "Supplier Performance" },
  { id: "goods-receiving", label: "Goods Receiving (GRN)" },
  { id: "stock-transfers", label: "Stock Transfers" },
  { id: "stock-discrepancies", label: "Stock Discrepancies" },
  { id: "supplier-payments", label: "Supplier Payments" },
];

type WorkspaceTab = "items" | "movements" | "warehouses" | "rfq" | "procurement" | "suppliers" | "reports";

export default function InventoryPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("items");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [supplierAccounts, setSupplierAccounts] = useState<{ id: number; name: string; email: string }[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters & selection for Products
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [stockFilter, setStockFilter] = useState("All");
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Modals for Products & Suppliers
  const [showItemModal, setShowItemModal] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState({ ...emptyItem });
  const [variantInput, setVariantInput] = useState({ sku: "", name: "", cost_price: 0, selling_price: 0, stock: 0, barcode: "" });
  const [showSupplierModal, setShowSupplierModal] = useState<{ itemId: number } | null>(null);
  const [isNewSupplier, setIsNewSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ ...emptySupplier });
  const [showRFQModal, setShowRFQModal] = useState<{ item: InventoryItem } | null>(null);
  const [rfqForm, setRfqForm] = useState({
    supplier_name: "", supplier_email: "", quantity: "", deadline: "",
    warehouse_id: "" as string, notes: "", multi_suppliers: [] as { supplier_name: string; supplier_email: string }[]
  });
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState("code,name,category,brand,barcode,unit,min_stock,current_stock,cost_price,selling_price\n");
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({ category: "", brand: "", status: "", min_stock: "", cost_price: "", selling_price: "", tax_rate: "" });
  const [productHistoryModal, setProductHistoryModal] = useState<any | null>(null);

  // Phase 1 & 5: Stock Movements, Adjustments & Stock Counts
  const [movements, setMovements] = useState<any[]>([]);
  const [mvTypeFilter, setMvTypeFilter] = useState("All");
  const [mvSearch, setMvSearch] = useState("");
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    item_id: 0, warehouse_id: "" as string, movement_type: "ADJUSTMENT_IN",
    quantity: "", reason: "", reference_id: ""
  });
  const [stockCounts, setStockCounts] = useState<any[]>([]);
  const [activeCountModal, setActiveCountModal] = useState<any | null>(null);

  // Phase 2: Warehouses & Transfers
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [whForm, setWhForm] = useState({ warehouse_name: "", warehouse_code: "", address: "", contact_person: "", phone: "", email: "", is_default: false });
  const [warehouseDetail, setWarehouseDetail] = useState<any | null>(null);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    source_warehouse_id: 0, destination_warehouse_id: 0, notes: "",
    items: [{ item_id: 0, requested_qty: 1 }]
  });
  const [receiveTransferModal, setReceiveTransferModal] = useState<any | null>(null);

  // Phase 3: RFQ Comparison & Quotations
  const [comparisons, setComparisons] = useState<any[]>([]);
  const [rfqList, setRfqList] = useState<any[]>([]);
  const [quoteResponseModal, setQuoteResponseModal] = useState<{ rfq_id: number; supplier_name: string; item_name: string } | null>(null);
  const [quoteRespForm, setQuoteRespForm] = useState({ unit_price: "", currency: "USD", min_order_qty: "1", lead_time_days: "7", availability: "In Stock", valid_until: "", notes: "" });

  // Phase 3 & 4: Purchase Orders & Goods Receiving
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<any[]>([]);
  const [showPOModal, setShowPOModal] = useState(false);
  const [poForm, setPoForm] = useState({
    vendor_name: "", vendor_email: "", supplier_id: null as number | null,
    warehouse_id: "" as string, currency: "USD", expected_delivery: "",
    discount: "0", notes: "",
    items: [{ product_id: 0, ordered_qty: 1, unit_cost: 0, tax_rate: 0 }]
  });
  const [receivingPOModal, setReceivingPOModal] = useState<any | null>(null);
  const [receivingItems, setReceivingItems] = useState<any[]>([]);
  const [receivingWarehouseId, setReceivingWarehouseId] = useState<string>("");
  const [receivingNotes, setReceivingNotes] = useState("");

  // Phase 5: Supplier Payments & Outstanding
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    supplier_id: "" as string, supplier_name: "", supplier_email: "",
    purchase_order_id: "" as string, amount: "", currency: "USD",
    payment_method: "Bank Transfer", transaction_reference: "", notes: ""
  });
  const [supplierOutstandingModal, setSupplierOutstandingModal] = useState<any | null>(null);

  // Phase 5: Reports
  const [activeReportType, setActiveReportType] = useState("current-inventory");
  const [reportData, setReportData] = useState<any | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");

  // Common UI state
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [newCredentials, setNewCredentials] = useState<{ supplier_id: number; email: string; password: string; name: string } | null>(null);
  const [sendingCreds, setSendingCreds] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const dropdownSuppliers = Array.from(new Map([
    ...supplierAccounts.map(account => ({ key: `account-${account.id}`, supplier_user_id: account.id, existing_supplier_id: null as number | null, supplier_name: account.name, supplier_email: account.email, supplier_brand: "", currency: "USD" })),
    ...items.flatMap(item => item.suppliers).map(supplier => ({ key: supplier.supplier_user_id ? `account-${supplier.supplier_user_id}` : `link-${supplier.id}`, supplier_user_id: supplier.supplier_user_id || null, existing_supplier_id: supplier.id, supplier_name: supplier.supplier_name, supplier_email: supplier.supplier_email || "", supplier_brand: supplier.supplier_brand || "", currency: supplier.currency }))
  ].map(supplier => [supplier.key, supplier])).values());

  const fetchItems = async (whId: number | null = selectedWarehouseId) => {
    setLoading(true);
    try {
      const whParam = whId ? `?warehouse_id=${whId}` : "";
      const [invRes, dashRes, whRes, accRes] = await Promise.all([
        fetch(`${API_BASE_URL}/inventory${whParam}`),
        fetch(`${API_BASE_URL}/inventory/dashboard${whParam}`),
        fetch(`${API_BASE_URL}/warehouses`),
        fetch(`${API_BASE_URL}/inventory/supplier-accounts`),
      ]);
      if (invRes.ok) setItems((await invRes.json()).items || []);
      if (dashRes.ok) setDashboard(await dashRes.json());
      if (whRes.ok) setWarehouses((await whRes.json()).warehouses || []);
      if (accRes.ok) setSupplierAccounts((await accRes.json()).suppliers || []);
    } finally {
      setLoading(false);
    }
  };

  const fetchMovementsAndCounts = async () => {
    const [mvRes, cntRes] = await Promise.all([
      fetch(`${API_BASE_URL}/stock-movements`),
      fetch(`${API_BASE_URL}/stock-counts`),
    ]);
    if (mvRes.ok) setMovements((await mvRes.json()).movements || []);
    if (cntRes.ok) setStockCounts((await cntRes.json()).counts || []);
  };

  const fetchTransfers = async () => {
    const res = await fetch(`${API_BASE_URL}/stock-transfers`);
    if (res.ok) setTransfers((await res.json()).transfers || []);
  };

  const fetchRfqComparisons = async () => {
    const [compRes, rfqRes] = await Promise.all([
      fetch(`${API_BASE_URL}/rfq/comparison`),
      fetch(`${API_BASE_URL}/rfq`),
    ]);
    if (compRes.ok) setComparisons((await compRes.json()).comparisons || []);
    if (rfqRes.ok) setRfqList((await rfqRes.json()).rfqs || []);
  };

  const fetchProcurement = async () => {
    const [poRes, grRes] = await Promise.all([
      fetch(`${API_BASE_URL}/purchase-orders`),
      fetch(`${API_BASE_URL}/goods-receipts`),
    ]);
    if (poRes.ok) setPurchaseOrders((await poRes.json()).orders || []);
    if (grRes.ok) setGoodsReceipts((await grRes.json()).receipts || []);
  };

  const fetchPayments = async () => {
    const [payRes, poRes] = await Promise.all([
      fetch(`${API_BASE_URL}/supplier-payments`),
      fetch(`${API_BASE_URL}/purchase-orders`),
    ]);
    if (payRes.ok) setSupplierPayments((await payRes.json()).payments || []);
    if (poRes.ok) setPurchaseOrders((await poRes.json()).orders || []);
  };

  const fetchReport = async (type = activeReportType) => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportDateFrom) params.set("date_from", reportDateFrom);
      if (reportDateTo) params.set("date_to", reportDateTo);
      if (selectedWarehouseId) params.set("warehouse_id", String(selectedWarehouseId));
      if (categoryFilter !== "All") params.set("category", categoryFilter);
      if (stockFilter !== "All") params.set("stock_status", stockFilter);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${API_BASE_URL}/inventory/reports/${type}${qs}`);
      if (res.ok) setReportData(await res.json());
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    fetchItems(selectedWarehouseId);
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (activeTab === "movements") fetchMovementsAndCounts();
    if (activeTab === "warehouses") fetchTransfers();
    if (activeTab === "rfq") fetchRfqComparisons();
    if (activeTab === "procurement") fetchProcurement();
    if (activeTab === "suppliers") fetchPayments();
    if (activeTab === "reports") fetchReport(activeReportType);
  }, [activeTab, activeReportType]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("Image must be under 10 MB", "err");
      if (e.target) e.target.value = "";
      return;
    }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE_URL}/upload-image`, { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.file_url) {
        setItemForm(f => ({ ...f, photo_url: data.file_url }));
        showToast(t("inventory.toast_photo_uploaded"), "ok");
      } else {
        showToast(data.detail || t("inventory.toast_upload_failed"), "err");
      }
    } catch {
      showToast(t("inventory.toast_network_error"), "err");
    } finally {
      setUploadingPhoto(false);
      if (e.target) e.target.value = "";
    }
  };

  const stockStatus = (item: InventoryItem) => {
    if (item.current_stock <= 0) return { key: "Out of Stock", label: t("inventory.stock_out_of_stock") || "Out of Stock", color: "text-red-500 bg-red-50 dark:bg-red-900/20" };
    if (item.current_stock <= item.min_stock) return { key: "Low Stock", label: t("inventory.stock_low_stock") || "Low Stock", color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20" };
    return { key: "In Stock", label: t("inventory.stock_in_stock") || "In Stock", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" };
  };

  const filtered = items.filter(item => {
    const q = search.toLowerCase();
    const matchSearch = !q || item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q)
      || (item.barcode || "").toLowerCase().includes(q) || (item.brand || "").toLowerCase().includes(q)
      || (item.category || "").toLowerCase().includes(q) || item.tags.some(tag => tag.toLowerCase().includes(q));
    const matchCat = categoryFilter === "All" || item.category === categoryFilter;
    const st = stockStatus(item).key;
    const matchStock = stockFilter === "All" || st === stockFilter;
    return matchSearch && matchCat && matchStock;
  });

  const openCreate = () => {
    setEditItem(null);
    setItemForm({ ...emptyItem, warehouse_id: selectedWarehouseId });
    setTagInput("");
    setShowItemModal(true);
  };

  const openEdit = (item: InventoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditItem(item);
    setItemForm({
      code: item.code, name: item.name, description: item.description || "",
      category: item.category || "", tags: item.tags || [], photo_url: item.photo_url || "",
      unit: item.unit || "pcs", min_stock: item.min_stock, current_stock: item.current_stock,
      barcode: item.barcode || "", brand: item.brand || "",
      cost_price: item.cost_price || 0, selling_price: item.selling_price || 0,
      tax_rate: item.tax_rate || 0, status: item.status || "Active",
      currency: item.currency || "USD", variants: item.variants || [],
      warehouse_id: selectedWarehouseId, adjustment_reason: ""
    });
    setTagInput("");
    setShowItemModal(true);
  };

  const handleSaveItem = async () => {
    if (!itemForm.name.trim() || !itemForm.code.trim()) return;
    setSaving(true);
    try {
      const url = editItem ? `${API_BASE_URL}/inventory/${editItem.id}` : `${API_BASE_URL}/inventory`;
      const method = editItem ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemForm)
      });
      if (res.ok) {
        setShowItemModal(false);
        fetchItems();
        showToast(editItem ? t("inventory.toast_item_updated") : t("inventory.toast_item_created"));
      }
    } finally { setSaving(false); }
  };

  const handleDeleteItem = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t("inventory.confirm_delete_item"))) return;
    await fetch(`${API_BASE_URL}/inventory/${id}`, { method: "DELETE" });
    fetchItems();
    showToast(t("inventory.toast_deleted"));
  };

  const handleOpenProductHistory = async (itemId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`${API_BASE_URL}/inventory/${itemId}/history`);
    if (res.ok) setProductHistoryModal(await res.json());
  };

  const handleCsvImport = async () => {
    if (!csvText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/import-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_text: csvText }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCsvModal(false);
        fetchItems();
        showToast(`Imported ${data.created} new, updated ${data.updated} products`);
      } else {
        showToast(data.detail || "CSV import failed", "err");
      }
    } finally { setSaving(false); }
  };

  const handleBulkUpdate = async () => {
    if (selectedItemIds.length === 0) return;
    setSaving(true);
    try {
      const payload: any = { item_ids: selectedItemIds };
      if (bulkForm.category) payload.category = bulkForm.category;
      if (bulkForm.brand) payload.brand = bulkForm.brand;
      if (bulkForm.status) payload.status = bulkForm.status;
      if (bulkForm.min_stock !== "") payload.min_stock = parseFloat(bulkForm.min_stock);
      if (bulkForm.cost_price !== "") payload.cost_price = parseFloat(bulkForm.cost_price);
      if (bulkForm.selling_price !== "") payload.selling_price = parseFloat(bulkForm.selling_price);
      if (bulkForm.tax_rate !== "") payload.tax_rate = parseFloat(bulkForm.tax_rate);
      const res = await fetch(`${API_BASE_URL}/inventory/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowBulkModal(false);
        setSelectedItemIds([]);
        fetchItems();
        showToast("Bulk update applied");
      }
    } finally { setSaving(false); }
  };

  const handleAddSupplier = async () => {
    if (!showSupplierModal || !supplierForm.supplier_name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/${showSupplierModal.itemId}/suppliers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierForm)
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.detail || "Failed to add supplier", "err");
        return;
      }
      setShowSupplierModal(null);
      setIsNewSupplier(false);
      setSupplierForm({ ...emptySupplier });
      await fetchItems();
      if (data.credentials_created && data.login_email) {
        setNewCredentials({ supplier_id: data.id, email: data.login_email, password: data.login_password, name: supplierForm.supplier_name });
      } else if (data.supplier_user_id) {
        showToast(data.already_linked ? "This supplier is already assigned to the item." : "Existing supplier account assigned. Login details are unchanged.");
      } else {
        setNewCredentials({ supplier_id: data.id, email: "", password: "", name: supplierForm.supplier_name });
      }
    } catch {
      showToast("Network error — please try again", "err");
    } finally { setSaving(false); }
  };

  const handleSendCredentials = async (supplierId: number, supplierName: string) => {
    setSendingCreds(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/suppliers/${supplierId}/send-credentials`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(`${supplierName}: ${t("inventory.toast_cred_sent")}`);
        fetchItems();
        if (newCredentials?.supplier_id === supplierId) setNewCredentials(null);
      } else {
        showToast(data.detail || t("inventory.toast_cred_send_failed"), "err");
      }
    } catch {
      showToast(t("inventory.toast_cred_send_failed"), "err");
    } finally { setSendingCreds(false); }
  };

  const handleDeleteSupplier = async (supplierId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${API_BASE_URL}/inventory/suppliers/${supplierId}`, { method: "DELETE" });
    fetchItems();
  };

  const handleSendRFQ = async () => {
    if (!showRFQModal) return;
    const targets = rfqForm.multi_suppliers.length > 0
      ? rfqForm.multi_suppliers
      : rfqForm.supplier_email.trim()
        ? [{ supplier_name: rfqForm.supplier_name || rfqForm.supplier_email, supplier_email: rfqForm.supplier_email }]
        : [];
    if (targets.length === 0) return;

    setSaving(true);
    try {
      if (targets.length > 1) {
        await fetch(`${API_BASE_URL}/rfq/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_id: showRFQModal.item.id,
            quantity: rfqForm.quantity ? parseFloat(rfqForm.quantity) : 1,
            deadline: rfqForm.deadline || null,
            warehouse_id: rfqForm.warehouse_id ? parseInt(rfqForm.warehouse_id) : null,
            notes: rfqForm.notes,
            suppliers: targets,
          }),
        });
      } else {
        await fetch(`${API_BASE_URL}/rfq`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_id: showRFQModal.item.id,
            supplier_name: targets[0].supplier_name,
            supplier_email: targets[0].supplier_email,
            quantity: rfqForm.quantity ? parseFloat(rfqForm.quantity) : null,
            deadline: rfqForm.deadline || null,
            warehouse_id: rfqForm.warehouse_id ? parseInt(rfqForm.warehouse_id) : null,
            notes: rfqForm.notes,
          }),
        });
      }
      setShowRFQModal(null);
      showToast(t("inventory.toast_rfq_sent"));
      if (activeTab === "rfq") fetchRfqComparisons();
    } finally { setSaving(false); }
  };

  const handleCreateAdjustment = async () => {
    if (!adjustForm.item_id || !adjustForm.quantity || !adjustForm.reason.trim()) {
      showToast("Select product, quantity and mandatory reason", "err");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/stock-adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: Number(adjustForm.item_id),
          warehouse_id: adjustForm.warehouse_id ? Number(adjustForm.warehouse_id) : null,
          movement_type: adjustForm.movement_type,
          quantity: parseFloat(adjustForm.quantity),
          reason: adjustForm.reason.trim(),
          reference_id: adjustForm.reference_id || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowAdjustModal(false);
        fetchItems();
        fetchMovementsAndCounts();
        showToast("Stock movement recorded");
      } else {
        showToast(data.detail || "Adjustment failed", "err");
      }
    } finally { setSaving(false); }
  };

  const handleStartStockCount = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/stock-counts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouse_id: selectedWarehouseId }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchMovementsAndCounts();
        setActiveCountModal(data.count);
      }
    } finally { setSaving(false); }
  };

  const handleSubmitStockCount = async () => {
    if (!activeCountModal) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/stock-counts/${activeCountModal.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: activeCountModal.items, notes: activeCountModal.notes }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveCountModal(data.count);
        fetchMovementsAndCounts();
        showToast("Physical count submitted for approval");
      }
    } finally { setSaving(false); }
  };

  const handleApproveStockCount = async (countId: number) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/stock-counts/${countId}/approve`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setActiveCountModal(null);
        fetchMovementsAndCounts();
        fetchItems();
        showToast(`Approved count (${data.adjustments_made} stock adjustments created)`);
      } else {
        showToast(data.detail || "Approval failed", "err");
      }
    } finally { setSaving(false); }
  };

  const handleCreateWarehouse = async () => {
    if (!whForm.warehouse_name.trim() || !whForm.warehouse_code.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/warehouses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(whForm),
      });
      const data = await res.json();
      if (res.ok) {
        setShowWarehouseModal(false);
        setWhForm({ warehouse_name: "", warehouse_code: "", address: "", contact_person: "", phone: "", email: "", is_default: false });
        fetchItems();
        showToast("Warehouse created");
      } else {
        showToast(data.detail || "Failed to create warehouse", "err");
      }
    } finally { setSaving(false); }
  };

  const handleViewWarehouseInventory = async (whId: number) => {
    const res = await fetch(`${API_BASE_URL}/warehouses/${whId}/inventory`);
    if (res.ok) setWarehouseDetail(await res.json());
  };

  const handleCreateTransfer = async () => {
    if (!transferForm.source_warehouse_id || !transferForm.destination_warehouse_id) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/stock-transfers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transferForm),
      });
      const data = await res.json();
      if (res.ok) {
        setShowTransferModal(false);
        fetchTransfers();
        showToast("Stock transfer created");
      } else {
        showToast(data.detail || "Transfer failed", "err");
      }
    } finally { setSaving(false); }
  };

  const handleTransferAction = async (transferId: number, action: "approve" | "dispatch") => {
    const res = await fetch(`${API_BASE_URL}/stock-transfers/${transferId}/${action}`, { method: "PUT" });
    const data = await res.json();
    if (res.ok) {
      fetchTransfers();
      fetchItems();
      showToast(`Transfer ${action}d`);
    } else {
      showToast(data.detail || "Action failed", "err");
    }
  };

  const handleReceiveTransfer = async () => {
    if (!receiveTransferModal) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/stock-transfers/${receiveTransferModal.id}/receive`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: receiveTransferModal.items.map((it: any) => ({
            item_id: it.item_id,
            received_qty: Number(it.receive_now_qty ?? (it.dispatched_qty - (it.received_qty || 0))),
            damaged_qty: Number(it.receive_damaged_qty || 0),
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setReceiveTransferModal(null);
        fetchTransfers();
        fetchItems();
        showToast("Transfer goods received & stock updated");
      } else {
        showToast(data.detail || "Receive failed", "err");
      }
    } finally { setSaving(false); }
  };

  const handleSubmitQuoteResponse = async () => {
    if (!quoteResponseModal || !quoteRespForm.unit_price) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/rfq/${quoteResponseModal.rfq_id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_price: parseFloat(quoteRespForm.unit_price),
          currency: quoteRespForm.currency,
          min_order_qty: parseFloat(quoteRespForm.min_order_qty) || 1,
          lead_time_days: parseInt(quoteRespForm.lead_time_days) || null,
          availability: quoteRespForm.availability,
          valid_until: quoteRespForm.valid_until || null,
          notes: quoteRespForm.notes || null,
        }),
      });
      if (res.ok) {
        setQuoteResponseModal(null);
        fetchRfqComparisons();
        showToast("Supplier quotation recorded");
      }
    } finally { setSaving(false); }
  };

  const handleApproveQuotation = async (rfqId: number, responseId: number) => {
    const res = await fetch(`${API_BASE_URL}/rfq/${rfqId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_id: responseId }),
    });
    if (res.ok) {
      fetchRfqComparisons();
      showToast("Quotation approved");
    }
  };

  const handleCreatePOFromRFQ = async (rfqId: number, responseId: number) => {
    const res = await fetch(`${API_BASE_URL}/purchase-orders/from-rfq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfq_id: rfqId, response_id: responseId, warehouse_id: selectedWarehouseId }),
    });
    if (res.ok) {
      fetchRfqComparisons();
      fetchProcurement();
      fetchItems();
      setActiveTab("procurement");
      showToast("Purchase Order created from RFQ");
    }
  };

  const handleCreateManualPO = async () => {
    if (!poForm.vendor_name.trim() || poForm.items.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/purchase-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_name: poForm.vendor_name,
          vendor_email: poForm.vendor_email || null,
          supplier_id: poForm.supplier_id,
          warehouse_id: poForm.warehouse_id ? Number(poForm.warehouse_id) : null,
          currency: poForm.currency,
          expected_delivery: poForm.expected_delivery || null,
          discount: parseFloat(poForm.discount) || 0,
          notes: poForm.notes || null,
          status: "Approved",
          items: poForm.items.filter(i => i.product_id > 0),
        }),
      });
      if (res.ok) {
        setShowPOModal(false);
        fetchProcurement();
        fetchItems();
        showToast("Purchase order created");
      }
    } finally { setSaving(false); }
  };

  const openGoodsReceiving = (po: any) => {
    const poLines = (po.items && po.items.length > 0)
      ? po.items.map((li: any) => {
          const remaining = Math.max(0, Number(li.ordered_qty || 0) - Number(li.accepted_qty || 0));
          return {
            product_id: li.product_id,
            product_name: li.product_name,
            product_code: li.product_code,
            ordered_qty: Number(li.ordered_qty || 0),
            already_accepted: Number(li.accepted_qty || 0),
            received_qty: remaining,
            damaged_qty: 0,
            lot_number: "",
            expiry_date: "",
            unit_cost: Number(li.unit_cost || 0),
          };
        })
      : items.slice(0, 1).map(it => ({
          product_id: it.id,
          product_name: it.name,
          product_code: it.code,
          ordered_qty: 1,
          already_accepted: 0,
          received_qty: 1,
          damaged_qty: 0,
          lot_number: "",
          expiry_date: "",
          unit_cost: it.cost_price || 0,
        }));
    setReceivingPOModal(po);
    setReceivingItems(poLines);
    setReceivingWarehouseId(po.warehouse_id ? String(po.warehouse_id) : (selectedWarehouseId ? String(selectedWarehouseId) : ""));
    setReceivingNotes("");
  };

  const handleConfirmGoodsReceipt = async () => {
    if (!receivingPOModal) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/goods-receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchase_order_id: receivingPOModal.id,
          warehouse_id: receivingWarehouseId ? Number(receivingWarehouseId) : null,
          notes: receivingNotes || null,
          idempotency_key: `grn-${receivingPOModal.id}-${Date.now()}`,
          items: receivingItems.map(li => ({
            product_id: Number(li.product_id),
            ordered_qty: Number(li.ordered_qty),
            received_qty: Number(li.received_qty),
            damaged_qty: Number(li.damaged_qty || 0),
            lot_number: li.lot_number || null,
            expiry_date: li.expiry_date || null,
            unit_cost: Number(li.unit_cost || 0),
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setReceivingPOModal(null);
        fetchProcurement();
        fetchItems();
        showToast(`Goods received (${data.receipt.receipt_number}) · PO is now ${data.po_status}`);
      } else {
        showToast(data.detail || "Goods receiving failed", "err");
      }
    } finally { setSaving(false); }
  };

  const handleRecordPayment = async () => {
    if (!paymentForm.amount) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/supplier-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: paymentForm.supplier_id ? Number(paymentForm.supplier_id) : null,
          supplier_name: paymentForm.supplier_name || null,
          supplier_email: paymentForm.supplier_email || null,
          purchase_order_id: paymentForm.purchase_order_id ? Number(paymentForm.purchase_order_id) : null,
          amount: parseFloat(paymentForm.amount),
          currency: paymentForm.currency,
          payment_method: paymentForm.payment_method,
          transaction_reference: paymentForm.transaction_reference || null,
          notes: paymentForm.notes || null,
        }),
      });
      if (res.ok) {
        setShowPaymentModal(false);
        fetchPayments();
        showToast("Supplier payment recorded");
      }
    } finally { setSaving(false); }
  };

  const handleViewSupplierOutstanding = async (supplierId: number) => {
    const res = await fetch(`${API_BASE_URL}/suppliers/${supplierId}/outstanding`);
    if (res.ok) setSupplierOutstandingModal(await res.json());
  };

  const handleTagAdd = () => {
    const tag = tagInput.trim();
    if (tag && !itemForm.tags.includes(tag)) {
      setItemForm(f => ({ ...f, tags: [...f.tags, tag] }));
    }
    setTagInput("");
  };

  const handleVariantAdd = () => {
    if (!variantInput.sku.trim() || !variantInput.name.trim()) return;
    setItemForm(f => ({
      ...f,
      variants: [...(f.variants || []), { ...variantInput }],
    }));
    setVariantInput({ sku: "", name: "", cost_price: 0, selling_price: 0, stock: 0, barcode: "" });
  };

  const categories = ["All", ...Array.from(new Set(items.map(i => i.category || "Other")))];

  const groupedSuppliers = items.reduce((acc, item) => {
    item.suppliers.forEach(sup => {
      const key = sup.supplier_email || sup.supplier_name;
      if (!acc[key]) {
        acc[key] = {
          id: sup.id,
          name: sup.supplier_name,
          email: sup.supplier_email,
          brand: sup.supplier_brand,
          items: []
        };
      }
      acc[key].items.push({ ...item, supplier_details: sup });
    });
    return acc;
  }, {} as Record<string, any>);
  const uniqueSuppliers = Object.values(groupedSuppliers);

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-black min-h-screen">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-[200] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold ${toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
            {toast.type === "ok" ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Credentials Modal */}
      <AnimatePresence>
        {newCredentials && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{newCredentials.name}</h2>
                  <p className="text-xs text-slate-500">
                    {newCredentials.email ? t("inventory.cred_can_login") : "Supplier added — add an email to enable portal login"}
                  </p>
                </div>
              </div>

              {newCredentials.email ? (
                <>
                  <div className="space-y-3 mb-5">
                    <div className="p-4 bg-slate-900 rounded-xl">
                      <p className="text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wider">{t("inventory.cred_login_url")}</p>
                      <code className="text-blue-400 text-sm font-mono break-all">{typeof window !== "undefined" ? `${window.location.origin}/login` : ""}</code>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 bg-slate-900 rounded-xl">
                        <p className="text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wider">{t("inventory.cred_email")}</p>
                        <code className="text-emerald-400 text-sm font-mono break-all select-all">{newCredentials.email}</code>
                      </div>
                      <div className="p-4 bg-slate-900 rounded-xl">
                        <p className="text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wider">{t("inventory.cred_password")}</p>
                        <code className="text-amber-400 text-sm font-mono select-all">{newCredentials.password}</code>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-4">
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {t("inventory.cred_share_notice")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSendCredentials(newCredentials.supplier_id, newCredentials.name)}
                      disabled={sendingCreds}
                      className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                      {sendingCreds ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {t("inventory.cred_send_email")}
                    </button>
                    <button onClick={() => { setNewCredentials(null); showToast(t("inventory.toast_supplier_added_login")); }}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-all">
                      {t("inventory.cred_done_btn")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl mb-5">
                    <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                      To enable supplier portal login, edit this supplier and add their email address. A login account will be created automatically.
                    </p>
                  </div>
                  <button onClick={() => { setNewCredentials(null); showToast(t("inventory.toast_supplier_added")); }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-all">
                    {t("inventory.cred_done_btn")}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Pulpos 10-KPI Dashboard */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{t("inventory.title")}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {items.length} {t("inventory.items_label")} · {items.reduce((a, b) => a + b.suppliers.length, 0)} {t("inventory.supplier_links_label")} · Pulpos Inventory, Warehouse & Procurement Suite
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {warehouses.length > 0 && (
              <select
                value={selectedWarehouseId || ""}
                onChange={e => setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                <option value="">All Warehouses</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.warehouse_name} ({w.warehouse_code})</option>
                ))}
              </select>
            )}
            <button onClick={() => setShowCsvModal(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-all">
              <FileSpreadsheet className="w-3.5 h-3.5" /> CSV Import
            </button>
            <button onClick={() => { setAdjustForm({ item_id: items[0]?.id || 0, warehouse_id: selectedWarehouseId ? String(selectedWarehouseId) : "", movement_type: "ADJUSTMENT_IN", quantity: "", reason: "", reference_id: "" }); setShowAdjustModal(true); }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-all">
              <ArrowLeftRight className="w-3.5 h-3.5" /> Adjust Stock
            </button>
            <ExportActions
              downloadUrl={`${API_BASE_URL}/inventory/export-pdf`}
              emailUrl={`${API_BASE_URL}/inventory/export-pdf`}
              filename="inventory_list.pdf"
              label="Inventory"
              items={items.map(i => ({ id: i.id, name: i.name, code: i.code }))}
              multiDownloadUrl={`${API_BASE_URL}/inventory/pdf`}
            />
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-all hover:shadow-md active:scale-95">
              <Plus className="w-4 h-4" /> {t("inventory.btn_add_item")}
            </button>
          </div>
        </div>

        {/* Pulpos 10-Metric Live Dashboard */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
          {[
            { label: t("inventory.stat_total_items") || "Total Products", value: dashboard?.total_products ?? items.length, color: "text-blue-600", bg: "bg-blue-500/10" },
            { label: "Total Stock Qty", value: dashboard?.total_stock_quantity ?? items.reduce((a, b) => a + (b.current_stock || 0), 0), color: "text-cyan-600", bg: "bg-cyan-500/10" },
            { label: "Inventory Value", value: `$${(dashboard?.total_inventory_value ?? 0).toLocaleString()}`, color: "text-teal-600", bg: "bg-teal-500/10" },
            { label: t("inventory.stat_in_stock") || "In Stock", value: dashboard?.in_stock_products ?? items.filter(i => i.current_stock > i.min_stock && i.current_stock > 0).length, color: "text-emerald-600", bg: "bg-emerald-500/10" },
            { label: "Low Stock", value: dashboard?.low_stock_products ?? items.filter(i => i.current_stock > 0 && i.current_stock <= i.min_stock).length, color: "text-amber-600", bg: "bg-amber-500/10" },
            { label: "Out of Stock", value: dashboard?.out_of_stock_products ?? items.filter(i => i.current_stock <= 0).length, color: "text-red-600", bg: "bg-red-500/10" },
            { label: t("inventory.stat_suppliers") || "Suppliers", value: dashboard?.total_suppliers ?? uniqueSuppliers.length, color: "text-violet-600", bg: "bg-violet-500/10" },
            { label: "Pending POs", value: dashboard?.pending_purchase_orders ?? 0, color: "text-indigo-600", bg: "bg-indigo-500/10" },
            { label: "Pending Receipts", value: dashboard?.pending_goods_receipts ?? 0, color: "text-orange-600", bg: "bg-orange-500/10" },
            { label: "Warehouses", value: dashboard?.total_warehouses ?? warehouses.length, color: "text-fuchsia-600", bg: "bg-fuchsia-500/10" },
          ].map(s => (
            <div key={s.label} className={`flex items-center justify-between px-4 py-2.5 rounded-xl ${s.bg}`}>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold">{s.label}</p>
              <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pulpos Workspace Navigation Tabs */}
      <div className="px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-black overflow-x-auto">
        <div className="flex bg-slate-100 dark:bg-zinc-900 p-1 rounded-2xl w-fit gap-1">
          {[
            { id: "items", label: "Products", icon: Package },
            { id: "movements", label: "Stock Movements & Counts", icon: ArrowLeftRight },
            { id: "warehouses", label: "Warehouses & Transfers", icon: WarehouseIcon },
            { id: "rfq", label: "RFQ & Quote Comparison", icon: Send },
            { id: "procurement", label: "Purchase Orders & Receiving", icon: Truck },
            { id: "suppliers", label: "Suppliers & Payments", icon: Building2 },
            { id: "reports", label: "Reports & Analytics", icon: BarChart3 },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as WorkspaceTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 1: PRODUCTS (INVENTORY ITEMS)
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "items" && (
        <>
          <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-black border-b border-slate-200 dark:border-slate-800 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Search name, SKU, barcode, brand, tag..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 dark:text-white placeholder:text-slate-400" />
              </div>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                {["All", "In Stock", "Low Stock", "Out of Stock"].map(st => (
                  <button key={st} onClick={() => setStockFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${stockFilter === st ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-sm" : "text-slate-500"}`}>
                    {st}
                  </button>
                ))}
              </div>
              {selectedItemIds.length > 0 && (
                <button onClick={() => setShowBulkModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-bold shadow-sm">
                  <CheckSquare className="w-3.5 h-3.5" /> Bulk Update ({selectedItemIds.length})
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {categories.map(cat => (
                <button key={cat} onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${categoryFilter === cat ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
                  {cat === "All" ? t("inventory.filter_all") : cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <Package className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t("inventory.empty_title")}</h3>
                <p className="text-sm text-slate-500 mt-1">{t("inventory.empty_desc")}</p>
                <button onClick={openCreate} className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
                  <Plus className="w-4 h-4" /> {t("inventory.empty_add_first")}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(item => {
                  const stock = stockStatus(item);
                  const isExpanded = expandedId === item.id;
                  const preferredSupplier = item.suppliers.find(s => s.is_preferred) || item.suppliers[0];
                  const isSelected = selectedItemIds.includes(item.id);
                  return (
                    <motion.div key={item.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-white dark:bg-[#111] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4 p-4 cursor-pointer select-none" onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            if (e.target.checked) setSelectedItemIds(prev => [...prev, item.id]);
                            else setSelectedItemIds(prev => prev.filter(id => id !== item.id));
                          }}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                        <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                          {item.photo_url ? (
                            <img src={item.photo_url.startsWith("/static") ? `${API_BASE_URL}${item.photo_url}` : item.photo_url} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-6 h-6 text-slate-400" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-white text-sm">{item.name}</span>
                            <span className="text-[11px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{item.code}</span>
                            {item.barcode && (
                              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded flex items-center gap-1">
                                <Barcode className="w-3 h-3" /> {item.barcode}
                              </span>
                            )}
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${stock.color}`}>{stock.label}</span>
                            {item.status && item.status !== "Active" && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{item.status}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-[12px] text-slate-500 dark:text-slate-400 flex-wrap">
                            {item.category && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{item.category}</span>}
                            {item.brand && <span>Brand: <b className="text-slate-700 dark:text-slate-200">{item.brand}</b></span>}
                            <span>{t("inventory.label_stock")} <b className="text-slate-700 dark:text-slate-200">{item.current_stock} {item.unit || t("inventory.default_unit")}</b></span>
                            <span>{t("inventory.label_min")} <b className="text-slate-700 dark:text-slate-200">{item.min_stock} {item.unit || t("inventory.default_unit")}</b></span>
                            {(item.cost_price || item.selling_price) ? (
                              <span>
                                Cost: <b className="text-slate-700 dark:text-slate-200">${item.cost_price || 0}</b> · Sell: <b className="text-emerald-600">${item.selling_price || 0}</b>
                              </span>
                            ) : null}
                            {preferredSupplier && (
                              <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                                <Building2 className="w-3 h-3" />
                                {preferredSupplier.supplier_name}
                                {preferredSupplier.unit_cost ? ` · ${preferredSupplier.currency} ${preferredSupplier.unit_cost}` : ""}
                              </span>
                            )}
                            {item.variants && item.variants.length > 0 && (
                              <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold">
                                <Layers className="w-3 h-3" /> {item.variants.length} variants
                              </span>
                            )}
                          </div>
                          {item.tags.length > 0 && (
                            <div className="flex gap-1 mt-1.5 flex-wrap">
                              {item.tags.map(tag => (
                                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-medium text-slate-400 mr-1">{item.suppliers.length} {item.suppliers.length !== 1 ? t("inventory.suppliers_suffix") : t("inventory.supplier_suffix")}</span>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setAdjustForm({ item_id: item.id, warehouse_id: selectedWarehouseId ? String(selectedWarehouseId) : "", movement_type: "ADJUSTMENT_IN", quantity: "", reason: "", reference_id: "" });
                              setShowAdjustModal(true);
                            }}
                            title="Adjust Stock"
                            className="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-slate-400 hover:text-indigo-600 transition-colors"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => handleOpenProductHistory(item.id, e)}
                            title="Stock History & Warehouses"
                            className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 text-slate-400 hover:text-amber-600 transition-colors"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setShowRFQModal({ item });
                              setRfqForm({
                                supplier_name: preferredSupplier?.supplier_name || "",
                                supplier_email: preferredSupplier?.supplier_email || "",
                                quantity: String(Math.max(10, (item.min_stock || 10) * 2)),
                                deadline: "",
                                warehouse_id: selectedWarehouseId ? String(selectedWarehouseId) : "",
                                notes: "",
                                multi_suppliers: item.suppliers.filter(s => s.supplier_email).map(s => ({ supplier_name: s.supplier_name, supplier_email: s.supplier_email! })),
                              });
                            }}
                            title={t("inventory.title_send_rfq")}
                            className="p-1.5 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 text-slate-400 hover:text-violet-600 transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={e => openEdit(item, e)} title={t("inventory.title_edit")} className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={e => handleDeleteItem(item.id, e)} title={t("inventory.title_delete")} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="border-t border-slate-100 dark:border-slate-800 overflow-hidden">
                            <div className="p-4 space-y-4">
                              {item.warehouse_balances && item.warehouse_balances.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Warehouse Stock Breakdown</h4>
                                  <div className="flex flex-wrap gap-2">
                                    {item.warehouse_balances.map(wb => (
                                      <div key={wb.warehouse_id} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold flex items-center gap-2">
                                        <WarehouseIcon className="w-3.5 h-3.5 text-blue-600" />
                                        <span>{wb.warehouse_name}:</span>
                                        <b className="text-slate-900 dark:text-white">{wb.quantity} {item.unit || "pcs"}</b>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("inventory.section_suppliers_cost")}</h4>
                                  <button onClick={() => { setShowSupplierModal({ itemId: item.id }); setIsNewSupplier(false); setSupplierForm({ ...emptySupplier }); }}
                                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                                    <Plus className="w-3 h-3" /> {t("inventory.btn_add_supplier")}
                                  </button>
                                </div>
                                {item.suppliers.length === 0 ? (
                                  <p className="text-sm text-slate-400 text-center py-4">{t("inventory.no_suppliers")}</p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {item.suppliers.map(s => (
                                      <div key={s.id} className={`p-3 rounded-xl border ${s.is_preferred ? "border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/10" : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"}`}>
                                        <div className="flex items-start justify-between mb-2">
                                          <div>
                                            <div className="flex items-center gap-1">
                                              {s.is_preferred && <Star className="w-3 h-3 text-violet-500 fill-violet-500" />}
                                              <span className="text-sm font-bold text-slate-800 dark:text-white">{s.supplier_name}</span>
                                            </div>
                                            {s.supplier_brand && <span className="text-[11px] text-slate-500">{s.supplier_brand}</span>}
                                          </div>
                                          <div className="flex items-center gap-1">
                                            {s.credentials_ready && (
                                              <button
                                                onClick={e => { e.stopPropagation(); handleSendCredentials(s.id, s.supplier_name); }}
                                                disabled={sendingCreds}
                                                title={s.credentials_sent ? t("inventory.title_resend_creds") : t("inventory.title_send_creds")}
                                                className={`p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors ${s.credentials_sent ? "text-emerald-500" : "text-slate-400 hover:text-emerald-600"}`}>
                                                {sendingCreds ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                              </button>
                                            )}
                                            <button onClick={e => handleDeleteSupplier(s.id, e)}
                                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-300 hover:text-red-500 transition-colors">
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                        <div className="space-y-1 text-[12px] text-slate-600 dark:text-slate-400">
                                          {s.unit_cost != null && <div className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{s.currency} {s.unit_cost} {t("inventory.per_unit")}</div>}
                                          {s.lead_time_days != null && <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.lead_time_days} {t("inventory.day_lead_time")}</div>}
                                          {s.lot_number && <div className="flex items-center gap-1"><ShoppingCart className="w-3 h-3" />{t("inventory.lot_label")} {s.lot_number}</div>}
                                          {s.supplier_email && <div className="text-blue-500 truncate">{s.supplier_email}</div>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 2: STOCK MOVEMENTS & PHYSICAL STOCK COUNTING
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "movements" && (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Immutable Stock Movement Ledger</h2>
                <p className="text-xs text-slate-500">Every stock change is audited with previous stock, new stock, reason, reference, and operator.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setAdjustForm({ item_id: items[0]?.id || 0, warehouse_id: selectedWarehouseId ? String(selectedWarehouseId) : "", movement_type: "ADJUSTMENT_IN", quantity: "", reason: "", reference_id: "" });
                    setShowAdjustModal(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" /> New Stock Adjustment
                </button>
                <button
                  onClick={handleStartStockCount}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" /> Start Physical Stock Count
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap mb-4">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={mvSearch} onChange={e => setMvSearch(e.target.value)} placeholder="Filter product, reason, ref..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" />
              </div>
              <select value={mvTypeFilter} onChange={e => setMvTypeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                <option value="All">All Movement Types</option>
                {MOVEMENT_TYPE_LIST.map(mt => <option key={mt} value={mt}>{mt}</option>)}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3">Warehouse</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Change</th>
                    <th className="py-2.5 px-3">Previous</th>
                    <th className="py-2.5 px-3">New Balance</th>
                    <th className="py-2.5 px-3">Reference</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {movements
                    .filter(m => (mvTypeFilter === "All" || m.movement_type === mvTypeFilter) && (!mvSearch || `${m.item_name} ${m.item_code} ${m.reason} ${m.reference_id || ""}`.toLowerCase().includes(mvSearch.toLowerCase())))
                    .map(m => (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <td className="py-2.5 px-3 text-slate-500">{m.created_at ? new Date(m.created_at).toLocaleString() : "—"}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">{m.item_name} <span className="text-slate-400 font-mono">({m.item_code})</span></td>
                        <td className="py-2.5 px-3">{m.warehouse_name}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.change >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
                            {m.movement_type}
                          </span>
                        </td>
                        <td className={`py-2.5 px-3 font-black ${m.change >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {m.change >= 0 ? `+${m.quantity}` : `-${m.quantity}`} {m.item_unit}
                        </td>
                        <td className="py-2.5 px-3">{m.previous_stock}</td>
                        <td className="py-2.5 px-3 font-bold">{m.new_stock}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{m.reference_id || "—"}</td>
                        <td className="py-2.5 px-3">{m.reason}</td>
                        <td className="py-2.5 px-3 text-slate-500">{m.performed_by_name}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Physical Stock Counts Section */}
          <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">Physical Stock Counts & Discrepancy Audits</h3>
            {stockCounts.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">No physical stock counts yet. Click &ldquo;Start Physical Stock Count&rdquo; above to audit inventory.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stockCounts.map(cnt => {
                  const discCount = (cnt.items || []).filter((i: any) => Math.abs(Number(i.discrepancy || 0)) > 0).length;
                  return (
                    <div key={cnt.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">{cnt.count_number}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cnt.status === "Approved" ? "bg-emerald-500/10 text-emerald-600" : cnt.status === "Submitted" ? "bg-amber-500/10 text-amber-600" : "bg-slate-200 text-slate-600"}`}>
                            {cnt.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{cnt.warehouse_name} · {(cnt.items || []).length} items · {discCount} discrepancies</p>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => setActiveCountModal(cnt)} className="flex-1 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold">
                          {cnt.status === "Approved" ? "View Audit" : "Enter / Review Count"}
                        </button>
                        {cnt.status === "Submitted" && (
                          <button onClick={() => handleApproveStockCount(cnt.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                            Approve
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 3: WAREHOUSES & STOCK TRANSFERS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "warehouses" && (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Multi-Warehouse Management</h2>
              <p className="text-xs text-slate-500">Manage physical locations, inspect warehouse stock valuation, and dispatch inter-warehouse transfers.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowWarehouseModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold">
                <Plus className="w-3.5 h-3.5" /> Add Warehouse
              </button>
              {warehouses.length >= 2 && (
                <button
                  onClick={() => {
                    setTransferForm({
                      source_warehouse_id: warehouses[0]?.id || 0,
                      destination_warehouse_id: warehouses[1]?.id || 0,
                      notes: "",
                      items: [{ item_id: items[0]?.id || 0, requested_qty: 1 }],
                    });
                    setShowTransferModal(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" /> New Stock Transfer
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {warehouses.map(w => (
              <div key={w.id} className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 dark:text-white">{w.warehouse_name}</h3>
                      <span className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{w.warehouse_code}</span>
                      {w.is_default && <span className="text-[10px] font-bold bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full">Default</span>}
                    </div>
                    {w.address && <p className="text-xs text-slate-500 mt-1">{w.address}</p>}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${w.status === "Active" ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-200 text-slate-500"}`}>{w.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 my-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900">
                  <div><p className="text-[10px] text-slate-400 uppercase">Products</p><p className="text-sm font-black">{w.product_count}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase">Units</p><p className="text-sm font-black">{w.total_stock_qty}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase">Value</p><p className="text-sm font-black text-emerald-600">${w.total_stock_value}</p></div>
                </div>
                <button onClick={() => handleViewWarehouseInventory(w.id)} className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-blue-600 hover:text-white transition-colors">
                  Inspect Warehouse Inventory
                </button>
              </div>
            ))}
          </div>

          {warehouseDetail && (
            <div className="bg-white dark:bg-[#111] border border-blue-200 dark:border-blue-900 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {warehouseDetail.warehouse.warehouse_name} — Stock Breakdown (${warehouseDetail.total_value})
                </h3>
                <button onClick={() => setWarehouseDetail(null)}><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase">
                      <th className="py-2 px-3">SKU</th>
                      <th className="py-2 px-3">Product</th>
                      <th className="py-2 px-3">Available Qty</th>
                      <th className="py-2 px-3">Damaged Qty</th>
                      <th className="py-2 px-3">Unit Cost</th>
                      <th className="py-2 px-3">Stock Value</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {warehouseDetail.items.map((it: any) => (
                      <tr key={it.item_id}>
                        <td className="py-2 px-3 font-mono">{it.code}</td>
                        <td className="py-2 px-3 font-bold">{it.name}</td>
                        <td className="py-2 px-3 font-black">{it.quantity} {it.unit}</td>
                        <td className="py-2 px-3 text-red-500">{it.damaged_qty}</td>
                        <td className="py-2 px-3">${it.unit_cost}</td>
                        <td className="py-2 px-3 font-bold text-emerald-600">${it.stock_value}</td>
                        <td className="py-2 px-3">{it.stock_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stock Transfers Table */}
          <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white mb-3">Inter-Warehouse Stock Transfers</h3>
            {transfers.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">No stock transfers recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {transfers.map(trf => (
                  <div key={trf.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">{trf.transfer_number}</span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {trf.source_warehouse_name} → {trf.destination_warehouse_name}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600">{trf.status}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {(trf.items || []).map((i: any) => `${i.item_name} (Req: ${i.requested_qty}, Disp: ${i.dispatched_qty || 0}, Acc: ${i.accepted_qty || 0})`).join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {trf.status === "Pending Approval" && (
                        <button onClick={() => handleTransferAction(trf.id, "approve")} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold">
                          Approve
                        </button>
                      )}
                      {trf.status === "Approved" && (
                        <button onClick={() => handleTransferAction(trf.id, "dispatch")} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold">
                          Dispatch Stock
                        </button>
                      )}
                      {(trf.status === "Dispatched" || trf.status === "Partially Received") && (
                        <button onClick={() => setReceiveTransferModal(trf)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                          Receive & Verify
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 4: RFQ & SIDE-BY-SIDE QUOTATION COMPARISON
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "rfq" && (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">RFQ Management & Side-by-Side Quotation Comparison</h2>
              <p className="text-xs text-slate-500">Compare Unit Price, MOQ, Lead Time, Availability, Preferred status, and Total Cost across suppliers before approving and generating a Purchase Order.</p>
            </div>
            {items.length > 0 && (
              <button
                onClick={() => {
                  const first = items[0];
                  setShowRFQModal({ item: first });
                  setRfqForm({
                    supplier_name: "", supplier_email: "", quantity: "50", deadline: "",
                    warehouse_id: selectedWarehouseId ? String(selectedWarehouseId) : "", notes: "",
                    multi_suppliers: first.suppliers.filter(s => s.supplier_email).map(s => ({ supplier_name: s.supplier_name, supplier_email: s.supplier_email! })),
                  });
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                <Send className="w-3.5 h-3.5" /> Create Multi-Supplier RFQ
              </button>
            )}
          </div>

          {comparisons.length === 0 ? (
            <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
              <Send className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No RFQs sent yet</p>
              <p className="text-xs text-slate-400 mt-1">Send an RFQ from any product row to compare supplier quotations side-by-side.</p>
            </div>
          ) : (
            comparisons.map(comp => (
              <div key={comp.item_id} className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      {comp.item_name} <span className="font-mono text-xs text-slate-400">({comp.item_code})</span>
                    </h3>
                    <p className="text-xs text-slate-500">Current Stock: {comp.current_stock} {comp.unit} · Min Stock: {comp.min_stock} {comp.unit}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <thead className="bg-slate-50 dark:bg-slate-900">
                      <tr>
                        <th className="py-2.5 px-4 font-bold text-slate-500">Comparison Field</th>
                        {comp.quotations.map((q: any, idx: number) => (
                          <th key={`${q.rfq_id}-${q.response_id || idx}`} className="py-2.5 px-4 font-bold text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-1.5">
                              {q.is_preferred && <Star className="w-3.5 h-3.5 text-violet-500 fill-violet-500" />}
                              <span>{q.supplier_name}</span>
                            </div>
                            <span className="text-[10px] font-normal text-slate-400 block">{q.supplier_email}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      <tr>
                        <td className="py-2 px-4 font-semibold text-slate-500">Unit Price</td>
                        {comp.quotations.map((q: any, idx: number) => (
                          <td key={idx} className="py-2 px-4 font-black text-emerald-600 border-l border-slate-200 dark:border-slate-800">
                            {q.unit_price != null ? `${q.currency} ${q.unit_price}` : "Pending Quote"}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-4 font-semibold text-slate-500">Currency</td>
                        {comp.quotations.map((q: any, idx: number) => (
                          <td key={idx} className="py-2 px-4 border-l border-slate-200 dark:border-slate-800">{q.currency}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-4 font-semibold text-slate-500">MOQ (Min Order Qty)</td>
                        {comp.quotations.map((q: any, idx: number) => (
                          <td key={idx} className="py-2 px-4 border-l border-slate-200 dark:border-slate-800">{q.min_order_qty ?? "—"}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-4 font-semibold text-slate-500">Lead Time</td>
                        {comp.quotations.map((q: any, idx: number) => (
                          <td key={idx} className="py-2 px-4 border-l border-slate-200 dark:border-slate-800">{q.lead_time_days != null ? `${q.lead_time_days} days` : "—"}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-4 font-semibold text-slate-500">Availability</td>
                        {comp.quotations.map((q: any, idx: number) => (
                          <td key={idx} className="py-2 px-4 border-l border-slate-200 dark:border-slate-800">{q.availability}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-4 font-semibold text-slate-500">Preferred Supplier</td>
                        {comp.quotations.map((q: any, idx: number) => (
                          <td key={idx} className="py-2 px-4 border-l border-slate-200 dark:border-slate-800">
                            {q.is_preferred ? <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 font-bold">Preferred</span> : "No"}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-4 font-semibold text-slate-500">Total Cost (Req: {comp.quotations[0]?.requested_qty || 1})</td>
                        {comp.quotations.map((q: any, idx: number) => (
                          <td key={idx} className="py-2 px-4 font-black text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-800">
                            {q.total_cost != null ? `${q.currency} ${q.total_cost.toLocaleString()}` : "—"}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 font-semibold text-slate-500">Decision / Action</td>
                        {comp.quotations.map((q: any, idx: number) => (
                          <td key={idx} className="py-2.5 px-4 border-l border-slate-200 dark:border-slate-800">
                            {q.response_id ? (
                              <div className="flex flex-wrap gap-1.5">
                                {q.approval_status !== "Approved" && (
                                  <button onClick={() => handleApproveQuotation(q.rfq_id, q.response_id)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-bold">
                                    Approve Quote
                                  </button>
                                )}
                                <button onClick={() => handleCreatePOFromRFQ(q.rfq_id, q.response_id)}
                                  className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-bold">
                                  Create PO
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setQuoteResponseModal({ rfq_id: q.rfq_id, supplier_name: q.supplier_name, item_name: comp.item_name });
                                  setQuoteRespForm({ unit_price: "", currency: "USD", min_order_qty: String(q.requested_qty || 1), lead_time_days: "7", availability: "In Stock", valid_until: "", notes: "" });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-blue-600 text-[11px] font-bold"
                              >
                                + Enter Supplier Quote
                              </button>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 5: PURCHASE ORDERS & GOODS RECEIVING (GRN)
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "procurement" && (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Purchase Orders & Goods Receiving (GRN)</h2>
              <p className="text-xs text-slate-500">Issue purchase orders, track supplier confirmation, inspect incoming deliveries, exclude damaged units, and update stock atomically.</p>
            </div>
            <button
              onClick={() => {
                setPoForm({
                  vendor_name: uniqueSuppliers[0]?.name || "",
                  vendor_email: uniqueSuppliers[0]?.email || "",
                  supplier_id: uniqueSuppliers[0]?.id || null,
                  warehouse_id: selectedWarehouseId ? String(selectedWarehouseId) : "",
                  currency: "USD",
                  expected_delivery: "",
                  discount: "0",
                  notes: "",
                  items: [{ product_id: items[0]?.id || 0, ordered_qty: 10, unit_cost: items[0]?.cost_price || 10, tax_rate: items[0]?.tax_rate || 0 }],
                });
                setShowPOModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Create Purchase Order
            </button>
          </div>

          <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white mb-3">Purchase Orders ({purchaseOrders.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase">
                    <th className="py-2.5 px-3">PO #</th>
                    <th className="py-2.5 px-3">Supplier</th>
                    <th className="py-2.5 px-3">Items</th>
                    <th className="py-2.5 px-3">Total</th>
                    <th className="py-2.5 px-3">Order Status</th>
                    <th className="py-2.5 px-3">Payment</th>
                    <th className="py-2.5 px-3">Expected Delivery</th>
                    <th className="py-2.5 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {purchaseOrders.map(po => (
                    <tr key={po.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      <td className="py-2.5 px-3 font-mono font-bold">{po.po_number}</td>
                      <td className="py-2.5 px-3">
                        <p className="font-bold text-slate-900 dark:text-white">{po.vendor_name}</p>
                        {po.vendor_email && <p className="text-[11px] text-slate-400">{po.vendor_email}</p>}
                      </td>
                      <td className="py-2.5 px-3">
                        {(po.items && po.items.length > 0)
                          ? po.items.map((i: any) => `${i.product_name} (${i.accepted_qty || 0}/${i.ordered_qty})`).join(", ")
                          : "General Order"}
                      </td>
                      <td className="py-2.5 px-3 font-black">{po.currency} {Number(po.total_amount || po.grand_total || 0).toLocaleString()}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600">{po.status}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${po.payment_status === "Fully Paid" ? "bg-emerald-500/10 text-emerald-600" : po.payment_status === "Partially Paid" ? "bg-amber-500/10 text-amber-600" : "bg-slate-100 text-slate-600"}`}>
                          {po.payment_status || "Unpaid"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{po.expected_delivery || "—"}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {po.status !== "Received" && po.status !== "Cancelled" && (
                            <button onClick={() => openGoodsReceiving(po)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">
                              Receive Goods
                            </button>
                          )}
                          <a href={`${API_BASE_URL}/purchase-orders/${po.id}/pdf`} target="_blank" rel="noreferrer"
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 hover:text-blue-600">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Goods Receipts History */}
          <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white mb-3">Goods Receiving History ({goodsReceipts.length})</h3>
            {goodsReceipts.length === 0 ? (
              <p className="text-xs text-slate-400">No goods receipts recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {goodsReceipts.map(gr => (
                  <div key={gr.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{gr.receipt_number}</span>
                      <span className="text-slate-500 ml-2">PO: {gr.po_number} · Vendor: {gr.vendor_name} · Warehouse: {gr.warehouse_name}</span>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {(gr.items || []).map((li: any) => `${li.product_name}: Rec ${li.received_qty}, Damaged ${li.damaged_qty}, Accepted +${li.accepted_qty}${li.lot_number ? ` (Lot: ${li.lot_number})` : ""}`).join(" · ")}
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600">{gr.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 6: SUPPLIERS & SUPPLIER PAYMENTS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "suppliers" && (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Supplier Directory & Payment Ledger</h2>
              <p className="text-xs text-slate-500">Track supplier catalogs, portal access, purchase order payments, and outstanding balances.</p>
            </div>
            <button
              onClick={() => {
                setPaymentForm({
                  supplier_id: uniqueSuppliers[0]?.id ? String(uniqueSuppliers[0].id) : "",
                  supplier_name: uniqueSuppliers[0]?.name || "",
                  supplier_email: uniqueSuppliers[0]?.email || "",
                  purchase_order_id: purchaseOrders[0]?.id ? String(purchaseOrders[0].id) : "",
                  amount: "",
                  currency: "USD",
                  payment_method: "Bank Transfer",
                  transaction_reference: "",
                  notes: "",
                });
                setShowPaymentModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
            >
              <CreditCard className="w-3.5 h-3.5" /> Record Supplier Payment
            </button>
          </div>

          {uniqueSuppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center bg-white dark:bg-[#111] rounded-2xl border border-slate-200 dark:border-slate-800">
              <Building2 className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-slate-500 font-medium">{t("inventory.no_suppliers") || "No suppliers found"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {uniqueSuppliers.map((supplier: any) => (
                <div key={supplier.email || supplier.name} className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">{supplier.name}</h3>
                        {supplier.email && <p className="text-sm text-slate-500 font-medium">{supplier.email}</p>}
                      </div>
                    </div>
                    {supplier.id && (
                      <button onClick={() => handleViewSupplierOutstanding(supplier.id)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-blue-600 hover:bg-blue-50">
                        Outstanding Balance
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Items ({supplier.items.length})</h4>
                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2">
                      {supplier.items.map((it: any) => (
                        <div key={it.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{it.name}</p>
                            <p className="text-xs text-slate-500">{it.code}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-emerald-600">
                              {it.supplier_details.unit_cost ? `${it.supplier_details.currency} ${it.supplier_details.unit_cost}` : "No Price"}
                            </p>
                            <p className="text-xs text-slate-400">{it.supplier_details.lead_time_days ? `${it.supplier_details.lead_time_days} days` : "Unknown lead time"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Supplier Payments Table */}
          <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white mb-3">Supplier Payments History ({supplierPayments.length})</h3>
            {supplierPayments.length === 0 ? (
              <p className="text-xs text-slate-400">No supplier payments recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase">
                      <th className="py-2 px-3">Payment #</th>
                      <th className="py-2 px-3">Supplier</th>
                      <th className="py-2 px-3">PO #</th>
                      <th className="py-2 px-3">Amount</th>
                      <th className="py-2 px-3">Method</th>
                      <th className="py-2 px-3">Reference</th>
                      <th className="py-2 px-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {supplierPayments.map(p => (
                      <tr key={p.id}>
                        <td className="py-2 px-3 font-mono font-bold">{p.payment_number}</td>
                        <td className="py-2 px-3 font-bold">{p.supplier_name}</td>
                        <td className="py-2 px-3 font-mono">{p.po_number || "—"}</td>
                        <td className="py-2 px-3 font-black text-emerald-600">{p.currency} {p.amount}</td>
                        <td className="py-2 px-3">{p.payment_method}</td>
                        <td className="py-2 px-3 font-mono">{p.transaction_reference || "—"}</td>
                        <td className="py-2 px-3 text-slate-500">{p.payment_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 7: DEDICATED REPORTS & ANALYTICS (11 REPORTS)
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "reports" && (
        <div className="flex-1 overflow-auto p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex flex-wrap gap-1.5">
              {REPORT_TYPES.map(rt => (
                <button
                  key={rt.id}
                  onClick={() => setActiveReportType(rt.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    activeReportType === rt.id ? "bg-blue-600 text-white shadow-sm" : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {rt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)} className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-700 text-xs" />
              <input type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)} className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-700 text-xs" />
              <button onClick={() => fetchReport(activeReportType)} className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-bold">
                Apply Filters
              </button>
              <a
                href={`${API_BASE_URL}/inventory/reports/${activeReportType}/export-csv`}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </a>
            </div>
          </div>

          <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            {reportLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            ) : reportData ? (
              <>
                {reportData.summary && (
                  <div className="flex flex-wrap gap-4 mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900">
                    {Object.entries(reportData.summary).map(([k, v]) => (
                      <div key={k} className="px-3 py-1">
                        <p className="text-[10px] uppercase font-bold text-slate-400">{k.replace(/_/g, " ")}</p>
                        <p className="text-base font-black text-slate-900 dark:text-white">{String(v)}</p>
                      </div>
                    ))}
                  </div>
                )}
                {(!reportData.rows || reportData.rows.length === 0) ? (
                  <p className="text-xs text-slate-400 py-8 text-center">No records match the current report filters.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase">
                          {Object.keys(reportData.rows[0]).filter(k => !Array.isArray(reportData.rows[0][k])).map(k => (
                            <th key={k} className="py-2 px-3">{k.replace(/_/g, " ")}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {reportData.rows.map((r: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                            {Object.keys(reportData.rows[0]).filter(k => !Array.isArray(reportData.rows[0][k])).map(k => (
                              <td key={k} className="py-2 px-3">{r[k] != null ? String(r[k]) : "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ─── ADD/EDIT ITEM MODAL (ENHANCED WITH BARCODE, BRAND, COST/SELL PRICE, TAX, VARIANTS) ─── */}
      <AnimatePresence>
        {showItemModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowItemModal(false); }}>
            <motion.div initial={{ scale: 0.94, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
              className="bg-white dark:bg-black rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editItem ? t("inventory.modal_edit_item") : t("inventory.modal_add_item")}</h2>
                    <p className="text-xs text-slate-500">{t("inventory.modal_item_sub")}</p>
                  </div>
                </div>
                <button onClick={() => setShowItemModal(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_photo")}</label>
                  <div className="flex items-center gap-3">
                    <input type="file" accept="image/*" className="hidden" id="inventoryPhotoUpload" onChange={handlePhotoUpload} />
                    <label htmlFor="inventoryPhotoUpload"
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-zinc-300 cursor-pointer hover:border-blue-500 hover:text-blue-600 transition-colors">
                      <Upload className="w-4 h-4" /> {uploadingPhoto ? t("inventory.uploading") : itemForm.photo_url ? t("inventory.change_photo") : t("inventory.upload_image")}
                    </label>
                    {itemForm.photo_url && (
                      <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                        <img src={itemForm.photo_url.startsWith("/static") ? `${API_BASE_URL}${itemForm.photo_url}` : itemForm.photo_url} alt="preview" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setItemForm(f => ({ ...f, photo_url: "" }))}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_item_code")} <span className="text-red-500">*</span></label>
                    <input autoFocus value={itemForm.code} onChange={e => setItemForm(f => ({ ...f, code: e.target.value }))} placeholder="SKU-001"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_item_name")} <span className="text-red-500">*</span></label>
                    <input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Industrial Pump"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Barcode / EAN / UPC</label>
                    <input value={itemForm.barcode} onChange={e => setItemForm(f => ({ ...f, barcode: e.target.value }))} placeholder="8901234567890"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Brand</label>
                    <input value={itemForm.brand} onChange={e => setItemForm(f => ({ ...f, brand: e.target.value }))} placeholder="Brand name"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Status</label>
                    <select value={itemForm.status} onChange={e => setItemForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white">
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Discontinued">Discontinued</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_category")}</label>
                    <select value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white">
                      <option value="">{t("inventory.select_category")}</option>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_unit")}</label>
                    <select value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white">
                      <option value="">{t("inventory.select_unit")}</option>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Cost Price</label>
                    <input type="number" value={itemForm.cost_price} onChange={e => setItemForm(f => ({ ...f, cost_price: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Selling Price</label>
                    <input type="number" value={itemForm.selling_price} onChange={e => setItemForm(f => ({ ...f, selling_price: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Tax Rate (%)</label>
                    <input type="number" value={itemForm.tax_rate} onChange={e => setItemForm(f => ({ ...f, tax_rate: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_current_stock")}</label>
                    <input type="number" value={itemForm.current_stock} onChange={e => setItemForm(f => ({ ...f, current_stock: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_min_stock")}</label>
                    <input type="number" value={itemForm.min_stock} onChange={e => setItemForm(f => ({ ...f, min_stock: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>

                {/* Product Variants */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block">Product Variants</label>
                  <div className="grid grid-cols-4 gap-2">
                    <input placeholder="Variant SKU" value={variantInput.sku} onChange={e => setVariantInput(v => ({ ...v, sku: e.target.value }))}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" />
                    <input placeholder="Variant Name (e.g. 220V / XL)" value={variantInput.name} onChange={e => setVariantInput(v => ({ ...v, name: e.target.value }))}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" />
                    <input type="number" placeholder="Price" value={variantInput.selling_price || ""} onChange={e => setVariantInput(v => ({ ...v, selling_price: parseFloat(e.target.value) || 0 }))}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" />
                    <button type="button" onClick={handleVariantAdd} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold">+ Add Variant</button>
                  </div>
                  {itemForm.variants && itemForm.variants.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {itemForm.variants.map((v, idx) => (
                        <span key={idx} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold">
                          {v.name} ({v.sku})
                          <button type="button" onClick={() => setItemForm(f => ({ ...f, variants: f.variants.filter((_, i) => i !== idx) }))}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_tags")}</label>
                  <div className="flex gap-2">
                    <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleTagAdd(); } }}
                      placeholder={t("inventory.tag_placeholder")}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                    <button onClick={handleTagAdd} className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {itemForm.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {itemForm.tags.map(tag => (
                        <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                          {tag}
                          <button onClick={() => setItemForm(f => ({ ...f, tags: f.tags.filter(tt => tt !== tag) }))}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_description")}</label>
                  <textarea value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} rows={2}
                    placeholder={t("inventory.desc_placeholder")}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white resize-none" />
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
                <button onClick={() => setShowItemModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm">
                  {t("inventory.btn_cancel")}
                </button>
                <button onClick={handleSaveItem} disabled={saving || !itemForm.name.trim() || !itemForm.code.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editItem ? t("inventory.btn_save_changes") : t("inventory.btn_add_item")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ADD SUPPLIER MODAL ─── */}
      <AnimatePresence>
        {showSupplierModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowSupplierModal(null); }}>
            <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
              className="bg-white dark:bg-black rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t("inventory.modal_add_supplier")}</h2>
                </div>
                <button onClick={() => setShowSupplierModal(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_supplier_name")} <span className="text-red-500">*</span></label>
                    {!isNewSupplier && dropdownSuppliers.length > 0 ? (
                      <div className="flex gap-2">
                        <select
                          className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                          value={supplierForm.supplier_user_id ? `account-${supplierForm.supplier_user_id}` : supplierForm.existing_supplier_id ? `link-${supplierForm.existing_supplier_id}` : ""}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === "__NEW__") {
                              setIsNewSupplier(true);
                              setSupplierForm(f => ({ ...f, supplier_user_id: null, existing_supplier_id: null, supplier_name: "", supplier_brand: "", supplier_email: "" }));
                            } else {
                              const existing = dropdownSuppliers.find(s => s.key === val);
                              if (existing) {
                                setSupplierForm(f => ({ ...f, supplier_user_id: existing.supplier_user_id, existing_supplier_id: existing.existing_supplier_id, supplier_name: existing.supplier_name, supplier_brand: existing.supplier_brand || "", supplier_email: existing.supplier_email || "", currency: existing.currency || "USD" }));
                              }
                            }
                          }}
                        >
                          <option value="" disabled>Select a supplier...</option>
                          {dropdownSuppliers.map(s => (
                            <option key={s.key} value={s.key}>{s.supplier_name}{s.supplier_email ? ` (${s.supplier_email})` : ""}</option>
                          ))}
                          <option value="__NEW__" className="font-bold text-blue-600">+ Create New Supplier</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input autoFocus value={supplierForm.supplier_name} onChange={e => setSupplierForm(f => ({ ...f, supplier_name: e.target.value }))} placeholder="Supplier Co."
                          className="flex-1 w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                        {dropdownSuppliers.length > 0 && (
                          <button type="button" onClick={() => setIsNewSupplier(false)} className="px-3 py-2 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl"><LocalizedText text={"Cancel"} /></button>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_brand")}</label>
                    <input value={supplierForm.supplier_brand} onChange={e => setSupplierForm(f => ({ ...f, supplier_brand: e.target.value }))} placeholder="Brand name"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_supplier_email")}</label>
                  <input type="email" readOnly={!!supplierForm.supplier_user_id || !!supplierForm.existing_supplier_id} value={supplierForm.supplier_email} onChange={e => setSupplierForm(f => ({ ...f, supplier_email: e.target.value }))} placeholder="orders@supplier.com"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_unit_cost")}</label>
                    <input type="number" value={supplierForm.unit_cost} onChange={e => setSupplierForm(f => ({ ...f, unit_cost: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_currency")}</label>
                    <select value={supplierForm.currency} onChange={e => setSupplierForm(f => ({ ...f, currency: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white">
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_lead_time")}</label>
                    <input type="number" value={supplierForm.lead_time_days} onChange={e => setSupplierForm(f => ({ ...f, lead_time_days: parseInt(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_lot_number")}</label>
                    <input value={supplierForm.lot_number} onChange={e => setSupplierForm(f => ({ ...f, lot_number: e.target.value }))} placeholder="LOT-2024-001"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_min_order_qty")}</label>
                    <input type="number" value={supplierForm.min_order_qty} onChange={e => setSupplierForm(f => ({ ...f, min_order_qty: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="is-preferred" checked={supplierForm.is_preferred} onChange={e => setSupplierForm(f => ({ ...f, is_preferred: e.target.checked }))}
                    className="w-4 h-4 rounded text-violet-600" />
                  <label htmlFor="is-preferred" className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-violet-500" /> {t("inventory.label_preferred")}
                  </label>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_notes")}</label>
                  <textarea value={supplierForm.notes} onChange={e => setSupplierForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white resize-none" />
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
                <button onClick={() => setShowSupplierModal(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm">
                  {t("inventory.btn_cancel")}
                </button>
                <button onClick={handleAddSupplier} disabled={saving || !supplierForm.supplier_name.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} {t("inventory.btn_add_supplier_modal")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── SEND RFQ MODAL (SINGLE OR MULTI-SUPPLIER) ─── */}
      <AnimatePresence>
        {showRFQModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowRFQModal(null); }}>
            <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
              className="bg-white dark:bg-black rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
                    <Send className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t("inventory.modal_send_rfq")}</h2>
                    <p className="text-xs text-slate-500">{showRFQModal.item.name} · {showRFQModal.item.code}</p>
                  </div>
                </div>
                <button onClick={() => setShowRFQModal(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400 font-medium">
                  {t("inventory.rfq_notice")}
                </div>
                {showRFQModal.item.suppliers.filter(s => s.supplier_email).length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Select Assigned Suppliers (Multi-Supplier RFQ)</label>
                    <div className="flex flex-wrap gap-2">
                      {showRFQModal.item.suppliers.filter(s => s.supplier_email).map(sup => {
                        const checked = rfqForm.multi_suppliers.some(m => m.supplier_email === sup.supplier_email);
                        return (
                          <button
                            key={sup.id}
                            type="button"
                            onClick={() => {
                              setRfqForm(f => ({
                                ...f,
                                multi_suppliers: checked
                                  ? f.multi_suppliers.filter(m => m.supplier_email !== sup.supplier_email)
                                  : [...f.multi_suppliers, { supplier_name: sup.supplier_name, supplier_email: sup.supplier_email! }],
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${checked ? "bg-emerald-600 text-white border-emerald-600" : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"}`}
                          >
                            {sup.supplier_name} ({sup.supplier_email})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_supplier_name")}</label>
                    <input value={rfqForm.supplier_name} onChange={e => setRfqForm(f => ({ ...f, supplier_name: e.target.value }))} placeholder="Supplier Co."
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_supplier_email")} <span className="text-red-500">*</span></label>
                    <input type="email" value={rfqForm.supplier_email} onChange={e => setRfqForm(f => ({ ...f, supplier_email: e.target.value }))} placeholder="orders@supplier.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_quantity")}</label>
                    <input type="number" value={rfqForm.quantity} onChange={e => setRfqForm(f => ({ ...f, quantity: e.target.value }))} placeholder="e.g. 100"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Quotation Deadline</label>
                    <input type="date" value={rfqForm.deadline} onChange={e => setRfqForm(f => ({ ...f, deadline: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("inventory.label_notes_to_supplier")}</label>
                  <textarea value={rfqForm.notes} onChange={e => setRfqForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    placeholder="Any specific requirements, delivery location, specs..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white resize-none" />
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
                <button onClick={() => setShowRFQModal(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm">
                  {t("inventory.btn_cancel")}
                </button>
                <button onClick={handleSendRFQ} disabled={saving || (rfqForm.multi_suppliers.length === 0 && !rfqForm.supplier_email.trim())}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Send className="w-4 h-4" /> {rfqForm.multi_suppliers.length > 1 ? `Send RFQ (${rfqForm.multi_suppliers.length} Suppliers)` : t("inventory.btn_send_rfq")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── STOCK ADJUSTMENT MODAL ─── */}
      <AnimatePresence>
        {showAdjustModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Authorized Stock Adjustment</h2>
                <button onClick={() => setShowAdjustModal(false)}><X className="w-4 h-4" /></button>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Product *</label>
                <select value={adjustForm.item_id} onChange={e => setAdjustForm(f => ({ ...f, item_id: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm">
                  <option value={0}>Select product...</option>
                  {items.map(it => <option key={it.id} value={it.id}>{it.name} ({it.code}) — Stock: {it.current_stock}</option>)}
                </select>
              </div>
              {warehouses.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Warehouse</label>
                  <select value={adjustForm.warehouse_id} onChange={e => setAdjustForm(f => ({ ...f, warehouse_id: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm">
                    <option value="">Default / Main Inventory</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Movement Type *</label>
                  <select value={adjustForm.movement_type} onChange={e => setAdjustForm(f => ({ ...f, movement_type: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm">
                    {MOVEMENT_TYPE_LIST.map(mt => <option key={mt} value={mt}>{mt}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Quantity *</label>
                  <input type="number" value={adjustForm.quantity} onChange={e => setAdjustForm(f => ({ ...f, quantity: e.target.value }))} placeholder="10"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Mandatory Reason *</label>
                <input value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Damaged packaging, Audit correction..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAdjustModal(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleCreateAdjustment} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold">
                  {saving ? "Saving..." : "Record Movement"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── GOODS RECEIVING (GRN) MODAL ─── */}
      <AnimatePresence>
        {receivingPOModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Goods Receiving & Quality Inspection — {receivingPOModal.po_number}</h2>
                  <p className="text-xs text-slate-500">Supplier: {receivingPOModal.vendor_name} · Only accepted (non-damaged) quantities increase available inventory.</p>
                </div>
                <button onClick={() => setReceivingPOModal(null)}><X className="w-4 h-4" /></button>
              </div>

              {warehouses.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Receiving Warehouse</label>
                  <select value={receivingWarehouseId} onChange={e => setReceivingWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs">
                    <option value="">Main Inventory</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}
                  </select>
                </div>
              )}

              <div className="space-y-3">
                {receivingItems.map((li, idx) => {
                  const accepted = Math.max(0, Number(li.received_qty || 0) - Number(li.damaged_qty || 0));
                  return (
                    <div key={idx} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">{li.product_name} ({li.product_code})</span>
                        <span className="text-xs text-slate-500">Ordered: <b>{li.ordered_qty}</b> · Previously Accepted: <b>{li.already_accepted}</b></span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Received Qty</label>
                          <input type="number" value={li.received_qty} onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setReceivingItems(prev => prev.map((r, i) => i === idx ? { ...r, received_qty: val } : r));
                          }} className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-red-400 uppercase">Damaged Qty</label>
                          <input type="number" value={li.damaged_qty} onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setReceivingItems(prev => prev.map((r, i) => i === idx ? { ...r, damaged_qty: val } : r));
                          }} className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-emerald-500 uppercase">Accepted Qty</label>
                          <input readOnly value={accepted} className="w-full px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 text-xs font-black text-emerald-600" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Lot Number</label>
                          <input value={li.lot_number} onChange={e => {
                            const val = e.target.value;
                            setReceivingItems(prev => prev.map((r, i) => i === idx ? { ...r, lot_number: val } : r));
                          }} placeholder="LOT-01" className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Expiry Date</label>
                          <input type="date" value={li.expiry_date} onChange={e => {
                            const val = e.target.value;
                            setReceivingItems(prev => prev.map((r, i) => i === idx ? { ...r, expiry_date: val } : r));
                          }} className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setReceivingPOModal(null)} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleConfirmGoodsReceipt} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">
                  {saving ? "Receiving..." : "Confirm Receipt & Update Stock"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── CREATE WAREHOUSE MODAL ─── */}
      <AnimatePresence>
        {showWarehouseModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Warehouse</h2>
                <button onClick={() => setShowWarehouseModal(false)}><X className="w-4 h-4" /></button>
              </div>
              <input placeholder="Warehouse Name *" value={whForm.warehouse_name} onChange={e => setWhForm(f => ({ ...f, warehouse_name: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
              <input placeholder="Warehouse Code (e.g. WH-MAIN) *" value={whForm.warehouse_code} onChange={e => setWhForm(f => ({ ...f, warehouse_code: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
              <input placeholder="Address" value={whForm.address} onChange={e => setWhForm(f => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Contact Person" value={whForm.contact_person} onChange={e => setWhForm(f => ({ ...f, contact_person: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
                <input placeholder="Phone" value={whForm.phone} onChange={e => setWhForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowWarehouseModal(false)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleCreateWarehouse} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Save Warehouse</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── CREATE STOCK TRANSFER MODAL ─── */}
      <AnimatePresence>
        {showTransferModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">New Stock Transfer</h2>
                <button onClick={() => setShowTransferModal(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Source Warehouse</label>
                  <select value={transferForm.source_warehouse_id} onChange={e => setTransferForm(f => ({ ...f, source_warehouse_id: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-xs">
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Destination Warehouse</label>
                  <select value={transferForm.destination_warehouse_id} onChange={e => setTransferForm(f => ({ ...f, destination_warehouse_id: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-xs">
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}
                  </select>
                </div>
              </div>
              {transferForm.items.map((li, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-2">
                  <select value={li.item_id} onChange={e => {
                    const val = Number(e.target.value);
                    setTransferForm(f => ({ ...f, items: f.items.map((r, i) => i === idx ? { ...r, item_id: val } : r) }));
                  }} className="col-span-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-xs">
                    {items.map(it => <option key={it.id} value={it.id}>{it.name} ({it.code})</option>)}
                  </select>
                  <input type="number" value={li.requested_qty} onChange={e => {
                    const val = parseFloat(e.target.value) || 1;
                    setTransferForm(f => ({ ...f, items: f.items.map((r, i) => i === idx ? { ...r, requested_qty: val } : r) }));
                  }} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-xs" />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowTransferModal(false)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleCreateTransfer} disabled={saving} className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">Create Transfer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── RECEIVE STOCK TRANSFER MODAL ─── */}
      <AnimatePresence>
        {receiveTransferModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Receive Transfer {receiveTransferModal.transfer_number}</h2>
                <button onClick={() => setReceiveTransferModal(null)}><X className="w-4 h-4" /></button>
              </div>
              {(receiveTransferModal.items || []).map((it: any, idx: number) => (
                <div key={idx} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                  <div className="font-bold">{it.item_name} — Dispatched: {it.dispatched_qty}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase">Received Qty</label>
                      <input type="number" defaultValue={it.dispatched_qty - (it.received_qty || 0)} onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setReceiveTransferModal((prev: any) => ({
                          ...prev,
                          items: prev.items.map((r: any, i: number) => i === idx ? { ...r, receive_now_qty: val } : r),
                        }));
                      }} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200" />
                    </div>
                    <div>
                      <label className="text-[10px] text-red-400 uppercase">Damaged Qty</label>
                      <input type="number" defaultValue={0} onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setReceiveTransferModal((prev: any) => ({
                          ...prev,
                          items: prev.items.map((r: any, i: number) => i === idx ? { ...r, receive_damaged_qty: val } : r),
                        }));
                      }} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200" />
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-3">
                <button onClick={() => setReceiveTransferModal(null)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleReceiveTransfer} disabled={saving} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Confirm Receipt</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── PHYSICAL STOCK COUNT MODAL ─── */}
      <AnimatePresence>
        {activeCountModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Physical Stock Count — {activeCountModal.count_number}</h2>
                  <p className="text-xs text-slate-500">Status: {activeCountModal.status} · Inventory is only adjusted after Manager Approval.</p>
                </div>
                <button onClick={() => setActiveCountModal(null)}><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-2">
                {(activeCountModal.items || []).map((li: any, idx: number) => (
                  <div key={li.item_id} className="grid grid-cols-5 gap-2 items-center p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 text-xs">
                    <div className="col-span-2 font-bold">{li.item_name} <span className="text-slate-400 font-mono">({li.item_code})</span></div>
                    <div>System: <b>{li.system_qty}</b></div>
                    <div>
                      <input
                        type="number"
                        disabled={activeCountModal.status === "Approved"}
                        value={li.physical_qty}
                        onChange={e => {
                          const phys = parseFloat(e.target.value) || 0;
                          setActiveCountModal((prev: any) => ({
                            ...prev,
                            items: prev.items.map((r: any, i: number) => i === idx ? { ...r, physical_qty: phys, discrepancy: phys - Number(r.system_qty || 0) } : r),
                          }));
                        }}
                        className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200"
                      />
                    </div>
                    <div className={`font-black text-right ${li.discrepancy > 0 ? "text-emerald-600" : li.discrepancy < 0 ? "text-red-500" : "text-slate-400"}`}>
                      {li.discrepancy > 0 ? `+${li.discrepancy}` : li.discrepancy}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setActiveCountModal(null)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Close</button>
                {activeCountModal.status !== "Approved" && (
                  <button onClick={handleSubmitStockCount} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">
                    Submit Count
                  </button>
                )}
                {activeCountModal.status === "Submitted" && (
                  <button onClick={() => handleApproveStockCount(activeCountModal.id)} disabled={saving} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">
                    Approve & Adjust Stock
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ENTER SUPPLIER QUOTE MODAL ─── */}
      <AnimatePresence>
        {quoteResponseModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Record Quote — {quoteResponseModal.supplier_name}</h2>
                <button onClick={() => setQuoteResponseModal(null)}><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Unit Price *" value={quoteRespForm.unit_price} onChange={e => setQuoteRespForm(f => ({ ...f, unit_price: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
                <select value={quoteRespForm.currency} onChange={e => setQuoteRespForm(f => ({ ...f, currency: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm">
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="MOQ" value={quoteRespForm.min_order_qty} onChange={e => setQuoteRespForm(f => ({ ...f, min_order_qty: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
                <input type="number" placeholder="Lead Time (days)" value={quoteRespForm.lead_time_days} onChange={e => setQuoteRespForm(f => ({ ...f, lead_time_days: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setQuoteResponseModal(null)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleSubmitQuoteResponse} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Save Quotation</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── CREATE PURCHASE ORDER MODAL ─── */}
      <AnimatePresence>
        {showPOModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Create Purchase Order</h2>
                <button onClick={() => setShowPOModal(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Supplier Name *" value={poForm.vendor_name} onChange={e => setPoForm(f => ({ ...f, vendor_name: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
                <input placeholder="Supplier Email" value={poForm.vendor_email} onChange={e => setPoForm(f => ({ ...f, vendor_email: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={poForm.expected_delivery} onChange={e => setPoForm(f => ({ ...f, expected_delivery: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
                <input type="number" placeholder="Discount" value={poForm.discount} onChange={e => setPoForm(f => ({ ...f, discount: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              </div>
              {poForm.items.map((li, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2">
                  <select value={li.product_id} onChange={e => {
                    const pid = Number(e.target.value);
                    const found = items.find(i => i.id === pid);
                    setPoForm(f => ({
                      ...f,
                      items: f.items.map((r, i) => i === idx ? { ...r, product_id: pid, unit_cost: found?.cost_price || r.unit_cost } : r),
                    }));
                  }} className="col-span-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-xs">
                    {items.map(it => <option key={it.id} value={it.id}>{it.name} ({it.code})</option>)}
                  </select>
                  <input type="number" placeholder="Qty" value={li.ordered_qty} onChange={e => {
                    const val = parseFloat(e.target.value) || 1;
                    setPoForm(f => ({ ...f, items: f.items.map((r, i) => i === idx ? { ...r, ordered_qty: val } : r) }));
                  }} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-xs" />
                  <input type="number" placeholder="Unit Cost" value={li.unit_cost} onChange={e => {
                    const val = parseFloat(e.target.value) || 0;
                    setPoForm(f => ({ ...f, items: f.items.map((r, i) => i === idx ? { ...r, unit_cost: val } : r) }));
                  }} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-xs" />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPOModal(false)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleCreateManualPO} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Create PO</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── RECORD SUPPLIER PAYMENT MODAL ─── */}
      <AnimatePresence>
        {showPaymentModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Record Supplier Payment</h2>
                <button onClick={() => setShowPaymentModal(false)}><X className="w-4 h-4" /></button>
              </div>
              <select value={paymentForm.purchase_order_id} onChange={e => {
                const po = purchaseOrders.find(p => String(p.id) === e.target.value);
                setPaymentForm(f => ({
                  ...f,
                  purchase_order_id: e.target.value,
                  supplier_name: po?.vendor_name || f.supplier_name,
                  supplier_email: po?.vendor_email || f.supplier_email,
                  amount: po ? String(Math.max(0, Number(po.total_amount || po.grand_total || 0) - Number(po.paid_amount || 0))) : f.amount,
                }));
              }} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-xs">
                <option value="">Select Purchase Order...</option>
                {purchaseOrders.map(p => <option key={p.id} value={p.id}>{p.po_number} — {p.vendor_name} (${p.total_amount || p.grand_total})</option>)}
              </select>
              <input placeholder="Supplier Name" value={paymentForm.supplier_name} onChange={e => setPaymentForm(f => ({ ...f, supplier_name: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Payment Amount *" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
                <input placeholder="Transaction Ref" value={paymentForm.transaction_reference} onChange={e => setPaymentForm(f => ({ ...f, transaction_reference: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleRecordPayment} disabled={saving} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Save Payment</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── SUPPLIER OUTSTANDING BALANCE MODAL ─── */}
      <AnimatePresence>
        {supplierOutstandingModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{supplierOutstandingModal.supplier_name} — Balance</h2>
                <button onClick={() => setSupplierOutstandingModal(null)}><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
                <div><p className="text-[10px] text-slate-400 uppercase">Billed</p><p className="font-black">${supplierOutstandingModal.total_billed}</p></div>
                <div><p className="text-[10px] text-slate-400 uppercase">Paid</p><p className="font-black text-emerald-600">${supplierOutstandingModal.total_paid}</p></div>
                <div><p className="text-[10px] text-slate-400 uppercase">Outstanding</p><p className="font-black text-amber-600">${supplierOutstandingModal.outstanding_balance}</p></div>
              </div>
              <button onClick={() => setSupplierOutstandingModal(null)} className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Close</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── CSV IMPORT MODAL ─── */}
      <AnimatePresence>
        {showCsvModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">CSV Product Import</h2>
                <button onClick={() => setShowCsvModal(false)}><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-slate-500">Paste CSV rows below. Opening stock movements are automatically generated.</p>
              <textarea rows={6} value={csvText} onChange={e => setCsvText(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 font-mono text-xs" />
              <div className="flex gap-3">
                <button onClick={() => setShowCsvModal(false)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleCsvImport} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Import Products</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── BULK PRODUCT UPDATE MODAL ─── */}
      <AnimatePresence>
        {showBulkModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Bulk Update ({selectedItemIds.length} Products)</h2>
                <button onClick={() => setShowBulkModal(false)}><X className="w-4 h-4" /></button>
              </div>
              <select value={bulkForm.category} onChange={e => setBulkForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm">
                <option value="">Keep Category</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input placeholder="Set Brand (optional)" value={bulkForm.brand} onChange={e => setBulkForm(f => ({ ...f, brand: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Cost Price" value={bulkForm.cost_price} onChange={e => setBulkForm(f => ({ ...f, cost_price: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
                <input type="number" placeholder="Selling Price" value={bulkForm.selling_price} onChange={e => setBulkForm(f => ({ ...f, selling_price: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-sm" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowBulkModal(false)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                <button onClick={handleBulkUpdate} disabled={saving} className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold">Apply Bulk Update</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── PRODUCT HISTORY MODAL ─── */}
      <AnimatePresence>
        {productHistoryModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{productHistoryModal.item.name} ({productHistoryModal.item.code}) — History</h2>
                  <p className="text-xs text-slate-500">Current Stock: {productHistoryModal.item.current_stock} · Status: {productHistoryModal.item.stock_status}</p>
                </div>
                <button onClick={() => setProductHistoryModal(null)}><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-2">
                {(productHistoryModal.movements || []).map((m: any) => (
                  <div key={m.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold">{m.movement_type}</span> · {m.reason}
                      <p className="text-[11px] text-slate-400">{m.warehouse_name} · {m.created_at ? new Date(m.created_at).toLocaleString() : ""}</p>
                    </div>
                    <div className="text-right">
                      <span className={`font-black ${m.change >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {m.change >= 0 ? `+${m.quantity}` : `-${m.quantity}`}
                      </span>
                      <p className="text-[11px] text-slate-400">{m.previous_stock} → {m.new_stock}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setProductHistoryModal(null)} className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Close</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
