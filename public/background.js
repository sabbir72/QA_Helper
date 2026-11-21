// VeriPulse — Manifest V3 Background Service Worker
// Local-first: Never transmits user data or form values to external servers.

const STATE_KEY = 'veripulse_workspace_v2';
const LEGACY_KEYS = ['root_state_v1', 'testally_last_scan', 'testally_last_inspected', 'testally_recording_state', 'testally_self_alerts_v1', 'testally_fired_alert_v1'];
const PREFS_KEY = 'testally_preferences_v1';
const RECORDING_KEY = 'testally_recording_state';
const INSPECTED_KEY = 'testally_last_inspected';
const ALERTS_KEY = 'testally_self_alerts_v1';
const FIRED_ALERT_KEY = 'testally_fired_alert_v1';

function updateActionBadge(isRecording, stepCount, hasAlert) {
  if (!chrome.action) return;
  if (isRecording) {
    chrome.action.setBadgeText({ text: stepCount > 0 ? String(stepCount) : 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#e11d48' });
  } else if (hasAlert) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ea580c' });
  } else {
    chrome.action.setBadgeText({ text: stepCount > 0 ? String(stepCount) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details && details.reason === 'install') {
    chrome.storage.local.remove(LEGACY_KEYS, () => {});
  }
  chrome.storage.local.get([RECORDING_KEY, ALERTS_KEY, FIRED_ALERT_KEY], (res) => {
    if (!res[RECORDING_KEY]) {
      chrome.storage.local.set({
        [RECORDING_KEY]: { isRecording: false, recordedSteps: [] },
      });
    } else {
      const rec = res[RECORDING_KEY];
      updateActionBadge(
        Boolean(rec.isRecording),
        (rec.recordedSteps || []).length,
        Boolean(res[FIRED_ALERT_KEY])
      );
    }

    // Re-arm any pending scheduled alarms after browser restart/update
    const alerts = Array.isArray(res[ALERTS_KEY]) ? res[ALERTS_KEY] : [];
    const now = Date.now();
    for (const alert of alerts) {
      if (alert.status === 'scheduled' && alert.triggerAt > now && chrome.alarms) {
        chrome.alarms.create(alert.id, { when: alert.triggerAt });
      }
    }
  });
});

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || !alarm.name) return;
    chrome.storage.local.get([ALERTS_KEY, RECORDING_KEY], (res) => {
      const alerts = Array.isArray(res[ALERTS_KEY]) ? res[ALERTS_KEY] : [];
      const target = alerts.find((a) => a.id === alarm.name);
      if (!target) return;

      const updatedAlert = { ...target, status: 'triggered' };
      const nextAlerts = alerts.map((a) => (a.id === alarm.name ? updatedAlert : a));

      chrome.storage.local.set(
        {
          [ALERTS_KEY]: nextAlerts,
          [FIRED_ALERT_KEY]: updatedAlert,
        },
        () => {
          const rec = res[RECORDING_KEY] || { isRecording: false, recordedSteps: [] };
          updateActionBadge(
            Boolean(rec.isRecording),
            (rec.recordedSteps || []).length,
            true
          );

          // 1. OS / Chrome Desktop Notification
          if (chrome.notifications && chrome.notifications.create) {
            chrome.notifications.create(updatedAlert.id, {
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: updatedAlert.title || 'VeriPulse Self Alert',
              message: updatedAlert.message || 'Your scheduled QA timer is up!',
              priority: 2,
            });
          }

          // 2. Broadcast floating popup text alert to active tabs
          chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
              if (tab.id) {
                chrome.tabs
                  .sendMessage(tab.id, {
                    type: 'TESTALLY_SELF_ALERT_FIRED',
                    alert: updatedAlert,
                  })
                  .catch(() => {});
              }
            }
          });

          // 3. Attempt to open extension popup if supported by Chrome version
          if (chrome.action && typeof chrome.action.openPopup === 'function') {
            chrome.action.openPopup().catch(() => {});
          }
        }
      );
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'TESTALLY_GET_STATUS') {
    chrome.storage.local.get(
      [STATE_KEY, PREFS_KEY, RECORDING_KEY, INSPECTED_KEY, ALERTS_KEY, FIRED_ALERT_KEY],
      (res) => {
        sendResponse({
          workspace: res[STATE_KEY] || null,
          preferences: res[PREFS_KEY] || { theme: 'light' },
          recording: res[RECORDING_KEY] || { isRecording: false, recordedSteps: [] },
          inspected: res[INSPECTED_KEY] || null,
          alerts: Array.isArray(res[ALERTS_KEY]) ? res[ALERTS_KEY] : [],
          firedAlert: res[FIRED_ALERT_KEY] || null,
        });
      }
    );
    return true;
  }

  if (message.type === 'TESTALLY_SCHEDULE_ALERT') {
    const alert = message.alert;
    if (!alert || !alert.id || !alert.triggerAt) {
      sendResponse({ ok: false });
      return false;
    }
    chrome.storage.local.get([ALERTS_KEY], (res) => {
      const current = Array.isArray(res[ALERTS_KEY]) ? res[ALERTS_KEY] : [];
      const next = [alert, ...current.filter((a) => a.id !== alert.id)];
      chrome.storage.local.set({ [ALERTS_KEY]: next }, () => {
        if (chrome.alarms) {
          chrome.alarms.create(alert.id, { when: Number(alert.triggerAt) });
        }
        sendResponse({ ok: true, alerts: next });
      });
    });
    return true;
  }

  if (message.type === 'TESTALLY_DELETE_ALERT') {
    const id = message.id;
    if (chrome.alarms && id) {
      chrome.alarms.clear(id);
    }
    chrome.storage.local.get([ALERTS_KEY, FIRED_ALERT_KEY, RECORDING_KEY], (res) => {
      const current = Array.isArray(res[ALERTS_KEY]) ? res[ALERTS_KEY] : [];
      const next = current.filter((a) => a.id !== id);
      const fired = res[FIRED_ALERT_KEY];
      const clearFired = fired && fired.id === id ? null : fired;
      chrome.storage.local.set(
        { [ALERTS_KEY]: next, [FIRED_ALERT_KEY]: clearFired || null },
        () => {
          const rec = res[RECORDING_KEY] || { isRecording: false, recordedSteps: [] };
          updateActionBadge(
            Boolean(rec.isRecording),
            (rec.recordedSteps || []).length,
            Boolean(clearFired)
          );
          sendResponse({ ok: true, alerts: next });
        }
      );
    });
    return true;
  }

  if (message.type === 'TESTALLY_DISMISS_FIRED_ALERT') {
    chrome.storage.local.get([RECORDING_KEY], (res) => {
      chrome.storage.local.set({ [FIRED_ALERT_KEY]: null }, () => {
        const rec = res[RECORDING_KEY] || { isRecording: false, recordedSteps: [] };
        updateActionBadge(
          Boolean(rec.isRecording),
          (rec.recordedSteps || []).length,
          false
        );
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (message.type === 'TESTALLY_SET_THEME') {
    chrome.storage.local.get([PREFS_KEY], (res) => {
      const nextTheme = message.theme === 'dark' ? 'dark' : 'light';
      const current = res[PREFS_KEY] || {};
      chrome.storage.local.set(
        { [PREFS_KEY]: { ...current, theme: nextTheme } },
        () => sendResponse({ ok: true, theme: nextTheme })
      );
    });
    return true;
  }

  if (message.type === 'TESTALLY_SET_RECORDING') {
    chrome.storage.local.get([RECORDING_KEY, FIRED_ALERT_KEY], (res) => {
      const current = res[RECORDING_KEY] || { isRecording: false, recordedSteps: [] };
      const updated = {
        ...current,
        isRecording: Boolean(message.isRecording),
      };
      chrome.storage.local.set({ [RECORDING_KEY]: updated }, () => {
        updateActionBadge(
          updated.isRecording,
          (updated.recordedSteps || []).length,
          Boolean(res[FIRED_ALERT_KEY])
        );
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs
                .sendMessage(tab.id, {
                  type: 'TESTALLY_RECORDING_CHANGED',
                  isRecording: updated.isRecording,
                })
                .catch(() => {});
            }
          }
        });
        sendResponse({ ok: true, recording: updated });
      });
    });
    return true;
  }

  if (message.type === 'TESTALLY_RECORDED_EVENT') {
    chrome.storage.local.get([RECORDING_KEY, FIRED_ALERT_KEY], (res) => {
      const current = res[RECORDING_KEY] || { isRecording: false, recordedSteps: [] };
      if (!current.isRecording) {
        sendResponse({ ok: false });
        return;
      }
      const nextSteps = [...(current.recordedSteps || []), message.step];
      chrome.storage.local.set(
        { [RECORDING_KEY]: { ...current, recordedSteps: nextSteps } },
        () => {
          updateActionBadge(true, nextSteps.length, Boolean(res[FIRED_ALERT_KEY]));
          sendResponse({ ok: true, count: nextSteps.length });
        }
      );
    });
    return true;
  }

  if (message.type === 'TESTALLY_CLEAR_RECORDED') {
    chrome.storage.local.get([RECORDING_KEY, FIRED_ALERT_KEY], (res) => {
      const current = res[RECORDING_KEY] || { isRecording: false, recordedSteps: [] };
      chrome.storage.local.set(
        { [RECORDING_KEY]: { ...current, recordedSteps: [] } },
        () => {
          updateActionBadge(
            Boolean(current.isRecording),
            0,
            Boolean(res[FIRED_ALERT_KEY])
          );
          sendResponse({ ok: true });
        }
      );
    });
    return true;
  }

  if (message.type === 'TESTALLY_ELEMENT_INSPECTED') {
    chrome.storage.local.set({ [INSPECTED_KEY]: message.element || null }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'TESTALLY_CAPTURE_VISIBLE_TAB') {
    if (!message.userConsentGranted) {
      sendResponse({ ok: false, error: 'Explicit screenshot consent required.' });
      return false;
    }
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, dataUrl });
      }
    });
    return true;
  }

  if (message.type === 'TESTALLY_OPEN_DASHBOARD') {
    const hash = message.section ? `#${message.section}` : '';
    chrome.tabs.create({ url: chrome.runtime.getURL(`index.html${hash}`) });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'TESTALLY_OPEN_SIDEPANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (chrome.sidePanel && tab?.windowId) {
        chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});
