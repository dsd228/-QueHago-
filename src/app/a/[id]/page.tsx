import { notFound } from "next/navigation";
import {
  createCalendarEventAction,
  createChecklistAction,
  createReminderAction,
  markResolvedAction,
  toggleChecklistItemAction,
  undoCalendarEventAction,
} from "@/app/actions";
import {
  getAnalysisById,
  getChecklistByAnalysisId,
  getReminderByAnalysisId,
} from "@/lib/data";
import { formatDeadline } from "@/lib/date";
import { getCalendarDraft } from "@/lib/calendar";
import { getAvailableActions } from "@/lib/product-actions";
import { getVisibleFacts } from "@/lib/privacy";
import { getSafePrimaryAction, getSecuritySignals } from "@/lib/security";

export const dynamic = "force-dynamic";

const actionLabel: Record<string, string> = {
  reminder: "Recordatorio",
  calendar: "Calendario",
  checklist: "Checklist",
  draft: "Borrador",
  explain: "Explicación",
  none: "Sin acción",
};

const calendarErrorCopy: Record<string, string> = {
  created: "",
  undone: "",
  "already-undone": "Ese evento ya estaba eliminado.",
  error: "No pude crear el evento esta vez. No se duplicó nada. Probá nuevamente.",
  "undo-error": "No pude deshacer el evento. No cambié el estado local; comprobá Make y probá de nuevo.",
  "undo-unavailable": "Para deshacer de verdad falta conectar el webhook de eliminación de Make.",
  example: "Los ejemplos no ejecutan automatizaciones reales. Hacé un análisis nuevo para probarlo.",
  unavailable: "Este análisis no tiene una fecha válida para calendario.",
};

const reminderCopy: Record<string, string> = {
  created: "Listo. Guardé el recordatorio en ¿QuéHago?.",
  already: "Ese recordatorio ya estaba creado. No generé un duplicado.",
  error: "No pude guardar el recordatorio esta vez. Probá nuevamente.",
  example: "Los ejemplos no crean recordatorios reales. Hacé un análisis nuevo para probarlo.",
  unavailable: "Este análisis no tiene una fecha válida para recordatorio.",
};

const checklistCopy: Record<string, string> = {
  created: "Listo. Armé un checklist seguro para este caso.",
  already: "Ese checklist ya estaba creado. No generé pasos duplicados.",
  error: "No pude crear el checklist esta vez. Probá nuevamente.",
  example: "Los ejemplos no crean checklists persistentes. Hacé un análisis nuevo para probarlo.",
  unavailable: "Este análisis no necesita un checklist ejecutable.",
};

