export function sidebarPathMatches(path: string | null, href: string): boolean {
  return path === href || (href !== "/" && !!path?.startsWith(href + "/"));
}

/** Saved preferences supply order and headings; the current catalog supplies routes and access. */
export function mergeSidebarSections<T extends { id: string; heading: string | null; items: { id: string }[] }>(defaults: T[], saved: unknown): T[] {
  if (!Array.isArray(saved)) return defaults;
  const catalog = new Map(defaults.map(section => [section.id, section]));
  const result: T[] = [];
  const seen = new Set<string>();
  for (const value of saved) {
    if (!value || typeof value !== "object" || typeof value.id !== "string" || seen.has(value.id)) continue;
    const section = catalog.get(value.id);
    if (!section) continue;
    seen.add(section.id);
    const items = new Map(section.items.map(item => [item.id, item]));
    const ordered: T["items"] = [];
    if (Array.isArray(value.items)) for (const item of value.items) {
      const canonical = item && items.get(item.id);
      if (canonical) { ordered.push(canonical); items.delete(canonical.id); }
    }
    ordered.push(...items.values());
    result.push({ ...section, heading: section.heading !== null && typeof value.heading === "string" && value.heading.trim() ? value.heading.trim().slice(0, 80) : section.heading, items: ordered });
  }
  return [...result, ...defaults.filter(section => !seen.has(section.id))];
}
