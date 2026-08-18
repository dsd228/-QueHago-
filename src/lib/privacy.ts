import type { AnalysisResult } from "./ai/schema";
import type { AnalysisFact } from "./ai/schema";

const sensitiveLabelPatterns = [
  /\bcuit\b/i,
  /\bcuil\b/i,
  /\bdni\b/i,
  /\bdocumento\b/i,
  /\bemail\b/i,
  /\bcorreo\b/i,
  /direcci[oó]n/i,
  /domicilio/i,
  /n[uú]mero de cliente/i,
  /nro\.?\s*de cliente/i,
  /n[uú]mero de servicio/i,
  /nro\.?\s*de servicio/i,
  /c[oó]digo de barras/i,
  /\bcbu\b/i,
  /\bcvu\b/i,
  /\biban\b/i,
  /tarjeta/i,
  /cuenta bancaria/i,
  /^cliente$/i,
  /^titular$/i,
  /^nombre( del)? cliente$/i,
  /n[uú]mero de factura/i,
  /n[°ºo]\s*de factura/i,
];

function isSensitiveLabel(label: string): boolean {
  return sensitiveLabelPatterns.some((pattern) => pattern.test(label.trim()));
}

function relevanceScore(label: string): number {
  const normalized = label.toLowerCase();
  if (/servicio|plan|especialidad|tr[aá]mite|concepto/.test(normalized)) return 100;
  if (/requis|documentaci[oó]n|presentar/.test(normalized)) return 95;
  if (/emisor|empresa|prestador/.test(normalized)) return 85;
  if (/per[ií]odo/.test(normalized)) return 75;
  if (/fecha|hora|turno/.test(normalized)) return 70;
  return 40;
}

export function getVisibleFacts(
  facts: AnalysisFact[],
  deadline: string | null,
  amount: number | null,
  limit = 3,
): AnalysisFact[] {
  return facts
    .filter((fact) => !isSensitiveLabel(fact.label))
    .filter((fact) => {
      const label = fact.label.toLowerCase();
      if (deadline && /venc|fecha l[ií]mite/.test(label)) return false;
      if (amount !== null && /total|importe|monto|saldo/.test(label)) return false;
      return true;
    })
    .sort((a, b) => relevanceScore(b.label) - relevanceScore(a.label))
    .slice(0, limit);
}

/**
 * Persist only what is useful for the next action.
 */
export function minimizeAnalysis(result: AnalysisResult): AnalysisResult {
  return {
    ...result,
    facts: getVisibleFacts(result.facts, result.deadline, result.amount, 3),
  };
}
