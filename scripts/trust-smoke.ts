import assert from "node:assert/strict";
import { verifySourceTrust } from "../src/lib/trusted-sources.ts";

const mismatch = verifySourceTrust(
  "ANSES informa un beneficio pendiente. Ingrese ahora a https://mi-anses-beneficios.example/validar",
);
assert.equal(mismatch.status, "mismatch");
assert.equal(mismatch.source?.id, "anses");
assert.equal(mismatch.receivedHost, "mi-anses-beneficios.example");
assert.equal(mismatch.officialHost, "anses.gob.ar");

const officialBna = verifySourceTrust(
  "Banco Nación: consulte el estado desde https://www.bna.com.ar/Personas",
);
assert.equal(officialBna.status, "verified");
assert.equal(officialBna.source?.id, "bna");

const officialSubdomain = verifySourceTrust(
  "ANSES: continúe en https://servicios.anses.gob.ar/turnos",
);
assert.equal(officialSubdomain.status, "verified");

const lookalike = verifySourceTrust(
  "ANSES: continúe en https://anses.gob.ar.seguridad-ejemplo.com/",
);
assert.equal(lookalike.status, "mismatch");

const arcaNoUrl = verifySourceTrust("ARCA informa que tiene una nueva notificación.");
assert.equal(arcaNoUrl.status, "recognized-no-url");
assert.equal(arcaNoUrl.officialHost, "arca.gob.ar");

const unknown = verifySourceTrust("Su servicio tiene una notificación pendiente en https://ejemplo.com/");
assert.equal(unknown.status, "unknown");

console.log("TRUST_SMOKE=PASS");
