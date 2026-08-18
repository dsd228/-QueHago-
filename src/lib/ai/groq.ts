import { ANALYSIS_JSON_SCHEMA, validateAnalysis, type AnalysisResult } from "./schema";
import { ANALYZER_SYSTEM_PROMPT } from "./system-prompt";
import type { AnalysisProvider, ImageAnalysisInput, ImageAnalysisOutput } from "./provider";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_VISION_MODEL = "qwen/qwen3.6-27b";

function currentContext() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    localeDate: new Intl.DateTimeFormat("es-AR", {
      dateStyle: "full",
      timeZone: "America/Argentina/Cordoba",
    }).format(now),
    timezone: "America/Argentina/Cordoba",
  };
}

function getApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY_MISSING");
  return apiKey;
}

async function ensureGroqResponse(response: Response): Promise<void> {
  if (response.ok) return;

  const body = await response.text().catch(() => "");
  console.error("[QueHago] Groq error", response.status, body.slice(0, 1000));
  if (response.status === 401) throw new Error("GROQ_AUTH_ERROR");
  if (response.status === 403) throw new Error("GROQ_FORBIDDEN");
  if (response.status === 429) throw new Error("GROQ_RATE_LIMIT");
  throw new Error(`GROQ_HTTP_${response.status}`);
}

function extractMessageContent(payload: unknown): string {
  const data = payload as { choices?: Array<{ message?: { content?: string | null } }> };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("GROQ_EMPTY_RESPONSE");
  return raw;
}

class GroqProvider implements AnalysisProvider {
  async analyzeText(content: string): Promise<AnalysisResult> {
    const apiKey = getApiKey();
    const model = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
    const context = currentContext();

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: ANALYZER_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Fecha de referencia: ${context.localeDate} (${context.iso}). Zona horaria: ${context.timezone}.
Si una fecha del texto omite el año pero día y mes son inequívocos, podés normalizarla usando el año de referencia y agregá un warning indicando que el año fue inferido. No inventes ningún otro dato.

CONTENIDO A ANALIZAR:\n${content}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "quehago_analysis",
            strict: true,
            schema: ANALYSIS_JSON_SCHEMA,
          },
        },
      }),
    });

    await ensureGroqResponse(response);
    const raw = extractMessageContent(await response.json());

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("GROQ_INVALID_JSON");
    }

    const validated = validateAnalysis(parsed);
    if (!validated) throw new Error("GROQ_SCHEMA_MISMATCH");
    return validated;
  }

  async analyzeImage(input: ImageAnalysisInput): Promise<ImageAnalysisOutput> {
    const apiKey = getApiKey();
    const visionModel = process.env.GROQ_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;

    // Primera capa: visión/OCR. Su único trabajo es transcribir lo que realmente se ve.
    // No toma decisiones sobre prioridad, riesgo ni acciones.
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        model: visionModel,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `Sos la capa de lectura visual de ¿QuéHago?. Tu tarea es OCR/transcripción, no asesoramiento.
Extraé únicamente texto realmente visible en la imagen. Conservá fechas, importes, teléfonos, URLs y nombres tal como aparecen.
No completes palabras ilegibles. No inventes contenido oculto. No expliques qué debería hacer el usuario.
Respondé SOLO un objeto JSON con esta forma exacta:
{"visible_text":"texto literal visible","notes":["observación objetiva opcional"]}
Si no hay texto legible, visible_text debe ser una cadena vacía.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: input.userContext?.trim()
                  ? `Transcribí esta imagen. Contexto dado por el usuario (no lo mezcles con la transcripción): ${input.userContext.trim()}`
                  : "Transcribí fielmente el texto visible de esta imagen.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${input.mimeType};base64,${input.base64}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    await ensureGroqResponse(response);
    const raw = extractMessageContent(await response.json());

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("GROQ_IMAGE_INVALID_JSON");
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("GROQ_IMAGE_INVALID_JSON");
    }

    const visibleText = (parsed as { visible_text?: unknown }).visible_text;
    if (typeof visibleText !== "string" || visibleText.trim().length < 2) {
      throw new Error("GROQ_IMAGE_NO_TEXT");
    }

    // Segunda capa: el analizador textual robusto ya existente, con JSON Schema estricto.
    const normalizedSource = [
      `Fuente: imagen subida (${input.fileName}).`,
      "Texto extraído visualmente (tratá esto como el contenido recibido; no inventes nada fuera de él):",
      visibleText.trim(),
      input.userContext?.trim() ? `Contexto adicional del usuario: ${input.userContext.trim()}` : "",
    ].filter(Boolean).join("\n\n");

    const analysis = await this.analyzeText(normalizedSource);
    return { analysis, extractedText: visibleText.trim() };
  }
}

export const groqProvider: AnalysisProvider = new GroqProvider();
