"use client";
import LocalizedText from "@/components/LocalizedText";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

type Member = { id: number; name: string; email: string; role: string; is_active?: boolean };
export default function ProjectMemberSelect({ users, value, onChange }: { users: Member[]; value: number[]; onChange: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const members = users.filter(u => u.is_active !== false && ["Admin", "SalesManager", "Sales", "Employee", "Intern", "ProjectMember"].includes(u.role));
  const filtered = members.filter(u => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return <div ref={root} className="relative" onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}>
    <button type="button" aria-label="Assign team members" aria-expanded={open} aria-controls="project-member-options" onClick={() => setOpen(!open)} className="w-full flex justify-between items-center px-5 py-4 bg-gray-50 dark:bg-zinc-950 rounded-2xl text-sm font-bold text-left focus:ring-2 focus:ring-blue-500">
      <span>{value.length ? `${value.length} team member${value.length === 1 ? "" : "s"} selected` : "Select team members"}</span><ChevronDown className="h-4 w-4" />
    </button>
    {open && <div id="project-member-options" className="absolute z-30 mt-2 w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-xl p-3">
      <input aria-label="Search team members" placeholder="Search name or email" value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm mb-2" />
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filtered.map(u => <label key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer">
          <input type="checkbox" checked={value.includes(u.id)} onChange={e => onChange(e.target.checked ? [...value, u.id] : value.filter(id => id !== u.id))} />
          <span className="min-w-0"><span className="block text-sm font-semibold truncate">{u.name || u.email}</span><span className="block text-xs text-gray-500 truncate">{u.email} · {u.role === "Sales" || u.role === "Employee" ? "Sales Manager" : u.role}</span></span>
        </label>)}
        {!filtered.length && <p className="text-sm text-gray-500 p-2">No matching team members.</p>}
      </div>
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-sm font-bold text-blue-600"><LocalizedText text={"Done"} /></button>
    </div>}
    {!!value.length && <div className="flex flex-wrap gap-2 mt-2">{members.filter(u => value.includes(u.id)).map(u => <button type="button" key={u.id} onClick={() => onChange(value.filter(id => id !== u.id))} className="rounded-full bg-blue-50 dark:bg-blue-950 px-3 py-1 text-xs text-blue-700 dark:text-blue-200" aria-label={`Remove ${u.name || u.email}`}>{u.name || u.email} ×</button>)}</div>}
  </div>;
}
