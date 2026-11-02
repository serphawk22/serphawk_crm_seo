/** Home stays usable even when neither overview module is assigned. */
export function homeModule(role: string | null, features: Record<string, boolean>): "platform" | "dashboard" | "command_center" | "none" {
  if (role === "SuperAdmin") return "platform";
  if (features.dashboard !== false) return "dashboard";
  if (["Admin", "SalesManager", "Sales", "Demo"].includes(role || "") && features.command_center === true) return "command_center";
  return "none";
}
