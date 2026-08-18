(() => {
  const root = typeof globalThis !== 'undefined' ? globalThis : self;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function normalize(value) {
    return clean(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function classifyRisk(step = {}) {
    const text = normalize(`${step.instruction || ''} ${step.target_text || ''}`);
    if (/\b(enviar|confirmar pago|pagar|comprar|eliminar|cancelar|aceptar declaracion|presentar tramite|firmar)\b/.test(text)) {
      return 'irreversible';
    }
    if (/\b(dni|cuil|cuit|documento|identidad|direccion|telefono|correo|email|subir archivo|adjuntar)\b/.test(text)) {
      return 'sensitive';
    }
    return 'safe';
  }

  function snapshot(target, options = {}) {
    if (!target) return null;
    const value = 'value' in target ? String(target.value ?? '') : '';
    const selectedIndex = typeof target.selectedIndex === 'number' ? target.selectedIndex : null;
    const checked = typeof target.checked === 'boolean' ? target.checked : null;
    return {
      url: String(options.url ?? root.location?.href ?? ''),
      value,
      selectedIndex,
      checked,
      text: clean(target.innerText || target.textContent || ''),
      disabled: Boolean(target.disabled),
      active: options.active ?? (root.document ? root.document.activeElement === target : false),
      domVersion: Number(options.domVersion || 0),
    };
  }

  function evaluate({ step = {}, before, after, eventType = '' }) {
    if (!before || !after) return result(false, 'missing-state', 'No hay suficiente estado para verificar el paso.');
    const action = String(step.action || 'focus');
    const risk = classifyRisk(step);

    if (action === 'select') {
      const changed = after.selectedIndex !== before.selectedIndex || after.value !== before.value;
      const usable = clean(after.value) !== '' || (after.selectedIndex !== null && after.selectedIndex > 0);
      return changed && usable && eventType === 'change'
        ? result(true, 'state-verified', 'La selección cambió y quedó aplicada.', risk)
        : result(false, 'waiting', 'Esperando que cambies la selección.', risk);
    }

    if (action === 'type') {
      const changed = after.value !== before.value;
      const usable = clean(after.value).length > 0;
      const validEvent = eventType === 'input' || eventType === 'change';
      return changed && usable && validEvent
        ? result(true, 'state-verified', 'El campo cambió y contiene un valor.', risk)
        : result(false, 'waiting', 'Esperando que completes el campo.', risk);
    }

    if (action === 'click') {
      if (eventType !== 'click') return result(false, 'waiting', 'Esperando la acción indicada.', risk);
      if (after.url && before.url && after.url !== before.url) {
        return result(true, 'state-verified', 'La acción produjo un cambio de navegación.', risk);
      }
      if (after.domVersion > before.domVersion) {
        return result(true, 'state-verified', 'La acción produjo un cambio verificable en la página.', risk);
      }
      return result(true, 'action-verified', 'Detectamos el clic real; el sitio no expuso un cambio de estado verificable.', risk);
    }

    if (action === 'focus') {
      return after.active
        ? result(true, 'action-verified', 'El control indicado recibió el foco.', risk)
        : result(false, 'waiting', 'Esperando que revises el control indicado.', risk);
    }

    return result(false, 'unsupported', 'Este tipo de paso todavía no tiene verificación determinística.', risk);
  }

  function result(verified, level, message, risk = 'safe') {
    return { verified, level, message, risk };
  }

  root.QHStepVerifier = Object.freeze({ classifyRisk, snapshot, evaluate });
})();
