export const INSTITUTE_STAGES = [
  "New", "Contacted", "Not Responded", "Follow-up", "Webinar Scheduled", "Webinar Attended",
  "Webinar Not Attended", "Walk-in Scheduled", "Walk-in Attended", "Walk-in Not Attended", "Converted", "Lost",
];

export type ScheduleStage = "Follow-up" | "Webinar Scheduled" | "Walk-in Scheduled";

export function scheduleStage(stage: string, institute: boolean): ScheduleStage | null {
  return institute && ["Follow-up", "Webinar Scheduled", "Walk-in Scheduled"].includes(stage)
    ? stage as ScheduleStage : null;
}

export function leadStages(custom: string[] | null | undefined, institute: boolean, fallback: string[], existing: string[]) {
  const configured = custom?.length ? custom : institute ? INSTITUTE_STAGES : fallback;
  return Array.from(new Set([...configured, ...existing.filter(Boolean)]));
}
