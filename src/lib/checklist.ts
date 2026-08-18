import type { AnalysisRecord } from "./types";

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function buildChecklistLabels(item: AnalysisRecord): string[] {
  if (item.category === "seguridad") {
    return [
      "No abrir enlaces ni descargar archivos desde ese mensaje.",
      "Verificar la situación entrando desde la app o sitio oficial que ya usás, sin usar enlaces del mensaje.",
      "No compartir contraseñas, códigos de verificación, PIN ni datos bancarios.",
      "Si ya ingresaste datos o códigos, cambiar la contraseña afectada y contactar a la entidad por un canal oficial.",
    ];
  }

  if (item.category === "tramite") {
    const documentFacts = item.facts
      .filter((fact) => /documentaci[oó]n|requis|presentar/i.test(fact.label))
      .map((fact) => `Preparar: ${fact.value}.`);

    return unique([
      ...documentFacts,
      ...(item.deadline ? ["Resolver el trámite antes de la fecha límite."] : []),
      "Guardar el comprobante o número de gestión cuando termines.",
    ]);
  }

  return [
    "Revisar los datos importantes detectados.",
    "Completar la acción principal.",
    "Guardar un comprobante si la gestión lo genera.",
  ];
}
