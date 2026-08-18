import assert from "node:assert/strict";
import { repairAmbiguousGuideTargets } from "../src/lib/guide-target-repair.ts";
import type { GuideElement, GuidePlan } from "../src/lib/guide-analyzer.ts";

const elements: GuideElement[] = [
  {
    id: "qh-1",
    tag: "button",
    text: "Buscar horarios",
    context: "Ejemplos rápidos Dermatología Buscar horarios Mostrarme qué tocar",
  },
  {
    id: "qh-4",
    tag: "select",
    label: "Especialidad",
    text: "Seleccionar Dermatología Clínica médica",
    context: "Solicitar turno Especialidad Profesional Sede Fecha Buscar horarios",
  },
  {
    id: "qh-5",
    tag: "select",
    label: "Profesional",
    context: "Solicitar turno Especialidad Profesional Sede Fecha Buscar horarios",
  },
  {
    id: "qh-7",
    tag: "button",
    text: "Buscar horarios",
    context: "Solicitar turno Especialidad Profesional Sede Fecha Buscar horarios",
  },
];

const wrongPlan: GuidePlan = {
  goal: "Sacar un turno con dermatología",
  summary: "Recorrido",
  confidence: 0.9,
  warnings: [],
  mode: "ai",
  steps: [
    {
      instruction: "Elegí Dermatología",
      target_id: "qh-4",
      target_text: "Especialidad",
      action: "select",
      why: "Define la especialidad",
    },
    {
      instruction: "Hacé clic en Buscar horarios",
      target_id: "qh-1",
      target_text: "Buscar horarios",
      action: "click",
      why: "Busca disponibilidad",
    },
  ],
};

const repaired = repairAmbiguousGuideTargets(wrongPlan, elements);
assert.equal(repaired.steps[0].target_id, "qh-4");
assert.equal(repaired.steps[1].target_id, "qh-7", "Debe preferir el control duplicado que continúa el flujo del formulario");

const uniquePlan: GuidePlan = {
  ...wrongPlan,
  steps: [
    {
      instruction: "Elegí un profesional",
      target_id: "qh-5",
      target_text: "Profesional",
      action: "select",
      why: "Define el profesional",
    },
  ],
};

assert.equal(repairAmbiguousGuideTargets(uniquePlan, elements).steps[0].target_id, "qh-5");
console.log("Verified guide target repair OK");
