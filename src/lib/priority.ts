import type { AnalysisCategory, Priority, Risk } from "./types";

const APP_TIME_ZONE = "America/Argentina/Cordoba";

function todayDateOnly(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function dateOnly(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Product priority is deterministic.
 * AI may suggest a priority, but dates and security risk win.
 */
export function getEffectivePriority(input: {
  category: AnalysisCategory;
  risk: Risk;
  deadline: string | null;
  suggested: Priority;
}): Priority {
  if (input.category === "seguridad" && (input.risk === "alto" || input.risk === "medio")) {
    return "alta";
  }

  if (input.deadline) {
    const due = dateOnly(input.deadline);
    if (due) {
      const days = daysBetween(todayDateOnly(), due);
      if (days <= 2) return "alta";
      if (days <= 10) return "media";
      return "baja";
    }
  }

  return input.suggested;
}
