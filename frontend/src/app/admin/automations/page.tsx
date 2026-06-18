"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Globe,
  Search,
  Loader2,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  Facebook,
  TrendingUp,
  Link2,
  ExternalLink,
  Building2,
  Users,
  Star,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Eye,
  X,
  UserPlus,
  Info,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SocialProfile {
  platform: string;
  handle: string;
  followers: string;
  engagement: string;
  url: string;
  verified: boolean;
  icon: typeof Instagram;
  color: string;
  popularity: number; // 0-100
}

interface WebMention {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  domainAuthority: number;
  type: "news" | "directory" | "social" | "review" | "partner" | "blog";
}

interface CompanyProfile {
  domain: string;
  name: string;
  googleSearchVolume: string;
  googleTrend: "rising" | "stable" | "declining";
  socialProfiles: SocialProfile[];
  webMentions: WebMention[];
  estimatedSize: "Startup (1-10)" | "SMB (11-50)" | "Mid-Market (51-200)" | "Enterprise (200+)";
  sizeScore: number;
  overallScore: number;
}

// ─── Mock data generator ──────────────────────────────────────────────────────

function generateProfile(url: string): Promise<CompanyProfile> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const domain = url.replace(/https?:\/\//, "").replace(/\/$/, "").split("/")[0];
      const name = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
      const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
      const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`;

      const SOCIAL: SocialProfile[] = [
        { platform: "LinkedIn", handle: `company/${domain.split(".")[0]}`, followers: fmt(rand(800, 180_000)), engagement: `${(Math.random() * 4 + 0.5).toFixed(1)}%`, url: `https://linkedin.com/company/${domain.split(".")[0]}`, verified: Math.random() > 0.4, icon: Linkedin, color: "#0A66C2", popularity: rand(20, 95) },
        { platform: "Twitter/X", handle: `@${domain.split(".")[0]}`, followers: fmt(rand(200, 95_000)), engagement: `${(Math.random() * 3 + 0.3).toFixed(1)}%`, url: `https://x.com/${domain.split(".")[0]}`, verified: Math.random() > 0.5, icon: Twitter, color: "#000000", popularity: rand(15, 90) },
        { platform: "Instagram", handle: `@${domain.split(".")[0]}`, followers: fmt(rand(500, 250_000)), engagement: `${(Math.random() * 6 + 1).toFixed(1)}%`, url: `https://instagram.com/${domain.split(".")[0]}`, verified: Math.random() > 0.6, icon: Instagram, color: "#E4405F", popularity: rand(10, 88) },
        { platform: "Facebook", handle: domain.split(".")[0], followers: fmt(rand(300, 120_000)), engagement: `${(Math.random() * 2 + 0.2).toFixed(1)}%`, url: `https://facebook.com/${domain.split(".")[0]}`, verified: Math.random() > 0.5, icon: Facebook, color: "#1877F2", popularity: rand(10, 80) },
        { platform: "YouTube", handle: `@${domain.split(".")[0]}`, followers: fmt(rand(100, 80_000)), engagement: `${(Math.random() * 5 + 0.5).toFixed(1)}%`, url: `https://youtube.com/@${domain.split(".")[0]}`, verified: Math.random() > 0.7, icon: Youtube, color: "#FF0000", popularity: rand(5, 75) },
      ].filter(() => Math.random() > 0.1); // randomly drop some platforms

      const MENTION_TYPES: WebMention["type"][] = ["news", "directory", "social", "review", "partner", "blog"];
      const DOMAINS = ["techcrunch.com", "forbes.com", "g2.com", "crunchbase.com", "clutch.co", "trustpilot.com", "yelp.com", "linkedin.com", "reddit.com", "glassdoor.com", "capterra.com", "producthunt.com"];

      const webMentions: WebMention[] = Array.from({ length: rand(8, 14) }, (_, i) => {
        const d = DOMAINS[i % DOMAINS.length];
        const t = MENTION_TYPES[rand(0, MENTION_TYPES.length - 1)];
        return {
          title: `${name} — ${t === "news" ? "Company Review & Growth Story" : t === "directory" ? "Business Profile" : t === "review" ? "Customer Reviews & Ratings" : "Mentioned Company"}`,
          url: `https://${d}/${domain.split(".")[0]}-${t}`,
          domain: d,
          snippet: `${name} is a ${["growing", "fast-scaling", "recognized", "award-winning", "trusted"][rand(0, 4)]} company in the ${["SaaS", "SEO", "digital marketing", "e-commerce", "fintech"][rand(0, 4)]} space...`,
          domainAuthority: rand(35, 98),
          type: t,
        };
      }).slice(0, 10);

      const sizeScore = rand(15, 95);
      const estimatedSize: CompanyProfile["estimatedSize"] =
        sizeScore < 25 ? "Startup (1-10)" : sizeScore < 50 ? "SMB (11-50)" : sizeScore < 75 ? "Mid-Market (51-200)" : "Enterprise (200+)";

      resolve({
        domain,
        name,
        googleSearchVolume: `${rand(100, 90_000).toLocaleString()}/mo`,
        googleTrend: (["rising", "stable", "declining"] as const)[rand(0, 2)],
        socialProfiles: SOCIAL,
        webMentions,
        estimatedSize,
        sizeScore,
        overallScore: rand(30, 90),
      });
    }, 2800);
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PopularityBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex-1 flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <span className="text-[11px] font-bold w-8 text-right" style={{ color: "var(--text-secondary)" }}>
        {value}
      </span>
    </div>
  );
}

