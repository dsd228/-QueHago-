# ¿QuéHago? — CoderCup 2026

¿QueHago? transforma información cotidiana difícil de interpretar en acciones concretas. La IA interpreta; el código valida, persiste y mantiene el control humano.

## Etapa actual

**Etapa 2 — Análisis de texto con IA local**

- Next.js App Router + TypeScript + Tailwind CSS v4.
- SQLite en `data/quehago.db` con `node:sqlite`.
- Migraciones automáticas, incluso sobre la DB creada en Etapa 1.
- Cuatro casos demo ficticios claramente marcados como `Ejemplo`.
- Server Action real para analizar texto.
- Ollama ejecutado exclusivamente desde servidor.
- Selección por `OLLAMA_MODEL`; si se omite, intenta elegir un modelo de texto instalado y evita modelos de embeddings conocidos.
- Structured Outputs mediante JSON Schema.
- Segunda validación del objeto antes de guardarlo.
- Ante respuesta inválida, Ollama caído o modelo ausente, la app no guarda datos y muestra un error claro.
- Resultado persistido con hechos, acciones sugeridas, warnings e información faltante.

## Requisitos

- Node.js 24 o superior.
- npm.
- Ollama instalado para análisis real.
- Al menos un modelo de texto instalado.

## Arranque

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Ollama

Comprobar que está instalado y ver modelos:

```bash
ollama list
```

Opcionalmente crear `.env.local`:

```env
OLLAMA_MODEL=nombre-exacto-del-modelo
OLLAMA_URL=http://127.0.0.1:11434
```

Si no se define `OLLAMA_MODEL`, la app consulta `/api/tags` y elige un modelo de texto instalado.

## Verificaciones

```bash
npm run typecheck
npm run lint
npm run build
```

## Prueba principal de Etapa 2

Pegar:

```text
Tu factura de Internet vence el 28/08/2026. Total a pagar: $34.860.
```

Esperado: categoría pago, vencimiento 2026-08-28, importe 34860 ARS y acciones de recordatorio/calendario.

## Reiniciar datos

Borrar `data/quehago.db` (y, si existen, `data/quehago.db-wal` y `data/quehago.db-shm`) y reiniciar la app.

## Privacidad

En esta etapa sólo se procesa texto pegado. Ollama recibe el contenido localmente. No se envía a un proveedor cloud. Los archivos se implementan en una etapa posterior y el original no se conservará.

## Limitaciones actuales

- `Subir archivo` todavía está deshabilitado.
- Las acciones sugeridas todavía no se ejecutan; se habilitan en la Etapa 3.
- No hay autenticación ni usuarios por diseño del MVP local.

Construido para CoderCup 2026.
