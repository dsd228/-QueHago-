import type { AnalysisRecord } from "./types";

export type SecuritySignal = {
  label: string;
  value: string;
};

function extractHost(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  if (!match) return null;

  try {
    return new URL(match[0]).hostname;
  } catch {
    return match[0].replace(/^https?:\/\//i, "").split(/[/?#]/)[0] || null;
  }
}

export function getSafePrimaryAction(item: AnalysisRecord): string {
  if (item.category !== "seguridad") return item.summary;

  if (item.risk === "alto" || item.risk === "medio") {
    return "No abras el enlace ni compartas datos. Verificá la situación desde la app, web o teléfono oficial que ya conozcas.";
  }

  return "Verificá el mensaje por un canal oficial antes de seguir cualquier instrucción.";
}

export function getSecuritySignals(item: AnalysisRecord): SecuritySignal[] {
  if (item.category !== "seguridad") return [];

  const original = item.rawText ?? "";
  const searchable = [
    original,
    item.summary,
    ...item.warnings,
    ...item.facts.map((fact) => `${fact.label} ${fact.value}`),
  ].join(" ");

  const signals: SecuritySignal[] = [];

  if (/\b(inmediatamente|urgente|urgencia|ahora|bloqueamos|bloqueada|suspendida|último aviso)\b/i.test(searchable)) {
    signals.push({
      label: "Urgencia",
      value: "El mensaje presiona para actuar rápido, una señal que conviene verificar antes de responder.",
    });
  }

  const host = extractHost(original);
  if (host) {
    signals.push({
      label: "Enlace recibido",
      value: `${host} — no lo uses para verificar la situación; entrá por un canal oficial que ya conozcas.`,
    });
  }

  if (/\b(verific\w*|confirm\w*|actualiz\w*)\b.{0,60}\b(datos|cuenta|identidad|contraseña|clave|código|pin)\b/i.test(searchable) ||
      /\b(datos|contraseña|clave|código|pin)\b.{0,60}\b(verific\w*|confirm\w*|actualiz\w*)\b/i.test(searchable)) {
    signals.push({
      label: "Pedido sensible",
      value: "Solicita verificar o entregar información vinculada con tu cuenta o identidad.",
    });
  }

  if (/\b(banco|bancaria|cuenta bancaria|tarjeta|transferencia)\b/i.test(searchable)) {
    signals.push({
      label: "Contexto financiero",
      value: "El mensaje se presenta como relacionado con dinero o una cuenta; verificá siempre por un canal independiente.",
    });
  }

  if (!signals.length) {
    return item.facts.slice(0, 4);
  }

  return signals.slice(0, 4);
}
