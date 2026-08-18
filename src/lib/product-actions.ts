import type { AnalysisAction } from "@/lib/ai/schema";
import type { AnalysisRecord } from "./types";

function uniqueByType(actions: AnalysisAction[]): AnalysisAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.type)) return false;
    seen.add(action.type);
    return true;
  });
}

export function getAvailableActions(item: AnalysisRecord): AnalysisAction[] {
  const deterministic: AnalysisAction[] = [];

  if (item.category === "seguridad") {
    deterministic.push(
      {
        type: "explain",
        label: "Ver por qué parece sospechoso",
        reason: "La app puede mostrarte las señales observables que detectó sin afirmar fraude como certeza.",
      },
      {
        type: "checklist",
        label: "Crear checklist de seguridad",
        reason: "Podés seguir un protocolo seguro paso a paso antes de hacer cualquier cosa con el mensaje.",
      },
    );
  }

  if (item.deadline) {
    deterministic.push(
      {
        type: "reminder",
        label: "Recordármelo",
        reason: "Hay una fecha concreta que conviene no perder de vista.",
      },
      {
        type: "calendar",
        label: "Agregar a mi calendario",
        reason: "La fecha ya fue extraída y validada por la aplicación.",
      },
    );
  }

  if (
    item.category === "tramite" &&
    item.facts.some((fact) => /documentaci[oó]n|requis|presentar/i.test(fact.label))
  ) {
    deterministic.push({
      type: "checklist",
      label: "Crear checklist",
      reason: "El contenido incluye pasos o documentación que conviene preparar.",
    });
  }

  const aiOnly = item.actions.filter(
    (action) => !["none", "reminder", "calendar", "checklist", "explain"].includes(action.type),
  );

  return uniqueByType([...deterministic, ...aiOnly]);
}

export function canCreateCalendarEvent(item: AnalysisRecord): boolean {
  return Boolean(item.deadline);
}

export function canCreateReminder(item: AnalysisRecord): boolean {
  return Boolean(item.deadline);
}

export function canCreateChecklist(item: AnalysisRecord): boolean {
  return (
    item.category === "seguridad" ||
    item.category === "tramite" ||
    item.actions.some((action) => action.type === "checklist")
  );
}
