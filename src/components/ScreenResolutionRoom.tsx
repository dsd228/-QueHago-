"use client";

import { useEffect, useRef, useState } from "react";

type ScreenGuideResult = {
  status: "guide" | "clarify" | "sensitive" | "complete" | "uncertain";
  instruction: string;
  reason: string;
  question: string | null;
  confidence: number;
  target: null | {
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type Props = {
  token: string;
  goal: string;
  sourceName: string;
  officialUrl: string;
  expiresAt: string;
};

export default function ScreenResolutionRoom({ token, goal, sourceName, officialUrl, expiresAt }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [sharing, setSharing] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<ScreenGuideResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState("");
  const [goalText, setGoalText] = useState(goal);

  useEffect(() => () => stopSharing(), []);

  function openOfficialSite() {
    window.open(officialUrl, "quehago-official", "noopener,noreferrer");
  }

  async function startSharing() {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const track = stream.getVideoTracks()[0];
      track.addEventListener("ended", () => {
        streamRef.current = null;
        setSharing(false);
      });
      setSharing(true);
    } catch (shareError) {
      console.error("[QueHago] screen share failed", shareError);
      setError("No pude iniciar la pantalla compartida. Elegí la ventana donde abriste el sitio oficial.");
    }
  }

  function stopSharing() {
    for (const track of streamRef.current?.getTracks() || []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSharing(false);
  }

  async function captureFrame(): Promise<string> {
    const video = videoRef.current;
    if (!video || !sharing || !video.videoWidth || !video.videoHeight) throw new Error("SCREEN_NOT_SHARED");

    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.78);
  }

  async function analyzeFrame() {
    if (!sharing) {
      setError("Primero compartí la ventana del sitio oficial.");
      return;
    }

    setWorking(true);
    setError(null);
    try {
      const image = await captureFrame();
      const response = await fetch("/api/resolver/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token, image }),
      });
      const data = await response.json();
      if (!response.ok || !data?.result) throw new Error(data?.error || `HTTP_${response.status}`);

      const next = data.result as ScreenGuideResult;
      setResult(next);
      if (next.status === "sensitive") stopSharing();
    } catch (analysisError) {
      console.error("[QueHago] visual guide failed", analysisError);
      setError("No pude interpretar esta pantalla con suficiente seguridad. No voy a adivinar el siguiente paso.");
    } finally {
      setWorking(false);
    }
  }

  async function submitClarification() {
    const answer = clarification.replace(/\s+/g, " ").trim();
    if (answer.length < 2) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/guide/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token, answer }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || data?.error || `HTTP_${response.status}`);
      setGoalText(`${goal} · ${answer}`);
      setClarification("");
      setResult(null);
      if (sharing) await analyzeFrame();
    } catch (contextError) {
      const message = contextError instanceof Error ? contextError.message : "No pude guardar la aclaración.";
      setError(message);
    } finally {
      setWorking(false);
    }
  }

  const expires = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date(expiresAt));

  return (
    <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="self-start rounded-[22px] border border-[var(--line)] bg-[var(--surface-strong)] p-5 lg:sticky lg:top-5">
        <div className="mb-5">
          <span className="verified-chip">Fuente de partida registrada</span>
          <h2 className="mt-3 mb-1 text-2xl font-bold tracking-[-.03em]">{sourceName}</h2>
          <p className="text-sm text-[var(--muted)]">El recorrido empieza desde la URL oficial guardada por ¿QuéHago?.</p>
        </div>

        <div className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="eyebrow">Objetivo</p>
          <strong className="block leading-snug">{goalText}</strong>
        </div>

        <ol className="mb-5 grid gap-3 pl-0 text-sm text-[var(--muted)]">
          <li><strong className="text-[var(--ink)]">1.</strong> Abrí la fuente oficial.</li>
          <li><strong className="text-[var(--ink)]">2.</strong> Compartí sólo esa ventana.</li>
          <li><strong className="text-[var(--ink)]">3.</strong> Analizá el estado antes de actuar.</li>
          <li><strong className="text-[var(--ink)]">4.</strong> Si aparece un dato sensible, la captura se corta.</li>
        </ol>

        <div className="grid gap-2">
          <button className="button button-primary" type="button" onClick={openOfficialSite}>Abrir {sourceName}</button>
          {!sharing ? (
            <button className="button button-secondary" type="button" onClick={startSharing}>Compartir ventana oficial</button>
          ) : (
            <button className="button button-secondary" type="button" onClick={stopSharing}>Detener captura</button>
          )}
        </div>

        <p className="mt-4 mb-0 text-xs text-[var(--muted)]">Sesión disponible hasta las {expires}.</p>
      </aside>

      <div className="grid min-w-0 gap-4">
        <div className="relative min-h-[360px] overflow-hidden rounded-[22px] border border-[var(--line)] bg-[#111]">
          <video ref={videoRef} muted playsInline className="block h-auto w-full" />
          {!sharing ? (
            <div className="absolute inset-0 grid place-content-center gap-2 p-8 text-center text-white">
              <strong>Tu pantalla no se está compartiendo.</strong>
              <p className="m-0 max-w-md text-sm text-white/70">¿QuéHago? no transmite video en segundo plano. Sólo manda un fotograma cuando pedís analizar o verificar.</p>
            </div>
          ) : null}
          {sharing && result?.target ? (
            <div
              className="pointer-events-none absolute rounded-xl border-4 border-[#b7ff54] shadow-[0_0_0_4px_rgba(0,0,0,.72),0_0_0_9px_rgba(183,255,84,.24)]"
              style={{
                left: `${result.target.x * 100}%`,
                top: `${result.target.y * 100}%`,
                width: `${result.target.width * 100}%`,
                height: `${result.target.height * 100}%`,
              }}
              aria-label={`Objetivo visual: ${result.target.label}`}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <strong className="block">Checkpoint visual</strong>
            <p className="m-0 text-sm text-[var(--muted)]">No escribas CUIL, DNI, claves o códigos mientras la captura esté activa.</p>
          </div>
          <button className="button button-primary" type="button" disabled={!sharing || working} onClick={analyzeFrame}>
            {working ? "Analizando…" : result ? "Verificar cambio" : "Analizar pantalla"}
          </button>
        </div>

        {error ? <p className="automation-error" role="alert">{error}</p> : null}

        {result ? (
          <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-strong)] p-5" aria-live="polite">
            <div className="receipt-heading">
              <div>
                <p className="eyebrow">{result.status === "complete" ? "Resultado detectado" : result.status === "sensitive" ? "Privacidad" : "Próximo paso"}</p>
                <h2 className="mb-2 text-2xl tracking-[-.03em]">{result.instruction}</h2>
              </div>
              <span className="review-chip">{Math.round(result.confidence * 100)}% confianza</span>
            </div>
            <p className="text-[var(--muted)]">{result.reason}</p>

            {result.status === "clarify" && result.question ? (
              <div className="mt-4 grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <strong>{result.question}</strong>
                <input
                  className="min-h-11 rounded-xl border border-[#c8c7c0] bg-white px-3"
                  value={clarification}
                  onChange={(event) => setClarification(event.target.value)}
                  placeholder="Ej.: Solicitud de Jubilación"
                  maxLength={200}
                />
                <p className="m-0 text-xs text-[var(--muted)]">Escribí sólo el tipo de trámite. No ingreses DNI, CUIL, correo, teléfono, claves ni códigos.</p>
                <button className="button button-primary" type="button" disabled={working || clarification.trim().length < 2} onClick={submitClarification}>Usar esta aclaración</button>
              </div>
            ) : null}

            {result.status === "sensitive" ? (
              <div className="mt-4 rounded-2xl border border-[#b8cce8] bg-[#f3f7fd] p-4">
                <strong>Captura detenida.</strong>
                <p className="mt-1 mb-0 text-sm">Completá el dato directamente en el sitio oficial. Después volvé a ¿QuéHago? y compartí nuevamente la ventana.</p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
