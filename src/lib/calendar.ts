import type { AnalysisRecord } from "./types";
import type { CalendarPayload } from "./automation/make-calendar";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DEFAULT_OFFSET = "-03:00";
const APP_TIME_ZONE = "America/Argentina/Cordoba";

export type CalendarDraft = {
  title: string;
  startInput: string;
  allDay: boolean;
  durationMinutes: number;
  amount: number | null;
};

export type CalendarConfirmation = {
  title: string;
  startInput: string;
  allDay: boolean;
  durationMinutes: number;
  amount: number | null;
};

function addDays(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function addMinutes(start: string, minutes: number): string {
  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) throw new Error("CALENDAR_DATE_INVALID");
  return new Date(parsed.getTime() + minutes * 60 * 1000).toISOString();
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s*[-–—]\s*vencimiento\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}.*$/i, "")
    .replace(/\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/i, "")
    .trim();
}

function eventTitle(item: AnalysisRecord): string {
  const title = cleanTitle(item.title);
  if (item.category === "pago") return /^pagar\b/i.test(title) ? title : `Pagar ${title}`;
  if (item.category === "tramite") return /^renovar|^hacer|^presentar/i.test(title) ? title : `Resolver ${title}`;
  return title;
}

function formatLocalInput(value: string): string {
  if (DATE_ONLY.test(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function normalizeStart(value: string, allDay: boolean): string {
  const trimmed = value.trim();

  if (allDay) {
    if (!DATE_ONLY.test(trimmed)) throw new Error("CALENDAR_DATE_INVALID");
    return trimmed;
  }

  if (LOCAL_DATE_TIME.test(trimmed)) return `${trimmed}:00${DEFAULT_OFFSET}`;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) throw new Error("CALENDAR_DATE_INVALID");
  return parsed.toISOString();
}

function eventDescription(item: AnalysisRecord, amount: number | null): string {
  const details = ["Creado desde ¿QuéHago? después de tu confirmación."];

  if (amount !== null) {
    const formattedAmount = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: item.currency ?? "ARS",
    }).format(amount);
    details.push(`Importe confirmado: ${formattedAmount}`);
  }

  details.push(`Acción sugerida: ${item.summary}`);
  return details.join("\n");
}

export function getCalendarDraft(item: AnalysisRecord): CalendarDraft {
  if (!item.deadline) throw new Error("CALENDAR_DATE_MISSING");
  const allDay = DATE_ONLY.test(item.deadline);

  return {
    title: eventTitle(item),
    startInput: formatLocalInput(item.deadline),
    allDay,
    durationMinutes: item.category === "turno" ? 30 : 30,
    amount: item.amount,
  };
}

export function buildCalendarPayload(
  item: AnalysisRecord,
  confirmed?: CalendarConfirmation,
): CalendarPayload {
  if (!item.deadline) throw new Error("CALENDAR_DATE_MISSING");

  const draft = getCalendarDraft(item);
  const title = (confirmed?.title ?? draft.title).trim();
  const allDay = confirmed?.allDay ?? draft.allDay;
  const startInput = confirmed?.startInput ?? draft.startInput;
  const durationMinutes = confirmed?.durationMinutes ?? draft.durationMinutes;
  const amount = confirmed?.amount ?? draft.amount;

  if (!title || title.length > 120) throw new Error("CALENDAR_TITLE_INVALID");
  if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 720) {
    throw new Error("CALENDAR_DURATION_INVALID");
  }
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 999_999_999)) {
    throw new Error("CALENDAR_AMOUNT_INVALID");
  }

  const start = normalizeStart(startInput, allDay);
  const end = allDay ? addDays(start, 1) : addMinutes(start, durationMinutes);

  return {
    title,
    start,
    end,
    all_day: allDay,
    description: eventDescription(item, amount),
    location: "",
    analysis_id: item.id,
  };
}
