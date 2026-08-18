"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { analyzeTextAction, type AnalyzeFormState } from "@/app/actions";

const initialState: AnalyzeFormState = { error: null };

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AnalyzerForm() {
  const [state, action, pending] = useActionState(analyzeTextAction, initialState);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  function clearFile() {
    handleFileChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <form className="analyzer-form" action={action} aria-describedby="analyzer-help">
      <fieldset className="input-source-fieldset" disabled={pending}>
        <legend>Lo que te llegó</legend>

        <div className={`upload-zone ${selectedFile ? "upload-zone-ready" : ""}`}>
          <input
            ref={inputRef}
            id="attachment"
            name="attachment"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
          />

          {selectedFile && previewUrl ? (
            <div className="upload-preview">
              <Image
                src={previewUrl}
                alt="Vista previa de la imagen seleccionada"
                width={640}
                height={360}
                unoptimized
              />
            </div>
          ) : (
            <div className="upload-copy-block">
              <span className="upload-zone-title">Subí una captura</span>
              <span className="upload-zone-copy">WhatsApp, factura, turno o aviso · PNG/JPG · hasta 10 MB</span>
            </div>
          )}

          <div className="upload-controls">
            <label className="button button-secondary upload-zone-button" htmlFor="attachment">
              {selectedFile ? "Cambiar imagen" : "Elegir imagen"}
            </label>
            {selectedFile ? (
              <button className="button button-secondary" type="button" onClick={clearFile}>
                Quitar
              </button>
            ) : null}
          </div>

          {selectedFile ? (
            <div className="selected-file" aria-live="polite">
              <strong>Imagen lista para analizar</strong>
              <span>{selectedFile.name} · {formatFileSize(selectedFile.size)}</span>
              <small>Se procesa en memoria. La imagen original no se guarda.</small>
            </div>
          ) : null}
        </div>

        <div className="input-or" aria-hidden="true"><span>o</span></div>

        <label htmlFor="content">Pegá el texto</label>
        <textarea
          id="content"
          name="content"
          rows={7}
          maxLength={20_000}
          aria-invalid={state.error ? "true" : "false"}
          aria-describedby={state.error ? "analyzer-error analyzer-help" : "analyzer-help"}
          placeholder="Pegá acá un mensaje, mail, trámite o cualquier cosa que no sepas bien cómo resolver."
        />
      </fieldset>

      {state.error ? (
        <p id="analyzer-error" className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "Buscando qué importa…" : "Decime qué hago"}
        </button>
      </div>

      <p id="analyzer-help" className="stage-note" aria-live="polite">
        {pending
          ? "Leyendo lo visible, separando hechos y preparando acciones seguras."
          : "¿QuéHago? usa minimización de datos: muestra y conserva solo lo necesario para ayudarte a resolverlo."}
      </p>
    </form>
  );
}
