import type { AnalysisProvider } from "./provider";
import { groqProvider } from "./groq";
import { analysisProvider as ollamaProvider } from "./ollama";

function resolveProvider(): AnalysisProvider {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();

  if (configured === "groq") return groqProvider;
  if (configured === "ollama") return ollamaProvider;

  // Comodidad para desarrollo: si hay una key de Groq, lo usa; si no, cae a Ollama.
  return process.env.GROQ_API_KEY?.trim() ? groqProvider : ollamaProvider;
}

export const analysisProvider: AnalysisProvider = resolveProvider();
export type { AnalysisResult } from "./schema";
