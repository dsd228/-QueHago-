"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { analysisProvider } from "@/lib/ai";
import {
  createAnalysis,
  createChecklistForAnalysis,
  createReminderForAnalysis,
  getAnalysisById,
  getChecklistByAnalysisId,
  getReminderByAnalysisId,
  markAnalysisResolved,
  markCalendarUndone,
  saveCalendarSync,
  toggleChecklistItem,
} from "@/lib/data";
import { buildCalendarPayload, getCalendarDraft, type CalendarConfirmation } from "@/lib/calendar";
import { createMakeCalendarEvent, deleteMakeCalendarEvent } from "@/lib/automation/make-calendar";
import { canCreateCalendarEvent, canCreateChecklist, canCreateReminder } from "@/lib/product-actions";
import { minimizeAnalysis } from "@/lib/privacy";

export type AnalyzeFormState = {
  error: string | null;
};

const MAX_TEXT_LENGTH = 20_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

function friendlyError(error: unknown): string {
  const code = error instanceof Error ? error.message : "UNKNOWN";

  if (code === "GROQ_API_KEY_MISSING") {
    return "Falta configurar GROQ_API_KEY en .env.local.";
  }
  if (code === "GROQ_AUTH_ERROR") {
    return "Groq rechazó la API key. Revisá GROQ_API_KEY en .env.local.";
  }
  if (code === "GROQ_FORBIDDEN") {
    return "Groq bloqueó el modelo solicitado para este proyecto. Revisá Model Permissions en Groq o probá otro modelo habilitado.";
  }
  if (code === "GROQ_RATE_LIMIT") {
    return "Groq alcanzó temporalmente el límite de uso. Probá nuevamente en un momento.";
  }
  if (code === "IMAGE_TOO_LARGE") {
    return "La imagen pesa más de 10 MB. Elegí una captura más liviana.";
  }
  if (code === "IMAGE_TYPE_UNSUPPORTED") {
    return "Por ahora acepto capturas PNG, JPG o JPEG.";
  }
  if (code === "IMAGE_PROVIDER_UNAVAILABLE") {
    return "El proveedor de IA configurado no admite imágenes en esta versión.";
  }
  if (code === "GROQ_IMAGE_NO_TEXT") {
    return "No pude leer texto suficiente en esa imagen. Probá con una captura más nítida o pegá el texto.";
  }
  if (code === "GROQ_IMAGE_INVALID_JSON") {
    return "Pude ver la imagen, pero no pude extraer su texto con seguridad. Probá nuevamente.";
  }
  if (code.startsWith("GROQ_HTTP_")) {
    return "No pude conectarme correctamente con Groq. Tus datos no se guardaron.";
  }
  if (code === "GROQ_INVALID_JSON" || code === "GROQ_SCHEMA_MISMATCH" || code === "GROQ_EMPTY_RESPONSE") {
    return "No pude interpretar esto con suficiente seguridad. Probá de nuevo o pegá un poco más de contexto.";
  }
  if (code === "OLLAMA_UNAVAILABLE" || code.startsWith("OLLAMA_HTTP_")) {
    return "No pude conectarme con Ollama. Comprobá que esté abierto y funcionando en tu computadora.";
  }
  if (code === "OLLAMA_NO_MODEL") {
    return "Ollama está funcionando, pero no encontré ningún modelo instalado.";
  }
  if (code === "OLLAMA_INVALID_JSON" || code === "OLLAMA_SCHEMA_MISMATCH" || code === "OLLAMA_EMPTY_RESPONSE") {
    return "No pude interpretar esto con suficiente seguridad. Probá de nuevo o pegá un poco más de contexto.";
  }

  console.error("[QueHago] analysis failed", error);
  return "No pude analizarlo esta vez. Tus datos no se guardaron. Probá nuevamente.";
}

