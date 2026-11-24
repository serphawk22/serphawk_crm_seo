"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  Lock,
  Shield,
  Eye,
  FileText,
  AlertCircle,
  Loader2,
  Save,
  Trash2
} from "lucide-react";
import { API_BASE_URL } from "@/config";

export default function EditBlogPostPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  // Authentication state
  const [token, setToken] = useState<string>("");
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

  // Form Fields
  const [title, setTitle] = useState<string>("");
  const [slug, setSlug] = useState<string>("");
  const [category, setCategory] = useState<string>("CRM Guide");
  const [customCategory, setCustomCategory] = useState<string>("");
  const [tagsInput, setTagsInput] = useState<string>("");
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

  // Submission & Deletion
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
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

  // Fetch blog data
  useEffect(() => {
    if (!id) return;
    const fetchBlog = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/blogs/${id}`);
        if (!res.ok) throw new Error("Blog not found");
        const data = await res.json();
        const b = data.blog;
        setTitle(b.title || "");
        setSlug(b.slug || "");
        setSummary(b.summary || "");
        setContent(b.content || "");
        setCoverImageUrl(b.cover_image || "");
        setCategory(b.category || "CRM Guide");
        setTagsInput((b.tags || []).join(", "));
        setReadTime(b.read_time_minutes || 5);
        setIsPublished(b.is_published ?? true);
      } catch (e: any) {
        setFormError(e.message || "Failed to load blog for editing");
      }
    };
    fetchBlog();
  }, [id]);

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

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const finalCategory = category === "Custom" ? customCategory.trim() : category;
    const tagsArray = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim(),
        summary: summary.trim(),
        content: content.trim(),
        cover_image: coverImageUrl.trim(),
        category: finalCategory,
        tags: tagsArray,
        read_time_minutes: readTime,
        is_published: isPublished,
      };

      const res = await fetch(`${API_BASE_URL}/blogs/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to update article.");
      }

      router.push(`/blogs/${slug}`);
    } catch (err: any) {
      setFormError(err.message || "Failed to save changes.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to permanently delete this article?")) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/blogs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        router.push("/blogs");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to delete article");
      }
    } catch (e) {
      alert("Failed to communicate with server");
    } finally {
      setDeleting(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex items-center justify-center p-4">
        <div className="max-w-md text-center bg-white dark:bg-zinc-900 p-8 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
          <Lock className="w-10 h-10 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold">Unauthorized</h2>
          <p className="text-sm text-slate-500">Only SuperAdmin or Admin accounts can edit articles.</p>
          <Link href="/blogs" className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">
            Back to Articles
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 flex flex-col font-sans">
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#0c0c10]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link
            href={`/blogs/${slug}`}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-400 hover:text-indigo-600 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Cancel</span>
          </Link>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{deleting ? "Deleting..." : "Delete"}</span>
            </button>

            <button
              type="button"
              onClick={handleUpdate}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">
        <form onSubmit={handleUpdate} className="space-y-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Edit Article
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Update article contents, images, or SEO parameters.
            </p>
          </div>

          {formError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

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
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-base font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
                URL Slug
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 font-mono text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

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
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
                Summary / Excerpt *
              </label>
              <textarea
                required
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs space-y-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              Cover Image
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Image URL</label>
                <input
                  type="url"
                  value={coverImageUrl}
                  onChange={(e) => setCoverImageUrl(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Upload New Image</label>
                <label className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold cursor-pointer hover:bg-indigo-100/50 transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingImage ? "Uploading..." : "Replace Image File"}</span>
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
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 font-mono text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
              />
            ) : (
              <div className="min-h-[400px] p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 prose prose-slate dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">Publish Status</div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">
                Visible on public blog index and search engines.
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
              href={`/blogs/${slug}`}
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
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

