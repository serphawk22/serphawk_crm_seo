"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  Loader2,
  Copy,
  Check,
  X,
  ShieldCheck,
  MessagesSquare,
  Clock,
  BadgeCheck,
  Lock,
  Shield,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Tag,
  AlertTriangle
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { serif } from "@/lib/publicFonts";
import { PublicHeader, PublicFooter, PublicStyles, Monogram, T } from "@/components/public/PublicSite";

interface StoreItem {
  id: number;
  name: string;
  category: string;
  unit_price: number;
  unit: string;
  description: string;
  photo_url?: string;
  badge?: string;
}

interface CartItem extends StoreItem {
  quantity: number;
}

const money = (n: number) => `$${Number(n || 0).toLocaleString()}`;

export default function ShopStorefrontPage() {
  const [catalog, setCatalog] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<number | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdProposal, setCreatedProposal] = useState<{ id: number; url: string; total: number; company: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Security Key & Item Creation state (SERP123)
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [securityKeyInput, setSecurityKeyInput] = useState("");
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [isSecurityUnlocked, setIsSecurityUnlocked] = useState(false);

  const [showPostModal, setShowPostModal] = useState(false);
  const [postingItem, setPostingItem] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [newItemName, setNewItemName] = useState("");
  const [newItemCode, setNewItemCode] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState<number | "">("");
  const [newItemUnit, setNewItemUnit] = useState("pcs");
  const [newItemBadge, setNewItemBadge] = useState("In Stock");
  const [newItemPhotoUrl, setNewItemPhotoUrl] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [postSuccess, setPostSuccess] = useState<string | null>(null);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/shop/catalog`);
      if (res.ok) {
        const data = await res.json();
        setCatalog(data.items || []);
      }
    } catch (e) {
      console.error("Failed to load store catalog", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("serphawk_security_unlocked");
      if (saved === "SERP123") {
        setIsSecurityUnlocked(true);
      }
    }
  }, []);

  const handleOpenPostModal = () => {
    const unlocked = typeof window !== "undefined" && localStorage.getItem("serphawk_security_unlocked") === "SERP123";
    if (unlocked || isSecurityUnlocked) {
      setShowPostModal(true);
    } else {
      setSecurityKeyInput("");
      setSecurityError(null);
      setShowSecurityModal(true);
    }
  };

  const handleVerifySecurityKey = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (securityKeyInput.trim() === "SERP123") {
      if (typeof window !== "undefined") {
        localStorage.setItem("serphawk_security_unlocked", "SERP123");
      }
      setIsSecurityUnlocked(true);
      setShowSecurityModal(false);
      setShowPostModal(true);
    } else {
      setSecurityError("Invalid security key. Key required: SERP123");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setPostError("Image must be under 10 MB");
      return;
    }
    setUploadingImage(true);
    setPostError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE_URL}/upload-image`, { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.file_url) {
        setNewItemPhotoUrl(data.file_url);
      } else {
        setPostError(data.detail || "Failed to upload image");
      }
    } catch {
      setPostError("Network error while uploading image.");
    } finally {
      setUploadingImage(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleCreateShopItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      setPostError("Item name is required.");
      return;
    }
    if (newItemPrice === "" || Number(newItemPrice) < 0) {
      setPostError("Please enter a valid price.");
      return;
    }

    const finalCategory = isCreatingNewCategory && newCategoryName.trim()
      ? newCategoryName.trim()
      : newItemCategory.trim() || (categories.find(c => c !== "All") || "General Services");

    setPostingItem(true);
    setPostError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/shop/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          security_key: "SERP123",
          name: newItemName.trim(),
          code: newItemCode.trim(),
          category: finalCategory,
          unit_price: Number(newItemPrice),
          unit: newItemUnit.trim() || "pcs",
          description: newItemDescription.trim(),
          photo_url: newItemPhotoUrl.trim(),
          badge: newItemBadge.trim()
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to post item to shop.");
      }

      await loadCatalog();
      setShowPostModal(false);
      setPostSuccess("Item successfully posted to storefront!");
      setTimeout(() => setPostSuccess(null), 3500);

      // Reset form
      setNewItemName("");
      setNewItemCode("");
      setNewItemCategory("");
      setIsCreatingNewCategory(false);
      setNewCategoryName("");
      setNewItemPrice("");
      setNewItemPhotoUrl("");
      setNewItemDescription("");
    } catch (err: any) {
      setPostError(err.message || "Failed to post item to shop.");
    } finally {
      setPostingItem(false);
    }
  };

  // Close drawer with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCartOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const categories = useMemo(() => ["All", ...Array.from(new Set(catalog.map((i) => i.category)))], [catalog]);
  const filteredItems = selectedCategory === "All" ? catalog : catalog.filter((i) => i.category === selectedCategory);
  const cartCount = cart.reduce((a, b) => a + b.quantity, 0);
  const cartTotal = cart.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

  const addToCart = (item: StoreItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { ...item, quantity: 1 }];
    });
    setJustAdded(item.id);
    setTimeout(() => setJustAdded(null), 1200);
  };

  const updateQuantity = (id: number, delta: number) =>
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );

  const removeFromCart = (id: number) => setCart((prev) => prev.filter((i) => i.id !== id));

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/shop/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          contact_name: contactName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          notes: notes.trim(),
          items: cart.map((i) => ({ id: i.id, name: i.name, category: i.category, unit_price: i.unit_price, quantity: i.quantity })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "We couldn't prepare your proposal. Please try again.");
      }
      const data = await res.json();
      setCreatedProposal({ id: data.proposal_id, url: window.location.origin + data.share_url, total: data.total_value, company: companyName.trim() });
      setCart([]);
      setCartOpen(false);
    } catch (err: any) {
      setFormError(err.message || "We couldn't prepare your proposal.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdProposal?.url) return;
    navigator.clipboard.writeText(createdProposal.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const CartButton = (
    <button
      type="button"
      onClick={() => setCartOpen(true)}
      className={`relative h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-xs cursor-pointer ${T.ghostBtn}`}
      aria-label="Open proposal"
    >
      <ShoppingBag className="w-4 h-4" />
      <span className="hidden sm:inline">Proposal</span>
      {cartCount > 0 && (
        <span className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-semibold inline-flex items-center justify-center ${T.goldBg} text-white dark:text-[#0E0D0B]`}>
          {cartCount}
        </span>
      )}
    </button>
  );

  const HeaderActions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleOpenPostModal}
        className={`h-9 px-3.5 rounded-full inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer border ${T.border} ${T.surface} hover:border-[#9A7B4F] hover:text-[#9A7B4F] transition`}
      >
        <Plus className="w-3.5 h-3.5 text-[#9A7B4F]" />
        <span className="hidden sm:inline">Post Item</span>
      </button>
      {CartButton}
    </div>
  );

  const steps = [
    { n: "I", t: "Select", d: "Choose the services and packages that fit your ambitions." },
    { n: "II", t: "Compose", d: "Adjust quantities and share a few details about your goals." },
    { n: "III", t: "Negotiate", d: "Receive a private proposal room to refine scope and price with us." },
  ];

  return (
    <div className={`${T.page} min-h-screen flex flex-col antialiased selection:bg-[#9A7B4F]/25`} style={{ ["--sh-serif" as any]: serif.style.fontFamily }}>
      <PublicStyles />
      <PublicHeader active="store" right={HeaderActions} />

      {/* ── TOAST NOTIFICATION ── */}
      {postSuccess && (
        <div className="fixed top-20 right-6 z-[200] px-5 py-3 rounded-2xl bg-emerald-600 text-white text-xs font-bold shadow-2xl flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4" />
          <span>{postSuccess}</span>
        </div>
      )}

      {/* ── HERO ── */}
      <section className="max-w-7xl w-full mx-auto px-4 sm:px-8 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        <div className="lg:col-span-7 sh-reveal">
          <p className={`${T.eyebrow} ${T.gold}`}>The SerpHawk Store · Services & Packages</p>
          <h1 className={`${serif.className} mt-6 text-5xl sm:text-6xl lg:text-7xl font-medium leading-[1.02] tracking-tight`}>
            Curated services, <em className={`${T.gold} font-normal`}>composed</em> into your proposal.
          </h1>
          <p className={`mt-7 max-w-xl text-base sm:text-lg leading-relaxed ${T.muted}`}>
            Select what you need, and we&apos;ll prepare a private proposal room where you and our team refine the scope together — transparently, and at your pace.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a href="#collection" className={`h-12 px-7 rounded-full inline-flex items-center gap-2 text-sm tracking-wide ${T.inkBtn}`}>
              Browse the collection <ArrowRight className="w-4 h-4" />
            </a>
            <button
              type="button"
              onClick={handleOpenPostModal}
              className={`h-12 px-6 rounded-full inline-flex items-center gap-2 text-sm tracking-wide border ${T.border} ${T.surface} hover:border-[#9A7B4F] hover:text-[#9A7B4F] cursor-pointer transition`}
            >
              <Plus className="w-4 h-4 text-[#9A7B4F]" />
              Post Item to Shop
            </button>
            <a href="#how" className={`h-12 px-7 rounded-full inline-flex items-center text-sm tracking-wide ${T.ghostBtn}`}>
              How it works
            </a>
          </div>
        </div>

        <div id="how" className="lg:col-span-5 sh-reveal" style={{ animationDelay: "150ms" }}>
          <div className={`p-1.5 border ${T.border}`}>
            <div className={`border ${T.border} ${T.surface} p-8 sm:p-10`}>
              <div className="flex items-center justify-between">
                <p className={`${serif.className} text-2xl italic`}>How it works</p>
                <Monogram size={38} />
              </div>
              <ol className="mt-8 space-y-7">
                {steps.map((s, i) => (
                  <li key={s.n} className="flex gap-5">
                    <span className={`${serif.className} w-10 shrink-0 text-2xl ${T.gold}`}>{s.n}</span>
                    <div className={`flex-1 pb-7 ${i < steps.length - 1 ? `border-b ${T.border}` : ""}`}>
                      <p className={`${serif.className} text-xl`}>{s.t}</p>
                      <p className={`mt-1.5 text-sm leading-relaxed ${T.muted}`}>{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ── ASSURANCES ── */}
      <section className={`border-y ${T.border}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 grid grid-cols-2 lg:grid-cols-4">
          {[
            { icon: BadgeCheck, t: "Transparent pricing", d: "Clear rates, no hidden fees" },
            { icon: MessagesSquare, t: "Live negotiation", d: "Discuss scope in your room" },
            { icon: Clock, t: "Reply within a day", d: "A specialist responds personally" },
            { icon: ShieldCheck, t: "Private & secure", d: "Your details stay with us" },
          ].map((a, i) => (
            <div key={a.t} className={`py-7 px-4 sm:px-6 flex items-start gap-3.5 ${i % 2 === 1 ? `border-l ${T.border}` : ""} ${i >= 2 ? `border-t lg:border-t-0 ${T.border}` : ""} ${i === 2 ? "lg:border-l" : ""}`}>
              <a.icon className={`w-5 h-5 mt-0.5 shrink-0 ${T.gold}`} strokeWidth={1.5} />
              <div>
                <p className="text-sm font-medium">{a.t}</p>
                <p className={`text-xs mt-0.5 ${T.muted}`}>{a.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── COLLECTION ── */}
      <main id="collection" className="max-w-7xl w-full mx-auto px-4 sm:px-8 pt-20 flex-1 scroll-mt-20">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <p className={`${T.eyebrow} ${T.gold}`}>The Collection</p>
            <h2 className={`${serif.className} mt-3 text-4xl sm:text-5xl font-medium`}>Everything we offer</h2>
          </div>
          <div className="flex items-center gap-4 overflow-x-auto sh-noscroll">
            <button
              type="button"
              onClick={handleOpenPostModal}
              className={`shrink-0 h-8 px-3.5 rounded-full inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide border border-dashed ${T.border} ${T.surface} hover:border-[#9A7B4F] hover:text-[#9A7B4F] cursor-pointer transition shadow-sm`}
            >
              <Plus className="w-3.5 h-3.5 text-[#9A7B4F]" />
              <span>+ Post Item</span>
            </button>
            <div className="h-4 w-px bg-slate-300 dark:bg-zinc-800 shrink-0"></div>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`relative whitespace-nowrap py-1.5 text-[13px] tracking-wide transition-colors cursor-pointer ${
                  selectedCategory === cat ? T.ink : `${T.muted} hover:text-[#1C1917] dark:hover:text-[#F3EEE3]`
                }`}
              >
                {cat}
                <span className={`absolute left-0 bottom-0 h-px ${T.goldBg} transition-all duration-500 ${selectedCategory === cat ? "w-full" : "w-0"}`} />
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`border ${T.border} animate-pulse`}>
                <div className={`aspect-[4/3] ${T.soft}`} />
                <div className="p-7 space-y-3">
                  <div className={`h-3 w-20 ${T.soft}`} />
                  <div className={`h-6 w-3/4 ${T.soft}`} />
                  <div className={`h-4 w-full ${T.soft}`} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-24">
            <Monogram size={56} />
            <p className={`${serif.className} text-3xl mt-6`}>The collection is being curated.</p>
            <p className={`mt-2 text-sm ${T.muted}`}>Please check back shortly.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredItems.map((item, i) => {
              const inCart = cart.find((c) => c.id === item.id);
              return (
                <article
                  key={item.id}
                  className={`group flex flex-col border ${T.border} ${T.surface} transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(28,25,23,0.35)] dark:hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)] sh-reveal`}
                  style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}
                >
                  <div className={`relative overflow-hidden aspect-[4/3] ${T.soft}`}>
                    {item.photo_url ? (
                      <img src={item.photo_url} alt={item.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05]" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className={`${serif.className} text-7xl italic ${T.gold} opacity-60`}>{item.name.slice(0, 1)}</span>
                      </div>
                    )}
                    {item.badge && (
                      <span className="absolute top-4 left-4 px-3 py-1.5 bg-[#FAF8F4]/95 dark:bg-[#0E0D0B]/90 text-[10px] uppercase tracking-[0.22em] text-[#1C1917] dark:text-[#F3EEE3]">
                        {item.badge}
                      </span>
                    )}
                    {inCart && (
                      <span className={`absolute top-4 right-4 h-7 px-3 rounded-full inline-flex items-center gap-1 text-[10px] tracking-wide ${T.goldBg} text-white dark:text-[#0E0D0B]`}>
                        <Check className="w-3 h-3" /> {inCart.quantity} in proposal
                      </span>
                    )}
                  </div>

                  <div className="p-7 flex-1 flex flex-col">
                    <p className={`${T.eyebrow} !text-[10px] ${T.gold}`}>{item.category}</p>
                    <h3 className={`${serif.className} mt-2.5 text-2xl leading-snug font-medium`}>{item.name}</h3>
                    <p className={`mt-3 text-sm leading-relaxed line-clamp-3 ${T.muted}`}>{item.description}</p>

                    <div className={`mt-auto pt-6 mt-6 border-t ${T.border} flex items-end justify-between gap-4`}>
                      <div>
                        <p className={`${T.eyebrow} !text-[9px] ${T.faint}`}>From</p>
                        <p className={`${serif.className} text-3xl leading-none mt-1.5`}>
                          {money(item.unit_price)}
                          <span className={`text-sm font-sans ${T.muted}`}> / {item.unit}</span>
                        </p>
                      </div>
                      {inCart ? (
                        <div className={`h-10 inline-flex items-center rounded-full border ${T.border}`}>
                          <button onClick={() => updateQuantity(item.id, -1)} className="w-10 h-10 inline-flex items-center justify-center hover:text-[#9A7B4F] cursor-pointer" aria-label="Decrease">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm tabular-nums">{inCart.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, 1)} className="w-10 h-10 inline-flex items-center justify-center hover:text-[#9A7B4F] cursor-pointer" aria-label="Increase">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          className={`h-10 px-5 rounded-full inline-flex items-center gap-1.5 text-xs tracking-wide cursor-pointer ${T.inkBtn}`}
                        >
                          {justAdded === item.id ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* ── BESPOKE ── */}
        <section className="mt-24 grid md:grid-cols-12 gap-8 items-center bg-[#1C1917] text-[#F3EEE3] dark:bg-[#F3EEE3] dark:text-[#1C1917] px-8 sm:px-14 py-14">
          <div className="md:col-span-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#C9A96E] dark:text-[#9A7B4F]">Something bespoke?</p>
            <h3 className={`${serif.className} mt-3 text-3xl sm:text-4xl font-medium leading-tight`}>
              Add any package, then describe the rest — we&apos;ll tailor the proposal to you.
            </h3>
          </div>
          <div className="md:col-span-4 flex md:justify-end">
            <button
              onClick={() => setCartOpen(true)}
              className="h-11 px-6 rounded-full inline-flex items-center gap-2 text-xs tracking-wide bg-[#C9A96E] text-[#1C1917] hover:bg-[#F3EEE3] dark:bg-[#1C1917] dark:text-[#F3EEE3] dark:hover:bg-[#9A7B4F] transition-colors cursor-pointer"
            >
              Review your proposal <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      </main>

      <PublicFooter />

      {/* ── MOBILE FLOATING PROPOSAL BAR ── */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-40 h-12 pl-5 pr-2 rounded-full inline-flex items-center gap-4 shadow-2xl sh-scale-in cursor-pointer ${T.inkBtn}`}
        >
          <span className="text-xs tracking-wide">{cartCount} {cartCount === 1 ? "item" : "items"} · <span className={serif.className}>{money(cartTotal)}</span></span>
          <span className="h-8 px-4 rounded-full inline-flex items-center gap-1.5 text-xs bg-[#C9A96E] text-[#1C1917]">
            Review <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </button>
      )}

      {/* ── PROPOSAL DRAWER ── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-[#1C1917]/40 dark:bg-black/70 backdrop-blur-sm sh-fade" onClick={() => setCartOpen(false)} />
          <aside className={`relative w-full max-w-md h-full ${T.page} border-l ${T.border} shadow-2xl flex flex-col sh-slide-in`}>
            <div className={`px-7 py-6 border-b ${T.border} flex items-start justify-between`}>
              <div>
                <p className={`${T.eyebrow} !text-[10px] ${T.gold}`}>{cartCount} {cartCount === 1 ? "item" : "items"}</p>
                <h3 className={`${serif.className} text-3xl mt-1`}>Your proposal</h3>
              </div>
              <button onClick={() => setCartOpen(false)} className={`w-9 h-9 rounded-full inline-flex items-center justify-center ${T.ghostBtn} cursor-pointer`} aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-7 py-6">
              {cart.length === 0 ? (
                <div className="text-center py-20">
                  <ShoppingBag className={`w-10 h-10 mx-auto ${T.faint}`} strokeWidth={1.2} />
                  <p className={`${serif.className} text-2xl mt-5`}>Nothing selected yet</p>
                  <p className={`text-sm mt-2 ${T.muted}`}>Add a service from the collection to begin.</p>
                  <button onClick={() => setCartOpen(false)} className={`mt-8 h-10 px-6 rounded-full text-xs tracking-wide cursor-pointer ${T.inkBtn}`}>
                    Browse the collection
                  </button>
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-[#E7E2D8] dark:divide-[#2A261F]">
                    {cart.map((item) => (
                      <li key={item.id} className="py-5 first:pt-0 flex gap-4">
                        <div className={`w-16 h-16 shrink-0 overflow-hidden ${T.soft} flex items-center justify-center`}>
                          {item.photo_url ? (
                            <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className={`${serif.className} text-2xl italic ${T.gold}`}>{item.name.slice(0, 1)}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`${serif.className} text-lg leading-snug`}>{item.name}</p>
                            <button onClick={() => removeFromCart(item.id)} className={`${T.faint} hover:text-[#A2413A] cursor-pointer mt-1`} aria-label="Remove">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className={`text-xs mt-0.5 ${T.muted}`}>{money(item.unit_price)} / {item.unit}</p>
                          <div className="mt-3 flex items-center justify-between">
                            <div className={`h-8 inline-flex items-center rounded-full border ${T.border}`}>
                              <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 inline-flex items-center justify-center cursor-pointer" aria-label="Decrease"><Minus className="w-3 h-3" /></button>
                              <span className="w-5 text-center text-xs tabular-nums">{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 inline-flex items-center justify-center cursor-pointer" aria-label="Increase"><Plus className="w-3 h-3" /></button>
                            </div>
                            <span className={`${serif.className} text-lg`}>{money(item.unit_price * item.quantity)}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <form id="proposal-form" onSubmit={handleCreateProposal} className={`mt-8 pt-8 border-t ${T.border} space-y-5`}>
                    <p className={`${serif.className} text-xl italic`}>A few details</p>
                    <label className="block">
                      <span className={`${T.eyebrow} !text-[10px] ${T.muted}`}>Company *</span>
                      <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Innovations" className={T.input} />
                    </label>
                    <div className="grid grid-cols-2 gap-5">
                      <label className="block">
                        <span className={`${T.eyebrow} !text-[10px] ${T.muted}`}>Your name *</span>
                        <input required value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jane Doe" className={T.input} />
                      </label>
                      <label className="block">
                        <span className={`${T.eyebrow} !text-[10px] ${T.muted}`}>Phone</span>
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" className={T.input} />
                      </label>
                    </div>
                    <label className="block">
                      <span className={`${T.eyebrow} !text-[10px] ${T.muted}`}>Work email *</span>
                      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" className={T.input} />
                    </label>
                    <label className="block">
                      <span className={`${T.eyebrow} !text-[10px] ${T.muted}`}>Notes & requirements</span>
                      <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Timelines, goals, anything bespoke…" className={`${T.input} resize-none`} />
                    </label>
                    {formError && (
                      <div className="px-4 py-3 text-xs border border-[#C0574B]/40 bg-[#C0574B]/10 text-[#A2413A] dark:text-[#E8A39A]">{formError}</div>
                    )}
                  </form>
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div className={`px-7 py-6 border-t ${T.border} ${T.surface}`}>
                <div className={`flex items-center justify-between text-sm ${T.muted}`}>
                  <span>Estimated total</span>
                  <span className={`${serif.className} text-3xl ${T.ink}`}>{money(cartTotal)}</span>
                </div>
                <p className={`text-[11px] mt-1 ${T.faint}`}>Final pricing is agreed together in your proposal room.</p>
                <button
                  type="submit"
                  form="proposal-form"
                  disabled={submitting}
                  className={`mt-5 w-full h-12 rounded-full inline-flex items-center justify-center gap-2 text-sm tracking-wide disabled:opacity-50 cursor-pointer ${T.inkBtn}`}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {submitting ? "Preparing your proposal…" : "Request proposal"}
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* ── SUCCESS ── */}
      {createdProposal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#1C1917]/50 dark:bg-black/70 backdrop-blur-sm sh-fade">
          <div className={`w-full max-w-lg p-1.5 border ${T.border} ${T.page} shadow-2xl sh-scale-in`}>
            <div className={`border ${T.border} ${T.surface} p-8 sm:p-10 text-center`}>
              <Monogram size={56} />
              <p className={`${T.eyebrow} ${T.gold} mt-6`}>Proposal prepared</p>
              <h3 className={`${serif.className} text-4xl mt-3`}>Thank you{createdProposal.company ? `, ${createdProposal.company}` : ""}.</h3>
              <p className={`mt-4 text-sm leading-relaxed ${T.muted}`}>
                Your private proposal room is ready. Our team has been notified and will join you there to refine scope and pricing.
              </p>
              {createdProposal.total ? (
                <p className={`${serif.className} text-2xl mt-5`}>{money(createdProposal.total)}</p>
              ) : null}
              <div className={`mt-6 flex items-center gap-2 border-b ${T.border} pb-2 text-left`}>
                <span className={`flex-1 truncate text-xs font-mono ${T.muted}`}>{createdProposal.url}</span>
                <button onClick={handleCopyLink} className={`${T.gold} cursor-pointer`} title="Copy link">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-8 flex flex-col gap-3">
                <Link href={createdProposal.url.replace(window.location.origin, "")} className={`h-12 rounded-full inline-flex items-center justify-center gap-2 text-sm tracking-wide ${T.inkBtn}`}>
                  Enter your proposal room <ArrowRight className="w-4 h-4" />
                </Link>
                <button onClick={() => setCreatedProposal(null)} className={`text-xs ${T.muted} hover:text-[#9A7B4F] cursor-pointer`}>
                  Continue browsing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECURITY KEY MODAL (SERP123) ── */}
      {showSecurityModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#1C1917]/60 dark:bg-black/80 backdrop-blur-sm sh-fade">
          <div className={`w-full max-w-md p-1.5 border ${T.border} ${T.page} shadow-2xl sh-scale-in`}>
            <div className={`border ${T.border} ${T.surface} p-7 sm:p-8 space-y-5`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${T.border} ${T.goldBg} text-white dark:text-[#0E0D0B]`}>
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className={`${T.eyebrow} ${T.gold}`}>Storefront Administration</p>
                    <h3 className={`${serif.className} text-2xl font-medium`}>Security Key Required</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSecurityModal(false)}
                  className={`p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-zinc-800 ${T.muted}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className={`text-xs leading-relaxed ${T.muted}`}>
                Please enter the system security key to post new inventory items or services directly to the public shop catalog.
              </p>

              {securityError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{securityError}</span>
                </div>
              )}

              <form onSubmit={handleVerifySecurityKey} className="space-y-4">
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${T.faint}`}>
                    Enter Security Key
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      autoFocus
                      required
                      value={securityKeyInput}
                      onChange={(e) => setSecurityKeyInput(e.target.value)}
                      placeholder="Security key..."
                      className={`w-full px-4 py-2.5 rounded-xl border ${T.border} ${T.page} text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#9A7B4F]`}
                    />
                    <button
                      type="button"
                      onClick={() => setSecurityKeyInput("SERP123")}
                      className={`absolute right-2 top-2 px-2 py-0.5 rounded text-[11px] font-bold ${T.goldBg} text-white dark:text-[#0E0D0B] hover:opacity-90`}
                    >
                      Use SERP123
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSecurityModal(false)}
                    className={`flex-1 h-11 rounded-full text-xs font-semibold border ${T.border} ${T.surface} hover:opacity-80 transition`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`flex-1 h-11 rounded-full text-xs font-semibold tracking-wide ${T.inkBtn} flex items-center justify-center gap-1.5`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Unlock & Post</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── POST NEW ITEM MODAL ── */}
      {showPostModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#1C1917]/60 dark:bg-black/80 backdrop-blur-sm sh-fade">
          <div className={`w-full max-w-xl max-h-[90vh] overflow-y-auto p-1.5 border ${T.border} ${T.page} shadow-2xl sh-scale-in`}>
            <div className={`border ${T.border} ${T.surface} p-7 sm:p-8 space-y-5`}>
              <div className="flex items-center justify-between pb-4 border-b border-inherit">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${T.border} ${T.goldBg} text-white dark:text-[#0E0D0B]`}>
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <p className={`${T.eyebrow} ${T.gold}`}>Public Storefront</p>
                    <h3 className={`${serif.className} text-2xl font-medium`}>Post New Item to Shop</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className={`p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-zinc-800 ${T.muted}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {postError && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{postError}</span>
                </div>
              )}

              <form onSubmit={handleCreateShopItem} className="space-y-4">
                {/* Image Section: File Upload or Direct Image URL */}
                <div className={`p-4 rounded-2xl border ${T.border} ${T.page} space-y-3`}>
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${T.ink}`}>
                      <ImageIcon className="w-3.5 h-3.5 text-[#9A7B4F]" />
                      <span>Item Photo / Image</span>
                    </label>
                    <span className={`text-[10px] ${T.faint}`}>File upload or direct URL</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="shopImageUpload"
                      onChange={handleImageUpload}
                    />
                    <label
                      htmlFor="shopImageUpload"
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed ${T.border} text-xs font-semibold cursor-pointer hover:border-[#9A7B4F] transition`}
                    >
                      <Upload className="w-4 h-4 text-[#9A7B4F]" />
                      <span>{uploadingImage ? "Uploading..." : newItemPhotoUrl ? "Change Photo File" : "Upload Photo File"}</span>
                    </label>

                    {newItemPhotoUrl && (
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-inherit shrink-0">
                        <img
                          src={newItemPhotoUrl.startsWith("/static") ? `${API_BASE_URL}${newItemPhotoUrl}` : newItemPhotoUrl}
                          alt="preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setNewItemPhotoUrl("")}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <input
                      type="url"
                      placeholder="Or paste direct image URL (https://example.com/photo.jpg)..."
                      value={newItemPhotoUrl}
                      onChange={(e) => setNewItemPhotoUrl(e.target.value)}
                      className={`w-full px-3.5 py-2 rounded-xl border ${T.border} ${T.surface} text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#9A7B4F]`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${T.faint}`}>
                      Item Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Executive SEO Package"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      className={`w-full px-3.5 py-2.5 rounded-xl border ${T.border} ${T.page} text-sm focus:outline-none focus:ring-2 focus:ring-[#9A7B4F]`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${T.faint}`}>
                      SKU / Code (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SEO-001"
                      value={newItemCode}
                      onChange={(e) => setNewItemCode(e.target.value)}
                      className={`w-full px-3.5 py-2.5 rounded-xl border ${T.border} ${T.page} text-sm focus:outline-none focus:ring-2 focus:ring-[#9A7B4F]`}
                    />
                  </div>
                </div>

                {/* Inventory Type (Dropdown of existing or create new) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={`text-[11px] font-bold uppercase tracking-wider ${T.faint}`}>
                      Inventory Type / Category <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingNewCategory(!isCreatingNewCategory);
                        if (!isCreatingNewCategory) setNewCategoryName("");
                      }}
                      className="text-[11px] font-bold text-[#9A7B4F] hover:underline"
                    >
                      {isCreatingNewCategory ? "Select Existing" : "+ Create New Type"}
                    </button>
                  </div>

                  {!isCreatingNewCategory ? (
                    <select
                      value={newItemCategory}
                      onChange={(e) => {
                        if (e.target.value === "__NEW__") {
                          setIsCreatingNewCategory(true);
                          setNewCategoryName("");
                        } else {
                          setNewItemCategory(e.target.value);
                        }
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl border ${T.border} ${T.page} text-sm focus:outline-none focus:ring-2 focus:ring-[#9A7B4F]`}
                    >
                      <option value="">Select Inventory Type</option>
                      {categories.filter(c => c !== "All").map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="Electronics">Electronics</option>
                      <option value="Raw Materials">Raw Materials</option>
                      <option value="Packaging">Packaging</option>
                      <option value="Tools">Tools</option>
                      <option value="Software">Software</option>
                      <option value="SEO & Growth">SEO & Growth</option>
                      <option value="__NEW__" className="font-bold text-[#9A7B4F]">+ Create New Type...</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Enter new inventory type name..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className={`w-full px-3.5 py-2 rounded-xl border border-[#9A7B4F] ${T.page} text-sm focus:outline-none focus:ring-2 focus:ring-[#9A7B4F]`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newCategoryName.trim()) {
                            setNewItemCategory(newCategoryName.trim());
                          }
                          setIsCreatingNewCategory(false);
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold ${T.inkBtn}`}
                      >
                        Set
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${T.faint}`}>
                      Price (USD $) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="e.g. 299"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
                      className={`w-full px-3.5 py-2 rounded-xl border ${T.border} ${T.page} text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#9A7B4F]`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${T.faint}`}>
                      Unit
                    </label>
                    <select
                      value={newItemUnit}
                      onChange={(e) => setNewItemUnit(e.target.value)}
                      className={`w-full px-3.5 py-2 rounded-xl border ${T.border} ${T.page} text-sm focus:outline-none focus:ring-2 focus:ring-[#9A7B4F]`}
                    >
                      <option value="pcs">pcs</option>
                      <option value="pack">pack</option>
                      <option value="month">month</option>
                      <option value="license">license</option>
                      <option value="service">service</option>
                      <option value="audit">audit</option>
                      <option value="hour">hour</option>
                    </select>
                  </div>

                  <div>
                    <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${T.faint}`}>
                      Badge
                    </label>
                    <select
                      value={newItemBadge}
                      onChange={(e) => setNewItemBadge(e.target.value)}
                      className={`w-full px-3.5 py-2 rounded-xl border ${T.border} ${T.page} text-sm focus:outline-none focus:ring-2 focus:ring-[#9A7B4F]`}
                    >
                      <option value="In Stock">In Stock</option>
                      <option value="Featured">Featured</option>
                      <option value="Popular">Popular</option>
                      <option value="Best Seller">Best Seller</option>
                      <option value="New Arrival">New Arrival</option>
                      <option value="Guaranteed">Guaranteed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${T.faint}`}>
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of the item or package..."
                    value={newItemDescription}
                    onChange={(e) => setNewItemDescription(e.target.value)}
                    className={`w-full px-3.5 py-2 rounded-xl border ${T.border} ${T.page} text-xs focus:outline-none focus:ring-2 focus:ring-[#9A7B4F] resize-none`}
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-inherit">
                  <button
                    type="button"
                    onClick={() => setShowPostModal(false)}
                    className={`flex-1 h-11 rounded-full text-xs font-semibold border ${T.border} ${T.surface} hover:opacity-80 transition`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={postingItem}
                    className={`flex-1 h-11 rounded-full text-xs font-semibold tracking-wide ${T.inkBtn} flex items-center justify-center gap-2 disabled:opacity-50`}
                  >
                    {postingItem ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Publishing...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Publish to Storefront</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
