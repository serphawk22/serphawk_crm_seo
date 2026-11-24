"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Sparkles,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Lock,
  Shield,
  Eye,
  FileText,
  Clock,
  Tag,
  AlertCircle,
  Loader2,
  Send
} from "lucide-react";
import { API_BASE_URL } from "@/config";

export default function CreateBlogPostPage() {
  const router = useRouter();

  // Authentication state
  const [token, setToken] = useState<string>("");
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

  // In-page SuperAdmin login if unauthenticated
  const [authEmail, setAuthEmail] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState<string>("");
  const [slug, setSlug] = useState<string>("");
  const [autoSlug, setAutoSlug] = useState<boolean>(true);
  const [category, setCategory] = useState<string>("CRM Guide");
  const [customCategory, setCustomCategory] = useState<string>("");
  const [tagsInput, setTagsInput] = useState<string>("crm, sales, automation");
  const [summary, setSummary] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [coverImageUrl, setCoverImageUrl] = useState<string>("");
  const [readTime, setReadTime] = useState<number>(5);
  const [isPublished, setIsPublished] = useState<boolean>(true);

  // Image Uploading
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Editor Tab: 'write' or 'preview'
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");

  // Submission
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("token") || "";
      const role = localStorage.getItem("user_role") || "";
      const userStr = localStorage.getItem("user");
      let parsedRole = role;
      try {
        if (userStr) {
          const u = JSON.parse(userStr);
          parsedRole = u.role || role;
        }
      } catch (e) {}

      setToken(storedToken);
      const low = parsedRole.toLowerCase();
      if ((low === "superadmin" || low === "admin") && storedToken) {
        setIsSuperAdmin(true);
      } else {
        setIsSuperAdmin(false);
      }
      setCheckingAuth(false);
    }
  }, []);

  // Auto-generate slug when title changes
  useEffect(() => {
    if (autoSlug && title) {
      const generated = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
      setSlug(generated);
    }
  }, [title, autoSlug]);

  // Estimate read time
  useEffect(() => {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const est = Math.max(1, Math.ceil(words / 180));
    setReadTime(est);
  }, [content]);

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
        throw new Error(errData.detail || "Invalid credentials.");
      }

      const data = await res.json();
      const role = data.user?.role || "";
      const low = role.toLowerCase();

      if (low !== "superadmin" && low !== "admin") {
        throw new Error("Only SuperAdmin or Admin accounts can author articles.");
      }

      if (typeof window !== "undefined") {
        if (data.token) localStorage.setItem("token", data.token);
        if (data.user) {
          localStorage.setItem("user", JSON.stringify(data.user));
          localStorage.setItem("user_role", data.user.role);
        }
      }

      setToken(data.token);
      setIsSuperAdmin(true);
    } catch (err: any) {
      setAuthError(err.message || "Failed to authenticate.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE_URL}/blogs/upload-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to upload image");
      }

      const data = await res.json();
      setCoverImageUrl(data.url);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Title is required.");
      return;
    }
    if (!summary.trim()) {
      setFormError("Please provide a short summary/excerpt.");
      return;
    }
    if (!content.trim()) {
      setFormError("Article content cannot be empty.");
      return;
    }

    const finalCategory = category === "Custom" ? customCategory.trim() : category;
    if (!finalCategory) {
      setFormError("Please select or enter a category.");
      return;
    }

    const tagsArray = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        summary: summary.trim(),
        content: content.trim(),
        cover_image: coverImageUrl.trim(),
        category: finalCategory,
        tags: tagsArray,
        read_time_minutes: readTime,
        is_published: isPublished,
      };

      const res = await fetch(`${API_BASE_URL}/blogs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create article.");
      }

      const data = await res.json();
      const createdSlug = data.blog?.slug || slug;
      router.push(`/blogs/${createdSlug}`);
    } catch (err: any) {
      setFormError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  // If not authenticated as SuperAdmin / Admin, show the SuperAdmin Login Gate
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 flex flex-col font-sans">
        <header className="w-full border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0c0c10]/90 backdrop-blur-md px-6 h-16 flex items-center justify-between">
          <Link
            href="/blogs"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-400 hover:text-indigo-600 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Blogs</span>
          </Link>
          <span className="text-xs font-bold text-slate-500">SuperAdmin Authorization Required</span>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto border border-indigo-200 dark:border-indigo-800">
                <Lock className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">Author Verification</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Enter your SuperAdmin credentials to publish articles and manage public knowledge hub resources.
              </p>
            </div>

            {authError && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuthenticate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {authBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>Authenticate & Access Studio</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 flex flex-col font-sans">
      {/* ── TOP HEADER ── */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#0c0c10]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link
            href="/blogs"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-400 hover:text-indigo-600 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Cancel & Back</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <Shield className="w-3.5 h-3.5" />
              SuperAdmin Verified
            </span>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Publish Article</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN CREATOR CONTAINER ── */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Create New Article
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Publish playbooks, customer stories, or CRM tutorials visible to everyone on the public web.
            </p>
          </div>

          {formError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Title & Slug */}
          <div className="space-y-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
                Article Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., How to Supercharge Lead Management with SerpHawk CRM"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-base font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                  URL Slug
                </label>
                <button
                  type="button"
                  onClick={() => setAutoSlug(!autoSlug)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {autoSlug ? "Lock auto-slug" : "Auto-generate from title"}
                </button>
              </div>
              <div className="flex items-center rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-slate-500">
                <span className="font-mono text-xs text-slate-400 select-none">/blogs/</span>
                <input
                  type="text"
                  value={slug}
                  disabled={autoSlug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="flex-1 bg-transparent font-mono text-xs text-slate-900 dark:text-zinc-100 focus:outline-none ml-1 disabled:opacity-75"
                />
              </div>
            </div>

            {/* Category & Tags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
                  Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="CRM Guide">CRM Guide</option>
                  <option value="AI Automation">AI Automation</option>
                  <option value="Sales Strategies">Sales Strategies</option>
                  <option value="Team Management">Team Management</option>
                  <option value="Product Updates">Product Updates</option>
                  <option value="Custom">Custom Category...</option>
                </select>
                {category === "Custom" && (
                  <input
                    type="text"
                    placeholder="Enter custom category"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="mt-2 w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-sm text-slate-900 dark:text-white"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="pipeline, transfers, ai-research"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Summary / Excerpt */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
                Summary / Excerpt (1-2 sentences) *
              </label>
              <textarea
                required
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Brief snapshot shown on blog cards and search engines..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Cover Image Upload / URL */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs space-y-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              Cover Image
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Image URL</label>
                <input
                  type="url"
                  value={coverImageUrl}
                  onChange={(e) => setCoverImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Or Upload File</label>
                <label className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold cursor-pointer hover:bg-indigo-100/50 transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingImage ? "Uploading..." : "Choose Image File"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

            {coverImageUrl && (
              <div className="mt-2 relative w-full h-44 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800">
                <img src={coverImageUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* Markdown Body Editor */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                Article Body (Markdown Supported) *
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("write")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    activeTab === "write"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 inline mr-1" />
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    activeTab === "preview"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 inline mr-1" />
                  Live Preview
                </button>
              </div>
            </div>

            {activeTab === "write" ? (
              <textarea
                required
                rows={18}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your article in markdown here... 
## Introduction
Start writing with headings, lists, bold text, links, and code blocks!"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 font-mono text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
              />
            ) : (
              <div className="min-h-[400px] p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 prose prose-slate dark:prose-invert max-w-none">
                {content.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                ) : (
                  <p className="text-slate-400 italic text-sm">Nothing to preview yet. Write some markdown content!</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 pt-1">
              <span>Estimated read time: ~{readTime} min</span>
              <span>Markdown formatting: headings (##), bold (**text**), lists (- item)</span>
            </div>
          </div>

          {/* Publishing Settings */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">Publish Immediately</div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">
                Make this article instantly visible on the public web directory.
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <Link
              href="/blogs"
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Publish Article</span>
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

