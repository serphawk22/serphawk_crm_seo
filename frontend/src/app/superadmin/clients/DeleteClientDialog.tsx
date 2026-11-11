"use client";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import ResponsiveDialog from "@/components/ResponsiveDialog";
import { call, displayName, ghostBtn, inputCls, TenantOverview } from "./shared";

export default function DeleteClientDialog({ tenant, onClose, onDeleted }: {
  tenant: TenantOverview; onClose: () => void; onDeleted: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = displayName(tenant);
  return <ResponsiveDialog title={`Delete ${name}?`} description="Permanently delete this workspace, its user accounts and CRM records. Linked demo workspaces must be deleted first." onClose={() => { if (!busy) onClose(); }}>
    <form className="space-y-4 p-4" onSubmit={async event => {
      event.preventDefault();
      if (busy || confirmation !== name) return;
      setBusy(true); setError("");
      try {
        await call(`/superadmin/tenants/${tenant.id}`, { method: "DELETE", body: JSON.stringify({ confirm_name: tenant.name }) });
        onDeleted();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not delete this workspace");
        setBusy(false);
      }
    }}>
      <label htmlFor="delete-client-confirmation" className="block text-sm font-semibold">Type <strong>{name}</strong> to confirm</label>
      <input id="delete-client-confirmation" className={inputCls} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" autoFocus />
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={ghostBtn} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" disabled={busy || confirmation !== name} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{busy ? "Deleting…" : "Delete workspace"}
        </button>
      </div>
    </form>
  </ResponsiveDialog>;
}
