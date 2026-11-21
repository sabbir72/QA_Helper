import { DEFAULT_SCAN_RESULT, DEFAULT_WORKSPACE } from '../data/defaultWorkspace';
import {
  CoverageScanResult,
  DomObservedState,
  InspectedElement,
  PreferencesState,
  RecordedStep,
  RecordingState,
  SelfAlert,
  WorkspaceState,
} from '../types/flowguard';

export const STORAGE_KEYS = {
  WORKSPACE: 'veripulse_workspace_v2',
  PREFERENCES: 'testally_preferences_v1',
  RECORDING: 'testally_recording_state',
  INSPECTED: 'testally_last_inspected',
  LAST_SCAN: 'testally_last_scan',
  ALERTS: 'testally_self_alerts_v1',
  FIRED_ALERT: 'testally_fired_alert_v1',
} as const;

const LEGACY_STORAGE_KEYS = [
  'root_state_v1',
  'testally_recording_state',
  'testally_last_inspected',
  'testally_last_scan',
  'testally_self_alerts_v1',
  'testally_fired_alert_v1',
];

interface ChromeStorageArea {
  get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
  set: (items: Record<string, unknown>, cb?: () => void) => void;
  remove?: (keys: string[], cb?: () => void) => void;
}

interface ChromeLike {
  runtime?: {
    id?: string;
    lastError?: { message: string };
    sendMessage?: (msg: unknown, cb?: (res: unknown) => void) => void;
  };
  storage?: {
    local?: ChromeStorageArea;
    onChanged?: {
      addListener: (
        cb: (changes: Record<string, { newValue: unknown }>, areaName: string) => void
      ) => void;
      removeListener: (
        cb: (changes: Record<string, { newValue: unknown }>, areaName: string) => void
      ) => void;
    };
  };
  tabs?: {
    query: (
      queryInfo: { active: boolean; currentWindow: boolean },
      cb: (tabs: Array<{ id?: number; url?: string; title?: string }>) => void
    ) => void;
    sendMessage: (tabId: number, msg: unknown, cb?: (res: unknown) => void) => void;
  };
}

function getChrome(): ChromeLike | null {
  const g = globalThis as unknown as { chrome?: ChromeLike };
  if (g.chrome && g.chrome.runtime?.id && g.chrome.storage?.local) {
    return g.chrome;
  }
  return null;
}

export function isChromeExtensionContext(): boolean {
  return Boolean(getChrome());
}

const LOCAL_EVENT = 'testally_local_storage_sync';

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: { key, value } }));
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadInitialBundle(): Promise<{
  workspace: WorkspaceState;
  preferences: PreferencesState;
  recording: RecordingState;
  inspected: InspectedElement | null;
  lastScan: CoverageScanResult;
}> {
  const chromeApi = getChrome();
  if (chromeApi?.storage?.local) {
    return new Promise((resolve) => {
      chromeApi.storage!.local!.get(
        [
          STORAGE_KEYS.WORKSPACE,
          STORAGE_KEYS.PREFERENCES,
          STORAGE_KEYS.RECORDING,
          STORAGE_KEYS.INSPECTED,
          STORAGE_KEYS.LAST_SCAN,
        ],
        (res) => {
          const isFirstCleanBoot = !res[STORAGE_KEYS.WORKSPACE];
          const workspace =
            (res[STORAGE_KEYS.WORKSPACE] as WorkspaceState | undefined) || DEFAULT_WORKSPACE;
          const preferences =
            (res[STORAGE_KEYS.PREFERENCES] as PreferencesState | undefined) || {
              theme: workspace.settings?.theme || 'light',
            };
          const recording = isFirstCleanBoot
            ? { isRecording: false, recordedSteps: [] }
            : (res[STORAGE_KEYS.RECORDING] as RecordingState | undefined) || {
                isRecording: false,
                recordedSteps: [],
              };
          const inspected = isFirstCleanBoot
            ? null
            : (res[STORAGE_KEYS.INSPECTED] as InspectedElement | undefined) || null;
          const lastScan = isFirstCleanBoot
            ? DEFAULT_SCAN_RESULT
            : (res[STORAGE_KEYS.LAST_SCAN] as CoverageScanResult | undefined) ||
              DEFAULT_SCAN_RESULT;

          if (isFirstCleanBoot) {
            chromeApi.storage!.local!.remove?.(LEGACY_STORAGE_KEYS, () => {});
            chromeApi.storage!.local!.set({
              [STORAGE_KEYS.WORKSPACE]: workspace,
              [STORAGE_KEYS.RECORDING]: recording,
              [STORAGE_KEYS.LAST_SCAN]: lastScan,
              [STORAGE_KEYS.INSPECTED]: null,
            });
          }

          resolve({ workspace, preferences, recording, inspected, lastScan });
        }
      );
    });
  }

  const isFirstLocalBoot = !localStorage.getItem(STORAGE_KEYS.WORKSPACE);
  if (isFirstLocalBoot) {
    for (const oldKey of LEGACY_STORAGE_KEYS) {
      try {
        localStorage.removeItem(oldKey);
      } catch {
        // Ignore storage error
      }
    }
  }

  const workspace = readLocal<WorkspaceState>(STORAGE_KEYS.WORKSPACE, DEFAULT_WORKSPACE);
  if (isFirstLocalBoot) {
    writeLocal(STORAGE_KEYS.WORKSPACE, workspace);
  }
  const preferences = readLocal<PreferencesState>(STORAGE_KEYS.PREFERENCES, {
    theme: workspace.settings?.theme || 'light',
  });
  const recording = readLocal<RecordingState>(STORAGE_KEYS.RECORDING, {
    isRecording: false,
    recordedSteps: [],
  });
  const inspected = readLocal<InspectedElement | null>(STORAGE_KEYS.INSPECTED, null);
  const lastScan = readLocal<CoverageScanResult>(
    STORAGE_KEYS.LAST_SCAN,
    DEFAULT_SCAN_RESULT
  );

  return { workspace, preferences, recording, inspected, lastScan };
}

