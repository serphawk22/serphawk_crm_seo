/** Stable legacy keys and the two independent dashboard section families. */
export function dashboardParent(key: string): string | null {
  if (key === "dashboard_b2c") return null;
  if (key.startsWith("dashboard_b2c_")) return "dashboard_b2c";
  if (key.startsWith("command_center_")) return "command_center";
  return key.startsWith("dashboard_") ? "dashboard" : null;
}
