"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowRight,
  Bookmark,
  Lock,
  Loader2,
  PenLine,
  X,
  Check,
  Share2,
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { serif } from "@/lib/publicFonts";
import { PublicHeader, PublicFooter, PublicStyles, Monogram, T } from "@/components/public/PublicSite";

interface BlogItem {
  id: number;
  title: string;
  slug: string;
  summary: string;
  content: string;
  cover_image: string;
  category: string;
  tags: string[];
  author_name: string;
  author_role: string;
  author_avatar?: string;
  read_time_minutes: number;
  views_count: number;
  created_at: string;
}

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80";

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function BlogsDirectoryPage() {
  const router = useRouter();

  const [blogs, setBlogs] = useState<BlogItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [newsletterEmail, setNewsletterEmail] = useState<string>("");
  const [subscribed, setSubscribed] = useState<boolean>(false);

  // Authoring (only needed to write — reading is fully public)
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authEmail, setAuthEmail] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const role = localStorage.getItem("user_role") || "";
    let parsedRole = role;
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      if (u?.role) parsedRole = u.role;
    } catch {}
    const low = parsedRole.toLowerCase();
    setIsSuperAdmin(low === "superadmin" || low === "admin");
    try {
      const saved = localStorage.getItem("serphawk_blog_bookmarks");
      if (saved) setBookmarks(JSON.parse(saved));
    } catch {}
    // Support /blogs?search=tag links from the reader page
    const q = new URLSearchParams(window.location.search).get("search");
    if (q) setSearchQuery(q);
    fetchBlogs("all", q || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBlogs = async (category = selectedCategory, query = searchQuery) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category && category !== "all") params.append("category", category);
      if (query.trim()) params.append("search", query.trim());
      const res = await fetch(`${API_BASE_URL}/blogs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBlogs(data.blogs || []);
        if (data.categories?.length) setCategories(data.categories);
      }
    } catch (err) {
      console.error("Failed to load blogs", err);
    } finally {
      setLoading(false);
    }
  };

  const chooseCategory = (cat: string) => {
    setSelectedCategory(cat);
    setSavedOnly(false);
    fetchBlogs(cat, searchQuery);
  };

  const toggleBookmark = (slug: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBookmarks((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      localStorage.setItem("serphawk_blog_bookmarks", JSON.stringify(next));
      return next;
    });
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.origin + "/blogs");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateClick = () => {
    if (isSuperAdmin) router.push("/blogs/create");
    else setShowAuthModal(true);
  };

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Invalid credentials. Please verify your email and password.");
      }
      const data = await res.json();
      const low = (data.user?.role || "").toLowerCase();
      if (low !== "superadmin" && low !== "admin") {
        throw new Error("Only SuperAdmin or Admin accounts can publish articles.");
      }
      if (data.token) localStorage.setItem("token", data.token);
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("user_role", data.user.role);
      }
      setIsSuperAdmin(true);
      setShowAuthModal(false);
      router.push("/blogs/create");
    } catch (err: any) {
      setAuthError(err.message || "Failed to authenticate.");
    } finally {
      setAuthBusy(false);
    }
  };

  const displayed = useMemo(
    () => (savedOnly ? blogs.filter((b) => bookmarks.includes(b.slug)) : blogs),
    [blogs, savedOnly, bookmarks]
  );
  const showFeature = !savedOnly && selectedCategory === "all" && !searchQuery.trim() && displayed.length > 0;
  const featured = showFeature ? displayed[0] : null;
  const rest = showFeature ? displayed.slice(1) : displayed;
  const mostRead = useMemo(() => [...blogs].sort((a, b) => b.views_count - a.views_count).slice(0, 4), [blogs]);

  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const issueNo = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);

  return (
    <div className={`${T.page} min-h-screen flex flex-col antialiased selection:bg-[#9A7B4F]/25`} style={{ ["--sh-serif" as any]: serif.style.fontFamily }}>
      <PublicStyles />

      <PublicHeader
        active="journal"
        right={
          <>
            {bookmarks.length > 0 && (
              <button
                type="button"
                onClick={() => setSavedOnly((v) => !v)}
                className={`h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-xs cursor-pointer ${
                  savedOnly ? `${T.inkBtn}` : T.ghostBtn
                }`}
                title="Your reading list"
              >
                <Bookmark className={`w-3.5 h-3.5 ${savedOnly ? "fill-current" : ""}`} />
                <span className="hidden sm:inline">Saved</span>
                <span className="tabular-nums">{bookmarks.length}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCreateClick}
              className={`h-9 px-3.5 rounded-full inline-flex items-center gap-1.5 text-xs cursor-pointer ${T.ghostBtn}`}
              title={isSuperAdmin ? "Write a new article" : "Authors sign in to write"}
            >
              {isSuperAdmin ? <PenLine className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Write</span>
            </button>
          </>
        }
      />

      {/* ── MASTHEAD ── */}
      <section className="max-w-7xl w-full mx-auto px-4 sm:px-8 pt-8 sm:pt-10">
        <div className={`flex items-center justify-between gap-4 border-y ${T.border} py-2.5 text-[10px] sm:text-[11px] uppercase tracking-[0.22em] ${T.muted}`}>
          <span className="truncate">{todayLabel}</span>
          <span className="hidden sm:inline">Daily Edition · No. {issueNo}</span>
          <button onClick={handleShare} className="inline-flex items-center gap-1.5 hover:text-[#9A7B4F] dark:hover:text-[#C9A96E] transition cursor-pointer">
            {copied ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
            {copied ? "Copied" : "Share"}
          </button>
        </div>

        <div className="text-center py-12 sm:py-16 sh-reveal">
          <p className={`${T.eyebrow} ${T.gold}`}>Est. 2026 · Free to read, every day</p>
          <h1 className={`${serif.className} mt-5 text-5xl sm:text-7xl lg:text-8xl font-medium tracking-tight leading-[0.95]`}>
            The SerpHawk <em className={`${T.gold} font-normal`}>Journal</em>
          </h1>
          <div className={`mx-auto mt-7 w-40 sh-rule ${T.gold}`} />
          <p className={`mt-6 max-w-xl mx-auto text-base sm:text-lg leading-relaxed ${T.muted}`}>
            Field notes on sales craft, CRM playbooks, and the quiet discipline of closing — written for the people who do the work.
          </p>
        </div>
      </section>

      {/* ── SECTIONS & SEARCH ── */}
      <div className={`sticky top-16 z-30 bg-[#FAF8F4]/90 dark:bg-[#0E0D0B]/90 backdrop-blur-xl border-y ${T.border}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col md:flex-row md:items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-6 overflow-x-auto sh-noscroll">
            {["all", ...categories].map((cat) => {
              const activeCat = selectedCategory === cat && !savedOnly;
              return (
                <button
                  key={cat}
                  onClick={() => chooseCategory(cat)}
                  className={`relative whitespace-nowrap py-1 text-[13px] tracking-wide transition-colors cursor-pointer ${
                    activeCat ? T.ink : `${T.muted} hover:text-[#1C1917] dark:hover:text-[#F3EEE3]`
                  }`}
                >
                  {cat === "all" ? "All Stories" : cat}
                  <span className={`absolute left-0 -bottom-[13px] h-[2px] ${T.goldBg} transition-all duration-500 ${activeCat ? "w-full" : "w-0"}`} />
                </button>
              );
            })}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSavedOnly(false);
              fetchBlogs(selectedCategory, searchQuery);
            }}
            className="relative w-full md:w-72"
          >
            <Search className={`w-4 h-4 absolute left-0 top-1/2 -translate-y-1/2 ${T.faint}`} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search the archive…"
              className={`${T.input} pl-7 pr-7 py-1.5`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  fetchBlogs(selectedCategory, "");
                }}
                className={`absolute right-0 top-1/2 -translate-y-1/2 ${T.faint} hover:text-[#9A7B4F] cursor-pointer`}
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
        </div>
      </div>

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-8 pt-12 flex-1">
        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-14">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-4 animate-pulse">
                <div className={`aspect-[4/3] ${T.soft}`} />
                <div className={`h-3 w-24 ${T.soft}`} />
                <div className={`h-6 w-full ${T.soft}`} />
                <div className={`h-6 w-2/3 ${T.soft}`} />
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-24 max-w-md mx-auto sh-reveal">
            <Monogram size={56} />
            <h3 className={`${serif.className} text-3xl mt-6`}>Nothing here — yet.</h3>
            <p className={`mt-3 text-sm ${T.muted}`}>
              {savedOnly ? "Bookmark a story and it will wait for you here." : "Try another section or a different search."}
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSavedOnly(false);
                chooseCategory("all");
              }}
              className={`mt-8 h-10 px-6 rounded-full text-xs tracking-wide cursor-pointer ${T.inkBtn}`}
            >
              Return to all stories
            </button>
          </div>
        ) : (
          <>
            {/* ── FEATURE + SIDEBAR ── */}
            {featured && (
              <section className="grid lg:grid-cols-12 gap-10 lg:gap-14 pb-16 mb-16 border-b border-[#E7E2D8] dark:border-[#2A261F]">
                <article className="lg:col-span-8 group sh-reveal">
                  <Link href={`/blogs/${featured.slug}`} className={`block relative overflow-hidden aspect-[16/10] ${T.soft}`}>
                    <img
                      src={featured.cover_image || FALLBACK_IMG}
                      alt={featured.title}
                      className="w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]"
                    />
                    <span className="absolute top-5 left-5 px-3 py-1.5 bg-[#FAF8F4]/95 dark:bg-[#0E0D0B]/90 text-[10px] uppercase tracking-[0.25em] text-[#1C1917] dark:text-[#F3EEE3]">
                      The Lead Story
                    </span>
                    <button
                      onClick={(e) => toggleBookmark(featured.slug, e)}
                      className="absolute top-5 right-5 w-10 h-10 rounded-full bg-[#FAF8F4]/95 dark:bg-[#0E0D0B]/90 text-[#1C1917] dark:text-[#F3EEE3] inline-flex items-center justify-center hover:scale-105 transition cursor-pointer"
                      aria-label="Save story"
                    >
                      <Bookmark className={`w-4 h-4 ${bookmarks.includes(featured.slug) ? "fill-[#9A7B4F] text-[#9A7B4F]" : ""}`} />
                    </button>
                  </Link>
                  <div className="mt-7 max-w-3xl">
                    <p className={`${T.eyebrow} ${T.gold}`}>
                      {featured.category} <span className={T.faint}>· {fmtDate(featured.created_at)}</span>
                    </p>
                    <h2 className={`${serif.className} mt-3 text-3xl sm:text-5xl font-medium leading-[1.1] tracking-tight`}>
                      <Link href={`/blogs/${featured.slug}`} className="sh-link">{featured.title}</Link>
                    </h2>
                    <p className={`mt-4 text-base sm:text-lg leading-relaxed ${T.muted}`}>{featured.summary}</p>
                    <div className="mt-6 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className={`${serif.className} w-10 h-10 rounded-full ${T.soft} inline-flex items-center justify-center text-sm ${T.gold}`}>
                          {featured.author_name?.[0]?.toUpperCase() || "S"}
                        </span>
                        <div className="text-sm leading-tight">
                          <span className="font-medium">{featured.author_name}</span>
                          <span className={`block text-xs ${T.muted}`}>{featured.author_role} · {featured.read_time_minutes} min read</span>
                        </div>
                      </div>
                      <Link href={`/blogs/${featured.slug}`} className={`inline-flex items-center gap-2 text-sm ${T.gold} group/rl`}>
                        Read the story
                        <ArrowRight className="w-4 h-4 transition-transform group-hover/rl:translate-x-1" />
                      </Link>
                    </div>
                  </div>
                </article>

                <aside className="lg:col-span-4 space-y-12 lg:border-l lg:pl-12 border-[#E7E2D8] dark:border-[#2A261F] sh-reveal" style={{ animationDelay: "150ms" }}>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className={`${serif.className} text-2xl italic`}>Most Read</h3>
                      <span className={`flex-1 h-px ${T.goldBg} opacity-40`} />
                    </div>
                    <ol className="mt-6 space-y-6">
                      {mostRead.map((b, i) => (
                        <li key={b.id} className="group flex gap-5">
                          <span className={`${serif.className} text-4xl leading-none ${T.gold} opacity-70 tabular-nums w-8 shrink-0`}>
                            {i + 1}
                          </span>
                          <div className={`pb-6 flex-1 ${i < mostRead.length - 1 ? `border-b ${T.border}` : ""}`}>
                            <p className={`${T.eyebrow} !text-[10px] ${T.faint}`}>{b.category}</p>
                            <Link href={`/blogs/${b.slug}`} className={`${serif.className} block mt-1.5 text-lg leading-snug`}>
                              <span className="sh-link">{b.title}</span>
                            </Link>
                            <p className={`mt-1.5 text-xs ${T.muted}`}>{b.read_time_minutes} min · {b.views_count.toLocaleString()} reads</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Visiting card */}
                  <div className={`relative p-1 border ${T.border}`}>
                    <div className={`border ${T.border} ${T.surface} p-7 text-center`}>
                      <Monogram size={52} />
                      <p className={`${serif.className} mt-4 text-xl`}>SerpHawk</p>
                      <p className={`${T.eyebrow} !text-[9px] mt-1 ${T.gold}`}>CRM · Intelligence · Proposals</p>
                      <div className={`mx-auto my-5 w-16 sh-rule ${T.gold}`} />
                      <p className={`text-sm leading-relaxed ${T.muted}`}>
                        One workspace for leads, clients, proposals and the team that serves them.
                      </p>
                      <div className="mt-6 flex flex-col gap-2">
                        <Link href="/login" className={`h-10 rounded-full inline-flex items-center justify-center text-xs tracking-wide ${T.inkBtn}`}>
                          Try the CRM
                        </Link>
                        <Link href="/shop" className={`h-10 rounded-full inline-flex items-center justify-center text-xs tracking-wide ${T.ghostBtn}`}>
                          Visit the Store
                        </Link>
                      </div>
                    </div>
                  </div>
                </aside>
              </section>
            )}

            {/* ── STORY GRID ── */}
            <section>
              <div className="flex items-baseline gap-5 mb-10">
                <h2 className={`${serif.className} text-3xl sm:text-4xl font-medium`}>
                  {savedOnly ? "Your Reading List" : searchQuery.trim() ? `Results for “${searchQuery.trim()}”` : selectedCategory === "all" ? "Latest Stories" : selectedCategory}
                </h2>
                <span className={`flex-1 h-px ${T.goldBg} opacity-30`} />
                <span className={`text-xs tabular-nums ${T.muted}`}>{rest.length} {rest.length === 1 ? "story" : "stories"}</span>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-16">
                {rest.map((b, i) => (
                  <article key={b.id} className="group sh-reveal" style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}>
                    <Link href={`/blogs/${b.slug}`} className={`block relative overflow-hidden aspect-[4/3] ${T.soft}`}>
                      <img
                        src={b.cover_image || FALLBACK_IMG}
                        alt={b.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05]"
                      />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <button
                        onClick={(e) => toggleBookmark(b.slug, e)}
                        className={`absolute top-3 right-3 w-9 h-9 rounded-full bg-[#FAF8F4]/95 dark:bg-[#0E0D0B]/90 text-[#1C1917] dark:text-[#F3EEE3] inline-flex items-center justify-center transition-all duration-300 cursor-pointer ${
                          bookmarks.includes(b.slug) ? "opacity-100" : "opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0"
                        }`}
                        aria-label="Save story"
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${bookmarks.includes(b.slug) ? "fill-[#9A7B4F] text-[#9A7B4F]" : ""}`} />
                      </button>
                    </Link>
                    <div className="mt-5">
                      <p className={`${T.eyebrow} !text-[10px] ${T.gold}`}>
                        {b.category} <span className={T.faint}>· {fmtDate(b.created_at)}</span>
                      </p>
                      <h3 className={`${serif.className} mt-2.5 text-[1.55rem] leading-[1.2] font-medium`}>
                        <Link href={`/blogs/${b.slug}`} className="sh-link">{b.title}</Link>
                      </h3>
                      <p className={`mt-3 text-[15px] leading-relaxed line-clamp-3 ${T.muted}`}>{b.summary}</p>
                      <p className={`mt-4 text-xs ${T.faint}`}>
                        By <span className={T.ink}>{b.author_name}</span> · {b.read_time_minutes} min read
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {/* ── THE MORNING BRIEF ── */}
        <section className={`mt-28 p-1.5 border ${T.border}`}>
          <div className={`border ${T.border} ${T.surface} px-6 py-14 sm:px-16 text-center`}>
            <p className={`${T.eyebrow} ${T.gold}`}>Delivered at 7am</p>
            <h3 className={`${serif.className} mt-4 text-3xl sm:text-5xl font-medium`}>
              The Morning <em className={T.gold}>Brief</em>
            </h3>
            <p className={`mt-4 max-w-lg mx-auto text-sm sm:text-base leading-relaxed ${T.muted}`}>
              One considered idea for your pipeline, every morning. No noise, unsubscribe whenever you like.
            </p>
            {subscribed ? (
              <p className={`mt-8 inline-flex items-center gap-2 text-sm ${T.gold}`}>
                <Check className="w-4 h-4" /> Thank you — your first brief arrives tomorrow.
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newsletterEmail.trim()) setSubscribed(true);
                }}
                className="mt-8 max-w-md mx-auto flex items-end gap-4"
              >
                <input
                  type="email"
                  required
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="your@company.com"
                  className={`${T.input} text-center sm:text-left`}
                />
                <button type="submit" className={`h-10 px-6 rounded-full text-xs tracking-wide whitespace-nowrap cursor-pointer ${T.inkBtn}`}>
                  Subscribe
                </button>
              </form>
            )}
          </div>
        </section>

        {/* ── CRM INVITATION ── */}
        <section className="mt-16 grid md:grid-cols-12 gap-8 items-center bg-[#1C1917] text-[#F3EEE3] dark:bg-[#F3EEE3] dark:text-[#1C1917] px-8 sm:px-14 py-14">
          <div className="md:col-span-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#C9A96E] dark:text-[#9A7B4F]">From reading to doing</p>
            <h3 className={`${serif.className} mt-3 text-3xl sm:text-4xl font-medium leading-tight`}>
              Put these playbooks to work inside SerpHawk CRM.
            </h3>
          </div>
          <div className="md:col-span-4 flex md:justify-end gap-3">
            <Link
              href="/login"
              className="h-11 px-6 rounded-full inline-flex items-center gap-2 text-xs tracking-wide bg-[#C9A96E] text-[#1C1917] hover:bg-[#F3EEE3] dark:bg-[#1C1917] dark:text-[#F3EEE3] dark:hover:bg-[#9A7B4F] transition-colors"
            >
              Open the CRM <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />

      {/* ── AUTHOR SIGN-IN (only for writing) ── */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/50 dark:bg-black/70 backdrop-blur-sm sh-fade" onClick={() => setShowAuthModal(false)}>
          <div className={`${T.surface} border ${T.border} w-full max-w-md p-8 sm:p-10 shadow-2xl sh-scale-in`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <Monogram size={44} />
              <button onClick={() => setShowAuthModal(false)} className={`${T.faint} hover:text-[#9A7B4F] cursor-pointer`} aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <h3 className={`${serif.className} mt-6 text-3xl font-medium`}>Author sign-in</h3>
            <p className={`mt-2 text-sm leading-relaxed ${T.muted}`}>
              Reading is open to everyone. To write and publish, sign in with an Admin or SuperAdmin account.
            </p>
            {authError && (
              <div className="mt-5 px-4 py-3 text-xs border border-[#C0574B]/40 bg-[#C0574B]/10 text-[#A2413A] dark:text-[#E8A39A]">
                {authError}
              </div>
            )}
            <form onSubmit={handleAuthenticate} className="mt-6 space-y-5">
              <label className="block">
                <span className={`${T.eyebrow} !text-[10px] ${T.muted}`}>Email</span>
                <input type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="admin@serphawk.com" className={T.input} />
              </label>
              <label className="block">
                <span className={`${T.eyebrow} !text-[10px] ${T.muted}`}>Password</span>
                <input type="password" required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" className={T.input} />
              </label>
              <button
                type="submit"
                disabled={authBusy}
                className={`w-full h-11 mt-2 rounded-full inline-flex items-center justify-center gap-2 text-xs tracking-wide disabled:opacity-50 cursor-pointer ${T.inkBtn}`}
              >
                {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
                Continue to the writing desk
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