export async function analyzeTextAction(
  _previousState: AnalyzeFormState,
  formData: FormData,
): Promise<AnalyzeFormState> {
  const value = formData.get("content");
  const content = typeof value === "string" ? value.trim() : "";
  const attachment = formData.get("attachment");
  const image = attachment instanceof File && attachment.size > 0 ? attachment : null;

  if (!content && !image) {
    return { error: "Subí una captura o pegá el mensaje que querés resolver." };
  }

  if (content.length > MAX_TEXT_LENGTH) {
    return { error: "El texto es demasiado largo. Usá hasta 20.000 caracteres." };
  }

  let id: string;
  try {
    if (image) {
      if (image.size > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
      if (!ALLOWED_IMAGE_TYPES.has(image.type)) throw new Error("IMAGE_TYPE_UNSUPPORTED");
      if (!analysisProvider.analyzeImage) throw new Error("IMAGE_PROVIDER_UNAVAILABLE");

      const bytes = Buffer.from(await image.arrayBuffer());
      const result = await analysisProvider.analyzeImage({
        base64: bytes.toString("base64"),
        mimeType: image.type as "image/png" | "image/jpeg",
        fileName: image.name || "captura",
        userContext: content || undefined,
      });

      id = createAnalysis(null, minimizeAnalysis(result.analysis), {
        kind: "image",
        name: image.name || "captura",
        mime: image.type,
      });
    } else {
      const result = await analysisProvider.analyzeText(content);
      id = createAnalysis(content, minimizeAnalysis(result), { kind: "text" });
    }
  } catch (error) {
    return { error: friendlyError(error) };
  }

  redirect(`/a/${id}`);
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function calendarConfirmationFromForm(item: NonNullable<ReturnType<typeof getAnalysisById>>, formData: FormData): CalendarConfirmation {
  const draft = getCalendarDraft(item);
  const title = formString(formData, "calendarTitle") || draft.title;
  const startInput = formString(formData, "calendarStart") || draft.startInput;
  const mode = formString(formData, "calendarMode");
  const allDay = mode === "all-day" ? true : mode === "timed" ? false : draft.allDay;
  const durationRaw = Number(formString(formData, "calendarDuration") || draft.durationMinutes);
  const amountRaw = formString(formData, "calendarAmount");
  const amount = amountRaw === "" ? draft.amount : Number(amountRaw);

  if (!Number.isFinite(durationRaw)) throw new Error("CALENDAR_DURATION_INVALID");
  if (amount !== null && !Number.isFinite(amount)) throw new Error("CALENDAR_AMOUNT_INVALID");

  return {
    title,
    startInput,
    allDay,
    durationMinutes: Math.round(durationRaw),
    amount,
  };
}

export async function createCalendarEventAction(
  analysisId: string,
  formData: FormData,
): Promise<void> {
  const item = getAnalysisById(analysisId);

  if (!item) redirect("/");
  if (item.isExample) redirect(`/a/${analysisId}?calendar=example`);
  if (item.calendarEventId && !item.calendarDeletedAt) redirect(`/a/${analysisId}`);
  if (!canCreateCalendarEvent(item)) redirect(`/a/${analysisId}?calendar=unavailable`);

  try {
    const confirmation = calendarConfirmationFromForm(item, formData);
    const payload = buildCalendarPayload(item, confirmation);
    const result = await createMakeCalendarEvent(payload);
    saveCalendarSync(item.id, result.event_id, result.event_url, payload);
  } catch (error) {
    console.error("[QueHago] calendar automation failed", error);
    redirect(`/a/${analysisId}?calendar=error`);
  }

  revalidatePath(`/a/${analysisId}`);
  revalidatePath("/hoy");
  revalidatePath("/historial");
  redirect(`/a/${analysisId}?calendar=created`);
}

export async function undoCalendarEventAction(analysisId: string): Promise<void> {
  const item = getAnalysisById(analysisId);
  if (!item) redirect("/");
  if (item.isExample) redirect(`/a/${analysisId}?calendar=example`);
  if (!item.calendarEventId || item.calendarDeletedAt) redirect(`/a/${analysisId}?calendar=already-undone`);

  try {
    await deleteMakeCalendarEvent(item.calendarEventId, item.id);
    markCalendarUndone(item.id);
  } catch (error) {
    console.error("[QueHago] calendar undo failed", error);
    const code = error instanceof Error ? error.message : "";
    if (code === "MAKE_DELETE_WEBHOOK_MISSING") {
      redirect(`/a/${analysisId}?calendar=undo-unavailable`);
    }
    redirect(`/a/${analysisId}?calendar=undo-error`);
  }

  revalidatePath(`/a/${analysisId}`);
  revalidatePath("/hoy");
  revalidatePath("/historial");
  redirect(`/a/${analysisId}?calendar=undone`);
}

export async function createReminderAction(analysisId: string): Promise<void> {
  const item = getAnalysisById(analysisId);
  if (!item) redirect("/");
  if (item.isExample) redirect(`/a/${analysisId}?reminder=example`);
  if (!canCreateReminder(item)) redirect(`/a/${analysisId}?reminder=unavailable`);

  const existing = getReminderByAnalysisId(item.id);
  if (existing) redirect(`/a/${analysisId}?reminder=already`);

  try {
    createReminderForAnalysis(item);
  } catch (error) {
    console.error("[QueHago] reminder creation failed", error);
    redirect(`/a/${analysisId}?reminder=error`);
  }

  revalidatePath(`/a/${analysisId}`);
  revalidatePath("/hoy");
  revalidatePath("/historial");
  redirect(`/a/${analysisId}?reminder=created`);
}

export async function markResolvedAction(analysisId: string): Promise<void> {
  const item = getAnalysisById(analysisId);
  if (!item) redirect("/");
  if (item.isExample) redirect(`/a/${analysisId}?status=example`);

  markAnalysisResolved(analysisId);
  revalidatePath(`/a/${analysisId}`);
  revalidatePath("/hoy");
  revalidatePath("/historial");
  redirect(`/a/${analysisId}?status=resolved`);
}


export async function createChecklistAction(analysisId: string): Promise<void> {
  const item = getAnalysisById(analysisId);
  if (!item) redirect("/");
  if (item.isExample) redirect(`/a/${analysisId}?checklist=example`);
  if (!canCreateChecklist(item)) redirect(`/a/${analysisId}?checklist=unavailable`);

  const existing = getChecklistByAnalysisId(item.id);
  if (existing.length) redirect(`/a/${analysisId}?checklist=already#checklist`);

  try {
    createChecklistForAnalysis(item);
  } catch (error) {
    console.error("[QueHago] checklist creation failed", error);
    redirect(`/a/${analysisId}?checklist=error`);
  }

  revalidatePath(`/a/${analysisId}`);
  revalidatePath("/hoy");
  redirect(`/a/${analysisId}?checklist=created#checklist`);
}

export async function toggleChecklistItemAction(
  analysisId: string,
  checklistItemId: string,
): Promise<void> {
  const item = getAnalysisById(analysisId);
  if (!item) redirect("/");
  if (item.isExample) redirect(`/a/${analysisId}?checklist=example`);

  toggleChecklistItem(analysisId, checklistItemId);

  revalidatePath(`/a/${analysisId}`);
  revalidatePath("/hoy");
  redirect(`/a/${analysisId}#checklist`);
}
