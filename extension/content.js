(() => {
  if (globalThis.__queHagoGuideLoaded) return;
  globalThis.__queHagoGuideLoaded = true;

  const INTERACTIVE_SELECTOR = 'button,a[href],input,select,textarea,[contenteditable="true"],[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="combobox"],[tabindex]';
  const STORAGE_KEY = 'queHagoActiveGuide';

  let sessionContext = null;
  let plan = null;
  let stepIndex = 0;
  let tagged = [];
  let root = null;
  let activeTarget = null;
  let verificationCleanup = null;
  let mutationObserver = null;
  let domVersion = 0;
  let stepVerified = false;
  let rafPending = false;

  boot().catch((error) => {
    console.warn('[QueHago Guide] boot failed', error);
  });

  async function boot() {
    const launch = await resolveLaunch();
    if (!launch) return;

    const response = await chrome.runtime.sendMessage({
      type: 'QH_SESSION_GET',
      origin: launch.origin,
      token: launch.token,
    });

    if (!response?.ok || !response?.data?.session) {
      clearStoredSession();
      showStandaloneMessage('La sesión de ¿QuéHago? venció o ya no está disponible.', 'error');
      return;
    }

    const session = response.data.session;
    if (!isTrustedCurrentHost(session.trustedDomains)) {
      showStandaloneMessage(
        `¿QuéHago? no va a guiarte en ${location.hostname}. Esta sesión sólo admite: ${session.trustedDomains.join(', ')}.`,
        'blocked',
      );
      return;
    }

    sessionContext = {
      token: launch.token,
      origin: launch.origin,
      sourceName: session.sourceName,
      trustedDomains: session.trustedDomains,
      expiresAt: session.expiresAt,
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: sessionContext });
    removeLaunchFragment();
    await analyzeCurrentPage();
  }

  async function resolveLaunch() {
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    const token = fragment.get('qh') || '';
    const origin = normalizeOrigin(fragment.get('qho') || '');

    if (token && origin && /^[A-Za-z0-9_-]{20,80}$/.test(token)) {
      return { token, origin };
    }

    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const active = stored?.[STORAGE_KEY];
    if (!active?.token || !active?.origin || !active?.expiresAt) return null;
    if (Date.parse(active.expiresAt) <= Date.now()) {
      await clearStoredSession();
      return null;
    }
    if (!Array.isArray(active.trustedDomains) || !isTrustedCurrentHost(active.trustedDomains)) return null;
    const storedOrigin = normalizeOrigin(active.origin);
    if (!storedOrigin) return null;
    return { token: active.token, origin: storedOrigin };
  }

  function normalizeOrigin(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.origin === 'http://localhost:3000' || url.origin === 'http://127.0.0.1:3000') return url.origin;
      return null;
    } catch {
      return null;
    }
  }

  function normalizeHost(value) {
    return String(value || '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  }

  function isTrustedCurrentHost(domains) {
    const host = normalizeHost(location.hostname);
    return domains.some((domain) => {
      const trusted = normalizeHost(domain);
      return host === trusted || host.endsWith(`.${trusted}`);
    });
  }

  function removeLaunchFragment() {
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (!fragment.has('qh') && !fragment.has('qho')) return;
    fragment.delete('qh');
    fragment.delete('qho');
    const hash = fragment.toString();
    history.replaceState(null, '', `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`);
  }

  async function analyzeCurrentPage() {
    resetPageState();
    const page = extractPage();
    const response = await chrome.runtime.sendMessage({
      type: 'QH_GUIDE_ANALYZE',
      origin: sessionContext.origin,
      token: sessionContext.token,
      page,
    });

    if (!response?.ok || !response?.data?.plan) {
      const message = response?.error === 'UNTRUSTED_CURRENT_DOMAIN'
        ? 'La página actual ya no coincide con la fuente oficial permitida.'
        : 'No pude construir una guía segura para esta página.';
      showStandaloneMessage(message, 'error');
      return;
    }

    plan = response.data.plan;
    if (!Array.isArray(plan.steps) || !plan.steps.length) {
      showStandaloneMessage('No encontré controles suficientemente claros para continuar. Podés seguir manualmente sin que ¿QuéHago? toque nada.', 'neutral');
      return;
    }

    stepIndex = 0;
    renderPanel();
    showStep(0);
  }

  function extractPage() {
    const raw = [...document.querySelectorAll(INTERACTIVE_SELECTOR)]
      .filter((el) => !el.closest('#quehago-guide-root'))
      .filter(isVisible)
      .filter((el) => !isSensitive(el))
      .slice(0, 450)
      .map((el, order) => ({ el, order, score: localRelevance(el) }));

    const selected = raw.length <= 140
      ? raw
      : raw.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 140).sort((a, b) => a.order - b.order);

    tagged = [];
    const elements = selected.map((item, index) => {
      const id = `qh-${index + 1}`;
      item.el.setAttribute('data-quehago-id', id);
      tagged.push(item.el);
      return {
        id,
        tag: item.el.tagName.toLowerCase(),
        role: scrub(item.el.getAttribute('role') || '').slice(0, 50),
        type: scrub(item.el.getAttribute('type') || '').slice(0, 30),
        label: scrub(getLabel(item.el)).slice(0, 220),
        text: scrub(item.el.innerText || item.el.textContent || '').slice(0, 220),
        placeholder: scrub(item.el.getAttribute('placeholder') || '').slice(0, 160),
        name: scrub(item.el.getAttribute('name') || '').slice(0, 100),
        context: scrub(getContext(item.el)).slice(0, 280),
        disabled: Boolean(item.el.disabled),
      };
    });

    return {
      title: scrub(document.title).slice(0, 200),
      url: `${location.origin}${location.pathname}`,
      text: extractSemanticSummary(),
      elements,
    };
  }

  function localRelevance(el) {
    const meta = `${getLabel(el)} ${el.innerText || el.textContent || ''} ${getContext(el)}`.toLowerCase();
    let score = 0;
    if (['SELECT', 'INPUT', 'BUTTON'].includes(el.tagName)) score += 2;
    if (el.id) score += 1;
    if (/turno|tramite|solicitud|consulta|continuar|ingresar|acceder|buscar|ver|estado|beneficio/i.test(meta)) score += 5;
    if (/publicidad|newsletter|promocion|redes sociales|ayuda/i.test(meta)) score -= 5;
    if (el.disabled) score -= 30;
    return score;
  }

  function extractSemanticSummary() {
    return [...document.querySelectorAll('h1,h2,h3,legend,[role="heading"]')]
      .filter((el) => !el.closest('#quehago-guide-root'))
      .filter(isVisible)
      .slice(0, 45)
      .map((el) => scrub(el.innerText || el.textContent || ''))
      .filter(Boolean)
      .join(' · ')
      .slice(0, 5000);
  }

  function isSensitive(el) {
    const type = String(el.getAttribute('type') || '').toLowerCase();
    const autocomplete = String(el.getAttribute('autocomplete') || '').toLowerCase();
    const name = String(el.getAttribute('name') || '').toLowerCase();
    if (['password', 'hidden'].includes(type)) return true;
    if (/(password|current-password|new-password|one-time-code|cc-number|cc-csc|cc-exp)/.test(autocomplete)) return true;
    return /(password|passwd|token|otp|cvv|cvc|cardnumber|tarjeta)/.test(name);
  }

  function getLabel(el) {
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    if (el.labels?.length) return clean([...el.labels].map((label) => label.innerText).join(' '));
    if (el.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) return clean(label.innerText);
      } catch {}
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ');
      if (clean(text)) return clean(text);
    }
    return clean(el.innerText || el.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || '');
  }

  function getContext(el) {
    const owner = el.closest('label,fieldset,form,section,article,main,[role="group"],[role="region"]');
    return clean(owner?.innerText || '').slice(0, 360);
  }

  function renderPanel() {
    root = document.createElement('div');
    root.id = 'quehago-guide-root';
    root.innerHTML = `
      <div class="qh-focus-ring" data-qh-ring aria-hidden="true"></div>
      <section class="qh-panel" role="dialog" aria-label="Guía verificada de ¿QuéHago?" aria-live="polite">
        <div class="qh-head">
          <span class="qh-mark" aria-hidden="true">Q</span>
          <div><strong>¿QuéHago?</strong><small>Guía verificada · ${escapeHtml(sessionContext.sourceName)}</small></div>
          <button class="qh-close" type="button" aria-label="Cerrar guía">×</button>
        </div>
        <div class="qh-trust">✓ Dominio oficial permitido</div>
        <div class="qh-progress"><span data-qh-progress></span></div>
        <div class="qh-meta"><span data-qh-counter></span><span data-qh-mode></span></div>
        <h2 data-qh-title></h2>
        <p class="qh-target" data-qh-target></p>
        <p class="qh-why" data-qh-why></p>
        <p class="qh-verification" data-qh-verification role="status">Esperando la acción indicada.</p>
        <div class="qh-actions">
          <button class="qh-prev" type="button">Anterior</button>
          <button class="qh-next" type="button" disabled>Esperando acción…</button>
        </div>
        <p class="qh-note">Vos hacés la acción. ¿QuéHago? no completa contraseñas, códigos ni confirmaciones finales.</p>
      </section>`;

    document.documentElement.appendChild(root);
    root.querySelector('.qh-close').addEventListener('click', stopSession);
    root.querySelector('.qh-prev').addEventListener('click', () => showStep(stepIndex - 1));
    root.querySelector('.qh-next').addEventListener('click', async () => {
      if (!stepVerified) return;
      if (stepIndex < plan.steps.length - 1) {
        showStep(stepIndex + 1);
        return;
      }
      await analyzeCurrentPage();
    });

    mutationObserver = new MutationObserver((records) => {
      if (records.some((record) => !(record.target instanceof Element && record.target.closest('#quehago-guide-root')))) domVersion += 1;
    });
    if (document.body) mutationObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('scroll', scheduleRingUpdate, true);
    window.addEventListener('resize', scheduleRingUpdate, true);
  }

  function showStep(index) {
    if (!root || !plan) return;
    cleanupVerification();
    stepIndex = Math.max(0, Math.min(index, plan.steps.length - 1));
    const step = plan.steps[stepIndex];
    activeTarget = findTarget(step);
    stepVerified = false;

    root.querySelector('[data-qh-counter]').textContent = `Paso ${stepIndex + 1} de ${plan.steps.length}`;
    root.querySelector('[data-qh-mode]').textContent = plan.mode === 'ai' ? 'IA + reglas' : 'Modo resiliente';
    root.querySelector('[data-qh-progress]').style.width = `${((stepIndex + 1) / plan.steps.length) * 100}%`;
    root.querySelector('[data-qh-title]').textContent = step.instruction;
    root.querySelector('[data-qh-target]').textContent = step.target_text ? `En esta página: ${step.target_text}` : '';
    root.querySelector('[data-qh-why]').textContent = activeTarget ? (step.why || plan.summary || '') : 'El control cambió o ya no está visible. No voy a marcar este paso como cumplido.';
    root.querySelector('.qh-prev').disabled = stepIndex === 0;
    const next = root.querySelector('.qh-next');
    next.disabled = true;
    next.textContent = 'Esperando acción…';

    const verification = root.querySelector('[data-qh-verification]');
    const verifier = globalThis.QHStepVerifier;
    const risk = verifier?.classifyRisk ? verifier.classifyRisk(step) : 'safe';
    verification.dataset.level = 'waiting';
    verification.dataset.risk = risk;
    verification.textContent = risk === 'irreversible'
      ? 'Acción importante: hacela personalmente. ¿QuéHago? no la ejecuta por vos.'
      : risk === 'sensitive'
        ? 'Paso sensible: completalo personalmente. No guardamos el valor del campo.'
        : 'Esperando la acción indicada.';

    if (!activeTarget) {
      hideRing();
      return;
    }

    installVerification(step, activeTarget);
    activeTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    if (['focus', 'type', 'select'].includes(step.action)) setTimeout(() => safeFocus(activeTarget), 250);
    setTimeout(updateRing, 150);
    setTimeout(updateRing, 450);
  }

  function installVerification(step, target) {
    const verifier = globalThis.QHStepVerifier;
    const status = root?.querySelector('[data-qh-verification]');
    if (!verifier?.snapshot || !verifier?.evaluate || !status) return;

    const before = verifier.snapshot(target, { url: location.href, domVersion });
    const action = String(step.action || 'focus');
    const eventTypes = action === 'select' ? ['change'] : action === 'type' ? ['input', 'change'] : action === 'click' ? ['click'] : ['focus'];
    let timer = null;
    const handlers = [];

    for (const eventType of eventTypes) {
      const handler = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (!root || step !== plan?.steps?.[stepIndex]) return;
          const after = verifier.snapshot(target, { url: location.href, domVersion, active: document.activeElement === target });
          const outcome = verifier.evaluate({ step, before, after, eventType });
          status.dataset.level = outcome.level;
          status.dataset.risk = outcome.risk;
          status.textContent = outcome.verified
            ? `${outcome.level === 'state-verified' ? 'Estado verificado' : 'Acción detectada'} · ${outcome.message}`
            : outcome.message;
          if (!outcome.verified) return;

          stepVerified = true;
          const next = root.querySelector('.qh-next');
          next.disabled = false;
          next.textContent = stepIndex < plan.steps.length - 1 ? 'Continuar · paso verificado' : 'Revisar siguiente estado';
        }, action === 'click' ? 220 : 40);
      };
      handlers.push({ eventType, handler });
      target.addEventListener(eventType, handler, true);
    }

    verificationCleanup = () => {
      if (timer) clearTimeout(timer);
      for (const { eventType, handler } of handlers) target.removeEventListener(eventType, handler, true);
    };
  }

  function findTarget(step) {
    if (step?.target_id) {
      const exact = document.querySelector(`[data-quehago-id="${attributeEscape(step.target_id)}"]`);
      if (exact && isVisible(exact)) return exact;
    }

    const wanted = normalize(step?.target_text || '');
    if (!wanted) return null;
    let best = null;
    let bestScore = -1;
    for (const el of [...document.querySelectorAll(INTERACTIVE_SELECTOR)].filter(isVisible).filter((item) => !isSensitive(item))) {
      const text = normalize(`${getLabel(el)} ${el.innerText || el.textContent || ''}`);
      const score = similarity(wanted, text);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return bestScore >= 0.45 ? best : null;
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    if (b === a) return 1;
    if (b.includes(a) || a.includes(b)) return 0.95;
    const aa = new Set(a.split(' ').filter(Boolean));
    const bb = new Set(b.split(' ').filter(Boolean));
    let common = 0;
    aa.forEach((word) => { if (bb.has(word)) common += 1; });
    return common / Math.max(aa.size, 1);
  }

  function updateRing() {
    rafPending = false;
    const ring = root?.querySelector('[data-qh-ring]');
    if (!ring || !activeTarget || !isVisible(activeTarget)) {
      hideRing();
      return;
    }
    const rect = activeTarget.getBoundingClientRect();
    const pad = 7;
    ring.style.display = 'block';
    ring.style.left = `${Math.max(4, rect.left - pad)}px`;
    ring.style.top = `${Math.max(4, rect.top - pad)}px`;
    ring.style.width = `${Math.max(12, rect.width + pad * 2)}px`;
    ring.style.height = `${Math.max(12, rect.height + pad * 2)}px`;
  }

  function scheduleRingUpdate() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(updateRing);
  }

  function hideRing() {
    const ring = root?.querySelector('[data-qh-ring]');
    if (ring) ring.style.display = 'none';
  }

  function resetPageState() {
    cleanupVerification();
    if (mutationObserver) mutationObserver.disconnect();
    mutationObserver = null;
    window.removeEventListener('scroll', scheduleRingUpdate, true);
    window.removeEventListener('resize', scheduleRingUpdate, true);
    if (root) root.remove();
    root = null;
    plan = null;
    stepIndex = 0;
    activeTarget = null;
    domVersion = 0;
    stepVerified = false;
    for (const el of tagged) {
      try { el.removeAttribute('data-quehago-id'); } catch {}
    }
    tagged = [];
  }

  function cleanupVerification() {
    if (verificationCleanup) {
      try { verificationCleanup(); } catch {}
    }
    verificationCleanup = null;
  }

  async function stopSession() {
    resetPageState();
    await clearStoredSession();
  }

  async function clearStoredSession() {
    try { await chrome.storage.local.remove(STORAGE_KEY); } catch {}
  }

  function showStandaloneMessage(message, kind) {
    resetPageState();
    root = document.createElement('div');
    root.id = 'quehago-guide-root';
    root.innerHTML = `<section class="qh-panel qh-panel-${kind}" role="alert"><div class="qh-head"><span class="qh-mark">Q</span><div><strong>¿QuéHago?</strong><small>Guía verificada</small></div><button class="qh-close" type="button" aria-label="Cerrar">×</button></div><p class="qh-standalone"></p></section>`;
    root.querySelector('.qh-standalone').textContent = message;
    root.querySelector('.qh-close').addEventListener('click', () => root?.remove());
    document.documentElement.appendChild(root);
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 1 && rect.height > 1;
  }

  function safeFocus(el) {
    try { el.focus({ preventScroll: true }); } catch {}
  }

  function scrub(value) {
    return clean(value)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[correo]')
      .replace(/(?:\+?\d[\s().-]*){8,}/g, '[número]')
      .replace(/\b\d{8,11}\b/g, '[dato numérico]');
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalize(value) {
    return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  }

  function attributeEscape(value) {
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }
})();
