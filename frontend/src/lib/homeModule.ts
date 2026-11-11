/** Home stays usable even when neither overview module is assigned. */
export function homeModule(role: string | null, features: Record<string, boolean>): "platform" | "dashboard" | "dashboard_b2c" | "command_center" | "none" {
  if (role === "SuperAdmin") return "platform";
  if (["Admin", "SalesManager", "Sales", "Employee", "Demo"].includes(role || "") && features.dashboard_b2c === true && features.institute === true) return "dashboard_b2c";
  if (["Admin", "SalesManager", "Sales", "Demo"].includes(role || "") && features.command_center === true) return "command_center";
  if (features.dashboard !== false) return "dashboard";
  return "none";
}
