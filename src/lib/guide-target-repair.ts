import type { GuideElement, GuidePlan } from "./guide-analyzer";

function normalize(value = ""): string {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function elementText(element: GuideElement): string {
  return normalize([
    element.label,
    element.text,
    element.placeholder,
  ].filter(Boolean).join(" "));
}

function contextTokens(element: GuideElement): Set<string> {
  return new Set(
    normalize(element.context || "")
      .split(" ")
      .filter((token) => token.length >= 5),
  );
}

function actionCompatible(action: string, element: GuideElement): boolean {
  const tag = normalize(element.tag);
  const role = normalize(element.role);
  if (action === "select") return tag === "select" || role === "combobox";
  if (action === "type") return tag === "input" || tag === "textarea";
  if (action === "click") return tag === "button" || tag === "a" || role === "button" || role === "link";
  return true;
}

function textSimilarity(wanted: string, candidate: string): number {
  if (!wanted || !candidate) return 0;
  if (wanted === candidate) return 1;
  if (candidate.includes(wanted) || wanted.includes(candidate)) return 0.96;
  const aa = new Set(wanted.split(" ").filter(Boolean));
  const bb = new Set(candidate.split(" ").filter(Boolean));
  let common = 0;
  for (const word of aa) if (bb.has(word)) common += 1;
  return common / Math.max(aa.size, 1);
}

function sharedContextScore(a: GuideElement | null, b: GuideElement): number {
  if (!a) return 0;
  const aa = contextTokens(a);
  const bb = contextTokens(b);
  let common = 0;
  for (const token of aa) if (bb.has(token)) common += 1;
  return Math.min(common, 8) * 0.7;
}

export function repairAmbiguousGuideTargets(plan: GuidePlan, elements: GuideElement[]): GuidePlan {
  if (!Array.isArray(plan.steps) || plan.steps.length < 2) return plan;

  const repaired = plan.steps.map((step) => ({ ...step }));
  let previousElement: GuideElement | null = null;
  let previousIndex = -1;

  for (let stepIndex = 0; stepIndex < repaired.length; stepIndex += 1) {
    const step = repaired[stepIndex];
    const currentIndex = elements.findIndex((element) => element.id === step.target_id);
    const currentElement = currentIndex >= 0 ? elements[currentIndex] : null;

    if (stepIndex === 0) {
      previousElement = currentElement;
      previousIndex = currentIndex;
      continue;
    }

    const wanted = normalize(step.target_text || step.instruction);
    const candidates = elements
      .map((element, index) => ({
        element,
        index,
        similarity: textSimilarity(wanted, elementText(element)),
      }))
      .filter(({ element, similarity }) => !element.disabled && actionCompatible(step.action, element) && similarity >= 0.82);

    if (candidates.length > 1 && previousIndex >= 0) {
      const ranked = candidates
        .map((candidate) => {
          const forward = candidate.index >= previousIndex ? 5 : -4;
          const distance = Math.abs(candidate.index - previousIndex);
          const proximity = Math.max(0, 4 - distance * 0.18);
          const sameContext = sharedContextScore(previousElement, candidate.element);
          const original = candidate.element.id === step.target_id ? 0.5 : 0;
          return {
            ...candidate,
            score: candidate.similarity * 8 + forward + proximity + sameContext + original,
          };
        })
        .sort((a, b) => b.score - a.score || a.index - b.index);

      const best = ranked[0];
      if (best && best.element.id !== step.target_id) {
        step.target_id = best.element.id;
      }
    }

    const resolvedIndex = elements.findIndex((element) => element.id === step.target_id);
    previousIndex = resolvedIndex;
    previousElement = resolvedIndex >= 0 ? elements[resolvedIndex] : currentElement;
  }

  return { ...plan, steps: repaired };
}
