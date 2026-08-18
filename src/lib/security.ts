import type { AnalysisRecord } from "./types";
import { verifySourceTrust } from "./trusted-sources";

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

function sourceTrustText(item: AnalysisRecord): string {
  return [
    item.rawText ?? "",
    item.title,
    item.summary,
    ...item.facts.map((fact) => `${fact.label} ${fact.value}`),
    ...item.warnings,
  ].join(" ");
}

export function getSafePrimaryAction(item: AnalysisRecord): string {
  if (item.category !== "seguridad") return item.summary;

  const trust = verifySourceTrust(sourceTrustText(item));

  if (trust.status === "mismatch" && trust.source && trust.officialHost) {
    return `No abras el enlace recibido. No coincide con ${trust.source.name}. Si necesitás verificar la situación, entrá por ${trust.officialHost}.`;
  }

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
  const trust = verifySourceTrust(sourceTrustText(item));

  if (trust.status === "mismatch" && trust.source && trust.receivedHost && trust.officialHost) {
    signals.push({
      label: "Fuente no coincidente",
      value: `${trust.receivedHost} no coincide con los dominios registrados de ${trust.source.name}. Fuente oficial registrada: ${trust.officialHost}.`,
    });
  } else if (trust.status === "verified" && trust.source && trust.receivedHost) {
    signals.push({
      label: "Dominio coincidente",
      value: `${trust.receivedHost} coincide con un dominio registrado de ${trust.source.name}. Esto valida el dominio, no el contenido completo del mensaje.`,
    });
  } else if (trust.status === "recognized-no-url" && trust.source && trust.officialHost) {
    signals.push({
      label: "Entidad reconocida",
      value: `${trust.source.name} fue identificada. Si necesitás verificar la situación, usá la fuente oficial registrada: ${trust.officialHost}.`,
    });
  }

  if (/\b(inmediatamente|urgente|urgencia|ahora|bloqueamos|bloqueada|suspendida|último aviso)\b/i.test(searchable)) {
    signals.push({
      label: "Urgencia",
      value: "El mensaje presiona para actuar rápido, una señal que conviene verificar antes de responder.",
    });
  }

  const host = extractHost(original);
  if (host && trust.status !== "mismatch" && trust.status !== "verified") {
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