export function clearAllStoredData(): void {
  const chromeApi = getChrome();
  const cleanRecording: RecordingState = { isRecording: false, recordedSteps: [] };
  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.set({
      [STORAGE_KEYS.WORKSPACE]: DEFAULT_WORKSPACE,
      [STORAGE_KEYS.RECORDING]: cleanRecording,
      [STORAGE_KEYS.INSPECTED]: null,
      [STORAGE_KEYS.LAST_SCAN]: DEFAULT_SCAN_RESULT,
      [STORAGE_KEYS.ALERTS]: [],
      [STORAGE_KEYS.FIRED_ALERT]: null,
    });
    return;
  }
  writeLocal(STORAGE_KEYS.WORKSPACE, DEFAULT_WORKSPACE);
  writeLocal(STORAGE_KEYS.RECORDING, cleanRecording);
  writeLocal(STORAGE_KEYS.INSPECTED, null);
  writeLocal(STORAGE_KEYS.LAST_SCAN, DEFAULT_SCAN_RESULT);
  writeLocal(STORAGE_KEYS.ALERTS, []);
  writeLocal(STORAGE_KEYS.FIRED_ALERT, null);
}

export function saveWorkspace(workspace: WorkspaceState): void {
  const chromeApi = getChrome();
  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.set({ [STORAGE_KEYS.WORKSPACE]: workspace });
  } else {
    writeLocal(STORAGE_KEYS.WORKSPACE, workspace);
  }
}

export function saveTheme(theme: 'light' | 'dark'): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_SET_THEME', theme });
  }
  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.set({ [STORAGE_KEYS.PREFERENCES]: { theme } });
  } else {
    writeLocal(STORAGE_KEYS.PREFERENCES, { theme });
  }
}

export function setRecordingActive(isRecording: boolean): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_SET_RECORDING', isRecording });
    return;
  }
  const current = readLocal<RecordingState>(STORAGE_KEYS.RECORDING, {
    isRecording: false,
    recordedSteps: [],
  });
  writeLocal(STORAGE_KEYS.RECORDING, { ...current, isRecording });
}

export function appendRecordedStep(step: RecordedStep): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_RECORDED_EVENT', step });
    return;
  }
  const current = readLocal<RecordingState>(STORAGE_KEYS.RECORDING, {
    isRecording: false,
    recordedSteps: [],
  });
  if (!current.isRecording) return;
  writeLocal(STORAGE_KEYS.RECORDING, {
    ...current,
    recordedSteps: [...current.recordedSteps, step],
  });
}

export function clearRecordedSteps(): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_CLEAR_RECORDED' });
    return;
  }
  const current = readLocal<RecordingState>(STORAGE_KEYS.RECORDING, {
    isRecording: false,
    recordedSteps: [],
  });
  writeLocal(STORAGE_KEYS.RECORDING, { ...current, recordedSteps: [] });
}

