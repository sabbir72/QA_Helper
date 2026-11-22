// VeriPulse — Manifest V3 Background Service Worker
// Local-first: Never transmits user data or form values to external servers.

const STATE_KEY = 'veripulse_workspace_v2';
const LEGACY_KEYS = ['root_state_v1', 'testally_last_scan', 'testally_last_inspected', 'testally_recording_state', 'testally_self_alerts_v1', 'testally_fired_alert_v1'];
const PREFS_KEY = 'testally_preferences_v1';
const RECORDING_KEY = 'testally_recording_state';
const INSPECTED_KEY = 'testally_last_inspected';
const ALERTS_KEY = 'testally_self_alerts_v1';
const FIRED_ALERT_KEY = 'testally_fired_alert_v1';
const FAKE_GPS_KEY = 'veripulse_fake_gps_v1';
const LAST_SCAN_KEY = 'testally_last_scan';
const SYNC_CONN_KEY = 'veripulse_ext_sync_conn_v1';

const DEFAULT_ZERO_WORKSPACE = {
  version: 1,
  activeProjectId: 'proj_default',
  settings: {
    theme: 'light',
    screenshotConsentGranted: false,
    maskSensitivePatterns: 'password|passwd|secret|token|auth|bearer|api_key|ssn|pin|cvv',
  },
  projects: [
    {
      id: 'proj_default',
      name: 'My QA Workspace',
      domain: 'app.example.com',
      activeEnvironment: 'staging',
      flows: [],
      rbacRules: [],
      customRoles: [],
      customTestRules: [],
      contentAssertions: [],
      formulaChecks: [],
      visualChecks: [],
      stateTransitions: [],
      dateTimeRules: [],
      dataDependencies: [],
      businessDocs: [],
      businessNotes: [],
      discussionPoints: [],
      businessPolicies: [],
      bugReports: [],
      testCases: [],
      notices: [],
      approvalChain: [],
      approvalSketches: [],
      savedGpsLocations: [],
    },
  ],
  recycleBin: [],
};

const DEFAULT_ZERO_GPS = {
  enabled: false,
  latitude: 23.8103,
  longitude: 90.4125,
  accuracy: 15,
  altitude: 12,
  heading: 0,
  speed: 0,
  locationLabel: 'Dhaka, Bangladesh',
  simulateMovement: false,
  routeEndLat: 23.8759,
  routeEndLng: 90.3795,
  routeIntervalSec: 3,
  showFloatingBadge: true,
  updatedAt: new Date(0).toISOString(),
};

const DEFAULT_ZERO_SCAN = {
  ok: true,
  pageUrl: '',
  pageTitle: 'No page scanned yet',
  elements: [],
};

let pushSyncTimer = null;

function broadcastFakeGpsToTabs(cfg) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id && tab.url && /^https?:\/\//i.test(tab.url)) {
        if (chrome.scripting && chrome.scripting.executeScript) {
          chrome.scripting
            .executeScript({
              target: { tabId: tab.id },
              files: ['geo-spoof.js'],
              world: 'MAIN',
            })
            .catch(() => {});
        }
        chrome.tabs
          .sendMessage(tab.id, {
            type: 'VERIPULSE_FAKE_GPS_UPDATED',
            config: cfg,
          })
          .catch(() => {});
      }
    }
  });
}

async function applyUserBundleToExtensionStorage(bundle, syncConn) {
  const ws = bundle.workspace || DEFAULT_ZERO_WORKSPACE;
  const fakeGps = bundle.fakeGps || DEFAULT_ZERO_GPS;
  const alerts = Array.isArray(bundle.alerts) ? bundle.alerts : [];
  const rec = bundle.recording || { isRecording: false, recordedSteps: [] };
  const lastScan = bundle.lastScan || DEFAULT_ZERO_SCAN;
  const inspected = bundle.inspected || null;

  return new Promise((resolve) => {
    const payload = {
      [STATE_KEY]: ws,
      [FAKE_GPS_KEY]: fakeGps,
      [ALERTS_KEY]: alerts,
      [RECORDING_KEY]: rec,
      [LAST_SCAN_KEY]: lastScan,
      [INSPECTED_KEY]: inspected,
      [FIRED_ALERT_KEY]: null,
    };
    if (syncConn !== undefined) {
      payload[SYNC_CONN_KEY] = syncConn;
    }
    chrome.storage.local.set(payload, () => {
      updateActionBadge(
        Boolean(rec.isRecording),
        (rec.recordedSteps || []).length,
        false
      );
      broadcastFakeGpsToTabs(fakeGps);
      resolve();
    });
  });
}