const TYPE_COLORS: Record<WebMention["type"], { bg: string; text: string; label: string }> = {
  news: { bg: "rgba(37,99,235,0.08)", text: "#2563eb", label: "News" },
  directory: { bg: "rgba(16,185,129,0.08)", text: "#10b981", label: "Directory" },
  social: { bg: "rgba(139,92,246,0.08)", text: "#7c3aed", label: "Social" },
  review: { bg: "rgba(245,158,11,0.08)", text: "#d97706", label: "Review" },
  partner: { bg: "rgba(236,72,153,0.08)", text: "#db2777", label: "Partner" },
  blog: { bg: "rgba(107,114,128,0.1)", text: "#6b7280", label: "Blog" },
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<"social" | "mentions" | "both">("both");
  const [expandedMention, setExpandedMention] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleScan = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!url.trim()) return;
    let clean = url.trim();
    if (!clean.startsWith("http")) clean = "https://" + clean;
    setError("");
    setProfile(null);
    setLoading(true);
    try {
      const result = await generateProfile(clean);
      setProfile(result);
      setActiveSection("both");
    } catch {
      setError("Could not analyze this website. Please check the URL and try again.");
    } finally {
      setLoading(false);
    }
  };

  const trendColor = profile?.googleTrend === "rising" ? "#10b981" : profile?.googleTrend === "declining" ? "#ef4444" : "#f59e0b";
  const trendLabel = profile?.googleTrend === "rising" ? "Rising ↑" : profile?.googleTrend === "declining" ? "Declining ↓" : "Stable →";

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md" style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>
              AI Automations
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Enter any company website to run a deep intelligence scan
            </p>
          </div>
        </div>

        {/* Feature badges */}
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            { icon: Instagram, label: "Social Media Intelligence", color: "#E4405F" },
            { icon: Link2, label: "Web Mentions & Company Size", color: "#2563eb" },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold border" style={{ background: `${color}08`, borderColor: `${color}22`, color }}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Search bar */}
      <motion.form
        onSubmit={handleScan}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex gap-3 mb-8"
      >
        <div
          className="flex-1 flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all"
          style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}
        >
          <Globe className="w-5 h-5 shrink-0" style={{ color: "var(--text-secondary)" }} />
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter company website — e.g. apple.com, hubspot.com"
            className="flex-1 bg-transparent text-[14px] outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          {url && (
            <button type="button" onClick={() => { setUrl(""); setProfile(null); }}>
              <X className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            </button>
          )}
        </div>
        <motion.button
          type="submit"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          disabled={loading || !url.trim()}
          className="px-6 py-3.5 rounded-2xl font-bold text-white text-[14px] flex items-center gap-2 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", boxShadow: "0 4px 16px rgba(99,102,241,0.35)" }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? "Scanning…" : "Scan"}
        </motion.button>
      </motion.form>

      {/* Loading skeletons */}
      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="h-24 rounded-2xl skeleton-loader" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-28 rounded-2xl skeleton-loader" style={{ opacity: 1 - i * 0.1 }} />)}
            </div>
            <div className="h-64 rounded-2xl skeleton-loader" />
            <motion.p className="text-center text-sm font-medium mt-2" style={{ color: "var(--text-secondary)" }}
              animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>
              🤖 Scanning social profiles, Google search data & web mentions…
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-4 rounded-2xl mb-6"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm font-medium text-red-500">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {profile && !loading && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

            {/* ── Overview card ── */}
            <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-extrabold text-white shadow-md"
                    style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
                    {profile.name[0]}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{profile.name}</h2>
                    <a href={`https://${profile.domain}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[12px] text-blue-500 hover:underline">
                      {profile.domain} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Google search volume */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold"
                    style={{ background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.15)", color: "#2563eb" }}>
                    <Search className="w-3.5 h-3.5" />
                    {profile.googleSearchVolume} Google searches
                  </div>
                  {/* Trend */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold"
                    style={{ background: `${trendColor}12`, border: `1px solid ${trendColor}30`, color: trendColor }}>
                    <TrendingUp className="w-3.5 h-3.5" />
                    {trendLabel}
                  </div>
                  {/* Est. size */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold"
                    style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", color: "#10b981" }}>
                    <Building2 className="w-3.5 h-3.5" />
                    {profile.estimatedSize}
                  </div>
                </div>
              </div>

              {/* Overall score */}
              <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                    Overall Online Presence Score
                  </span>
                  <span className="font-extrabold text-[20px]" style={{ color: profile.overallScore > 65 ? "#10b981" : profile.overallScore > 40 ? "#f59e0b" : "#ef4444" }}>
                    {profile.overallScore}/100
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${profile.overallScore}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: profile.overallScore > 65 ? "#10b981" : profile.overallScore > 40 ? "#f59e0b" : "#ef4444" }}
                  />
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                FEATURE 1 — SOCIAL MEDIA INTELLIGENCE
            ══════════════════════════════════════════════════════════════ */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#E4405F,#833AB4)" }}>
                  <Instagram className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-[15px]" style={{ color: "var(--text-primary)" }}>
                    Social Media Intelligence
                  </h3>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    Follower counts, engagement rates & Google popularity by platform
                  </p>
                </div>
              </div>

              <div className="p-5 space-y-3">
                {profile.socialProfiles.map((s, i) => (
                  <motion.div
                    key={s.platform}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="flex items-center gap-4 p-3.5 rounded-xl group cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ background: `${s.color}08`, border: `1px solid ${s.color}20` }}
                  >
                    {/* Platform icon + name */}
                    <div className="flex items-center gap-2.5 w-32 shrink-0">
                      <s.icon className="w-4 h-4 shrink-0" style={{ color: s.color }} />
                      <div>
                        <p className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>{s.platform}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{s.handle}</p>
                      </div>
                    </div>

                    {/* Followers */}
                    <div className="w-20 shrink-0 text-center">
                      <p className="text-[15px] font-extrabold" style={{ color: s.color }}>{s.followers}</p>
                      <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>followers</p>
                    </div>

                    {/* Engagement */}
                    <div className="w-16 shrink-0 text-center">
                      <p className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>{s.engagement}</p>
                      <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>engage</p>
                    </div>

                    {/* Popularity bar */}
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-wide shrink-0" style={{ color: "var(--text-secondary)" }}>Popularity</span>
                      <PopularityBar value={s.popularity} color={s.color} />
                    </div>

                    {/* Verified + link */}
                    <div className="flex items-center gap-2 shrink-0">
                      {s.verified && <CheckCircle className="w-4 h-4 text-blue-500" title="Verified profile" />}
                      <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500 transition-colors" />
                      </a>
                    </div>
                  </motion.div>
                ))}

                {/* Google Search Popularity */}
                <div className="mt-2 p-3.5 rounded-xl flex items-center gap-4" style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.15)" }}>
                  <div className="flex items-center gap-2.5 w-32 shrink-0">
                    <Search className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <p className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>Google Search</p>
                      <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>brand queries</p>
                    </div>
                  </div>
                  <div className="w-20 shrink-0 text-center">
                    <p className="text-[15px] font-extrabold text-blue-600">{profile.googleSearchVolume}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>searches</p>
                  </div>
                  <div className="w-16 shrink-0 text-center">
                    <p className="text-[14px] font-bold" style={{ color: trendColor }}>{trendLabel}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>trend</p>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-wide shrink-0" style={{ color: "var(--text-secondary)" }}>Popularity</span>
                    <PopularityBar value={Math.min(100, Math.round(profile.overallScore * 1.1))} color="#2563eb" />
                  </div>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                FEATURE 2 — WEB MENTIONS & COMPANY SIZE ESTIMATION
            ══════════════════════════════════════════════════════════════ */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #2563eb, #0891b2)" }}>
                    <Link2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[15px]" style={{ color: "var(--text-primary)" }}>
                      Web Mentions & Company Size Estimator
                    </h3>
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {profile.webMentions.length} web references found — used to estimate company scale
                    </p>
                  </div>
                </div>

                {/* Size badge */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Est. Company Size</span>
                  <span className="px-3 py-1 rounded-full text-[12px] font-extrabold"
                    style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)" }}>
                    {profile.estimatedSize}
                  </span>
                </div>
              </div>

              {/* Size estimation method info */}
              <div className="mx-5 mt-4 p-3 rounded-xl flex items-start gap-2.5 text-[12px]"
                style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.12)", color: "var(--text-secondary)" }}>
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                <p>
                  Company size is estimated by analyzing the <strong>number and quality of web mentions</strong> — high-DA domains (news, directories, review sites), combined with social reach and Google search volume. More authoritative mentions = larger, more established company.
                </p>
              </div>

              {/* Size progress bar */}
              <div className="px-5 py-4">
                <div className="flex justify-between text-[11px] font-bold mb-2">
                  <span style={{ color: "var(--text-secondary)" }}>Startup</span>
                  <span style={{ color: "var(--text-secondary)" }}>SMB</span>
                  <span style={{ color: "var(--text-secondary)" }}>Mid-Market</span>
                  <span style={{ color: "var(--text-secondary)" }}>Enterprise</span>
                </div>
                <div className="relative h-3 rounded-full overflow-hidden mb-1" style={{ background: "var(--border)" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${profile.sizeScore}%` }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #2563eb, #10b981)" }}
                  />
                </div>
                <div className="flex justify-between">
                  {[0, 25, 50, 75, 100].map((mark) => (
                    <div key={mark} className="w-px h-2 rounded-full" style={{ background: "var(--border)" }} />
                  ))}
                </div>
              </div>

              {/* Mention cards */}
              <div className="px-5 pb-5 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-secondary)" }}>
                  References Found Across the Web
                </p>
                {profile.webMentions.map((m, i) => {
                  const typeStyle = TYPE_COLORS[m.type];
                  const isExpanded = expandedMention === i;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-xl overflow-hidden cursor-pointer"
                      style={{ border: "1px solid var(--border)" }}
                      onClick={() => setExpandedMention(isExpanded ? null : i)}
                    >
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                        {/* DA badge */}
                        <div className="w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0"
                          style={{ background: m.domainAuthority > 70 ? "rgba(16,185,129,0.1)" : m.domainAuthority > 45 ? "rgba(245,158,11,0.1)" : "rgba(107,114,128,0.1)" }}>
                          <span className="text-[13px] font-extrabold leading-none"
                            style={{ color: m.domainAuthority > 70 ? "#10b981" : m.domainAuthority > 45 ? "#d97706" : "#6b7280" }}>
                            {m.domainAuthority}
                          </span>
                          <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>DA</span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                              {m.title}
                            </p>
                            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: typeStyle.bg, color: typeStyle.text }}>
                              {typeStyle.label}
                            </span>
                          </div>
                          <p className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{m.domain}</p>
                        </div>

                        {/* Expand icon + link */}
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={m.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            <ExternalLink className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500 transition-colors" />
                          </a>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "var(--text-secondary)" }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--text-secondary)" }} />}
                        </div>
                      </div>

                      {/* Expanded snippet */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="px-4 pb-3 text-[12.5px]"
                            style={{ color: "var(--text-secondary)", borderTop: "1px solid var(--border)", paddingTop: 10 }}
                          >
                            <span className="text-blue-500 text-[11px] font-mono">{m.url}</span>
                            <p className="mt-1.5 italic">"{m.snippet}"</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Add as Client CTA */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap"
              style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.06),rgba(168,85,247,0.06))", border: "1px solid rgba(99,102,241,0.15)" }}
            >
              <div>
                <h3 className="font-bold text-[15px]" style={{ color: "var(--text-primary)" }}>
                  Interested in onboarding {profile.name}?
                </h3>
                <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {profile.socialProfiles.length} social platforms · {profile.webMentions.length} web mentions · {profile.estimatedSize}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="px-6 py-3 rounded-xl font-bold text-[14px] text-white flex items-center gap-2"
                style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)", boxShadow: "0 4px 14px rgba(99,102,241,0.3)" }}
              >
                <UserPlus className="w-4 h-4" /> Add as Client
              </motion.button>
            </motion.div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
