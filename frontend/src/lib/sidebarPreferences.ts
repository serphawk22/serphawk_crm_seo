export function sidebarPathMatches(path: string | null, href: string): boolean {
  return path === href || (href !== "/" && !!path?.startsWith(href + "/"));
}

/** Current dashboards keep their home position even for pre-migration saved menus. */
export function pinDashboardNavigation<T extends { id: string; heading: string | null; items: { id: string }[] }>(sections: T[]): T[] {
  const home = sections.find(section => section.id === "section-home");
  if (!home) return sections;
  const ids = ["item-dashboard-b2c", "item-command-center"];
  const dashboards = ids.flatMap(id => sections.flatMap(section => section.items.filter(item => item.id === id)).slice(0, 1));
  const updated = sections.map(section => ({ ...section, items: section.items.filter(item => !ids.includes(item.id)) }));
  const homeSection = updated.find(section => section.id === home.id)!;
  homeSection.items = [...dashboards, ...homeSection.items];
  return [homeSection, ...updated.filter(section => section.id !== home.id)];
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
      if (canonical) {
        const customName = typeof (item as any).name === "string" && (item as any).name.trim() ? (item as any).name.trim().slice(0, 80) : ((item as any).customName || null);
        ordered.push(customName ? { ...canonical, name: customName, customName } : canonical);
        items.delete(canonical.id);
      }
    }
    ordered.push(...items.values());
    result.push({ ...section, heading: section.heading !== null && typeof value.heading === "string" && value.heading.trim() ? value.heading.trim().slice(0, 80) : section.heading, items: ordered });
  }
  return [...result, ...defaults.filter(section => !seen.has(section.id))];
}