export function saveInspectedElement(element: InspectedElement | null): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_ELEMENT_INSPECTED', element });
    return;
  }
  writeLocal(STORAGE_KEYS.INSPECTED, element);
}

export function saveScanResult(scan: CoverageScanResult): void {
  const chromeApi = getChrome();
  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.set({ [STORAGE_KEYS.LAST_SCAN]: scan });
  } else {
    writeLocal(STORAGE_KEYS.LAST_SCAN, scan);
  }
}

export async function probeActiveTabSelectors(
  selectors: string[]
): Promise<{ ok: boolean; results: Record<string, DomObservedState>; error?: string }> {
  const chromeApi = getChrome();
  if (!chromeApi?.tabs) {
    return {
      ok: false,
      results: {},
      error: 'Running in Web Preview mode — load VeriPulse as a Chrome Extension to probe live tabs.',
    };
  }
  return new Promise((resolve) => {
    chromeApi.tabs!.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        resolve({ ok: false, results: {}, error: 'No active browser tab found.' });
        return;
      }
      chromeApi.tabs!.sendMessage(
        tabId,
        { type: 'TESTALLY_CHECK_SELECTORS', selectors },
        (res) => {
          const typed = res as { ok?: boolean; results?: Record<string, DomObservedState> } | undefined;
          if (!typed?.ok || !typed.results) {
            resolve({
              ok: false,
              results: {},
              error: 'Active tab did not respond (internal browser page or unmounted tab).',
            });
            return;
          }
          resolve({ ok: true, results: typed.results });
        }
      );
    });
  });
}

export async function readActiveTabContent(selectors: string[]): Promise<{
  ok: boolean;
  pageUrl?: string;
  pageTitle?: string;
  pageBodySample?: string;
  values: Record<string, { found: boolean; text: string }>;
  error?: string;
}> {
  const chromeApi = getChrome();
  if (!chromeApi?.tabs) {
    return {
      ok: false,
      values: {},
      error: 'Running in Web Preview mode — paste sample text or test inside Chrome Extension.',
    };
  }
  return new Promise((resolve) => {
    chromeApi.tabs!.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        resolve({ ok: false, values: {}, error: 'No active browser tab found.' });
        return;
      }
      chromeApi.tabs!.sendMessage(
        tabId,
        { type: 'TESTALLY_READ_SELECTORS_TEXT', selectors },
        (res) => {
          const typed = res as
            | {
                ok?: boolean;
                pageUrl?: string;
                pageTitle?: string;
                pageBodySample?: string;
                values?: Record<string, { found: boolean; text: string }>;
              }
            | undefined;
          if (!typed?.ok || !typed.values) {
            resolve({
              ok: false,
              values: {},
              error: 'Active tab did not respond (restricted browser page or unmounted tab).',
            });
            return;
          }
          resolve({
            ok: true,
            pageUrl: typed.pageUrl,
            pageTitle: typed.pageTitle,
            pageBodySample: typed.pageBodySample || '',
            values: typed.values,
          });
        }
      );
    });
  });
}

export async function scanActiveChromeTab(): Promise<CoverageScanResult | null> {
  const chromeApi = getChrome();
  if (!chromeApi?.tabs) return null;
  return new Promise((resolve) => {
    chromeApi.tabs!.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        resolve(null);
        return;
      }
      chromeApi.tabs!.sendMessage(tabId, { type: 'TESTALLY_SCAN_PAGE_ELEMENTS' }, (res) => {
        const typed = res as CoverageScanResult | undefined;
        if (typed?.ok) {
          const stamped: CoverageScanResult = {
            ...typed,
            scannedAt: new Date().toISOString(),
          };
          saveScanResult(stamped);
          resolve(stamped);
        } else {
          resolve(null);
        }
      });
    });
  });
}

export async function requestVisibleTabScreenshot(
  userConsentGranted: boolean
): Promise<{ ok: boolean; dataUrl?: string; error?: string }> {
  const chromeApi = getChrome();
  if (!userConsentGranted) {
    return { ok: false, error: 'Explicit screenshot consent required in Settings.' };
  }
  if (!chromeApi?.runtime?.sendMessage) {
    return {
      ok: false,
      error: 'Screenshot capture requires the installed Chrome Extension runtime.',
    };
  }
  return new Promise((resolve) => {
    chromeApi.runtime!.sendMessage!(
      { type: 'TESTALLY_CAPTURE_VISIBLE_TAB', userConsentGranted },
      (res) => {
        resolve(
          (res as { ok: boolean; dataUrl?: string; error?: string }) || {
            ok: false,
            error: 'No response from background service worker.',
          }
        );
      }
    );
  });
}

