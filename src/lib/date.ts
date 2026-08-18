const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDeadline(value: string, locale = "es-AR"): string {
  const dateOnly = DATE_ONLY_RE.exec(value);

  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const safeLocalDate = new Date(Number(year), Number(month) - 1, Number(day));
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(safeLocalDate);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Argentina/Cordoba",
  }).format(parsed);
}
