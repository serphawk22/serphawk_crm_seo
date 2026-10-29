/** Which module (feature key) each page belongs to. A page whose module is switched off for the company is closed
 *  (components/ModuleGate.tsx), so typing the address of a hidden menu entry does not open it.
 *  Keys match modules/features.py. Pages that are not listed are always open (dashboard, leads, notifications, profile...). */
const PAGE_MODULES: ReadonlyArray<readonly [string, string]> = [
  // CRM / work
  ["/leads", "leads"], ["/contacts", "contacts"], ["/clients", "clients"], ["/admin/clients", "clients"], ["/pipeline", "deals"],
  ["/work-queue", "work_queue"], ["/projects", "projects"], ["/task-sheet", "task_sheet"], ["/reports", "reports"],
  ["/meetings", "meetings"], ["/calls", "calls"], ["/teams", "teams"], ["/admin/leaderboard", "leaderboard"],
  ["/admin/telemetry", "demo_accounts"],
  // communication / AI agents
  ["/inbox", "inbox"], ["/followups", "followups"], ["/follow-ups", "followup_board"],
  ["/email-agent", "email_agent"], ["/voice-agent", "voice_agent"],
  // sales operations / support / system
  ["/inventory", "inventory"], ["/orders", "inventory"], ["/products", "products"],
  ["/billing", "billing"], ["/invoices", "billing"], ["/quotes", "billing"], ["/proposals", "proposals"],
  ["/admin/marketplace", "marketplace"],
  ["/support/cases", "support"], ["/support/solutions", "support"], ["/support/scmhub-cases", "scmhub_cases"],
  ["/import", "import_data"], ["/admin/api-intelligence", "api_intelligence"],
  // business suite
  ["/command-center", "command_center"], ["/revenue", "finance_suite"], ["/business-costs", "finance_suite"],
  ["/lead-sources", "lead_sources"], ["/lead-source-analytics", "lead_sources"], ["/ownership", "ownership"],
  ["/dropped-clients", "dropped_clients"],
  // institute
  ["/students", "institute"], ["/courses", "institute"], ["/batches", "institute"], ["/instructors", "institute"],
  ["/enrollments", "institute"], ["/schedule", "institute"], ["/institute-analytics", "institute"],
];

/** The module a page address belongs to (the longest matching prefix wins), or null when the page is not a module. */
export function moduleForPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  let best: readonly [string, string] | null = null;
  for (const entry of PAGE_MODULES) {
    const [prefix] = entry;
    if ((pathname === prefix || pathname.startsWith(prefix + "/")) && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}

const LABELS: Record<string, string> = {
  contacts: "Contacts", clients: "Clients", deals: "Deals", work_queue: "My Work Queue", projects: "Projects", task_sheet: "Task Sheet",
  reports: "Reports", meetings: "Meetings", calls: "Calls", teams: "Team Directory", leaderboard: "Leaderboard",
  demo_accounts: "Demo account data", inbox: "Inbox", followups: "Follow-ups", followup_board: "Follow-up board",
  email_agent: "Email Agent", voice_agent: "AI Voice Caller", inventory: "Inventory & orders", products: "Products catalog",
  billing: "Billing", proposals: "Proposals", marketplace: "Marketplace", support: "Cases & solutions", scmhub_cases: "SCMHub Cases",
  import_data: "Import data", api_intelligence: "API Intelligence", command_center: "Command center", finance_suite: "Revenue & business costs",
  lead_sources: "Lead sources", ownership: "Ownership history", dropped_clients: "Dropped clients", institute: "Institute",
};

export function moduleLabel(key: string): string {
  return LABELS[key] || key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Platform demo management is independent of any selected tenant's plan. */
export function isPlatformManagementPage(pathname: string | null | undefined): boolean {
  return pathname === "/admin/telemetry" || !!pathname?.startsWith("/admin/telemetry/");
}
