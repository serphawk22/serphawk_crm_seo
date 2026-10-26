"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, Users } from "lucide-react";
import Drawer from "@/components/Drawer";
import { Preset, RegionOptions, call, ghostBtn, inputCls, primaryBtn } from "./shared";

interface Props {
  open: boolean;
  onClose: () => void;
  presets: Preset[];
  regions: RegionOptions;
  onDone: (created: number, failed: number) => void;
  onError: (title: string, message: string) => void;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EXAMPLE = [
  "acme-logistics, Acme Logistics, Anita Rao, anita@acme-logistics.com, bpo, IN, logistics",
  "casa-bella, Casa Bella Studio, Bruno Bella, bruno@casabella.mx, agency, MX, agency",
  "plain-goods, Plain Goods Co, Pat Plain, pat@plaingoods.com",
].join("\n");

interface Row {
  line: number;
  raw: string;
  body: Record<string, any>;
  problems: string[];
}

export default function BulkDrawer({ open, onClose, presets, regions, onDone, onError }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const rows: Row[] = useMemo(() => {
    const seenAccounts = new Set<string>();
    const seenEmails = new Set<string>();
    return text.split("\n").map((raw, i) => ({ raw: raw.trim(), line: i + 1 })).filter((r) => r.raw).map(({ raw, line }) => {
      const [name = "", business = "", adminName = "", adminEmail = "", preset = "", country = "", industry = ""] = raw.split(",").map((x) => x.trim());
      const problems: string[] = [];
      if (!name) problems.push("account name missing");
      if (!adminName) problems.push("admin name missing");
      if (!EMAIL.test(adminEmail)) problems.push("admin email is not valid");
      if (preset && !presets.some((p) => p.key === preset)) problems.push(`unknown setup "${preset}"`);
      if (country && !regions.countries.some((c) => c.code === country.toUpperCase())) problems.push(`unknown country "${country}"`);
      if (industry && !regions.industries.some((x) => x.key === industry)) problems.push(`unknown business type "${industry}"`);
      if (name && seenAccounts.has(name.toLowerCase())) problems.push("account name repeated");
      if (adminEmail && seenEmails.has(adminEmail.toLowerCase())) problems.push("admin email repeated");
      seenAccounts.add(name.toLowerCase());
      seenEmails.add(adminEmail.toLowerCase());
      return {
        line, raw, problems,
        body: { name, business_name: business || null, admin_name: adminName, admin_email: adminEmail, preset: preset || "standard", country: country ? country.toUpperCase() : null, industry: industry || null },
      };
    });
  }, [text, presets, regions]);

  const valid = rows.length > 0 && rows.every((r) => r.problems.length === 0);

  const create = async () => {
    setBusy(true);
    try {
      const out = await call("/superadmin/tenants/bulk", { method: "POST", body: JSON.stringify({ clients: rows.map((r) => r.body) }) });
      setResult(out);
      onDone(out.created, out.failed);
    } catch (e: any) {
      onError("The clients were not created", e.message);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    const lines = [["account", "result", "admin_email", "temporary_password"], ...result.results.map((r: any) => [r.name, r.ok ? "created" : r.error, r.admin_email || "", r.generated_admin_password || ""])];
    const csv = lines.map((l: string[]) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "new-client-logins.csv";
    a.click();
  };

  const reset = () => { setResult(null); setText(""); };

  return (
    <Drawer
      open={open}
      onClose={() => { onClose(); if (result) reset(); }}
      width="max-w-3xl"
      title="Add many clients at once"
      subtitle="One client per line. Each is created independently: a line that fails does not stop the others."
      leading={<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md"><Users className="w-5 h-5" /></div>}
      footer={
        result ? (
          <div className="flex items-center justify-between gap-3">
            <button className={ghostBtn} onClick={download}><Download className="w-4 h-4" /> Download logins (CSV)</button>
            <button className={primaryBtn} onClick={() => { reset(); }}>Add more</button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-zinc-400">{rows.length === 0 ? "Paste or type one client per line." : valid ? `${rows.length} client${rows.length === 1 ? "" : "s"} ready.` : "Fix the lines marked in red to continue."}</p>
            <button className={primaryBtn} onClick={create} disabled={!valid || busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Create {rows.length || ""} client{rows.length === 1 ? "" : "s"}
            </button>
          </div>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className={`rounded-2xl border p-4 text-sm ${result.failed ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30"}`}>
            <p className="font-semibold text-slate-900 dark:text-white">{result.created} created{result.failed ? `, ${result.failed} failed` : ""}</p>
            <p className="mt-1 text-slate-600 dark:text-zinc-400">Temporary passwords are shown only on this screen. Download them now.</p>
          </div>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-zinc-800 dark:border-zinc-800">
            {result.results.map((r: any, i: number) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
                {r.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-zinc-100">{r.name}</p>
                  {r.ok ? (
                    <p className="font-mono text-xs text-slate-500 dark:text-zinc-400">{r.admin_email}{r.generated_admin_password ? ` · ${r.generated_admin_password}` : ""}</p>
                  ) : (
                    <p className="text-xs font-medium text-red-600">{r.error}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
            <p className="font-semibold text-slate-900 dark:text-zinc-100">Format</p>
            <code className="mt-1 block text-[11px]">account, company name, admin name, admin email, setup, country, business type</code>
            <p className="mt-2">The last three are optional. Setups: {presets.map((p) => p.key).join(", ")}. A password is generated for every admin.</p>
          </div>
          <textarea className={`${inputCls} font-mono text-xs`} rows={7} spellCheck={false} placeholder={EXAMPLE} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-3">
            <button type="button" className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => setText(EXAMPLE)}>Fill with an example</button>
            {text && <button type="button" className="text-xs font-semibold text-slate-500 hover:underline" onClick={() => setText("")}>Clear</button>}
          </div>

          {rows.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr><th className="px-3 py-2">Line</th><th className="px-3 py-2">Account</th><th className="px-3 py-2">Admin</th><th className="px-3 py-2">Setup</th><th className="px-3 py-2">Check</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {rows.map((r) => (
                    <tr key={r.line} className={r.problems.length ? "bg-red-50/60 dark:bg-red-950/20" : ""}>
                      <td className="px-3 py-2 text-slate-400">{r.line}</td>
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-zinc-100">{r.body.name || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-zinc-300">{r.body.admin_email || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-zinc-300">{r.body.preset}{r.body.country ? ` · ${r.body.country}` : ""}</td>
                      <td className="px-3 py-2 text-xs">{r.problems.length ? <span className="font-medium text-red-600">{r.problems.join(", ")}</span> : <span className="font-medium text-emerald-600">OK</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
