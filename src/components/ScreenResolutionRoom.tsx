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

  useEffect(() => () => stopSharing(), []);

  function openOfficialSite() {
    window.open(officialUrl, "quehago-official", "noopener,noreferrer");
  }

  async function startSharing() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
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

  async function analyzeFrame() {
    const video = videoRef.current;
    if (!video || !sharing || !video.videoWidth || !video.videoHeight) {
      setError("Primero compartí la ventana del sitio oficial.");
      return;
    }

    setWorking(true);
    setError(null);
    try {
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
      const image = canvas.toDataURL("image/jpeg", 0.78);

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

  const expires = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date(expiresAt));

  return (
    <section className="resolution-room">
      <aside className="resolution-side">
        <div className="resolution-trust">
          <span className="verified-chip">Fuente registrada</span>
          <h2>{sourceName}</h2>
          <p>El recorrido parte del sitio oficial guardado por ¿QuéHago?.</p>
        </div>

        <div className="resolution-goal">
          <p className="eyebrow">Objetivo</p>
          <strong>{goal}</strong>
        </div>

        <ol className="resolution-steps">
          <li><strong>1.</strong> Abrí la fuente oficial.</li>
          <li><strong>2.</strong> Compartí sólo esa ventana.</li>
          <li><strong>3.</strong> Analizá cada estado cuando lo necesites.</li>
          <li><strong>4.</strong> Para claves, códigos o datos sensibles, la captura se corta.</li>
        </ol>

        <button className="button button-primary" type="button" onClick={openOfficialSite}>Abrir {sourceName}</button>
        {!sharing ? (
          <button className="button button-secondary" type="button" onClick={startSharing}>Compartir ventana oficial</button>
        ) : (
          <button className="button button-secondary" type="button" onClick={stopSharing}>Detener captura</button>
        )}

        <small className="resolution-expiry">Sesión disponible hasta las {expires}.</small>
      </aside>

      <div className="resolution-workspace">
        <div className="resolution-preview" data-sharing={sharing ? "true" : "false"}>
          <video ref={videoRef} muted playsInline />
          {!sharing ? (
            <div className="resolution-empty">
              <strong>Tu pantalla no se está compartiendo.</strong>
              <p>¿QuéHago? sólo recibe una imagen cuando tocás analizar.</p>
            </div>
          ) : null}
          {sharing && result?.target ? (
            <div
              className="resolution-target"
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

        <div className="resolution-controls">
          <button className="button button-primary" type="button" disabled={!sharing || working} onClick={analyzeFrame}>
            {working ? "Analizando…" : result ? "Verificar cambio" : "Analizar pantalla"}
          </button>
          <p>La imagen puntual se usa para decidir el próximo paso y no se guarda como archivo del caso.</p>
        </div>

        {error ? <p className="automation-error" role="alert">{error}</p> : null}

        {result ? (
          <section className={`resolution-guidance guidance-${result.status}`} aria-live="polite">
            <div className="receipt-heading">
              <div>
                <p className="eyebrow">{result.status === "complete" ? "Resultado detectado" : "Próximo paso"}</p>
                <h2>{result.instruction}</h2>
              </div>
              <span className="review-chip">{Math.round(result.confidence * 100)}% confianza</span>
            </div>
            <p>{result.reason}</p>
            {result.question ? <p><strong>{result.question}</strong></p> : null}
            {result.status === "sensitive" ? (
              <p className="privacy-inline">Captura detenida. Completá el dato sensible directamente en el sitio y después volvé a compartir.</p>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
