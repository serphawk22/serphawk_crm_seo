"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Edit3,
  Link2,
  Linkedin,
  MessageCircle,
  Trash2,
  Twitter,
  Instagram,
  Share2,
  Users,
  Send,
  Smartphone,
  Copy,
  X,
  Sparkles,
  ExternalLink,
  Flame,
  FileText,
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { serif, bodySerif } from "@/lib/publicFonts";
import { PublicHeader, PublicFooter, PublicStyles, Monogram, T } from "@/components/public/PublicSite";

interface BlogPostDetail {
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

interface RelatedArticle {
  id: number;
  title: string;
  slug: string;
  summary: string;
  cover_image: string;
  category: string;
  read_time_minutes: number;
  created_at: string;
}

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80";

/**
 * Cleanly extracts the first two body paragraphs from article markdown content,
 * stripping markdown syntax, headers, images, tables, and blockquotes.
 */
function extractFirstTwoParagraphs(content: string, summary?: string): [string, string] {
  if (!content) return [summary || "", ""];

  const blocks = content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    // Exclude markdown headings, image tags, tables, horizontal rules
    .filter((b) => {
      if (!b) return false;
      if (/^#{1,6}\s/.test(b)) return false;
      if (b.startsWith("![") || b.startsWith("|") || /^(\*{3,}|-{3,}|_{3,}|✦)/.test(b)) return false;
      return true;
    })
    // Strip markdown formatting for clean social post reading
    .map((b) => {
      return b
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links: [text](url) -> text
        .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
        .replace(/(\*|_)(.*?)\1/g, "$2") // italics
        .replace(/`([^`]+)`/g, "$1") // inline code
        .replace(/^>\s*/gm, "") // blockquotes
        .replace(/\s+/g, " ") // normalize spacing
        .trim();
    })
    .filter((b) => b.length > 25);

  const p1 = blocks[0] || summary || "";
  const p2 = blocks[1] || (summary && summary !== p1 ? summary : "");

  return [p1, p2];
}

export default function BlogPostReaderPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const [blog, setBlog] = useState<BlogPostDetail | null>(null);
  const [related, setRelated] = useState<RelatedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [token, setToken] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);

  // Share modal & toast state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTab, setShareTab] = useState<"linkedin" | "instagram" | "whatsapp_story" | "whatsapp_group" | "snippet">("linkedin");
  const [snippetCopied, setSnippetCopied] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(total > 0 ? Math.min(100, Math.max(0, (window.scrollY / total) * 100)) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setToken(localStorage.getItem("token") || "");
    let role = localStorage.getItem("user_role") || "";
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      if (u?.role) role = u.role;
    } catch {}
    const low = role.toLowerCase();
    setIsSuperAdmin(low === "superadmin" || low === "admin");
    try {
      const list: string[] = JSON.parse(localStorage.getItem("serphawk_blog_bookmarks") || "[]");
      setBookmarked(!!slug && list.includes(slug));
    } catch {}
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/blogs/${slug}`);
        if (!res.ok) throw new Error("This story could not be found.");
        const data = await res.json();
        setBlog(data.blog);

        // Dynamically update document title & OpenGraph tags for social scrapers
        if (typeof document !== "undefined" && data.blog) {
          document.title = `${data.blog.title} — SerpHawk Journal`;
        }

        try {
          const relRes = await fetch(`${API_BASE_URL}/blogs`);
          if (relRes.ok) {
            const relData = await relRes.json();
            const all: RelatedArticle[] = relData.blogs || [];
            const same = all.filter((b) => b.slug !== slug && b.category === data.blog?.category);
            const others = all.filter((b) => b.slug !== slug && b.category !== data.blog?.category);
            setRelated([...same, ...others].slice(0, 3));
          }
        } catch {}
      } catch (err: any) {
        setError(err.message || "Failed to load story");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const toggleBookmark = () => {
    if (!slug) return;
    try {
      const list: string[] = JSON.parse(localStorage.getItem("serphawk_blog_bookmarks") || "[]");
      const next = list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
      localStorage.setItem("serphawk_blog_bookmarks", JSON.stringify(next));
      setBookmarked(next.includes(slug));
    } catch {}
  };

  const copyLink = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setToastMessage("Article link copied to clipboard!");
    setTimeout(() => {
      setCopied(false);
      setToastMessage(null);
    }, 2500);
  };

  // Resolve current article URL
  const currentUrl = typeof window !== "undefined" ? window.location.href : `https://serphawk.in/blogs/${slug}`;

  // Extract Title, First 2 Paragraphs, and Link for LinkedIn
  const [p1, p2] = useMemo(() => {
    if (!blog) return ["", ""];
    return extractFirstTwoParagraphs(blog.content, blog.summary);
  }, [blog]);

  const linkedinPostText = useMemo(() => {
    if (!blog) return "";
    return [
      blog.title,
      "",
      p1,
      "",
      p2,
      "",
      "To read the full article, click the link below:",
      currentUrl,
      "",
      "#SalesStrategy #CRM #DealClosing #EnterpriseSales #SerpHawk"
    ].filter((line) => line !== undefined).join("\n");
  }, [blog, p1, p2, currentUrl]);

  const instagramCaption = useMemo(() => {
    if (!blog) return "";
    return `📖 Field Note: "${blog.title}"\n\n"${p1 || blog.summary}"\n\nBy ${blog.author_name} (${blog.author_role})\n\n🔗 Link in bio / Read daily at serphawk.in/blogs\n\n#SerpHawk #SalesCraft #B2BGrowth #CRMPlaybook #DealClosing #SalesOps`;
  }, [blog, p1]);

  const whatsappStoryText = useMemo(() => {
    if (!blog) return currentUrl;
    return `📖 Reading: "${blog.title}"\n\n${p1.slice(0, 140)}...\n\n👉 Read full story:\n${currentUrl}`;
  }, [blog, p1, currentUrl]);

  const whatsappGroupMessage = useMemo(() => {
    if (!blog) return currentUrl;
    return `📌 *Team Reading: ${blog.title}*\n_Category: ${blog.category} · ${blog.read_time_minutes} min read_\n\n> "${p1}"\n\n${p2 ? `> "${p2}"\n\n` : ""}💡 To read the full article, click the link below:\n🔗 ${currentUrl}`;
  }, [blog, p1, p2, currentUrl]);

  const slackSnippet = useMemo(() => {
    if (!blog) return currentUrl;
    return `📌 *${blog.title}*\n>${p1}\n🔗 <${currentUrl}|To read the full article, click here>`;
  }, [blog, p1, currentUrl]);

  const handleCopySnippet = (text: string, key: string, message = "Copied to clipboard!") => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(text);
    setSnippetCopied(key);
    setToastMessage(message);
    setTimeout(() => {
      setSnippetCopied(null);
      setToastMessage(null);
    }, 3500);
  };

