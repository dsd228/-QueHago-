import { ANALYSIS_JSON_SCHEMA, validateAnalysis, type AnalysisResult } from "./schema";
import { ANALYZER_SYSTEM_PROMPT } from "./system-prompt";
import type { AnalysisProvider } from "./provider";

const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");

async function resolveModel(): Promise<string> {
  const configured = process.env.OLLAMA_MODEL?.trim();
  if (configured) return configured;

  const response = await fetch(`${OLLAMA_URL}/api/tags`, { cache: "no-store" });
  if (!response.ok) throw new Error("OLLAMA_UNAVAILABLE");

  const payload = (await response.json()) as { models?: Array<{ name?: string }> };
  const model = payload.models?.find((item) => {
    const name = item.name?.toLowerCase() ?? "";
    return name && !name.includes("embed") && !name.includes("nomic") && !name.includes("bge");
  })?.name;
  if (!model) throw new Error("OLLAMA_NO_MODEL");
  return model;
}

function currentContext() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    localeDate: new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeZone: "America/Argentina/Cordoba" }).format(now),
    timezone: "America/Argentina/Cordoba",
  };
}

class OllamaProvider implements AnalysisProvider {
  async analyzeText(content: string): Promise<AnalysisResult> {
    const model = await resolveModel();
    const context = currentContext();

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        model,
        stream: false,
        format: ANALYSIS_JSON_SCHEMA,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: ANALYZER_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Fecha de referencia: ${context.localeDate} (${context.iso}). Zona horaria: ${context.timezone}.
Si una fecha del texto omite el año pero día y mes son inequívocos, podés normalizarla usando el año de referencia y agregá un warning indicando que el año fue inferido. No inventes ningún otro dato.

CONTENIDO A ANALIZAR:\n${content}\n\nDevolvé JSON válido conforme al schema.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OLLAMA_HTTP_${response.status}`);
    }

    const payload = (await response.json()) as { message?: { content?: string } };
    const raw = payload.message?.content;
    if (!raw) throw new Error("OLLAMA_EMPTY_RESPONSE");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("OLLAMA_INVALID_JSON");
    }

    const validated = validateAnalysis(parsed);
    if (!validated) throw new Error("OLLAMA_SCHEMA_MISMATCH");
    return validated;
  }
}

export const analysisProvider: AnalysisProvider = new OllamaProvider();
