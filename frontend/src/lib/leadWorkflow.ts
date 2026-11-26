export const INSTITUTE_STAGES = [
  "New", "Contacted", "Not Responded", "Follow-up", "Webinar Scheduled", "Webinar Attended",
  "Webinar Not Attended", "Walk-in Scheduled", "Walk-in Attended", "Walk-in Not Attended", "Student", "Converted", "Lost",
];

export type ScheduleStage = "Follow-up" | "Webinar Scheduled" | "Walk-in Scheduled" | "Meeting" | string;

export function scheduleStage(stage: string, institute?: boolean): ScheduleStage | null {
  const s = (stage || "").toLowerCase();
  if (s.includes("follow")) return "Follow-up";
  if (s.includes("meeting") || s.includes("demo")) return "Meeting";
  if (s.includes("webinar")) return "Webinar Scheduled";
  if (s.includes("walk-in") || s.includes("walkin")) return "Walk-in Scheduled";
  return null;
}

export function leadStages(custom: string[] | null | undefined, institute: boolean, fallback: string[], existing: string[]) {
  const configured = custom?.length ? custom : institute ? INSTITUTE_STAGES : fallback;
  return Array.from(new Set([...configured, ...existing.filter(Boolean)]));
}
