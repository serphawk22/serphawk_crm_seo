/** Localize server-generated month labels without changing record names. */
export function dashboardDateLabel(label: string, language: string): string {
  if (language === "en") return label;
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(label);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const english = /^([A-Za-z]+)(?:\s+(\d{1,2}|\d{4}))?$/.exec(label);
  const fullMonths = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const monthName = english?.[1].toLowerCase();
  const englishMonth = fullMonths.findIndex((name, index) => name === monthName || months[index] === monthName);
  let year = 2000, month: number, day: number | undefined, showYear = false;
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]) - 1;
    day = iso[3] ? Number(iso[3]) : undefined;
    showYear = !day;
  } else if (english && englishMonth >= 0) {
    month = englishMonth;
    if (english[2]?.length === 4) { year = Number(english[2]); showYear = true; }
    else if (english[2]) day = Number(english[2]);
  } else return label;
  if (month < 0 || month > 11 || (day !== undefined && (day < 1 || day > 31))) return label;
  const date = new Date(Date.UTC(year, month, day || 1));
  if (date.getUTCMonth() !== month) return label;
  return new Intl.DateTimeFormat(language, { month: "short", ...(day ? { day: "numeric" } : {}), ...(showYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(date);
}