export default async function AnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    calendar?: string;
    reminder?: string;
    checklist?: string;
    status?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const item = getAnalysisById(id);
  if (!item) notFound();

  const availableActions = getAvailableActions(item);
  const primaryAction = getSafePrimaryAction(item);
  const securitySignals = getSecuritySignals(item);
  const visibleFacts = getVisibleFacts(item.facts, item.deadline, item.amount, 3);
  const activeCalendarEvent = Boolean(item.calendarEventId && item.calendarEventUrl && !item.calendarDeletedAt);
  const calendarDraft = item.deadline ? getCalendarDraft(item) : null;
  const canUndoCalendar = activeCalendarEvent && Boolean(process.env.MAKE_CALENDAR_DELETE_WEBHOOK_URL?.trim());
  const reminder = getReminderByAnalysisId(item.id);
  const checklist = getChecklistByAnalysisId(item.id);
  const completedChecklist = checklist.filter((entry) => entry.completed).length;
  const checklistComplete = checklist.length > 0 && completedChecklist === checklist.length;
  const activity = [
    { label: item.sourceKind === "image" ? "Captura analizada" : "Contenido analizado", time: item.createdAt },
    reminder ? { label: "Recordatorio creado", time: reminder.createdAt } : null,
    checklist.length ? { label: `Checklist creado · ${completedChecklist}/${checklist.length} completo`, time: checklist[0].createdAt } : null,
    item.calendarSyncedAt ? { label: "Evento creado en Google Calendar", time: item.calendarSyncedAt } : null,
    item.calendarDeletedAt ? { label: "Evento eliminado de Google Calendar", time: item.calendarDeletedAt } : null,
  ].filter((entry): entry is { label: string; time: string } => Boolean(entry));

  const calendarAction = createCalendarEventAction.bind(null, item.id);
  const undoCalendarAction = undoCalendarEventAction.bind(null, item.id);
  const reminderAction = createReminderAction.bind(null, item.id);
  const checklistAction = createChecklistAction.bind(null, item.id);
  const resolvedAction = markResolvedAction.bind(null, item.id);

  const calendarMessage = query.calendar ? calendarErrorCopy[query.calendar] : null;
  const reminderMessage = query.reminder ? reminderCopy[query.reminder] : null;
  const checklistMessage = query.checklist ? checklistCopy[query.checklist] : null;

  return (
    <article className="result-page">
      <div className="result-header">
        <div>
          <p className="eyebrow">{item.category}</p>
          <h1>{item.title}</h1>
        </div>
        <div className="result-badges">
          {item.status === "resuelto" ? <span className="status-badge">Resuelto</span> : null}
          {item.isExample ? (
            <span className="example-badge">Ejemplo</span>
          ) : item.sourceKind === "image" ? (
            <span className="real-badge">Captura analizada con IA</span>
          ) : (
            <span className="real-badge">Análisis con IA</span>
          )}
        </div>
      </div>

      <section className="action-summary" aria-labelledby="action-title">
        <p className="eyebrow">Qué tenés que hacer</p>
        <h2 id="action-title">{primaryAction}</h2>
      </section>

      {item.category === "seguridad" && ["medio", "alto"].includes(item.risk) ? (
        <section className={`security-hero security-${item.risk}`} aria-labelledby="security-title">
          <div className="security-shield" aria-hidden="true">!</div>
          <div>
            <p className="eyebrow">Antes de hacer nada</p>
            <h2 id="security-title">No verifiques desde el propio mensaje.</h2>
            <p>
              Si necesitás comprobarlo, entrá por una app, sitio o teléfono oficial que ya conozcas.
              ¿QuéHago? te muestra señales de riesgo, pero no declara fraude como certeza.
            </p>
          </div>
        </section>
      ) : null}

      {activeCalendarEvent ? (
        <section className="action-receipt" aria-live="polite">
          <div className="receipt-heading">
            <div>
              <p className="eyebrow">Acción verificada</p>
              <h2>Evento creado en Google Calendar</h2>
              <p>¿QuéHago? recibió la confirmación de Make y guardó el identificador del evento.</p>
            </div>
            <span className="verified-chip">Verificado</span>
          </div>

          <dl className="receipt-grid">
            <div>
              <dt>Qué</dt>
              <dd>{item.calendarTitle ?? item.title}</dd>
            </div>
            <div>
              <dt>Cuándo</dt>
              <dd>{item.calendarStart ? formatDeadline(item.calendarStart) : item.deadline ? formatDeadline(item.deadline) : "—"}</dd>
            </div>
            <div>
              <dt>Vía</dt>
              <dd>Google Calendar · Make</dd>
            </div>
            <div>
              <dt>Ejecutado</dt>
              <dd>{item.calendarSyncedAt ? formatDeadline(item.calendarSyncedAt) : "Ahora"}</dd>
            </div>
          </dl>

          <div className="receipt-actions">
            <a className="button button-primary" href={item.calendarEventUrl!} target="_blank" rel="noreferrer">
              Abrir en Google Calendar
            </a>
            {canUndoCalendar ? (
              <form action={undoCalendarAction}>
                <button className="button button-danger-ghost" type="submit">Deshacer</button>
              </form>
            ) : null}
          </div>
        </section>
      ) : item.calendarDeletedAt ? (
        <section className="action-undone" aria-live="polite">
          <div>
            <p className="eyebrow">Acción deshecha</p>
            <h2>El evento ya no está en Google Calendar</h2>
            <p>Se eliminó el {formatDeadline(item.calendarDeletedAt)}. Podés volver a crearlo si lo necesitás.</p>
          </div>
        </section>
      ) : null}

      {reminder ? (
        <section className="automation-success" aria-live="polite">
          <div>
            <p className="eyebrow">Recordatorio activo</p>
            <h2>No hace falta que lo recuerdes solo</h2>
            <p>{reminder.title} · {formatDeadline(reminder.dueAt)}</p>
          </div>
          <a className="button button-secondary" href="/hoy">Ver en Hoy</a>
        </section>
      ) : null}

      {calendarMessage ? <p className="automation-error" role="alert">{calendarMessage}</p> : null}
      {reminderMessage ? <p className="automation-note" role="status">{reminderMessage}</p> : null}
      {checklistMessage ? <p className="automation-note" role="status">{checklistMessage}</p> : null}

      <dl className="fact-grid">
        {item.deadline ? (
          <div>
            <dt>Fecha</dt>
            <dd>{formatDeadline(item.deadline)}</dd>
          </div>
        ) : null}
        {item.amount !== null ? (
          <div>
            <dt>Importe</dt>
            <dd>{new Intl.NumberFormat("es-AR", { style: "currency", currency: item.currency ?? "ARS" }).format(item.amount)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Prioridad</dt>
          <dd className={`priority priority-${item.priority}`}>{item.priority}</dd>
        </div>
        <div>
          <dt>Riesgo</dt>
          <dd className={`risk-value risk-${item.risk}`}>{item.risk}</dd>
        </div>
      </dl>

      {item.sourceKind === "image" ? (
        <section className="privacy-note" aria-label="Privacidad de la captura">
          <div>
            <p className="eyebrow">Privacidad por defecto</p>
            <strong>La imagen original no quedó guardada.</strong>
          </div>
          <p>Después del análisis conservamos solamente los datos mínimos necesarios para la acción.</p>
        </section>
      ) : null}

      {(item.category === "seguridad" ? securitySignals.length : visibleFacts.length) ? (
        <section className="detail-panel" aria-labelledby="facts-title">
          <p className="eyebrow">{item.category === "seguridad" ? "Señales observadas" : "Qué importa"}</p>
          <h2 id="facts-title">
            {item.category === "seguridad"
              ? "Por qué conviene verificar antes de actuar"
              : "Solo lo que necesitás para resolverlo"}
          </h2>
          <dl className="facts-list">
            {(item.category === "seguridad" ? securitySignals : visibleFacts).map((fact, index) => (
              <div key={`${fact.label}-${index}`}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {availableActions.length ? (
        <section className="detail-panel" aria-labelledby="actions-title">
          <p className="eyebrow">Acciones disponibles</p>
          <h2 id="actions-title">Qué podés hacer desde acá</h2>
          <p className="action-rule-note">Solo mostramos acciones que podemos ejecutar con los datos confirmados.</p>

          <div className="action-list">
            {availableActions.map((action, index) => (
              <div className="suggested-action" key={`${action.type}-${index}`}>
                <div>
                  <span className="action-kind">{actionLabel[action.type] ?? action.type}</span>
                  <h3>{action.label}</h3>
                  <p>{action.reason}</p>
                </div>

                {action.type === "calendar" ? (
                  activeCalendarEvent ? (
                    <a className="button button-secondary" href={item.calendarEventUrl!} target="_blank" rel="noreferrer">
                      Ver evento
                    </a>
                  ) : item.isExample ? (
                    <button className="button button-secondary" type="button" disabled>Requiere análisis real</button>
                  ) : calendarDraft ? (
                    <details className="action-confirm">
                      <summary className="button button-primary">Agregar a mi calendario</summary>
                      <div className="action-confirm-card action-confirm-wide">
                        <div className="confirm-heading">
                          <div>
                            <strong>Revisá antes de ejecutar</strong>
                            <p>La IA propone. Vos confirmás o corregís los datos antes de enviarlos a Make.</p>
                          </div>
                          <span className={item.confidence < 0.8 ? "review-chip review-needed" : "review-chip"}>
                            {item.confidence < 0.8 ? "Revisar" : "Listo para confirmar"}
                          </span>
                        </div>

                        <form action={calendarAction} className="confirmation-form">
                          <label>
                            <span>Nombre del evento</span>
                            <input
                              type="text"
                              name="calendarTitle"
                              defaultValue={calendarDraft.title}
                              maxLength={120}
                              required
                            />
                          </label>

                          <label>
                            <span>{calendarDraft.allDay ? "Fecha" : "Fecha y hora"}</span>
                            <input
                              type={calendarDraft.allDay ? "date" : "datetime-local"}
                              name="calendarStart"
                              defaultValue={calendarDraft.startInput}
                              required
                            />
                          </label>

                          <input type="hidden" name="calendarMode" value={calendarDraft.allDay ? "all-day" : "timed"} />

                          {!calendarDraft.allDay ? (
                            <label>
                              <span>Duración</span>
                              <select name="calendarDuration" defaultValue={calendarDraft.durationMinutes}>
                                <option value="15">15 minutos</option>
                                <option value="30">30 minutos</option>
                                <option value="45">45 minutos</option>
                                <option value="60">1 hora</option>
                                <option value="90">1 h 30 min</option>
                                <option value="120">2 horas</option>
                              </select>
                            </label>
                          ) : (
                            <input type="hidden" name="calendarDuration" value="30" />
                          )}

                          {calendarDraft.amount !== null ? (
                            <label>
                              <span>Importe confirmado</span>
                              <input
                                type="number"
                                name="calendarAmount"
                                min="0"
                                step="0.01"
                                defaultValue={calendarDraft.amount}
                              />
                            </label>
                          ) : null}

                          <p className="privacy-inline">
                            Make recibe sólo estos datos confirmados. No enviamos la captura ni el texto original completo.
                          </p>

                          <button className="button button-primary" type="submit">Confirmar y crear</button>
                        </form>
                      </div>
                    </details>
                  ) : (
                    <button className="button button-secondary" type="button" disabled>Fecha insuficiente</button>
                  )
                ) : action.type === "reminder" ? (
                  reminder ? (
                    <a className="button button-secondary" href="/hoy">Ya está activo</a>
                  ) : item.isExample ? (
                    <button className="button button-secondary" type="button" disabled>Requiere análisis real</button>
                  ) : (
                    <form action={reminderAction}>
                      <button className="button button-primary" type="submit">Recordármelo</button>
                    </form>
                  )
                ) : action.type === "checklist" ? (
                  checklist.length ? (
                    <a className="button button-secondary" href="#checklist">Ver checklist</a>
                  ) : item.isExample ? (
                    <button className="button button-secondary" type="button" disabled>Requiere análisis real</button>
                  ) : (
                    <form action={checklistAction}>
                      <button className="button button-primary" type="submit">Crear checklist</button>
                    </form>
                  )
                ) : action.type === "explain" ? (
                  <details className="risk-explain">
                    <summary className="button button-secondary">Ver señales</summary>
                    <div className="risk-explain-card">
                      <strong>Lo que observó ¿QuéHago?</strong>
                      {securitySignals.length ? (
                        <ul>
                          {securitySignals.map((fact, factIndex) => (
                            <li key={`${fact.label}-explain-${factIndex}`}>
                              <b>{fact.label}:</b> {fact.value}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No hay suficientes señales concretas para detallar.</p>
                      )}
                      <small>Esto es una evaluación de riesgo, no una confirmación de fraude.</small>
                    </div>
                  </details>
                ) : (
                  <button className="button button-secondary" type="button" disabled title="Se habilitará cuando la acción tenga ejecución real">
                    Próxima acción
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {checklist.length ? (
        <section className="checklist-panel" id="checklist" aria-labelledby="checklist-title">
          <div className="checklist-header">
            <div>
              <p className="eyebrow">Plan de acción</p>
              <h2 id="checklist-title">
                {item.category === "seguridad" ? "Checklist de seguridad" : "Checklist para resolverlo"}
              </h2>
            </div>
            <span className="checklist-progress" aria-label={`${completedChecklist} de ${checklist.length} pasos completados`}>
              {completedChecklist}/{checklist.length}
            </span>
          </div>

          <div className="checklist-track" aria-hidden="true">
            <span style={{ width: `${(completedChecklist / checklist.length) * 100}%` }} />
          </div>

          <ul className="checklist-list">
            {checklist.map((entry) => {
              const toggleAction = toggleChecklistItemAction.bind(null, item.id, entry.id);
              return (
                <li key={entry.id} className={entry.completed ? "is-complete" : ""}>
                  <form action={toggleAction}>
                    <button
                      className="checklist-toggle"
                      type="submit"
                      aria-label={entry.completed ? `Marcar pendiente: ${entry.label}` : `Completar: ${entry.label}`}
                    >
                      <span className="checklist-box" aria-hidden="true">{entry.completed ? "✓" : ""}</span>
                      <span>{entry.label}</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>

          {checklistComplete ? (
            <p className="checklist-complete" role="status">
              Checklist completo. Si ya terminaste con el caso, podés marcarlo como resuelto.
            </p>
          ) : null}
        </section>
      ) : null}

      {activity.length > 1 ? (
        <section className="case-history" aria-labelledby="case-history-title">
          <p className="eyebrow">Trazabilidad</p>
          <h2 id="case-history-title">Qué pasó con este caso</h2>
          <ol>
            {activity.map((entry, index) => (
              <li key={`${entry.label}-${entry.time}-${index}`}>
                <span className="history-dot" aria-hidden="true" />
                <div>
                  <strong>{entry.label}</strong>
                  <time dateTime={entry.time}>{formatDeadline(entry.time)}</time>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {item.status === "pendiente" && !item.isExample ? (
        <section className="resolve-panel">
          <div>
            <p className="eyebrow">Cerrar el ciclo</p>
            <h2>¿Ya lo resolviste?</h2>
            <p>Al marcarlo como resuelto deja de aparecer en Hoy y cualquier recordatorio local asociado se completa.</p>
          </div>
          <form action={resolvedAction}>
            <button className="button button-secondary" type="submit">Marcar como resuelto</button>
          </form>
        </section>
      ) : null}

      {item.warnings.length && item.category !== "seguridad" ? (
        <section className="warning-panel" aria-labelledby="warnings-title">
          <p className="eyebrow">Ojo con esto</p>
          <h2 id="warnings-title">Incertidumbres y límites</h2>
          <ul>{item.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </section>
      ) : null}

      {item.missingInformation.length ? (
        <details className="source-details">
          <summary>Información que falta</summary>
          <ul>{item.missingInformation.map((missing, index) => <li key={index}>{missing}</li>)}</ul>
        </details>
      ) : null}

      {item.rawText ? (
        <details className="source-details">
          <summary>{item.sourceKind === "image" ? "Ver texto extraído de la captura" : "Ver contenido original"}</summary>
          <p>{item.rawText}</p>
        </details>
      ) : null}
    </article>
  );
}
