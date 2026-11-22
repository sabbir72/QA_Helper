// VeriPulse — Content Script (DOM Recorder, Element Inspector, Coverage Scanner, Permission Probe)
// Privacy & Security: Never captures raw passwords or sensitive tokens; never auto-submits forms.

(() => {
  if (window.__testallyInjected) return;
  window.__testallyInjected = true;

  let isRecording = false;
  let isInspecting = false;
  let highlightedEl = null;
  let previousOutline = '';
  let fakeGpsConfig = null;
  const FAKE_GPS_KEY = 'veripulse_fake_gps_v1';
  const SENSITIVE_RE = /password|passwd|secret|token|auth|bearer|api[_-]?key|ssn|salary|cvv/i;

  function broadcastFakeGpsToMain(cfg) {
    fakeGpsConfig = cfg || null;
    try {
      window.postMessage(
        { source: 'VERIPULSE_GPS_CONFIG', config: fakeGpsConfig },
        '*'
      );
    } catch {
      // Ignore postMessage failure
    }
    updateFakeGpsBadge(fakeGpsConfig);
  }

  try {
    chrome.storage.local.get([FAKE_GPS_KEY], (res) => {
      if (chrome.runtime.lastError) return;
      broadcastFakeGpsToMain(res[FAKE_GPS_KEY] || { enabled: false });
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes[FAKE_GPS_KEY]) {
        broadcastFakeGpsToMain(changes[FAKE_GPS_KEY].newValue || { enabled: false });
      }
    });
  } catch {
    // Ignore storage context errors
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data) return;
    if (ev.data.source === 'VERIPULSE_GPS_REQUEST_CONFIG' && fakeGpsConfig !== null) {
      window.postMessage(
        { source: 'VERIPULSE_GPS_CONFIG', config: fakeGpsConfig },
        '*'
      );
      return;
    }
    if (ev.data.source === 'VERIPULSE_WEB_PING') {
      window.postMessage(
        { source: 'VERIPULSE_EXTENSION_PONG', version: '1.1.0' },
        '*'
      );
      return;
    }
    if (ev.data.source === 'VERIPULSE_WEB_PAIR_EXTENSION') {
      const serverUrl = String(ev.data.serverUrl || window.location.origin);
      const bearerToken = String(ev.data.bearerToken || '');
      try {
        chrome.runtime.sendMessage(
          { type: 'VERIPULSE_CONNECT_SYNC', serverUrl, bearerToken },
          (res) => {
            window.postMessage(
              {
                source: 'VERIPULSE_WEB_PAIR_RESULT',
                ok: Boolean(res?.ok),
                user: res?.user || null,
                error: res?.error || undefined,
              },
              '*'
            );
          }
        );
      } catch {
        window.postMessage(
          {
            source: 'VERIPULSE_WEB_PAIR_RESULT',
            ok: false,
            error: 'Extension runtime unavailable.',
          },
          '*'
        );
      }
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (isRecording) updateRecordingIndicator(true);
    if (fakeGpsConfig?.enabled) updateFakeGpsBadge(fakeGpsConfig);
  });

  try {
    chrome.runtime.sendMessage({ type: 'TESTALLY_GET_STATUS' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.recording?.isRecording) {
        isRecording = true;
        updateRecordingIndicator(true);
      }
      if (res?.fakeGps) {
        broadcastFakeGpsToMain(res.fakeGps);
      }
    });
  } catch {
    // Ignore when extension context reloads
  }

  function escapeAttr(val) {
    return String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function isSensitiveElement(el) {
    if (!el) return false;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'password') return true;
    const descriptor = [
      el.getAttribute('name'),
      el.getAttribute('id'),
      el.getAttribute('data-testid'),
      el.getAttribute('aria-label'),
      el.getAttribute('placeholder'),
    ]
      .filter(Boolean)
      .join(' ');
    return SENSITIVE_RE.test(descriptor);
  }

  function buildStableSelector(el) {
    if (!el || !el.tagName) return '';
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${escapeAttr(testId)}"]`;
    const aria = el.getAttribute('aria-label');
    if (aria) return `${el.tagName.toLowerCase()}[aria-label="${escapeAttr(aria)}"]`;
    const name = el.getAttribute('name');
    if (name) return `${el.tagName.toLowerCase()}[name="${escapeAttr(name)}"]`;
    if (el.id && !/\d{4,}/.test(el.id)) return `#${CSS?.escape ? CSS.escape(el.id) : el.id}`;
    return el.tagName.toLowerCase();
  }

  function buildXPath(el) {
    if (!el || !el.tagName) return '';
    const testId = el.getAttribute('data-testid');
    if (testId) return `//*[@data-testid="${testId}"]`;
    if (el.id && !/\d{4,}/.test(el.id)) return `//*[@id="${el.id}"]`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 5) {
      let idx = 1;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName === cur.tagName) idx += 1;
        sib = sib.previousElementSibling;
      }
      parts.unshift(idx > 1 ? `${cur.tagName.toLowerCase()}[${idx}]` : cur.tagName.toLowerCase());
      cur = cur.parentElement;
    }
    return `//${parts.join('/')}`;
  }

  function inspectTarget(el) {
    const tagName = el.tagName.toLowerCase();
    const id = el.id || '';
    const name = el.getAttribute('name') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const role = el.getAttribute('role') || (tagName === 'button' ? 'button' : tagName === 'a' ? 'link' : '');
    const ariaLabel = el.getAttribute('aria-label') || '';
    const visibleText = (el.innerText || el.textContent || '').trim().slice(0, 80);
    const labelEl = id ? document.querySelector(`label[for="${CSS?.escape ? CSS.escape(id) : id}"]`) : el.closest('label');
    const label = labelEl ? (labelEl.textContent || '').trim().slice(0, 60) : '';
    const cssSelector = buildStableSelector(el);
    let cssIsUnique = false;
    try {
      cssIsUnique = document.querySelectorAll(cssSelector).length === 1;
    } catch {
      cssIsUnique = false;
    }

    return {
      tagName,
      visibleText,
      accessibleName: ariaLabel || label || visibleText || placeholder || name,
      id,
      name,
      placeholder,
      role,
      label,
      cssSelector,
      cssIsUnique,
      xpathSuggestion: buildXPath(el),
      pageUrl: window.location.href,
      timestamp: new Date().toISOString(),
    };
  }

  function maskIfSensitive(el, value) {
    if (!value) return '';
    if (isSensitiveElement(el)) return '••••••••';
    return String(value).slice(0, 120);
  }

  function clearInspectorHighlight() {
    if (highlightedEl) {
      highlightedEl.style.outline = previousOutline;
      highlightedEl = null;
      previousOutline = '';
    }
    document.documentElement.style.cursor = '';
  }

  function scanInteractiveElements() {
    const query = 'button, input, select, textarea, a[href], [role="button"]';
    const nodes = Array.from(document.querySelectorAll(query));
    return nodes.slice(0, 400).map((node, idx) => {
      const tag = node.tagName.toLowerCase();
      const type = (node.getAttribute('type') || '').toLowerCase();
      let controlType = 'button';
      if (tag === 'a') controlType = 'link';
      else if (tag === 'select') controlType = 'select';
      else if (tag === 'textarea') controlType = 'input';
      else if (tag === 'input') {
        if (type === 'checkbox') controlType = 'checkbox';
        else if (type === 'radio') controlType = 'radio';
        else if (type === 'submit' || type === 'button') controlType = 'button';
        else controlType = 'input';
      }
      const style = window.getComputedStyle(node);
      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        node.offsetParent !== null;

      return {
        id: `ext_el_${idx}`,
        pageUrl: window.location.href,
        pageTitle: document.title || window.location.pathname,
        controlType,
        label:
          node.getAttribute('aria-label') ||
          (node.innerText || '').trim().slice(0, 60) ||
          node.getAttribute('placeholder') ||
          node.getAttribute('name') ||
          `${controlType}_${idx + 1}`,
        selector: buildStableSelector(node),
        testId: node.getAttribute('data-testid') || undefined,
        visible,
        disabled: Boolean(node.disabled),
        testState: 'Untested',
      };
    });
  }

  function scanFormFieldsForAutofill() {
    const nodes = Array.from(document.querySelectorAll('input, textarea, select'));
    const fields = [];
    for (let idx = 0; idx < nodes.length && fields.length < 45; idx += 1) {
      const node = nodes[idx];
      const tag = node.tagName.toLowerCase();
      const inputType = (node.getAttribute('type') || (tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(inputType)) continue;
      if (node.disabled || node.readOnly) continue;

      const style = window.getComputedStyle(node);
      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        node.offsetParent !== null;
      if (!visible) continue;

      const id = node.id || '';
      const labelEl = id
        ? document.querySelector(`label[for="${CSS?.escape ? CSS.escape(id) : id}"]`)
        : node.closest('label');
      const labelText = (
        (labelEl ? labelEl.textContent : '') ||
        node.getAttribute('aria-label') ||
        node.getAttribute('placeholder') ||
        node.getAttribute('name') ||
        id ||
        `Field ${fields.length + 1}`
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90);

      const options =
        tag === 'select'
          ? Array.from(node.options || [])
              .map((o) => (o.value || o.textContent || '').trim())
              .filter((v) => Boolean(v) && !/^select\b/i.test(v))
              .slice(0, 20)
          : [];

      const sensitive = isSensitiveElement(node);
      const selector = buildStableSelector(node);
      fields.push({
        id: `dom_${fields.length + 1}`,
        label: labelText,
        name: node.getAttribute('name') || id || '',
        idAttr: id,
        selector,
        tagName: tag,
        type: inputType,
        placeholder: (node.getAttribute('placeholder') || '').slice(0, 90),
        required: Boolean(node.required || node.getAttribute('aria-required') === 'true'),
        options,
        currentValue: sensitive ? '' : String(node.value || '').slice(0, 100),
        isSensitive: sensitive,
      });
    }
    return fields;
  }

  function setNativeControlValue(el, rawVal) {
    const tag = el.tagName;
    const type = (el.getAttribute('type') || '').toLowerCase();

    if (type === 'checkbox' || type === 'radio') {
      const normalized = String(rawVal ?? '').trim().toLowerCase();
      const shouldCheck = ['true', '1', 'yes', 'on', 'checked'].includes(normalized);
      if (type === 'radio') {
        if (shouldCheck || normalized === String(el.value || '').toLowerCase()) {
          el.click();
        }
      } else if (el.checked !== shouldCheck) {
        el.click();
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    if (tag === 'SELECT') {
      const targetStr = String(rawVal ?? '').trim().toLowerCase();
      const opts = Array.from(el.options || []);
      const matched =
        opts.find((o) => String(o.value || '').trim().toLowerCase() === targetStr) ||
        opts.find((o) => String(o.textContent || '').trim().toLowerCase() === targetStr) ||
        opts.find((o) => String(o.textContent || '').trim().toLowerCase().includes(targetStr)) ||
        opts.find((o) => Boolean(o.value));
      if (!matched) return false;
      const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
      if (selectSetter) selectSetter.call(el, matched.value);
      else el.value = matched.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    const proto =
      tag === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    const nextVal = String(rawVal ?? '');
    if (setter) {
      setter.call(el, nextVal);
    } else {
      el.value = nextVal;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function autofillWindowFields(items) {
    const list = Array.isArray(items) ? items : [];
    let filledCount = 0;
    let skippedCount = 0;
    for (const item of list) {
      if (!item || !item.selector) {
        skippedCount += 1;
        continue;
      }
      let target = null;
      try {
        target = document.querySelector(item.selector);
      } catch {
        target = null;
      }
      if (!target && item.name) {
        try {
          target = document.querySelector(`[name="${escapeAttr(item.name)}"]`);
        } catch {
          target = null;
        }
      }
      if (!target || target.disabled || target.readOnly) {
        skippedCount += 1;
        continue;
      }
      const ok = setNativeControlValue(target, item.value);
      if (ok) {
        filledCount += 1;
        const prevShadow = target.style.boxShadow;
        const prevTransition = target.style.transition;
        target.style.transition = 'box-shadow 0.25s ease';
        target.style.boxShadow = '0 0 0 2px #0d9488';
        setTimeout(() => {
          target.style.boxShadow = prevShadow;
          target.style.transition = prevTransition;
        }, 1800);
      } else {
        skippedCount += 1;
      }
    }
    return { ok: true, filledCount, skippedCount };
  }

  document.addEventListener(
    'mouseover',
    (e) => {
      if (!isInspecting || !e.target || e.target === highlightedEl) return;
      if (highlightedEl) {
        highlightedEl.style.outline = previousOutline;
      }
      highlightedEl = e.target;
      previousOutline = highlightedEl.style.outline || '';
      highlightedEl.style.outline = '2px solid #2563eb';
    },
    true
  );

  document.addEventListener(
    'click',
    (e) => {
      if (isInspecting) {
        e.preventDefault();
        e.stopPropagation();
        const target = e.target;
        clearInspectorHighlight();
        const inspected = inspectTarget(target);
        isInspecting = false;
        chrome.runtime.sendMessage({
          type: 'TESTALLY_ELEMENT_INSPECTED',
          element: inspected,
        });
        return;
      }

      if (!isRecording) return;
      const target = e.target?.closest?.('button, a, [role="button"], input[type="checkbox"], input[type="radio"]');
      if (!target) return;
      const info = inspectTarget(target);
      const type = (target.getAttribute('type') || '').toLowerCase();
      const action =
        type === 'checkbox'
          ? target.checked
            ? 'check'
            : 'uncheck'
          : 'click';

      chrome.runtime.sendMessage({
        type: 'TESTALLY_RECORDED_EVENT',
        step: {
          title: `${action === 'check' ? 'Check' : action === 'uncheck' ? 'Uncheck' : 'Click'} ${info.accessibleName || info.tagName}`,
          action,
          targetElement: info.cssSelector,
          testData: '',
          isSensitiveData: false,
          pageUrl: info.pageUrl,
          inspected: info,
          observedResult: `Interaction captured on ${window.location.pathname}`,
          timestamp: info.timestamp,
        },
      });
    },
    true
  );

  document.addEventListener(
    'change',
    (e) => {
      if (!isRecording) return;
      const target = e.target;
      if (!target || !['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const type = (target.getAttribute('type') || '').toLowerCase();
      if (type === 'checkbox') return;
      const sensitive = isSensitiveElement(target);
      const info = inspectTarget(target);
      const action =
        target.tagName === 'SELECT'
          ? 'select'
          : type === 'radio'
            ? 'click'
            : 'type';

      chrome.runtime.sendMessage({
        type: 'TESTALLY_RECORDED_EVENT',
        step: {
          title: `${action === 'select' ? 'Select' : 'Type'} ${info.label || info.name || info.tagName}`,
          action,
          targetElement: info.cssSelector,
          testData: maskIfSensitive(target, target.value),
          isSensitiveData: sensitive,
          pageUrl: info.pageUrl,
          inspected: info,
          observedResult: sensitive ? 'Sensitive value masked' : 'Value updated',
          timestamp: info.timestamp,
        },
      });
    },
    true
  );

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return false;
    if (msg.type === 'TESTALLY_RECORDING_CHANGED') {
      isRecording = Boolean(msg.isRecording);
      updateRecordingIndicator(isRecording);
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'TESTALLY_TOGGLE_INSPECTOR') {
      isInspecting = Boolean(msg.enabled);
      if (isInspecting) {
        document.documentElement.style.cursor = 'crosshair';
      } else {
        clearInspectorHighlight();
      }
      sendResponse({ ok: true, isInspecting });
      return false;
    }
    if (msg.type === 'TESTALLY_SCAN_PAGE_ELEMENTS') {
      const elements = scanInteractiveElements();
      sendResponse({
        ok: true,
        pageUrl: window.location.href,
        pageTitle: document.title,
        elements,
      });
      return false;
    }
    if (msg.type === 'TESTALLY_CHECK_SELECTORS') {
      const selectors = Array.isArray(msg.selectors) ? msg.selectors : [];
      const results = {};
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (!el) {
            results[sel] = 'hidden';
          } else {
            const style = window.getComputedStyle(el);
            const isVisible =
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              el.offsetParent !== null;
            results[sel] = !isVisible ? 'hidden' : el.disabled ? 'disabled' : 'visible';
          }
        } catch {
          results[sel] = 'not_checked';
        }
      }
      sendResponse({ ok: true, results });
      return false;
    }
    if (msg.type === 'TESTALLY_READ_SELECTORS_TEXT') {
      const selectors = Array.isArray(msg.selectors) ? msg.selectors : [];
      const values = {};
      for (const sel of selectors) {
        if (sel === 'PAGE_BODY') {
          values[sel] = {
            found: true,
            text: (document.body?.innerText || '').trim().slice(0, 8000),
          };
          continue;
        }
        try {
          const el = document.querySelector(sel);
          if (!el) {
            values[sel] = { found: false, text: '' };
          } else {
            const raw =
              'value' in el &&
              ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
                ? String(el.value || '')
                : String(el.innerText || el.textContent || '');
            values[sel] = { found: true, text: raw.trim().slice(0, 2000) };
          }
        } catch {
          values[sel] = { found: false, text: '' };
        }
      }
      sendResponse({
        ok: true,
        pageUrl: window.location.href,
        pageTitle: document.title,
        pageBodySample: (document.body?.innerText || '').trim().slice(0, 8000),
        values,
      });
      return false;
    }
    if (msg.type === 'TESTALLY_SELF_ALERT_FIRED' && msg.alert) {
      showOnPageSelfAlert(msg.alert);
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'VERIPULSE_FAKE_GPS_UPDATED') {
      broadcastFakeGpsToMain(msg.config || { enabled: false });
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'VERIPULSE_SCAN_FORM_FIELDS') {
      const fields = scanFormFieldsForAutofill();
      sendResponse({
        ok: true,
        pageUrl: window.location.href,
        pageTitle: document.title || window.location.pathname,
        pageTextSample: (document.body?.innerText || '').trim().slice(0, 4500),
        fields,
      });
      return false;
    }
    if (msg.type === 'VERIPULSE_AUTOFILL_FIELDS') {
      const result = autofillWindowFields(msg.fields);
      sendResponse(result);
      return false;
    }
    if (msg.type === 'VERIPULSE_PROBE_GEO') {
      const requestId = `vp_geo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onGeoRes);
        sendResponse({
          ok: false,
          error: 'Timed out waiting for page geolocation response.',
        });
      }, 6500);
      function onGeoRes(ev) {
        if (
          ev.source !== window ||
          !ev.data ||
          ev.data.source !== 'VERIPULSE_PROBE_GEO_RES' ||
          ev.data.requestId !== requestId
        ) {
          return;
        }
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('message', onGeoRes);
        sendResponse(ev.data);
      }
      window.addEventListener('message', onGeoRes);
      window.postMessage({ source: 'VERIPULSE_PROBE_GEO_REQ', requestId }, '*');
      return true;
    }
    if (msg.type === 'VERIPULSE_MANUAL_ACTION') {
      sendResponse(runManualPageAction(msg.action));
      return false;
    }
    return false;
  });

  let pasteUnlocked = false;
  function runManualPageAction(action) {
    if (action === 'reveal_passwords') {
      const inputs = Array.from(
        document.querySelectorAll('input[type="password"], input[data-vp-pw="1"]')
      );
      if (inputs.length === 0) {
        return { ok: true, count: 0, summary: 'No password inputs found on this page.' };
      }
      let revealedCount = 0;
      let maskedCount = 0;
      for (const el of inputs) {
        if (el.type === 'password') {
          el.dataset.vpPw = '1';
          el.type = 'text';
          revealedCount += 1;
        } else {
          el.type = 'password';
          delete el.dataset.vpPw;
          maskedCount += 1;
        }
      }
      return {
        ok: true,
        count: revealedCount || maskedCount,
        summary:
          revealedCount > 0
            ? `Revealed ${revealedCount} password field(s).`
            : `Re-masked ${maskedCount} password field(s).`,
      };
    }

    if (action === 'unlock_paste') {
      if (!pasteUnlocked) {
        pasteUnlocked = true;
        ['paste', 'copy', 'cut', 'contextmenu', 'selectstart'].forEach((evName) => {
          window.addEventListener(
            evName,
            (ev) => {
              ev.stopImmediatePropagation();
            },
            true
          );
        });
      }
      const controls = Array.from(document.querySelectorAll('input, textarea'));
      controls.forEach((el) => {
        el.onpaste = null;
        el.oncopy = null;
        el.oncut = null;
        el.oncontextmenu = null;
        el.removeAttribute('onpaste');
        el.removeAttribute('oncopy');
      });
      if (document.body) {
        document.body.oncontextmenu = null;
        document.body.style.userSelect = 'text';
      }
      return {
        ok: true,
        count: controls.length,
        summary: `Unlocked paste, copy & right-click across ${controls.length} input(s).`,
      };
    }

    if (action === 'bypass_html5') {
      const forms = Array.from(document.querySelectorAll('form'));
      forms.forEach((f) => {
        f.noValidate = true;
      });
      const controls = Array.from(
        document.querySelectorAll('input, textarea, select, button')
      );
      let modified = 0;
      controls.forEach((el) => {
        if (
          el.hasAttribute('required') ||
          el.hasAttribute('maxlength') ||
          el.hasAttribute('pattern') ||
          el.hasAttribute('min') ||
          el.hasAttribute('max') ||
          el.disabled ||
          el.readOnly
        ) {
          modified += 1;
        }
        el.removeAttribute('required');
        el.removeAttribute('maxlength');
        el.removeAttribute('pattern');
        el.removeAttribute('min');
        el.removeAttribute('max');
        el.disabled = false;
        el.readOnly = false;
      });
      return {
        ok: true,
        count: modified,
        summary: `Bypassed HTML5 constraints on ${modified} control(s) across ${forms.length} form(s) for server validation testing.`,
      };
    }

    if (action === 'scan_ui_glitches') {
      const brokenImgs = [];
      document.querySelectorAll('img').forEach((img) => {
        if (!img.complete || img.naturalWidth === 0) {
          img.dataset.vpQaOutline = img.style.outline || '';
          img.style.outline = '3px dashed #e11d48';
          brokenImgs.push(img.getAttribute('src') || '(no src)');
        }
      });
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const overflowItems = [];
      document.querySelectorAll('body *').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > vw + 1) {
          el.dataset.vpQaOutline = el.style.outline || '';
          el.style.outline = '2px solid #f59e0b';
          overflowItems.push(`${el.tagName.toLowerCase()} (+${Math.round(rect.right - vw)}px)`);
        }
      });
      const details = [
        ...brokenImgs.slice(0, 5).map((s) => `Broken IMG: ${s.slice(0, 60)}`),
        ...overflowItems.slice(0, 5).map((o) => `Overflow: ${o}`),
      ];
      return {
        ok: true,
        count: brokenImgs.length + overflowItems.length,
        summary: `Found ${brokenImgs.length} broken image(s) & ${overflowItems.length} horizontal overflow element(s).`,
        details,
      };
    }

    if (action === 'highlight_testids') {
      const nodes = Array.from(
        document.querySelectorAll('[data-testid], button, input, select, textarea, a[href]')
      );
      nodes.forEach((el) => {
        el.dataset.vpQaOutline = el.style.outline || '';
        el.style.outline = '1.5px dashed #7c3aed';
        const tid = el.getAttribute('data-testid');
        if (tid) {
          el.title = `[data-testid="${tid}"]`;
        } else if (el.getAttribute('name') || el.id) {
          el.title = el.getAttribute('name') || `#${el.id}`;
        }
      });
      return {
        ok: true,
        count: nodes.length,
        summary: `Outlined ${nodes.length} interactive control(s) & [data-testid] hooks.`,
      };
    }

    if (action === 'show_hidden_fields') {
      const hiddens = Array.from(document.querySelectorAll('input[type="hidden"]'));
      const details = hiddens.slice(0, 10).map((el) => {
        const key = el.name || el.id || 'unnamed';
        const raw = String(el.value || '');
        const masked = /token|secret|csrf|auth|key/i.test(key)
          ? `${raw.slice(0, 4)}***`
          : raw.slice(0, 40);
        return `${key} = "${masked}"`;
      });
      return {
        ok: true,
        count: hiddens.length,
        summary: `Detected ${hiddens.length} hidden form input(s) on this page.`,
        details,
      };
    }

    if (action === 'clear_storage') {
      const lsCount = localStorage.length;
      const ssCount = sessionStorage.length;
      localStorage.clear();
      sessionStorage.clear();
      return {
        ok: true,
        count: lsCount + ssCount,
        summary: `Cleared ${lsCount} localStorage & ${ssCount} sessionStorage key(s) on this site.`,
      };
    }

    if (action === 'reset_highlights') {
      let cleared = 0;
      document.querySelectorAll('[data-vp-qa-outline]').forEach((el) => {
        el.style.outline = el.dataset.vpQaOutline || '';
        delete el.dataset.vpQaOutline;
        cleared += 1;
      });
      return {
        ok: true,
        count: cleared,
        summary: `Cleared ${cleared} temporary QA outline(s).`,
      };
    }

    return { ok: false, error: 'Unknown manual QA action.' };
  }

  function showOnPageSelfAlert(alert) {
    const existing = document.getElementById('testally-self-alert-popup');
    if (existing) existing.remove();

    const box = document.createElement('div');
    box.id = 'testally-self-alert-popup';
    box.setAttribute('role', 'alertdialog');
    box.style.cssText =
      'position:fixed;top:20px;right:20px;z-index:2147483647;max-width:340px;width:calc(100% - 40px);background:#0f172a;color:#f8fafc;border:2px solid #f59e0b;border-radius:14px;padding:14px 16px;box-shadow:0 16px 36px rgba(15,23,42,0.38);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;';

    const badge = document.createElement('span');
    badge.textContent = 'VeriPulse Self Alert';
    badge.style.cssText =
      'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#fbbf24;';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Dismiss';
    closeBtn.style.cssText =
      'background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:600;cursor:pointer;';
    closeBtn.addEventListener('click', () => {
      box.remove();
      chrome.runtime.sendMessage({ type: 'TESTALLY_DISMISS_FIRED_ALERT' });
    });

    header.appendChild(badge);
    header.appendChild(closeBtn);

    const titleEl = document.createElement('div');
    titleEl.textContent = alert.title || 'Scheduled QA Reminder';
    titleEl.style.cssText = 'font-size:13px;font-weight:700;margin-bottom:4px;color:#ffffff;';

    const msgEl = document.createElement('div');
    msgEl.textContent = alert.message || '';
    msgEl.style.cssText = 'font-size:12px;line-height:1.45;color:#cbd5e1;';

    box.appendChild(header);
    box.appendChild(titleEl);
    box.appendChild(msgEl);
    document.body.appendChild(box);
  }

  function updateRecordingIndicator(active) {
    const existing = document.getElementById('testally-rec-indicator');
    if (!active) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const badge = document.createElement('div');
    badge.id = 'testally-rec-indicator';
    badge.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:2147483646;display:flex;align-items:center;gap:8px;background:#0f172a;color:#f8fafc;border:1.5px solid #e11d48;border-radius:10px;padding:7px 12px;font-size:11px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(15,23,42,0.3);pointer-events:none;';
    const dot = document.createElement('span');
    dot.style.cssText =
      'width:8px;height:8px;border-radius:9999px;background:#f43f5e;display:inline-block;';
    const label = document.createElement('span');
    label.textContent = 'VeriPulse REC • Codegen Active';
    badge.appendChild(dot);
    badge.appendChild(label);
    if (document.body) {
      document.body.appendChild(badge);
    }
  }

  function updateFakeGpsBadge(cfg) {
    const existing = document.getElementById('veripulse-gps-badge');
    if (!cfg || !cfg.enabled || cfg.showFloatingBadge === false) {
      if (existing) existing.remove();
      return;
    }
    if (!document.body) return;

    const latStr = Number(cfg.latitude).toFixed(4);
    const lngStr = Number(cfg.longitude).toFixed(4);
    const labelStr = cfg.locationLabel ? `${cfg.locationLabel} · ` : '';

    if (existing) {
      const textEl = existing.querySelector('[data-vp-gps-text]');
      if (textEl) {
        textEl.textContent = `Fake GPS ON · ${labelStr}${latStr}, ${lngStr}`;
      }
      return;
    }

    const badge = document.createElement('div');
    badge.id = 'veripulse-gps-badge';
    badge.style.cssText =
      'position:fixed;bottom:16px;left:16px;z-index:2147483645;display:flex;align-items:center;gap:8px;background:#0f172a;color:#f8fafc;border:1.5px solid #06b6d4;border-radius:10px;padding:6px 11px;font-size:11px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(15,23,42,0.3);pointer-events:none;';
    const dot = document.createElement('span');
    dot.style.cssText =
      'width:8px;height:8px;border-radius:9999px;background:#22d3ee;display:inline-block;flex-shrink:0;';
    const label = document.createElement('span');
    label.setAttribute('data-vp-gps-text', '1');
    label.textContent = `Fake GPS ON · ${labelStr}${latStr}, ${lngStr}`;
    badge.appendChild(dot);
    badge.appendChild(label);
    document.body.appendChild(badge);
  }
})();