async function pushExtensionStateToCloud() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        SYNC_CONN_KEY,
        STATE_KEY,
        FAKE_GPS_KEY,
        ALERTS_KEY,
        RECORDING_KEY,
        LAST_SCAN_KEY,
        INSPECTED_KEY,
      ],
      async (res) => {
        const conn = res[SYNC_CONN_KEY];
        if (!conn || !conn.serverUrl || !conn.bearerToken) {
          resolve({ ok: false, error: 'Not connected to cloud account.' });
          return;
        }
        const base = String(conn.serverUrl).replace(/\/+$/, '');
        try {
          const resp = await fetch(`${base}/api/workspace`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${conn.bearerToken}`,
            },
            body: JSON.stringify({
              workspace: res[STATE_KEY] || DEFAULT_ZERO_WORKSPACE,
              fakeGps: res[FAKE_GPS_KEY] || DEFAULT_ZERO_GPS,
              alerts: Array.isArray(res[ALERTS_KEY]) ? res[ALERTS_KEY] : [],
              recording: res[RECORDING_KEY] || { isRecording: false, recordedSteps: [] },
              lastScan: res[LAST_SCAN_KEY] || DEFAULT_ZERO_SCAN,
              inspected: res[INSPECTED_KEY] || null,
            }),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data.ok) {
            resolve({ ok: false, error: data.error || `HTTP ${resp.status}` });
            return;
          }
          const updatedConn = {
            ...conn,
            lastSyncedAt: data.updatedAt || new Date().toISOString(),
          };
          chrome.storage.local.set({ [SYNC_CONN_KEY]: updatedConn }, () => {
            resolve({ ok: true, updatedAt: updatedConn.lastSyncedAt });
          });
        } catch (err) {
          resolve({
            ok: false,
            error: err instanceof Error ? err.message : 'Network error',
          });
        }
      }
    );
  });
}

function scheduleCloudSyncPush() {
  if (pushSyncTimer) clearTimeout(pushSyncTimer);
  pushSyncTimer = setTimeout(() => {
    pushExtensionStateToCloud();
  }, 600);
}

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
      [
        STATE_KEY,
        PREFS_KEY,
        RECORDING_KEY,
        INSPECTED_KEY,
        ALERTS_KEY,
        FIRED_ALERT_KEY,
        FAKE_GPS_KEY,
        SYNC_CONN_KEY,
      ],
      (res) => {
        sendResponse({
          workspace: res[STATE_KEY] || null,
          preferences: res[PREFS_KEY] || { theme: 'light' },
          recording: res[RECORDING_KEY] || { isRecording: false, recordedSteps: [] },
          inspected: res[INSPECTED_KEY] || null,
          alerts: Array.isArray(res[ALERTS_KEY]) ? res[ALERTS_KEY] : [],
          firedAlert: res[FIRED_ALERT_KEY] || null,
          fakeGps: res[FAKE_GPS_KEY] || null,
          syncConn: res[SYNC_CONN_KEY] || null,
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
        scheduleCloudSyncPush();
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
          scheduleCloudSyncPush();
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
        scheduleCloudSyncPush();
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
          scheduleCloudSyncPush();
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
          scheduleCloudSyncPush();
          sendResponse({ ok: true });
        }
      );
    });
    return true;
  }

  if (message.type === 'TESTALLY_ELEMENT_INSPECTED') {
    chrome.storage.local.set({ [INSPECTED_KEY]: message.element || null }, () => {
      scheduleCloudSyncPush();
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

  if (message.type === 'VERIPULSE_SET_FAKE_GPS') {
    const cfg = message.config || { enabled: false };
    chrome.storage.local.set({ [FAKE_GPS_KEY]: cfg }, () => {
      broadcastFakeGpsToTabs(cfg);
      scheduleCloudSyncPush();
      sendResponse({ ok: true, fakeGps: cfg });
    });
    return true;
  }

  if (message.type === 'VERIPULSE_CONNECT_SYNC') {
    const serverUrl = String(message.serverUrl || '').replace(/\/+$/, '');
    const bearerToken = String(message.bearerToken || '').trim();
    if (!serverUrl || !bearerToken) {
      sendResponse({ ok: false, error: 'Missing server URL or sync token.' });
      return false;
    }
    fetch(`${serverUrl}/api/workspace`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(async ({ ok, d }) => {
        if (!ok || !d?.ok || !d?.user || !d?.bundle) {
          sendResponse({
            ok: false,
            error: d?.error || 'Could not verify account token with web server.',
          });
          return;
        }
        const syncConn = {
          user: d.user,
          serverUrl,
          bearerToken,
          lastSyncedAt: d.bundle.updatedAt || new Date().toISOString(),
        };
        await applyUserBundleToExtensionStorage(d.bundle, syncConn);
        sendResponse({ ok: true, user: d.user, syncConn });
      })
      .catch((err) => {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to reach web server.',
        });
      });
    return true;
  }

  if (message.type === 'VERIPULSE_PULL_SYNC') {
    chrome.storage.local.get([SYNC_CONN_KEY], (res) => {
      const conn = res[SYNC_CONN_KEY];
      if (!conn || !conn.serverUrl || !conn.bearerToken) {
        sendResponse({ ok: false, error: 'Extension is not connected to any account.' });
        return;
      }
      const base = String(conn.serverUrl).replace(/\/+$/, '');
      fetch(`${base}/api/workspace`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${conn.bearerToken}` },
      })
        .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
        .then(async ({ ok, d }) => {
          if (!ok || !d?.ok || !d?.bundle) {
            sendResponse({ ok: false, error: d?.error || 'Sync failed.' });
            return;
          }
          const updatedConn = {
            ...conn,
            user: d.user || conn.user,
            lastSyncedAt: d.bundle.updatedAt || new Date().toISOString(),
          };
          await applyUserBundleToExtensionStorage(d.bundle, updatedConn);
          sendResponse({ ok: true, user: updatedConn.user, syncConn: updatedConn });
        })
        .catch((err) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'Network error.',
          });
        });
    });
    return true;
  }

  if (message.type === 'VERIPULSE_PUSH_SYNC') {
    pushExtensionStateToCloud().then((res) => sendResponse(res));
    return true;
  }

  if (message.type === 'VERIPULSE_DISCONNECT_SYNC') {
    if (chrome.alarms && chrome.alarms.clearAll) {
      chrome.alarms.clearAll();
    }
    applyUserBundleToExtensionStorage(
      {
        workspace: DEFAULT_ZERO_WORKSPACE,
        fakeGps: DEFAULT_ZERO_GPS,
        alerts: [],
        recording: { isRecording: false, recordedSteps: [] },
        lastScan: DEFAULT_ZERO_SCAN,
        inspected: null,
      },
      null
    ).then(() => {
      chrome.storage.local.remove([SYNC_CONN_KEY], () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  return false;
});