export function subscribeStorageChanges(
  onUpdate: (key: string, value: unknown) => void
): () => void {
  const chromeApi = getChrome();
  if (chromeApi?.storage?.onChanged) {
    const listener = (
      changes: Record<string, { newValue: unknown }>,
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      for (const [key, change] of Object.entries(changes)) {
        onUpdate(key, change.newValue);
      }
    };
    chromeApi.storage.onChanged.addListener(listener);
    return () => chromeApi.storage?.onChanged?.removeListener(listener);
  }

  const localHandler = (ev: Event) => {
    const custom = ev as CustomEvent<{ key: string; value: unknown }>;
    if (custom.detail?.key) {
      onUpdate(custom.detail.key, custom.detail.value);
    }
  };
  window.addEventListener(LOCAL_EVENT, localHandler);
  return () => window.removeEventListener(LOCAL_EVENT, localHandler);
}

export async function loadSelfAlerts(): Promise<{
  alerts: SelfAlert[];
  firedAlert: SelfAlert | null;
}> {
  const chromeApi = getChrome();
  if (chromeApi?.storage?.local) {
    return new Promise((resolve) => {
      chromeApi.storage!.local!.get(
        [STORAGE_KEYS.ALERTS, STORAGE_KEYS.FIRED_ALERT],
        (res) => {
          const alerts = Array.isArray(res[STORAGE_KEYS.ALERTS])
            ? (res[STORAGE_KEYS.ALERTS] as SelfAlert[])
            : [];
          const firedAlert =
            (res[STORAGE_KEYS.FIRED_ALERT] as SelfAlert | null | undefined) || null;
          resolve({ alerts, firedAlert });
        }
      );
    });
  }
  const alerts = readLocal<SelfAlert[]>(STORAGE_KEYS.ALERTS, []);
  const firedAlert = readLocal<SelfAlert | null>(STORAGE_KEYS.FIRED_ALERT, null);
  return { alerts, firedAlert };
}

export function scheduleSelfAlert(alert: SelfAlert): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_SCHEDULE_ALERT', alert });
    return;
  }
  const current = readLocal<SelfAlert[]>(STORAGE_KEYS.ALERTS, []);
  const next = [alert, ...current.filter((a) => a.id !== alert.id)];
  writeLocal(STORAGE_KEYS.ALERTS, next);
}

export function markSelfAlertTriggered(alert: SelfAlert): void {
  const triggered: SelfAlert = { ...alert, status: 'triggered' };
  const chromeApi = getChrome();
  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.get([STORAGE_KEYS.ALERTS], (res) => {
      const current = Array.isArray(res[STORAGE_KEYS.ALERTS])
        ? (res[STORAGE_KEYS.ALERTS] as SelfAlert[])
        : [];
      const next = current.map((a) => (a.id === triggered.id ? triggered : a));
      chromeApi.storage!.local!.set({
        [STORAGE_KEYS.ALERTS]: next,
        [STORAGE_KEYS.FIRED_ALERT]: triggered,
      });
    });
    return;
  }
  const current = readLocal<SelfAlert[]>(STORAGE_KEYS.ALERTS, []);
  const next = current.map((a) => (a.id === triggered.id ? triggered : a));
  writeLocal(STORAGE_KEYS.ALERTS, next);
  writeLocal(STORAGE_KEYS.FIRED_ALERT, triggered);
}

export function deleteSelfAlert(id: string): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_DELETE_ALERT', id });
    return;
  }
  const current = readLocal<SelfAlert[]>(STORAGE_KEYS.ALERTS, []);
  const next = current.filter((a) => a.id !== id);
  writeLocal(STORAGE_KEYS.ALERTS, next);
  const fired = readLocal<SelfAlert | null>(STORAGE_KEYS.FIRED_ALERT, null);
  if (fired && fired.id === id) {
    writeLocal(STORAGE_KEYS.FIRED_ALERT, null);
  }
}

export function dismissFiredAlert(): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_DISMISS_FIRED_ALERT' });
    return;
  }
  writeLocal(STORAGE_KEYS.FIRED_ALERT, null);
}

