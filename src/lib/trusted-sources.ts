export type TrustedSourceId = "anses" | "arca" | "mi-argentina" | "bna";

export type TrustedSource = {
  id: TrustedSourceId;
  name: string;
  officialUrl: string;
  trustedDomains: string[];
  allowSubdomains: boolean;
  aliases: string[];
};

export type SourceTrustStatus = "verified" | "mismatch" | "recognized-no-url" | "unknown";

export type SourceTrustResult = {
  status: SourceTrustStatus;
  source: TrustedSource | null;
  receivedHost: string | null;
  officialHost: string | null;
};

// Registry deliberadamente chico para el MVP CoderCup.
// Los dominios se mantienen en código y no pueden ser inventados por el modelo.
export const TRUSTED_SOURCES: readonly TrustedSource[] = [
  {
    id: "anses",
    name: "ANSES",
    officialUrl: "https://www.anses.gob.ar/",
    trustedDomains: ["anses.gob.ar"],
    allowSubdomains: true,
    aliases: ["anses", "administracion nacional de la seguridad social"],
  },
  {
    id: "arca",
    name: "ARCA",
    officialUrl: "https://www.arca.gob.ar/",
    trustedDomains: ["arca.gob.ar"],
    allowSubdomains: true,
    aliases: ["arca", "agencia de recaudacion y control aduanero"],
  },
  {
    id: "mi-argentina",
    name: "Mi Argentina",
    officialUrl: "https://www.argentina.gob.ar/miargentina",
    trustedDomains: ["argentina.gob.ar"],
    allowSubdomains: true,
    aliases: ["mi argentina"],
  },
  {
    id: "bna",
    name: "Banco Nación",
    officialUrl: "https://www.bna.com.ar/",
    trustedDomains: ["bna.com.ar"],
    allowSubdomains: true,
    aliases: ["banco nacion", "banco nación", "banco de la nacion argentina", "banco de la nación argentina", "bna"],
  },
] as const;

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHost(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

export function identifyTrustedSource(text: string): TrustedSource | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  let best: { source: TrustedSource; score: number } | null = null;

  for (const source of TRUSTED_SOURCES) {
    let score = 0;
    for (const alias of source.aliases) {
      const normalizedAlias = normalizeText(alias);
      if (!normalizedAlias) continue;
      if (normalized.includes(normalizedAlias)) score = Math.max(score, normalizedAlias.length);
    }

    if (score > 0 && (!best || score > best.score)) best = { source, score };
  }

  return best?.source ?? null;
}

export function extractReceivedHost(text: string): string | null {
  const source = String(text || "");
  const urlMatch = source.match(/https?:\/\/[^\s<>"')\]]+/i);

  if (urlMatch) {
    try {
      return normalizeHost(new URL(urlMatch[0]).hostname);
    } catch {
      // Seguimos con detección de dominio desnudo.
    }
  }

  const bareDomain = source.match(/(?:^|[\s(])((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+)(?=[\s/?#):,.;]|$)/i);
  if (!bareDomain?.[1]) return null;
  return normalizeHost(bareDomain[1]);
}

export function isTrustedHost(host: string, source: TrustedSource): boolean {
  const candidate = normalizeHost(host);
  if (!candidate) return false;

  return source.trustedDomains.some((domain) => {
    const trusted = normalizeHost(domain);
    if (candidate === trusted) return true;
    return source.allowSubdomains && candidate.endsWith(`.${trusted}`);
  });
}

export function verifySourceTrust(text: string): SourceTrustResult {
  const source = identifyTrustedSource(text);
  const receivedHost = extractReceivedHost(text);

  if (!source) {
    return {
      status: "unknown",
      source: null,
      receivedHost,
      officialHost: null,
    };
  }

  const officialHost = normalizeHost(new URL(source.officialUrl).hostname);

  if (!receivedHost) {
    return {
      status: "recognized-no-url",
      source,
      receivedHost: null,
      officialHost,
    };
  }

  return {
    status: isTrustedHost(receivedHost, source) ? "verified" : "mismatch",
    source,
    receivedHost,
    officialHost,
  };
}