  const handleOpenShare = (tab?: "linkedin" | "instagram" | "whatsapp_story" | "whatsapp_group" | "snippet") => {
    if (tab) setShareTab(tab);
    setShareModalOpen(true);
  };

  // Direct LinkedIn Share with Title, first 2 paragraphs, and full article link
  const shareToLinkedIn = () => {
    if (!blog) return;
    // 1. Immediately copy the full post text (Title + 2 Paragraphs + Link) to clipboard
    navigator.clipboard.writeText(linkedinPostText);
    setToastMessage("✓ LinkedIn post copied to clipboard! (Title + 2 paragraphs + link). Opening LinkedIn composer...");
    setTimeout(() => setToastMessage(null), 4500);

    // 2. Open LinkedIn feed composer with pre-filled text
    const target = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(linkedinPostText)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const shareToLinkedInOffsite = () => {
    if (!blog) return;
    navigator.clipboard.writeText(linkedinPostText);
    const target = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const shareToWhatsAppStory = () => {
    if (!blog) return;
    const target = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappStoryText)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const shareToWhatsAppGroup = () => {
    if (!blog) return;
    const target = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappGroupMessage)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const shareToTwitter = () => {
    if (!blog) return;
    const tweetText = `${blog.title}\n\n${p1.slice(0, 120)}...\n\nTo read full article:\n`;
    const target = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(currentUrl)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const shareNativeDevice = async () => {
    if (typeof navigator !== "undefined" && navigator.share && blog) {
      try {
        await navigator.share({
          title: blog.title,
          text: `${p1}\n\nTo read the full article: ${currentUrl}`,
          url: currentUrl,
        });
      } catch (err) {
        // Fallback to modal if canceled or unsupported
      }
    } else {
      setShareModalOpen(true);
    }
  };

  const handleDelete = async () => {
    if (!blog || !window.confirm("Permanently delete this story?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/blogs/${blog.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) router.push("/blogs");
      else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to delete story");
      }
    } catch {
      alert("Failed to reach the server");
    } finally {
      setDeleting(false);
    }
  };

  const wrapperStyle = { ["--sh-serif" as any]: serif.style.fontFamily };

  if (loading) {
    return (
      <div className={`${T.page} min-h-screen`} style={wrapperStyle}>
        <PublicStyles />
        <PublicHeader active="journal" />
        <div className="max-w-3xl mx-auto px-4 pt-20 space-y-5 animate-pulse">
          <div className={`h-3 w-32 mx-auto ${T.soft}`} />
          <div className={`h-12 w-full ${T.soft}`} />
          <div className={`h-12 w-3/4 mx-auto ${T.soft}`} />
          <div className={`h-5 w-2/3 mx-auto ${T.soft}`} />
          <div className={`mt-12 aspect-[21/9] w-full ${T.soft}`} />
        </div>
      </div>
    );
  }

  if (error || !blog) {
    return (
      <div className={`${T.page} min-h-screen flex flex-col`} style={wrapperStyle}>
        <PublicStyles />
        <PublicHeader active="journal" />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md sh-reveal">
            <Monogram size={56} />
            <h2 className={`${serif.className} text-4xl mt-6`}>Story not found</h2>
            <p className={`mt-3 text-sm ${T.muted}`}>{error || "It may have been moved or unpublished."}</p>
            <Link href="/blogs" className={`mt-8 inline-flex items-center gap-2 h-10 px-6 rounded-full text-xs tracking-wide ${T.inkBtn}`}>
              <ArrowLeft className="w-4 h-4" /> Back to the Journal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const longDate = new Date(blog.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const shareBtn = `w-10 h-10 rounded-full inline-flex items-center justify-center ${T.ghostBtn} cursor-pointer transition-transform hover:scale-105`;

  return (
    <div className={`${T.page} min-h-screen flex flex-col antialiased selection:bg-[#9A7B4F]/25 relative`} style={wrapperStyle}>
      <PublicStyles />
      <div className={`fixed top-0 left-0 h-[2px] z-50 ${T.goldBg}`} style={{ width: `${progress}%`, transition: "width 120ms linear" }} />

      {/* ── FLOATING TOAST NOTIFICATION ── */}
      {toastMessage && (
        <div className="fixed top-20 right-4 sm:right-8 z-50 max-w-md bg-[#1C1917] dark:bg-[#F3EEE3] text-[#F3EEE3] dark:text-[#1C1917] p-4 rounded-2xl shadow-2xl border border-[#9A7B4F]/40 sh-slide-in flex items-start gap-3">
          <Check className="w-5 h-5 text-emerald-400 dark:text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs leading-relaxed font-sans font-medium">
            {toastMessage}
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white dark:hover:text-black">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <PublicHeader
        active="journal"
        right={
          <>
            {isSuperAdmin && (
              <>
                <Link href={`/blogs/edit/${blog.id}`} className={`h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-xs ${T.ghostBtn}`} title="Edit story">
                  <Edit3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </Link>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="h-9 w-9 rounded-full inline-flex items-center justify-center border border-[#C0574B]/40 text-[#A2413A] dark:text-[#E8A39A] hover:bg-[#C0574B]/10 transition cursor-pointer disabled:opacity-50"
                  title="Delete story"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {/* Share story button */}
            <button
              onClick={() => setShareModalOpen(true)}
              className={`h-9 px-3.5 rounded-full inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer ${T.ghostBtn}`}
              title="Share story (LinkedIn, Instagram, WhatsApp, Teams)"
            >
              <Share2 className="w-3.5 h-3.5 text-[#9A7B4F] dark:text-[#C9A96E]" />
              <span className="hidden sm:inline">Share</span>
            </button>

            <button onClick={toggleBookmark} className={`h-9 w-9 rounded-full inline-flex items-center justify-center cursor-pointer ${bookmarked ? T.inkBtn : T.ghostBtn}`} title={bookmarked ? "Saved" : "Save for later"}>
              <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? "fill-current" : ""}`} />
            </button>
          </>
        }
      />

      <article className="flex-1">
        {/* ── HEADLINE ── */}
        <header className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 text-center sh-reveal">
          <Link href="/blogs" className={`inline-flex items-center gap-2 text-xs tracking-wide ${T.muted} hover:text-[#9A7B4F] dark:hover:text-[#C9A96E] transition`}>
            <ArrowLeft className="w-3.5 h-3.5" /> The Journal
          </Link>
          <p className={`${T.eyebrow} ${T.gold} mt-10`}>{blog.category}</p>
          <h1 className={`${serif.className} mt-5 text-4xl sm:text-6xl font-medium leading-[1.06] tracking-tight`}>{blog.title}</h1>
          <p className={`${bodySerif.className} italic mt-6 text-lg sm:text-xl leading-relaxed ${T.muted}`}>{blog.summary}</p>

          <div className={`mt-9 inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm`}>
            <span className="inline-flex items-center gap-3">
              <span className={`${serif.className} w-11 h-11 rounded-full overflow-hidden ${T.soft} inline-flex items-center justify-center ${T.gold}`}>
                {blog.author_avatar ? <img src={blog.author_avatar} alt={blog.author_name} className="w-full h-full object-cover" /> : blog.author_name?.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-left leading-tight">
                <span className="font-medium block">{blog.author_name}</span>
                <span className={`text-xs ${T.muted}`}>{blog.author_role}</span>
              </span>
            </span>
            <span className={`hidden sm:block w-px h-8 ${T.soft}`} />
            <span className={`text-xs ${T.muted}`}>
              {longDate} · {blog.read_time_minutes} min read · {blog.views_count.toLocaleString()} reads
            </span>
          </div>
        </header>

        {/* ── COVER ── */}
        <figure className="max-w-6xl mx-auto px-4 sm:px-6 mt-12 sm:mt-14 sh-reveal" style={{ animationDelay: "120ms" }}>
          <div className={`overflow-hidden aspect-[16/9] sm:aspect-[21/9] ${T.soft}`}>
            <img src={blog.cover_image || FALLBACK_IMG} alt={blog.title} className="w-full h-full object-cover" />
          </div>
        </figure>

        {/* ── BODY & SIDEBAR ── */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-14 grid lg:grid-cols-[1fr_minmax(0,680px)_1fr] gap-10">
          <aside className="hidden lg:flex flex-col items-end">
            <div className="sticky top-28 flex flex-col items-center gap-3">
              <span className={`${T.eyebrow} !text-[9px] ${T.faint} [writing-mode:vertical-rl] rotate-180 mb-2`}>Share</span>
              
              {/* Full share modal trigger */}
              <button onClick={() => setShareModalOpen(true)} className={`${shareBtn} ${T.goldBg} text-white dark:text-[#0E0D0B]`} title="All Share Options">
                <Share2 className="w-4 h-4" />
              </button>

              {/* LinkedIn Post (Title + first 2 paragraphs + link) */}
              <button
                onClick={shareToLinkedIn}
                className={shareBtn}
                title="Share to LinkedIn (Includes Title, first 2 paragraphs & link)"
              >
                <Linkedin className="w-4 h-4 text-[#0A66C2]" />
              </button>

              {/* Instagram Story / Post */}
              <button onClick={() => handleOpenShare("instagram")} className={shareBtn} title="Share as Instagram Story / Post">
                <Instagram className="w-4 h-4 text-[#E1306C]" />
              </button>

              {/* WhatsApp Story */}
              <button onClick={shareToWhatsAppStory} className={shareBtn} title="Share to WhatsApp Story / Status">
                <MessageCircle className="w-4 h-4 text-[#25D366]" />
              </button>

              {/* WhatsApp Group Message */}
              <button onClick={shareToWhatsAppGroup} className={shareBtn} title="Send to WhatsApp Group or Team Chat">
                <Users className="w-4 h-4 text-[#25D366]" />
              </button>

              {/* X / Twitter */}
              <button onClick={shareToTwitter} className={shareBtn} title="Post on X">
                <Twitter className="w-4 h-4" />
              </button>

              {/* Copy Direct Link */}
              <button onClick={copyLink} className={shareBtn} title="Copy link">
                {copied ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Link2 className="w-4 h-4" />}
              </button>
            </div>
          </aside>

          <div>
            <div className={`${bodySerif.className} sh-dropcap text-[1.15rem] sm:text-[1.2rem] leading-[1.85] text-[#2C2824] dark:text-[#DCD5C7]`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ node, ...props }) => <h2 className={`${serif.className} text-3xl sm:text-4xl font-medium mt-14 mb-5 leading-tight text-[#1C1917] dark:text-[#F3EEE3]`} {...props} />,
                  h2: ({ node, ...props }) => <h2 className={`${serif.className} text-2xl sm:text-3xl font-medium mt-12 mb-4 leading-snug text-[#1C1917] dark:text-[#F3EEE3]`} {...props} />,
                  h3: ({ node, ...props }) => <h3 className={`${serif.className} text-xl sm:text-2xl font-medium mt-10 mb-3 text-[#1C1917] dark:text-[#F3EEE3]`} {...props} />,
                  p: ({ node, ...props }) => <p className="mb-7" {...props} />,
                  a: ({ node, ...props }) => <a className="text-[#9A7B4F] dark:text-[#C9A96E] underline underline-offset-4 decoration-1 hover:decoration-2" target="_blank" rel="noreferrer" {...props} />,
                  strong: ({ node, ...props }) => <strong className="font-semibold text-[#1C1917] dark:text-[#F3EEE3]" {...props} />,
                  ul: ({ node, ...props }) => <ul className="mb-7 pl-6 space-y-2.5 list-disc marker:text-[#9A7B4F] dark:marker:text-[#C9A96E]" {...props} />,
                  ol: ({ node, ...props }) => <ol className="mb-7 pl-6 space-y-2.5 list-decimal marker:text-[#9A7B4F] dark:marker:text-[#C9A96E]" {...props} />,
                  li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                  hr: () => <div className="my-12 text-center text-[#9A7B4F] dark:text-[#C9A96E] tracking-[1em]">✦✦✦</div>,
                  blockquote: ({ node, ...props }) => (
                    <blockquote className={`${serif.className} my-10 pl-6 border-l-2 border-[#9A7B4F] dark:border-[#C9A96E] italic text-2xl leading-snug text-[#1C1917] dark:text-[#F3EEE3]`} {...props} />
                  ),
                  img: ({ node, ...props }) => <img className="my-10 w-full" loading="lazy" {...props} />,
                  code: ({ node, inline, className, ...props }: any) =>
                    inline || !className ? (
                      <code className="px-1.5 py-0.5 text-[0.85em] font-mono bg-[#F3EFE7] dark:bg-[#1B1813] text-[#7A5F38] dark:text-[#C9A96E]" {...props} />
                    ) : (
                      <code className={`block my-8 p-5 overflow-x-auto text-sm font-mono leading-relaxed bg-[#1C1917] text-[#F3EEE3] dark:bg-black/60 ${className}`} {...props} />
                    ),
                  table: ({ node, ...props }) => (
                    <div className="my-8 overflow-x-auto border-y border-[#E7E2D8] dark:border-[#2A261F]">
                      <table className="min-w-full text-base" {...props} />
                    </div>
                  ),
                  th: ({ node, ...props }) => <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-widest text-[#9A7B4F] dark:text-[#C9A96E]" {...props} />,
                  td: ({ node, ...props }) => <td className="px-4 py-3 border-t border-[#E7E2D8] dark:border-[#2A261F]" {...props} />,
                }}
              >
                {blog.content}
              </ReactMarkdown>
            </div>

            <div className="my-14 text-center text-[#9A7B4F] dark:text-[#C9A96E] tracking-[1em] text-sm">✦✦✦</div>

            {blog.tags?.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {blog.tags.map((tag) => (
                  <Link key={tag} href={`/blogs?search=${encodeURIComponent(tag)}`} className={`px-3.5 py-1.5 rounded-full text-xs ${T.ghostBtn}`}>
                    {tag}
                  </Link>
                ))}
              </div>
            )}

            {/* ── EXPANDED SHARE PANEL (In-Page) ── */}
            <div className={`mt-12 p-1 border ${T.border}`}>
              <div className={`border ${T.border} ${T.surface} p-6 sm:p-7 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${T.eyebrow} !text-[10px] ${T.gold}`}>Pass It On</p>
                    <h3 className={`${serif.className} text-2xl font-medium mt-1`}>Share this field note</h3>
                  </div>
                  <button
                    onClick={shareNativeDevice}
                    className="inline-flex items-center gap-1.5 text-xs text-[#9A7B4F] dark:text-[#C9A96E] hover:underline cursor-pointer"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Device menu</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                  {/* LinkedIn Post Button with Title + first 2 paragraphs */}
                  <button
                    onClick={shareToLinkedIn}
                    className={`p-3 rounded-xl border ${T.border} hover:border-[#0A66C2] ${T.soft} hover:bg-[#0A66C2]/10 transition text-left cursor-pointer group`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Linkedin className="w-4 h-4 text-[#0A66C2]" />
                      <span className="text-[10px] text-[#0A66C2] font-semibold">Post</span>
                    </div>
                    <span className="text-xs font-semibold block truncate">LinkedIn Post</span>
                    <span className={`text-[10px] ${T.muted} block`}>Title + 2 Paragraphs</span>
                  </button>

                  {/* Instagram Story / Post Button */}
                  <button
                    onClick={() => handleOpenShare("instagram")}
                    className={`p-3 rounded-xl border ${T.border} hover:border-[#E1306C] ${T.soft} hover:bg-[#E1306C]/10 transition text-left cursor-pointer group`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Instagram className="w-4 h-4 text-[#E1306C]" />
                      <span className="text-[10px] text-[#E1306C] font-semibold">Story / Card</span>
                    </div>
                    <span className="text-xs font-semibold block truncate">Instagram Story</span>
                    <span className={`text-[10px] ${T.muted} block`}>Story card & tags</span>
                  </button>

                  {/* WhatsApp Story Button */}
                  <button
                    onClick={shareToWhatsAppStory}
                    className={`p-3 rounded-xl border ${T.border} hover:border-[#25D366] ${T.soft} hover:bg-[#25D366]/10 transition text-left cursor-pointer group`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <MessageCircle className="w-4 h-4 text-[#25D366]" />
                      <span className="text-[10px] text-[#25D366] font-semibold">Status</span>
                    </div>
                    <span className="text-xs font-semibold block truncate">WhatsApp Story</span>
                    <span className={`text-[10px] ${T.muted} block`}>Post to my status</span>
                  </button>

                  {/* WhatsApp Group Message Button */}
                  <button
                    onClick={shareToWhatsAppGroup}
                    className={`p-3 rounded-xl border ${T.border} hover:border-[#25D366] ${T.soft} hover:bg-[#25D366]/10 transition text-left cursor-pointer group`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Users className="w-4 h-4 text-[#25D366]" />
                      <span className="text-[10px] text-[#25D366] font-semibold">Group</span>
                    </div>
                    <span className="text-xs font-semibold block truncate">Group Message</span>
                    <span className={`text-[10px] ${T.muted} block`}>Summary & full link</span>
                  </button>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <button
                    onClick={() => handleOpenShare("snippet")}
                    className={`inline-flex items-center gap-1.5 text-xs ${T.muted} hover:text-[#9A7B4F] dark:hover:text-[#C9A96E] transition cursor-pointer`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Copy TL;DR for Slack / Teams</span>
                  </button>

                  <button
                    onClick={copyLink}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${T.ghostBtn} text-xs font-medium cursor-pointer`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Link Copied" : "Copy Direct Link"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Author card */}
            <div className={`mt-10 p-1 border ${T.border}`}>
              <div className={`border ${T.border} ${T.surface} p-7 flex flex-col sm:flex-row gap-5 items-start`}>
                <span className={`${serif.className} w-16 h-16 shrink-0 rounded-full overflow-hidden ${T.soft} inline-flex items-center justify-center text-2xl ${T.gold}`}>
                  {blog.author_avatar ? <img src={blog.author_avatar} alt={blog.author_name} className="w-full h-full object-cover" /> : blog.author_name?.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <p className={`${T.eyebrow} !text-[10px] ${T.gold}`}>Written by</p>
                  <p className={`${serif.className} text-2xl mt-1`}>{blog.author_name}</p>
                  <p className={`text-sm mt-1 ${T.muted}`}>{blog.author_role} at SerpHawk — sharing what works in modern sales, one story at a time.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="hidden lg:block" />
        </div>

        {/* ── CONTINUE READING ── */}
        {related.length > 0 && (
          <section className={`max-w-7xl mx-auto px-4 sm:px-8 mt-24 pt-16 border-t ${T.border}`}>
            <div className="flex items-baseline gap-5 mb-10">
              <h2 className={`${serif.className} text-3xl sm:text-4xl font-medium`}>Continue <em className={T.gold}>reading</em></h2>
              <span className={`flex-1 h-px ${T.goldBg} opacity-30`} />
              <Link href="/blogs" className={`text-xs ${T.muted} hover:text-[#9A7B4F] inline-flex items-center gap-1.5`}>All stories <ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
            <div className="grid md:grid-cols-3 gap-10">
              {related.map((r) => (
                <article key={r.id} className="group">
                  <Link href={`/blogs/${r.slug}`} className={`block overflow-hidden aspect-[4/3] ${T.soft}`}>
                    <img src={r.cover_image || FALLBACK_IMG} alt={r.title} loading="lazy" className="w-full h-full object-cover transition-transform duration-[1200ms] group-hover:scale-[1.05]" />
                  </Link>
                  <p className={`${T.eyebrow} !text-[10px] ${T.gold} mt-5`}>{r.category}</p>
                  <h3 className={`${serif.className} text-xl leading-snug mt-2`}>
                    <Link href={`/blogs/${r.slug}`} className="sh-link">{r.title}</Link>
                  </h3>
                  <p className={`text-xs mt-2 ${T.faint}`}>{r.read_time_minutes} min read</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ── INVITATION ── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-8 mt-20">
          <div className="grid md:grid-cols-12 gap-8 items-center bg-[#1C1917] text-[#F3EEE3] dark:bg-[#F3EEE3] dark:text-[#1C1917] px-8 sm:px-14 py-14">
            <div className="md:col-span-8">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#C9A96E] dark:text-[#9A7B4F]">Turn insight into revenue</p>
              <h3 className={`${serif.className} mt-3 text-3xl sm:text-4xl font-medium leading-tight`}>Bring this playbook into SerpHawk CRM.</h3>
            </div>
            <div className="md:col-span-4 flex md:justify-end gap-3 flex-wrap">
              <Link href="/login" className="h-11 px-6 rounded-full inline-flex items-center gap-2 text-xs tracking-wide bg-[#C9A96E] text-[#1C1917] hover:bg-[#F3EEE3] dark:bg-[#1C1917] dark:text-[#F3EEE3] dark:hover:bg-[#9A7B4F] transition-colors">
                Open the CRM <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/shop" className="h-11 px-6 rounded-full inline-flex items-center text-xs tracking-wide border border-[#F3EEE3]/30 hover:border-[#C9A96E] dark:border-[#1C1917]/30 dark:hover:border-[#9A7B4F] transition-colors">
                Visit the Store
              </Link>
            </div>
          </div>
        </section>
      </article>

      {/* ── DEDICATED SOCIAL SHARING STUDIO MODAL ── */}
      {shareModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/60 dark:bg-black/80 backdrop-blur-sm sh-fade"
          onClick={() => setShareModalOpen(false)}
        >
          <div
            className={`${T.surface} border ${T.border} w-full max-w-xl p-6 sm:p-8 shadow-2xl sh-scale-in max-h-[92vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#E7E2D8] dark:border-[#2A261F] pb-4">
              <div>
                <p className={`${T.eyebrow} ${T.gold}`}>Editorial Publishing</p>
                <h3 className={`${serif.className} text-2xl sm:text-3xl font-medium mt-1`}>
                  Share to your audience
                </h3>
              </div>
              <button
                onClick={() => setShareModalOpen(false)}
                className={`w-8 h-8 rounded-full inline-flex items-center justify-center ${T.faint} hover:text-[#9A7B4F] cursor-pointer`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Platform Selector Tabs */}
            <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-2 sh-noscroll border-b border-[#E7E2D8] dark:border-[#2A261F]">
              <button
                onClick={() => setShareTab("linkedin")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                  shareTab === "linkedin" ? T.inkBtn : T.ghostBtn
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Linkedin className="w-3.5 h-3.5 text-[#0A66C2]" />
                  <span>LinkedIn Post</span>
                </span>
              </button>

              <button
                onClick={() => setShareTab("instagram")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                  shareTab === "instagram" ? T.inkBtn : T.ghostBtn
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Instagram className="w-3.5 h-3.5 text-[#E1306C]" />
                  <span>Instagram Story</span>
                </span>
              </button>

              <button
                onClick={() => setShareTab("whatsapp_story")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                  shareTab === "whatsapp_story" ? T.inkBtn : T.ghostBtn
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                  <span>WhatsApp Story</span>
                </span>
              </button>

              <button
                onClick={() => setShareTab("whatsapp_group")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                  shareTab === "whatsapp_group" ? T.inkBtn : T.ghostBtn
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#25D366]" />
                  <span>Group Message</span>
                </span>
              </button>

              <button
                onClick={() => setShareTab("snippet")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                  shareTab === "snippet" ? T.inkBtn : T.ghostBtn
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  <span>Slack / Teams</span>
                </span>
              </button>
            </div>

            {/* Tab 1: LinkedIn Post (Title + First 2 Paragraphs + Full Article Link) */}
            {shareTab === "linkedin" && (
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className={`${T.eyebrow} !text-[10px] ${T.gold}`}>
                    Post Content (Title + 2 Paragraphs + Full Article Link)
                  </span>
                  <button
                    onClick={() => handleCopySnippet(linkedinPostText, "linkedin_text", "LinkedIn post copied!")}
                    className="inline-flex items-center gap-1 text-[11px] text-[#9A7B4F] dark:text-[#C9A96E] hover:underline cursor-pointer font-semibold"
                  >
                    {snippetCopied === "linkedin_text" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{snippetCopied === "linkedin_text" ? "Copied!" : "Copy Text"}</span>
                  </button>
                </div>

                <div className={`p-4 rounded-xl border ${T.border} ${T.soft} text-xs font-sans leading-relaxed whitespace-pre-wrap select-all max-h-56 overflow-y-auto`}>
                  <p className="font-bold text-sm text-[#1C1917] dark:text-[#F3EEE3] mb-3">{blog.title}</p>
                  <p className="mb-2 text-[#44403C] dark:text-[#D6D3D1]">{p1}</p>
                  {p2 && <p className="mb-3 text-[#44403C] dark:text-[#D6D3D1]">{p2}</p>}
                  <p className="font-semibold text-[#9A7B4F] dark:text-[#C9A96E] mt-3">
                    To read the full article, click the link below:
                  </p>
                  <p className="font-mono text-[11px] text-[#0A66C2] break-all">{currentUrl}</p>
                </div>

                <p className={`text-[11px] ${T.muted}`}>
                  Clicking <strong>&ldquo;Open LinkedIn Composer&rdquo;</strong> copies this complete post to your clipboard and opens LinkedIn so you can paste (Ctrl+V) and publish directly!
                </p>

                <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                  <button
                    onClick={shareToLinkedInOffsite}
                    className={`h-10 px-4 rounded-full text-xs font-medium cursor-pointer ${T.ghostBtn}`}
                    title="Open LinkedIn standard share window"
                  >
                    <span>Standard Share Dialog</span>
                  </button>
                  <button
                    onClick={shareToLinkedIn}
                    className={`h-10 px-5 rounded-full inline-flex items-center gap-2 text-xs font-medium cursor-pointer ${T.inkBtn}`}
                  >
                    <Linkedin className="w-4 h-4 text-[#0A66C2]" />
                    <span>Open LinkedIn Composer</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Instagram Story & Post */}
            {shareTab === "instagram" && (
              <div className="mt-5 space-y-4">
                {/* Visual Story Card Preview */}
                <div className="p-3 border border-[#E7E2D8] dark:border-[#2A261F] rounded-2xl bg-gradient-to-b from-[#1C1917] to-[#0E0D0B] text-[#FAF8F4] max-w-xs mx-auto shadow-xl">
                  <div className="border border-[#9A7B4F]/40 p-4 rounded-xl text-center space-y-3">
                    <Monogram size={32} />
                    <span className="text-[9px] uppercase tracking-[0.25em] text-[#C9A96E] block font-semibold">
                      SerpHawk Journal · Story
                    </span>
                    <h4 className={`${serif.className} text-base font-medium leading-snug line-clamp-3 text-white`}>
                      {blog.title}
                    </h4>
                    <p className={`text-[10px] leading-relaxed line-clamp-3 text-[#A39B8B]`}>
                      &ldquo;{p1 || blog.summary}&rdquo;
                    </p>
                    <div className="pt-2 border-t border-white/10 text-[9px] text-[#C9A96E]">
                      🔗 Read daily at serphawk.in/blogs
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className={`${T.eyebrow} !text-[10px] ${T.muted} block`}>
                    Caption & Hashtags for Instagram
                  </label>
                  <div className={`p-3 rounded-xl border ${T.border} ${T.soft} text-xs font-sans leading-relaxed whitespace-pre-wrap select-all max-h-28 overflow-y-auto`}>
                    {instagramCaption}
                  </div>
                </div>

                <p className={`text-[11px] ${T.muted}`}>
                  Instagram on desktop doesn&apos;t support direct Story posting URLs. Copy this caption, or on mobile tap &ldquo;Device Share&rdquo; to send directly to Instagram Stories!
                </p>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => handleCopySnippet(instagramCaption, "insta_caption")}
                    className={`h-10 px-4 rounded-full text-xs font-medium cursor-pointer ${T.ghostBtn}`}
                  >
                    {snippetCopied === "insta_caption" ? "Caption Copied!" : "Copy Caption & Tags"}
                  </button>
                  <button
                    onClick={shareNativeDevice}
                    className={`h-10 px-4 rounded-full inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer ${T.ghostBtn}`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Mobile Story Sheet</span>
                  </button>
                  <button
                    onClick={() => window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer")}
                    className={`h-10 px-5 rounded-full inline-flex items-center gap-2 text-xs font-medium cursor-pointer ${T.inkBtn}`}
                  >
                    <Instagram className="w-4 h-4 text-[#E1306C]" />
                    <span>Open Instagram</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                  </button>
                </div>
              </div>
            )}

            {/* Tab 3: WhatsApp Story / Status */}
            {shareTab === "whatsapp_story" && (
              <div className="mt-5 space-y-4">
                <div className={`p-4 rounded-xl border ${T.border} ${T.soft} text-xs font-sans leading-relaxed whitespace-pre-wrap select-all`}>
                  {whatsappStoryText}
                </div>
                <p className={`text-[11px] ${T.muted}`}>
                  Opens WhatsApp with this link and message ready. On your phone, simply choose <strong>&ldquo;My Status&rdquo;</strong> to share it as your WhatsApp Story!
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => handleCopySnippet(whatsappStoryText, "wa_story_text")}
                    className={`h-10 px-4 rounded-full text-xs font-medium cursor-pointer ${T.ghostBtn}`}
                  >
                    {snippetCopied === "wa_story_text" ? "Copied!" : "Copy Status Text"}
                  </button>
                  <button
                    onClick={shareToWhatsAppStory}
                    className={`h-10 px-5 rounded-full inline-flex items-center gap-2 text-xs font-medium cursor-pointer bg-[#25D366] text-white hover:opacity-90`}
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Post to WhatsApp Status</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                  </button>
                </div>
              </div>
            )}

            {/* Tab 4: WhatsApp Group Message */}
            {shareTab === "whatsapp_group" && (
              <div className="mt-5 space-y-4">
                <div className={`p-4 rounded-xl border ${T.border} ${T.soft} text-xs font-sans leading-relaxed whitespace-pre-wrap select-all max-h-36 overflow-y-auto`}>
                  {whatsappGroupMessage}
                </div>
                <p className={`text-[11px] ${T.muted}`}>
                  Formatted with bullet points, title, and key paragraph. Ready to drop into your sales team group, leadership chat, or client discussions.
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => handleCopySnippet(whatsappGroupMessage, "wa_grp_text")}
                    className={`h-10 px-4 rounded-full text-xs font-medium cursor-pointer ${T.ghostBtn}`}
                  >
                    {snippetCopied === "wa_grp_text" ? "Message Copied!" : "Copy Message"}
                  </button>
                  <button
                    onClick={shareToWhatsAppGroup}
                    className={`h-10 px-5 rounded-full inline-flex items-center gap-2 text-xs font-medium cursor-pointer bg-[#25D366] text-white hover:opacity-90`}
                  >
                    <Users className="w-4 h-4" />
                    <span>Send to WhatsApp Group</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                  </button>
                </div>
              </div>
            )}

            {/* Tab 5: Slack / Teams / Snippet */}
            {shareTab === "snippet" && (
              <div className="mt-5 space-y-4">
                <div className={`p-4 rounded-xl border ${T.border} ${T.soft} text-xs font-mono leading-relaxed whitespace-pre-wrap select-all`}>
                  {slackSnippet}
                </div>
                <p className={`text-[11px] ${T.muted}`}>
                  One-click Markdown snippet ready to paste into Slack, Microsoft Teams, Discord, or an email digest.
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => handleCopySnippet(slackSnippet, "slack_text")}
                    className={`h-10 px-5 rounded-full inline-flex items-center gap-2 text-xs font-medium cursor-pointer ${T.inkBtn}`}
                  >
                    {snippetCopied === "slack_text" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{snippetCopied === "slack_text" ? "Copied for Slack!" : "Copy Slack / Teams Snippet"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Direct Link Bar */}
            <div className={`mt-6 pt-4 border-t ${T.border} flex items-center justify-between gap-3 text-xs`}>
              <span className={`truncate font-mono text-[11px] ${T.faint} max-w-[280px]`}>{currentUrl}</span>
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 text-xs text-[#9A7B4F] dark:text-[#C9A96E] hover:underline cursor-pointer font-medium"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Link Copied" : "Copy Direct Link"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <PublicFooter />
    </div>
  );
}
