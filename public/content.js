// VeriPulse — Content Script (DOM Recorder, Element Inspector, Coverage Scanner, Permission Probe)
// Privacy & Security: Never captures raw passwords or sensitive tokens; never auto-submits forms.

(() => {
  if (window.__testallyInjected) return;
  window.__testallyInjected = true;

  let isRecording = false;
  let isInspecting = false;
  let highlightedEl = null;
  let previousOutline = '';
  const SENSITIVE_RE = /password|passwd|secret|token|auth|bearer|api[_-]?key|ssn|salary|cvv/i;

  try {
    chrome.runtime.sendMessage({ type: 'TESTALLY_GET_STATUS' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.recording?.isRecording) {
        isRecording = true;
        updateRecordingIndicator(true);
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
    return false;
  });

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
})();
