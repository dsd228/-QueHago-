import Link from "next/link";
import {
  getChecklistByAnalysisId,
  getReminderByAnalysisId,
  listPendingAnalyses,
  listResolvedAnalyses,
} from "@/lib/data";
import { formatDeadline } from "@/lib/date";
import { getSafePrimaryAction } from "@/lib/security";
import type { AnalysisRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type Bucket = "attention" | "today" | "upcoming";

type DashboardItem = {
  item: AnalysisRecord;
  bucket: Bucket;
  reminderActive: boolean;
  calendarActive: boolean;
  checklistCompleted: number;
  checklistTotal: number;
  similarCount: number;
};

function argentinaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function deadlineDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const mapped = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${mapped.year}-${mapped.month}-${mapped.day}`;
}

function dashboardBucket(item: AnalysisRecord, today: string): Bucket | null {
  if (item.deadline) {
    const date = deadlineDate(item.deadline);
    if (date && date < today) return "attention";
    if (date === today) return "today";
    if (date && date > today) return "upcoming";
  }

  if (item.priority === "alta" || (item.category === "seguridad" && ["medio", "alto"].includes(item.risk))) {
    return "attention";
  }

  return null;
}

function dashboardItem(item: AnalysisRecord, today: string): DashboardItem | null {
  const bucket = dashboardBucket(item, today);
  if (!bucket) return null;

  const reminder = getReminderByAnalysisId(item.id);
  const checklist = getChecklistByAnalysisId(item.id);

  return {
    item,
    bucket,
    reminderActive: reminder?.status === "pendiente",
    calendarActive: Boolean(item.calendarEventId && !item.calendarDeletedAt),
    checklistCompleted: checklist.filter((entry) => entry.completed).length,
    checklistTotal: checklist.length,
    similarCount: 1,
  };
}

function sortItems(a: DashboardItem, b: DashboardItem): number {
  const priority = { alta: 0, media: 1, baja: 2 } as const;
  const aDate = a.item.deadline ? deadlineDate(a.item.deadline) ?? "9999-12-31" : "9999-12-31";
  const bDate = b.item.deadline ? deadlineDate(b.item.deadline) ?? "9999-12-31" : "9999-12-31";
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  return priority[a.item.priority] - priority[b.item.priority];
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function dashboardFingerprint(entry: DashboardItem): string {
  const item = entry.item;
  return [
    item.category,
    item.deadline ?? "",
    item.amount ?? "",
    item.currency ?? "",
    normalized(getSafePrimaryAction(item)),
  ].join("|");
}

function groupSimilar(entries: DashboardItem[]): DashboardItem[] {
  const grouped = new Map<string, DashboardItem>();

  for (const entry of entries) {
    const key = dashboardFingerprint(entry);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...entry, similarCount: 1 });
      continue;
    }

    existing.similarCount += 1;
    if (new Date(entry.item.createdAt).getTime() > new Date(existing.item.createdAt).getTime()) {
      grouped.set(key, { ...entry, similarCount: existing.similarCount });
    }
  }

  return [...grouped.values()];
}

function DashboardCard({ entry }: { entry: DashboardItem }) {
  const { item } = entry;
  const safeSummary = getSafePrimaryAction(item);

  return (
    <Link className="dashboard-card" href={`/a/${item.id}`}>
      <div className="dashboard-card-main">
        <div className="dashboard-topline">
          <span className={`attention-chip dashboard-${entry.bucket}`}>
            {entry.bucket === "attention" ? "Necesita atención" : entry.bucket === "today" ? "Hoy" : "Próximamente"}
          </span>
          <span className="dashboard-category">{item.category}</span>
          {entry.similarCount > 1 ? <span className="similar-chip">{entry.similarCount} similares agrupados</span> : null}
        </div>
        <h3>{item.title}</h3>
        <p>{safeSummary}</p>
      </div>

      <div className="dashboard-card-side">
        <strong>{item.deadline ? formatDeadline(item.deadline) : "Sin fecha"}</strong>
        <div className="execution-chips" aria-label="Acciones del caso">
          {entry.calendarActive ? <span>Calendar ✓</span> : null}
          {entry.reminderActive ? <span>Recordatorio ✓</span> : null}
          {entry.checklistTotal ? <span>Checklist {entry.checklistCompleted}/{entry.checklistTotal}</span> : null}
          {!entry.calendarActive && !entry.reminderActive && !entry.checklistTotal ? <span>Sin acciones todavía</span> : null}
        </div>
      </div>
    </Link>
  );
}

function DashboardSection({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: DashboardItem[];
}) {
  if (!items.length) return null;

  return (
    <section className="dashboard-section">
      <div className="dashboard-section-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span>{items.length}</span>
      </div>
      <div className="dashboard-list">
        {items.map((entry) => <DashboardCard entry={entry} key={entry.item.id} />)}
      </div>
    </section>
  );
}

export default function TodayPage() {
  const today = argentinaToday();
  const pending = groupSimilar(
    listPendingAnalyses()
      .filter((item) => !item.isExample)
      .map((item) => dashboardItem(item, today))
      .filter((entry): entry is DashboardItem => Boolean(entry)),
  );

  const attention = pending.filter((entry) => entry.bucket === "attention").sort(sortItems);
  const todayItems = pending.filter((entry) => entry.bucket === "today").sort(sortItems);
  const upcoming = pending.filter((entry) => entry.bucket === "upcoming").sort(sortItems);
  const resolved = listResolvedAnalyses(4);
  const totalActive = attention.length + todayItems.length + upcoming.length;

  return (
    <section className="today-page dashboard-page">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Centro de control</p>
          <h1>Lo importante, sin volver a buscarlo.</h1>
          <p>Fechas, riesgos y acciones ejecutadas en un solo lugar. El orden lo decide código, no la IA.</p>
        </div>
        <div className="dashboard-stats" aria-label="Resumen de pendientes">
          <div><strong>{attention.length}</strong><span>atención</span></div>
          <div><strong>{todayItems.length}</strong><span>hoy</span></div>
          <div><strong>{upcoming.length}</strong><span>próximos</span></div>
        </div>
      </div>

      {totalActive ? (
        <>
          <DashboardSection
            title="Necesita atención"
            description="Vencidos, riesgos importantes o tareas de prioridad alta."
            items={attention}
          />
          <DashboardSection
            title="Hoy"
            description="Lo que tiene fecha para hoy."
            items={todayItems}
          />
          <DashboardSection
            title="Próximamente"
            description="Ordenado por la fecha más cercana."
            items={upcoming}
          />
        </>
      ) : (
        <div className="empty-state dashboard-empty">
          <p className="eyebrow">Todo al día</p>
          <h2>No hay nada que necesite tu atención ahora.</h2>
          <p>Cuando ¿QuéHago? detecte una fecha, una prioridad alta o un riesgo, va a aparecer acá.</p>
          <Link className="button button-primary" href="/">Resolver algo</Link>
        </div>
      )}

      {resolved.length ? (
        <section className="resolved-section">
          <div className="dashboard-section-heading">
            <div>
              <h2>Resuelto</h2>
              <p>Los últimos casos que ya cerraste.</p>
            </div>
          </div>
          <div className="resolved-grid">
            {resolved.map((item) => (
              <Link href={`/a/${item.id}`} className="resolved-card" key={item.id}>
                <span>Resuelto</span>
                <strong>{item.title}</strong>
                <small>{item.category}</small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
