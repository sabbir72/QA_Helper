document.addEventListener('DOMContentLoaded', () => {
  const currentSiteEl = document.getElementById('current-site');
  const projNameEl = document.getElementById('proj-name');
  const projEnvEl = document.getElementById('proj-env');
  const recCountEl = document.getElementById('rec-count');
  const toggleBtn = document.getElementById('toggle-rec-btn');
  const inspectBtn = document.getElementById('inspect-el-btn');
  const scanBtn = document.getElementById('scan-cov-btn');
  const openDashBtn = document.getElementById('open-dash-btn');
  const openSidePanelBtn = document.getElementById('open-sidepanel-btn');
  const openSettingsBtn = document.getElementById('open-settings-btn');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const langToggleBtn = document.getElementById('lang-toggle-btn');
  const statusMsg = document.getElementById('status-msg');

  const firedAlertBox = document.getElementById('fired-alert-box');
  const firedAlertTag = document.getElementById('fired-alert-tag');
  const firedAlertTitle = document.getElementById('fired-alert-title');
  const firedAlertMsg = document.getElementById('fired-alert-msg');
  const dismissAlertBtn = document.getElementById('dismiss-alert-btn');

  const alertCardTitle = document.getElementById('alert-card-title');
  const openAlertsBtn = document.getElementById('open-alerts-btn');
  const quickAlertText = document.getElementById('quick-alert-text');
  const quickAlertMins = document.getElementById('quick-alert-mins');
  const alertMinsLabel = document.getElementById('alert-mins-label');
  const setAlertBtn = document.getElementById('set-alert-btn');

  let isRecording = false;
  let currentTheme = 'light';
  let currentLang = 'en';

  try {
    currentLang = localStorage.getItem('testally_lang') === 'bn' ? 'bn' : 'en';
  } catch {
    currentLang = 'en';
  }

  function applyTheme(theme) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    if (currentTheme === 'dark') {
      document.documentElement.classList.add('dark');
      themeToggleBtn.textContent = currentLang === 'bn' ? 'লাইট' : 'Light';
    } else {
      document.documentElement.classList.remove('dark');
      themeToggleBtn.textContent = currentLang === 'bn' ? 'ডার্ক' : 'Dark';
    }
  }

  function applyLanguage(lang) {
    currentLang = lang === 'bn' ? 'bn' : 'en';
    const subEl = document.querySelector('.brand-sub');
    if (subEl) {
      subEl.textContent =
        currentLang === 'bn'
          ? 'স্মার্ট SQA স্টুডিও ও এক্সটেনশন'
          : 'Precision SQA Studio & Extension';
    }
    if (langToggleBtn) {
      langToggleBtn.textContent = currentLang === 'bn' ? 'EN' : 'বাংলা';
    }
    if (alertCardTitle) {
      alertCardTitle.textContent =
        currentLang === 'bn' ? 'সেলফ অ্যালার্ট টাইমার' : 'Quick Self Alert';
    }
    if (openAlertsBtn) {
      openAlertsBtn.textContent =
        currentLang === 'bn' ? 'সব অ্যালার্ট →' : 'All Timers →';
    }
    if (quickAlertText) {
      quickAlertText.placeholder =
        currentLang === 'bn'
          ? 'অ্যালার্ট মেসেজ লিখুন (যেমন: টেস্ট চেক করুন)'
          : 'Alert message (e.g. Check staging build)';
    }
    if (alertMinsLabel) {
      alertMinsLabel.textContent = currentLang === 'bn' ? 'মি.' : 'min';
    }
    if (setAlertBtn) {
      setAlertBtn.textContent =
        currentLang === 'bn' ? 'অ্যালার্ট সেট করুন' : 'Set Self Alert';
    }
    if (firedAlertTag) {
      firedAlertTag.textContent =
        currentLang === 'bn' ? 'সেলফ অ্যালার্ট এসেছে!' : 'Self Alert Triggered';
    }
    if (dismissAlertBtn) {
      dismissAlertBtn.textContent = currentLang === 'bn' ? 'বন্ধ করুন' : 'Dismiss';
    }

    inspectBtn.textContent =
      currentLang === 'bn' ? 'এলিমেন্ট পিকার' : 'Pick Element';
    scanBtn.textContent =
      currentLang === 'bn' ? 'কন্ট্রোল স্ক্যান' : 'Scan Controls';
    openDashBtn.textContent =
      currentLang === 'bn' ? 'ওয়ার্কস্পেস খুলুন' : 'Open Workspace';
    if (openSidePanelBtn) {
      openSidePanelBtn.textContent =
        currentLang === 'bn' ? 'সাইড প্যানেল' : 'Side Panel';
    }
    openSettingsBtn.textContent =
      currentLang === 'bn' ? 'এক্সটেনশন সেটিংস' : 'Extension Settings';
    applyTheme(currentTheme);
    renderRecordingButton();
  }

  function renderRecordingButton() {
    if (currentLang === 'bn') {
      toggleBtn.textContent = isRecording
        ? 'রেকর্ডিং বন্ধ করুন'
        : 'স্টেপ রেকর্ডিং শুরু করুন';
    } else {
      toggleBtn.textContent = isRecording
        ? 'Stop Recording Steps'
        : 'Start Recording Steps';
    }
    toggleBtn.className = isRecording ? 'btn btn-danger' : 'btn';
  }

  function renderFiredAlert(alert) {
    if (!firedAlertBox) return;
    if (!alert) {
      firedAlertBox.style.display = 'none';
      return;
    }
    firedAlertTitle.textContent = alert.title || 'VeriPulse Self Alert';
    firedAlertMsg.textContent = alert.message || '';
    firedAlertBox.style.display = 'block';
  }

  function ensureContentScriptAndSend(tabId, message, onResponse) {
    chrome.tabs.sendMessage(tabId, message, (res) => {
      if (!chrome.runtime.lastError && res) {
        onResponse(res);
        return;
      }
      if (chrome.scripting && chrome.scripting.executeScript) {
        chrome.scripting.executeScript(
          { target: { tabId }, files: ['content.js'] },
          () => {
            if (chrome.runtime.lastError) {
              onResponse(null);
              return;
            }
            chrome.tabs.sendMessage(tabId, message, (retryRes) => {
              if (chrome.runtime.lastError) {
                onResponse(null);
              } else {
                onResponse(retryRes);
              }
            });
          }
        );
      } else {
        onResponse(null);
      }
    });
  }

  applyLanguage(currentLang);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const urlStr = tabs[0]?.url;
    if (!urlStr) {
      currentSiteEl.textContent = 'Unavailable';
      return;
    }
    try {
      const parsed = new URL(urlStr);
      currentSiteEl.textContent = parsed.host || parsed.protocol;
      currentSiteEl.title = urlStr;
    } catch {
      currentSiteEl.textContent = urlStr;
    }
  });

  chrome.runtime.sendMessage({ type: 'TESTALLY_GET_STATUS' }, (res) => {
    if (!res) return;
    if (res.preferences?.theme) {
      applyTheme(res.preferences.theme);
    } else if (res.workspace?.settings?.theme) {
      applyTheme(res.workspace.settings.theme);
    }

    if (res.workspace && Array.isArray(res.workspace.projects)) {
      const active =
        res.workspace.projects.find(
          (p) => p.id === res.workspace.activeProjectId
        ) || res.workspace.projects[0];
      if (active) {
        projNameEl.textContent = active.name;
        projEnvEl.textContent = active.activeEnvironment;
      }
    }
    if (res.recording) {
      isRecording = Boolean(res.recording.isRecording);
      recCountEl.textContent = String((res.recording.recordedSteps || []).length);
      renderRecordingButton();
    }
    renderFiredAlert(res.firedAlert || null);
  });

  if (dismissAlertBtn) {
    dismissAlertBtn.addEventListener('click', () => {
      renderFiredAlert(null);
      chrome.runtime.sendMessage({ type: 'TESTALLY_DISMISS_FIRED_ALERT' });
    });
  }

  if (setAlertBtn) {
    setAlertBtn.addEventListener('click', () => {
      const mins = Math.max(1, Number(quickAlertMins.value) || 5);
      const msgText =
        (quickAlertText.value || '').trim() ||
        (currentLang === 'bn'
          ? 'আপনার QA চেক করার সময় হয়েছে!'
          : 'Time to run your scheduled QA check!');
      const alertObj = {
        id: `alert_${Date.now()}`,
        title: currentLang === 'bn' ? 'VeriPulse রিমাইন্ডার' : 'VeriPulse QA Reminder',
        message: msgText,
        mode: 'timer',
        durationMinutes: mins,
        triggerAt: Date.now() + mins * 60 * 1000,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
      };
      chrome.runtime.sendMessage(
        { type: 'TESTALLY_SCHEDULE_ALERT', alert: alertObj },
        () => {
          quickAlertText.value = '';
          statusMsg.textContent =
            currentLang === 'bn'
              ? `${mins} মিনিট পর আপনাকে নোটিফিকেশন ও পপআপ দেওয়া হবে।`
              : `Self alert scheduled for ${mins} minute(s) from now.`;
        }
      );
    });
  }

  if (openAlertsBtn) {
    openAlertsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'TESTALLY_OPEN_DASHBOARD',
        section: 'alerts',
      });
    });
  }

  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      const next = currentLang === 'bn' ? 'en' : 'bn';
      try {
        localStorage.setItem('testally_lang', next);
      } catch {
        // Ignore
      }
      applyLanguage(next);
    });
  }

  themeToggleBtn.addEventListener('click', () => {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    chrome.runtime.sendMessage({ type: 'TESTALLY_SET_THEME', theme: next });
  });

  toggleBtn.addEventListener('click', () => {
    isRecording = !isRecording;
    chrome.runtime.sendMessage(
      { type: 'TESTALLY_SET_RECORDING', isRecording },
      () => {
        renderRecordingButton();
        if (currentLang === 'bn') {
          statusMsg.textContent = isRecording
            ? 'রেকর্ডিং শুরু! পেজে ক্লিক/টাইপ করুন — পাসওয়ার্ড গোপন থাকবে।'
            : 'রেকর্ডিং থামানো হয়েছে। স্টেপ দেখতে ওয়ার্কস্পেস খুলুন।';
        } else {
          statusMsg.textContent = isRecording
            ? 'Recording started! Interact with the webpage — passwords stay hidden automatically.'
            : 'Recording paused. Open Workspace to review captured steps.';
        }
      }
    );
  });

  inspectBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      ensureContentScriptAndSend(
        tabId,
        { type: 'TESTALLY_TOGGLE_INSPECTOR', enabled: true },
        (res) => {
          if (!res?.ok) {
            statusMsg.textContent =
              currentLang === 'bn'
                ? 'ব্রাউজারের ইন্টারনাল পেজে পিকার কাজ করে না। যেকোনো ওয়েবসাইটে চেষ্টা করুন।'
                : 'Picker is unavailable on internal browser pages (chrome://). Try any regular webpage.';
            return;
          }
          statusMsg.textContent =
            currentLang === 'bn'
              ? 'এলিমেন্ট পিকার চালু! পেজের যেকোনো বাটন বা ফিল্ডে ক্লিক করুন।'
              : 'Element Picker ready! Click any button or field on the page to grab its locator.';
        }
      );
    });
  });

  scanBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      ensureContentScriptAndSend(
        tabId,
        { type: 'TESTALLY_SCAN_PAGE_ELEMENTS' },
        (res) => {
          if (!res?.ok) {
            statusMsg.textContent =
              currentLang === 'bn'
                ? 'এই ট্যাবটি স্ক্যান করা যাচ্ছে না। একটি সাধারণ ওয়েবপেজ খুলুন।'
                : 'Unable to scan this tab. Switch to any http/https webpage and try again.';
            return;
          }
          chrome.storage.local.set({ testally_last_scan: res }, () => {
            statusMsg.textContent =
              currentLang === 'bn'
                ? `"${res.pageTitle}" পেজে ${res.elements.length}টি কন্ট্রোল পাওয়া গেছে।`
                : `Found ${res.elements.length} interactive controls on "${res.pageTitle}". Open Workspace to review.`;
          });
        }
      );
    });
  });

  openDashBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TESTALLY_OPEN_DASHBOARD' });
  });

  if (openSidePanelBtn) {
    openSidePanelBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'TESTALLY_OPEN_SIDEPANEL' }, () => {
        window.close();
      });
    });
  }

  openSettingsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'TESTALLY_OPEN_DASHBOARD',
      section: 'settings',
    });
  });
});
