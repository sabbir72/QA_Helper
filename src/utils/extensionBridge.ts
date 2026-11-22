import {
  DEFAULT_FAKE_GPS_CONFIG,
  DEFAULT_SCAN_RESULT,
  DEFAULT_WORKSPACE,
} from '../data/defaultWorkspace';
import {
  AuthUser,
  CloudSyncSession,
  CoverageScanResult,
  DomObservedState,
  FakeGpsConfig,
  InspectedElement,
  PreferencesState,
  RecordedStep,
  RecordingState,
  SelfAlert,
  SmartScreenAnalysisResult,
  UserSyncBundle,
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
  FAKE_GPS: 'veripulse_fake_gps_v1',
} as const;

const WEB_SESSION_KEY = 'veripulse_web_session_v1';
const EXT_SYNC_CONN_KEY = 'veripulse_ext_sync_conn_v1';

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

export function getDefaultServerUrl(): string {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return window.location.origin;
  }
  const envUrl =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_APP_URL || '';
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

const LOCAL_EVENT = 'testally_local_storage_sync';
let activeScopePrefix = 'guest_';

function setScopeUser(userId?: string | null): void {
  activeScopePrefix = userId ? `u_${userId}_` : 'guest_';
}

function scopedKey(baseKey: string): string {
  return `${activeScopePrefix}${baseKey}`;
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T, notifyKey?: string): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (notifyKey) {
      window.dispatchEvent(
        new CustomEvent(LOCAL_EVENT, { detail: { key: notifyKey, value } })
      );
    }
  } catch {
    // Ignore storage quota errors
  }
}

export async function getActiveSession(): Promise<CloudSyncSession> {
  const chromeApi = getChrome();
  const defaultUrl = getDefaultServerUrl();
  if (chromeApi?.storage?.local) {
    return new Promise((resolve) => {
      chromeApi.storage!.local!.get([EXT_SYNC_CONN_KEY], (res) => {
        const conn = res[EXT_SYNC_CONN_KEY] as CloudSyncSession | undefined;
        resolve({
          user: conn?.user || null,
          serverUrl: conn?.serverUrl || defaultUrl,
          bearerToken: conn?.bearerToken || '',
          lastSyncedAt: conn?.lastSyncedAt || null,
        });
      });
    });
  }
  const saved = readLocal<CloudSyncSession | null>(WEB_SESSION_KEY, null);
  return {
    user: saved?.user || null,
    serverUrl: saved?.serverUrl || defaultUrl,
    bearerToken: saved?.bearerToken || '',
    lastSyncedAt: saved?.lastSyncedAt || null,
  };
}

export async function saveActiveSession(session: CloudSyncSession | null): Promise<void> {
  setScopeUser(session?.user?.id || null);
  const chromeApi = getChrome();
  if (chromeApi?.storage?.local) {
    return new Promise((resolve) => {
      if (!session || !session.user) {
        chromeApi.storage!.local!.remove?.([EXT_SYNC_CONN_KEY], () => resolve());
        return;
      }
      chromeApi.storage!.local!.set({ [EXT_SYNC_CONN_KEY]: session }, () => resolve());
    });
  }
  if (!session || !session.user) {
    try {
      localStorage.removeItem(WEB_SESSION_KEY);
    } catch {
      // Ignore
    }
    return;
  }
  writeLocal(WEB_SESSION_KEY, session);
}

export function clearGuestLocalKeys(): void {
  if (isChromeExtensionContext()) return;
  const keys = [
    STORAGE_KEYS.WORKSPACE,
    STORAGE_KEYS.RECORDING,
    STORAGE_KEYS.INSPECTED,
    STORAGE_KEYS.LAST_SCAN,
    STORAGE_KEYS.ALERTS,
    STORAGE_KEYS.FIRED_ALERT,
    STORAGE_KEYS.FAKE_GPS,
  ];
  for (const k of keys) {
    try {
      localStorage.removeItem(`guest_${k}`);
    } catch {
      // Ignore
    }
  }
}

export async function loadInitialBundle(): Promise<{
  workspace: WorkspaceState;
  preferences: PreferencesState;
  recording: RecordingState;
  inspected: InspectedElement | null;
  lastScan: CoverageScanResult;
  fakeGps: FakeGpsConfig;
  session: CloudSyncSession;
}> {
  const session = await getActiveSession();
  setScopeUser(session.user?.id || null);

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
          STORAGE_KEYS.FAKE_GPS,
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
          const fakeGps = isFirstCleanBoot
            ? DEFAULT_FAKE_GPS_CONFIG
            : (res[STORAGE_KEYS.FAKE_GPS] as FakeGpsConfig | undefined) ||
              DEFAULT_FAKE_GPS_CONFIG;

          if (isFirstCleanBoot) {
            chromeApi.storage!.local!.remove?.(LEGACY_STORAGE_KEYS, () => {});
            chromeApi.storage!.local!.set({
              [STORAGE_KEYS.WORKSPACE]: workspace,
              [STORAGE_KEYS.RECORDING]: recording,
              [STORAGE_KEYS.LAST_SCAN]: lastScan,
              [STORAGE_KEYS.INSPECTED]: null,
              [STORAGE_KEYS.FAKE_GPS]: fakeGps,
            });
          }

          resolve({
            workspace,
            preferences,
            recording,
            inspected,
            lastScan,
            fakeGps,
            session,
          });
        }
      );
    });
  }

  // Clean up legacy unscoped keys so old shared local data never leaks to users
  for (const oldKey of [...LEGACY_STORAGE_KEYS, STORAGE_KEYS.WORKSPACE, STORAGE_KEYS.FAKE_GPS]) {
    try {
      localStorage.removeItem(oldKey);
    } catch {
      // Ignore
    }
  }

  // Check if cookie session exists on web when local session metadata is present or missing
  try {
    const headers: Record<string, string> = {};
    if (session.bearerToken) {
      headers.Authorization = `Bearer ${session.bearerToken}`;
    }
    const base = (session.serverUrl || getDefaultServerUrl()).replace(/\/+$/, '');
    const resp = await fetch(`${base}/api/workspace`, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    if (resp.ok) {
      const data = (await resp.json()) as {
        ok?: boolean;
        user?: AuthUser;
        bundle?: UserSyncBundle;
      };
      if (data.ok && data.user && data.bundle) {
        const nextSession: CloudSyncSession = {
          user: data.user,
          serverUrl: base,
          bearerToken: session.bearerToken,
          lastSyncedAt: data.bundle.updatedAt || new Date().toISOString(),
        };
        await saveActiveSession(nextSession);
        applyBundleToLocalWeb(data.bundle);
        return {
          workspace: data.bundle.workspace || DEFAULT_WORKSPACE,
          preferences: {
            theme: data.bundle.workspace?.settings?.theme || 'light',
          },
          recording: data.bundle.recording || { isRecording: false, recordedSteps: [] },
          inspected: data.bundle.inspected || null,
          lastScan: data.bundle.lastScan || DEFAULT_SCAN_RESULT,
          fakeGps: data.bundle.fakeGps || DEFAULT_FAKE_GPS_CONFIG,
          session: nextSession,
        };
      }
    } else if (resp.status === 401 && session.user) {
      // Session expired or logged out — clear stale session so zero-data starts cleanly
      await saveActiveSession(null);
      session.user = null;
      session.bearerToken = '';
    }
  } catch {
    // Offline fallback to user-scoped localStorage
  }

  const workspace = readLocal<WorkspaceState>(
    scopedKey(STORAGE_KEYS.WORKSPACE),
    DEFAULT_WORKSPACE
  );
  const preferences = readLocal<PreferencesState>(STORAGE_KEYS.PREFERENCES, {
    theme: workspace.settings?.theme || 'light',
  });
  const recording = readLocal<RecordingState>(scopedKey(STORAGE_KEYS.RECORDING), {
    isRecording: false,
    recordedSteps: [],
  });
  const inspected = readLocal<InspectedElement | null>(
    scopedKey(STORAGE_KEYS.INSPECTED),
    null
  );
  const lastScan = readLocal<CoverageScanResult>(
    scopedKey(STORAGE_KEYS.LAST_SCAN),
    DEFAULT_SCAN_RESULT
  );
  const fakeGps = readLocal<FakeGpsConfig>(
    scopedKey(STORAGE_KEYS.FAKE_GPS),
    DEFAULT_FAKE_GPS_CONFIG
  );

  return {
    workspace,
    preferences,
    recording,
    inspected,
    lastScan,
    fakeGps,
    session,
  };
}

function applyBundleToLocalWeb(bundle: UserSyncBundle): void {
  writeLocal(scopedKey(STORAGE_KEYS.WORKSPACE), bundle.workspace || DEFAULT_WORKSPACE);
  writeLocal(
    scopedKey(STORAGE_KEYS.FAKE_GPS),
    bundle.fakeGps || DEFAULT_FAKE_GPS_CONFIG
  );
  writeLocal(scopedKey(STORAGE_KEYS.ALERTS), Array.isArray(bundle.alerts) ? bundle.alerts : []);
  writeLocal(
    scopedKey(STORAGE_KEYS.RECORDING),
    bundle.recording || { isRecording: false, recordedSteps: [] }
  );
  writeLocal(
    scopedKey(STORAGE_KEYS.LAST_SCAN),
    bundle.lastScan || DEFAULT_SCAN_RESULT
  );
  writeLocal(scopedKey(STORAGE_KEYS.INSPECTED), bundle.inspected || null);
}

export async function registerAccount(params: {
  serverUrl: string;
  name: string;
  email: string;
  password: string;
}): Promise<{ ok: boolean; session?: CloudSyncSession; bundle?: UserSyncBundle; error?: string }> {
  const base = params.serverUrl.replace(/\/+$/, '');
  try {
    const resp = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.name,
        email: params.email,
        password: params.password,
      }),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      user?: AuthUser;
      bearerToken?: string;
      bundle?: UserSyncBundle;
      error?: string;
    };
    if (!resp.ok || !data.ok || !data.user || !data.bundle) {
      return { ok: false, error: data.error || `Registration failed (${resp.status})` };
    }
    const nextSession: CloudSyncSession = {
      user: data.user,
      serverUrl: base,
      bearerToken: data.bearerToken || '',
      lastSyncedAt: data.bundle.updatedAt || new Date().toISOString(),
    };
    await saveActiveSession(nextSession);
    if (isChromeExtensionContext()) {
      await connectChromeExtensionSync(base, nextSession.bearerToken);
    } else {
      clearGuestLocalKeys();
      applyBundleToLocalWeb(data.bundle);
    }
    return { ok: true, session: nextSession, bundle: data.bundle };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to reach VeriPulse server.',
    };
  }
}

export async function loginAccount(params: {
  serverUrl: string;
  email: string;
  password: string;
}): Promise<{ ok: boolean; session?: CloudSyncSession; bundle?: UserSyncBundle; error?: string }> {
  const base = params.serverUrl.replace(/\/+$/, '');
  try {
    const resp = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.email,
        password: params.password,
      }),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      user?: AuthUser;
      bearerToken?: string;
      bundle?: UserSyncBundle;
      error?: string;
    };
    if (!resp.ok || !data.ok || !data.user || !data.bundle) {
      return { ok: false, error: data.error || 'Invalid email or password.' };
    }
    const nextSession: CloudSyncSession = {
      user: data.user,
      serverUrl: base,
      bearerToken: data.bearerToken || '',
      lastSyncedAt: data.bundle.updatedAt || new Date().toISOString(),
    };
    await saveActiveSession(nextSession);
    if (isChromeExtensionContext()) {
      await connectChromeExtensionSync(base, nextSession.bearerToken);
    } else {
      clearGuestLocalKeys();
      applyBundleToLocalWeb(data.bundle);
    }
    return { ok: true, session: nextSession, bundle: data.bundle };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to reach VeriPulse server.',
    };
  }
}

export async function logoutAccount(): Promise<void> {
  const session = await getActiveSession();
  const base = (session.serverUrl || getDefaultServerUrl()).replace(/\/+$/, '');
  try {
    const headers: Record<string, string> = {};
    if (session.bearerToken) {
      headers.Authorization = `Bearer ${session.bearerToken}`;
    }
    await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers,
    });
  } catch {
    // Proceed with local cleanup even if offline
  }

  await saveActiveSession(null);
  clearGuestLocalKeys();

  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    await new Promise<void>((resolve) => {
      chromeApi.runtime!.sendMessage!({ type: 'VERIPULSE_DISCONNECT_SYNC' }, () => resolve());
    });
  } else {
    clearAllStoredData();
  }
}

export async function pullCloudBundle(): Promise<{
  ok: boolean;
  bundle?: UserSyncBundle;
  user?: AuthUser;
  updatedAt?: string;
  error?: string;
}> {
  const session = await getActiveSession();
  if (!session.user) {
    return { ok: false, error: 'Not signed in.' };
  }
  const base = (session.serverUrl || getDefaultServerUrl()).replace(/\/+$/, '');

  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    return new Promise((resolve) => {
      chromeApi.runtime!.sendMessage!({ type: 'VERIPULSE_PULL_SYNC' }, (res) => {
        const typed = res as { ok?: boolean; error?: string; syncConn?: CloudSyncSession } | undefined;
        if (!typed?.ok) {
          resolve({ ok: false, error: typed?.error || 'Extension sync failed.' });
          return;
        }
        loadInitialBundle().then((bundle) => {
          resolve({
            ok: true,
            user: typed.syncConn?.user || session.user || undefined,
            updatedAt: typed.syncConn?.lastSyncedAt || new Date().toISOString(),
            bundle: {
              workspace: bundle.workspace,
              fakeGps: bundle.fakeGps,
              alerts: [],
              lastScan: bundle.lastScan,
              recording: bundle.recording,
              inspected: bundle.inspected,
            },
          });
        });
      });
    });
  }

  try {
    const headers: Record<string, string> = {};
    if (session.bearerToken) {
      headers.Authorization = `Bearer ${session.bearerToken}`;
    }
    const resp = await fetch(`${base}/api/workspace`, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    const data = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      user?: AuthUser;
      bundle?: UserSyncBundle;
      error?: string;
    };
    if (!resp.ok || !data.ok || !data.bundle) {
      return { ok: false, error: data.error || `HTTP ${resp.status}` };
    }
    const updatedSession: CloudSyncSession = {
      ...session,
      user: data.user || session.user,
      lastSyncedAt: data.bundle.updatedAt || new Date().toISOString(),
    };
    await saveActiveSession(updatedSession);
    applyBundleToLocalWeb(data.bundle);
    return {
      ok: true,
      bundle: data.bundle,
      user: updatedSession.user || undefined,
      updatedAt: updatedSession.lastSyncedAt || undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error.',
    };
  }
}

export async function pushCloudBundle(
  bundle: UserSyncBundle
): Promise<{ ok: boolean; updatedAt?: string; error?: string }> {
  const session = await getActiveSession();
  if (!session.user) {
    return { ok: false, error: 'Not signed in.' };
  }
  const base = (session.serverUrl || getDefaultServerUrl()).replace(/\/+$/, '');
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session.bearerToken) {
      headers.Authorization = `Bearer ${session.bearerToken}`;
    }
    const resp = await fetch(`${base}/api/workspace`, {
      method: 'PUT',
      credentials: 'include',
      headers,
      body: JSON.stringify(bundle),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      updatedAt?: string;
      error?: string;
    };
    if (!resp.ok || !data.ok) {
      return { ok: false, error: data.error || `HTTP ${resp.status}` };
    }
    await saveActiveSession({
      ...session,
      lastSyncedAt: data.updatedAt || new Date().toISOString(),
    });
    return { ok: true, updatedAt: data.updatedAt };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error.',
    };
  }
}

async function connectChromeExtensionSync(
  serverUrl: string,
  bearerToken: string
): Promise<{ ok: boolean; error?: string }> {
  const chromeApi = getChrome();
  if (!chromeApi?.runtime?.sendMessage) {
    return { ok: false, error: 'Not in extension context.' };
  }
  return new Promise((resolve) => {
    chromeApi.runtime!.sendMessage!(
      { type: 'VERIPULSE_CONNECT_SYNC', serverUrl, bearerToken },
      (res) => {
        const typed = res as { ok?: boolean; error?: string } | undefined;
        resolve({ ok: Boolean(typed?.ok), error: typed?.error });
      }
    );
  });
}

export async function mintExtensionSyncToken(): Promise<{
  ok: boolean;
  token?: string;
  serverUrl?: string;
  error?: string;
}> {
  const session = await getActiveSession();
  const base = (session.serverUrl || getDefaultServerUrl()).replace(/\/+$/, '');
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session.bearerToken) {
      headers.Authorization = `Bearer ${session.bearerToken}`;
    }
    const resp = await fetch(`${base}/api/auth/extension-token`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ label: 'Chrome Extension Pair' }),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      token?: string;
      error?: string;
    };
    if (!resp.ok || !data.ok || !data.token) {
      return { ok: false, error: data.error || 'Could not generate pairing token.' };
    }
    return { ok: true, token: data.token, serverUrl: base };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error.',
    };
  }
}

export async function connectWithPairingToken(params: {
  serverUrl: string;
  bearerToken: string;
}): Promise<{ ok: boolean; session?: CloudSyncSession; bundle?: UserSyncBundle; error?: string }> {
  const base = params.serverUrl.replace(/\/+$/, '');
  const token = params.bearerToken.trim();
  if (!base || !token) {
    return { ok: false, error: 'Server URL and Pairing Token are required.' };
  }

  try {
    const resp = await fetch(`${base}/api/workspace`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      user?: AuthUser;
      bundle?: UserSyncBundle;
      error?: string;
    };
    if (!resp.ok || !data.ok || !data.user || !data.bundle) {
      return { ok: false, error: data.error || 'Invalid or expired pairing token.' };
    }
    const nextSession: CloudSyncSession = {
      user: data.user,
      serverUrl: base,
      bearerToken: token,
      lastSyncedAt: data.bundle.updatedAt || new Date().toISOString(),
    };
    await saveActiveSession(nextSession);
    if (isChromeExtensionContext()) {
      await connectChromeExtensionSync(base, token);
    } else {
      applyBundleToLocalWeb(data.bundle);
    }
    return { ok: true, session: nextSession, bundle: data.bundle };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to verify pairing token.',
    };
  }
}

export async function pairInstalledBrowserExtension(): Promise<{
  ok: boolean;
  token?: string;
  serverUrl?: string;
  pairedInBrowser?: boolean;
  error?: string;
}> {
  const minted = await mintExtensionSyncToken();
  if (!minted.ok || !minted.token || !minted.serverUrl) {
    return { ok: false, error: minted.error || 'Sign in first to pair your extension.' };
  }

  if (isChromeExtensionContext()) {
    await connectChromeExtensionSync(minted.serverUrl, minted.token);
    return {
      ok: true,
      token: minted.token,
      serverUrl: minted.serverUrl,
      pairedInBrowser: true,
    };
  }

  const paired = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMsg);
      resolve({ ok: false });
    }, 1800);

    function onMsg(ev: MessageEvent) {
      if (ev.source !== window || !ev.data) return;
      if (ev.data.source === 'VERIPULSE_WEB_PAIR_RESULT') {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        window.removeEventListener('message', onMsg);
        resolve({ ok: Boolean(ev.data.ok), error: ev.data.error });
      }
    }

    window.addEventListener('message', onMsg);
    window.postMessage(
      {
        source: 'VERIPULSE_WEB_PAIR_EXTENSION',
        serverUrl: minted.serverUrl,
        bearerToken: minted.token,
      },
      '*'
    );
  });

  return {
    ok: true,
    token: minted.token,
    serverUrl: minted.serverUrl,
    pairedInBrowser: paired.ok,
    error: paired.ok ? undefined : paired.error,
  };
}

export async function detectInstalledExtensionInWeb(): Promise<boolean> {
  if (isChromeExtensionContext()) return true;
  if (typeof window === 'undefined') return false;
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener('message', handler);
      resolve(false);
    }, 450);
    function handler(ev: MessageEvent) {
      if (ev.source === window && ev.data?.source === 'VERIPULSE_EXTENSION_PONG') {
        if (done) return;
        done = true;
        clearTimeout(t);
        window.removeEventListener('message', handler);
        resolve(true);
      }
    }
    window.addEventListener('message', handler);
    window.postMessage({ source: 'VERIPULSE_WEB_PING' }, '*');
  });
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
      [STORAGE_KEYS.FAKE_GPS]: DEFAULT_FAKE_GPS_CONFIG,
    });
    return;
  }
  writeLocal(scopedKey(STORAGE_KEYS.WORKSPACE), DEFAULT_WORKSPACE, STORAGE_KEYS.WORKSPACE);
  writeLocal(scopedKey(STORAGE_KEYS.RECORDING), cleanRecording, STORAGE_KEYS.RECORDING);
  writeLocal(scopedKey(STORAGE_KEYS.INSPECTED), null, STORAGE_KEYS.INSPECTED);
  writeLocal(scopedKey(STORAGE_KEYS.LAST_SCAN), DEFAULT_SCAN_RESULT, STORAGE_KEYS.LAST_SCAN);
  writeLocal(scopedKey(STORAGE_KEYS.ALERTS), [], STORAGE_KEYS.ALERTS);
  writeLocal(scopedKey(STORAGE_KEYS.FIRED_ALERT), null, STORAGE_KEYS.FIRED_ALERT);
  writeLocal(
    scopedKey(STORAGE_KEYS.FAKE_GPS),
    DEFAULT_FAKE_GPS_CONFIG,
    STORAGE_KEYS.FAKE_GPS
  );
}

export function saveWorkspace(workspace: WorkspaceState): void {
  const chromeApi = getChrome();
  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.set({ [STORAGE_KEYS.WORKSPACE]: workspace });
  } else {
    writeLocal(scopedKey(STORAGE_KEYS.WORKSPACE), workspace);
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
  const current = readLocal<RecordingState>(scopedKey(STORAGE_KEYS.RECORDING), {
    isRecording: false,
    recordedSteps: [],
  });
  writeLocal(
    scopedKey(STORAGE_KEYS.RECORDING),
    { ...current, isRecording },
    STORAGE_KEYS.RECORDING
  );
}

export function appendRecordedStep(step: RecordedStep): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_RECORDED_EVENT', step });
    return;
  }
  const current = readLocal<RecordingState>(scopedKey(STORAGE_KEYS.RECORDING), {
    isRecording: false,
    recordedSteps: [],
  });
  if (!current.isRecording) return;
  writeLocal(
    scopedKey(STORAGE_KEYS.RECORDING),
    {
      ...current,
      recordedSteps: [...current.recordedSteps, step],
    },
    STORAGE_KEYS.RECORDING
  );
}

export function clearRecordedSteps(): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_CLEAR_RECORDED' });
    return;
  }
  const current = readLocal<RecordingState>(scopedKey(STORAGE_KEYS.RECORDING), {
    isRecording: false,
    recordedSteps: [],
  });
  writeLocal(
    scopedKey(STORAGE_KEYS.RECORDING),
    { ...current, recordedSteps: [] },
    STORAGE_KEYS.RECORDING
  );
}

export function saveInspectedElement(element: InspectedElement | null): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_ELEMENT_INSPECTED', element });
    return;
  }
  writeLocal(scopedKey(STORAGE_KEYS.INSPECTED), element, STORAGE_KEYS.INSPECTED);
}

export function saveScanResult(scan: CoverageScanResult): void {
  const chromeApi = getChrome();
  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.set({ [STORAGE_KEYS.LAST_SCAN]: scan });
  } else {
    writeLocal(scopedKey(STORAGE_KEYS.LAST_SCAN), scan);
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
  const session = await getActiveSession();
  setScopeUser(session.user?.id || null);

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
  const alerts = readLocal<SelfAlert[]>(scopedKey(STORAGE_KEYS.ALERTS), []);
  const firedAlert = readLocal<SelfAlert | null>(scopedKey(STORAGE_KEYS.FIRED_ALERT), null);
  return { alerts, firedAlert };
}

export function scheduleSelfAlert(alert: SelfAlert): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_SCHEDULE_ALERT', alert });
    return;
  }
  const current = readLocal<SelfAlert[]>(scopedKey(STORAGE_KEYS.ALERTS), []);
  const next = [alert, ...current.filter((a) => a.id !== alert.id)];
  writeLocal(scopedKey(STORAGE_KEYS.ALERTS), next, STORAGE_KEYS.ALERTS);
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
  const current = readLocal<SelfAlert[]>(scopedKey(STORAGE_KEYS.ALERTS), []);
  const next = current.map((a) => (a.id === triggered.id ? triggered : a));
  writeLocal(scopedKey(STORAGE_KEYS.ALERTS), next, STORAGE_KEYS.ALERTS);
  writeLocal(scopedKey(STORAGE_KEYS.FIRED_ALERT), triggered, STORAGE_KEYS.FIRED_ALERT);
}

export function deleteSelfAlert(id: string): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_DELETE_ALERT', id });
    return;
  }
  const current = readLocal<SelfAlert[]>(scopedKey(STORAGE_KEYS.ALERTS), []);
  const next = current.filter((a) => a.id !== id);
  writeLocal(scopedKey(STORAGE_KEYS.ALERTS), next, STORAGE_KEYS.ALERTS);
  const fired = readLocal<SelfAlert | null>(scopedKey(STORAGE_KEYS.FIRED_ALERT), null);
  if (fired && fired.id === id) {
    writeLocal(scopedKey(STORAGE_KEYS.FIRED_ALERT), null, STORAGE_KEYS.FIRED_ALERT);
  }
}

export function dismissFiredAlert(): void {
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'TESTALLY_DISMISS_FIRED_ALERT' });
    return;
  }
  writeLocal(scopedKey(STORAGE_KEYS.FIRED_ALERT), null, STORAGE_KEYS.FIRED_ALERT);
}

export function saveFakeGpsConfig(config: FakeGpsConfig): void {
  const stamped: FakeGpsConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };
  const chromeApi = getChrome();
  if (chromeApi?.runtime?.sendMessage) {
    chromeApi.runtime.sendMessage({ type: 'VERIPULSE_SET_FAKE_GPS', config: stamped });
  }
  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.set({ [STORAGE_KEYS.FAKE_GPS]: stamped });
  } else {
    writeLocal(scopedKey(STORAGE_KEYS.FAKE_GPS), stamped, STORAGE_KEYS.FAKE_GPS);
  }
}

export async function probeActiveTabGeolocation(): Promise<{
  ok: boolean;
  source: 'active_tab' | 'studio_preview';
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
  spoofed?: boolean;
  error?: string;
}> {
  const chromeApi = getChrome();
  if (chromeApi?.tabs) {
    const tabResult = await new Promise<{
      ok: boolean;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      altitude?: number | null;
      heading?: number | null;
      speed?: number | null;
      timestamp?: number;
      spoofed?: boolean;
      error?: string;
    }>((resolve) => {
      chromeApi.tabs!.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) {
          resolve({ ok: false, error: 'No active browser tab found.' });
          return;
        }
        chromeApi.tabs!.sendMessage(
          tabId,
          { type: 'VERIPULSE_PROBE_GEO' },
          (res) => {
            const typed = res as
              | {
                  ok?: boolean;
                  latitude?: number;
                  longitude?: number;
                  accuracy?: number;
                  altitude?: number | null;
                  heading?: number | null;
                  speed?: number | null;
                  timestamp?: number;
                  spoofed?: boolean;
                  error?: string;
                }
              | undefined;
            if (!typed?.ok) {
              resolve({
                ok: false,
                error:
                  typed?.error ||
                  'Active tab did not respond (restricted browser page).',
              });
              return;
            }
            resolve({ ok: true, ...typed });
          }
        );
      });
    });

    if (tabResult.ok) {
      return { ...tabResult, source: 'active_tab' };
    }
  }

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        ok: false,
        source: 'studio_preview',
        error: 'Geolocation API is not available in this browser.',
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          source: 'studio_preview',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
          spoofed: Boolean((pos as unknown as { __veripulseSpoofed?: boolean }).__veripulseSpoofed),
        });
      },
      (err) => {
        resolve({
          ok: false,
          source: 'studio_preview',
          error: err.message || 'Geolocation permission denied or unavailable.',
        });
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    );
  });
}

export interface DomScannedFieldInput {
  id: string;
  label: string;
  name: string;
  selector: string;
  tagName: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  currentValue?: string;
  isSensitive?: boolean;
}

export async function scanActiveTabFormFields(): Promise<{
  ok: boolean;
  pageUrl?: string;
  pageTitle?: string;
  pageTextSample?: string;
  fields: DomScannedFieldInput[];
  error?: string;
}> {
  const chromeApi = getChrome();
  if (!chromeApi?.tabs) {
    return {
      ok: false,
      fields: [],
      error:
        'Live browser tab scanning requires the VeriPulse Chrome Extension (Side Panel or Dashboard). In Web App mode, use Capture Window / Screen, Upload Screenshot, or Website URL.',
    };
  }
  return new Promise((resolve) => {
    chromeApi.tabs!.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        resolve({ ok: false, fields: [], error: 'No active browser tab found.' });
        return;
      }
      chromeApi.tabs!.sendMessage(
        tabId,
        { type: 'VERIPULSE_SCAN_FORM_FIELDS' },
        (res) => {
          const typed = res as
            | {
                ok?: boolean;
                pageUrl?: string;
                pageTitle?: string;
                pageTextSample?: string;
                fields?: DomScannedFieldInput[];
              }
            | undefined;
          if (!typed?.ok || !Array.isArray(typed.fields)) {
            resolve({
              ok: false,
              fields: [],
              error: 'Active tab did not respond (internal browser page or reload target tab).',
            });
            return;
          }
          resolve({
            ok: true,
            pageUrl: typed.pageUrl,
            pageTitle: typed.pageTitle,
            pageTextSample: typed.pageTextSample || '',
            fields: typed.fields,
          });
        }
      );
    });
  });
}

export async function autofillActiveTabFields(
  fields: Array<{ selector: string; name?: string; value: string }>
): Promise<{ ok: boolean; filledCount: number; skippedCount: number; error?: string }> {
  const chromeApi = getChrome();
  if (!chromeApi?.tabs) {
    return {
      ok: false,
      filledCount: 0,
      skippedCount: fields.length,
      error: 'Direct tab injection works inside Chrome Extension Side Panel / Popup.',
    };
  }
  return new Promise((resolve) => {
    chromeApi.tabs!.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        resolve({
          ok: false,
          filledCount: 0,
          skippedCount: fields.length,
          error: 'No active browser tab found.',
        });
        return;
      }
      chromeApi.tabs!.sendMessage(
        tabId,
        { type: 'VERIPULSE_AUTOFILL_FIELDS', fields },
        (res) => {
          const typed = res as
            | { ok?: boolean; filledCount?: number; skippedCount?: number }
            | undefined;
          if (!typed?.ok) {
            resolve({
              ok: false,
              filledCount: 0,
              skippedCount: fields.length,
              error: 'Could not inject values into active tab (try reloading the target tab).',
            });
            return;
          }
          resolve({
            ok: true,
            filledCount: typed.filledCount || 0,
            skippedCount: typed.skippedCount || 0,
          });
        }
      );
    });
  });
}

export async function analyzeScreenOrWebsiteWithAi(params: {
  mode?: 'fields_and_tests' | 'autofill_only' | 'website_tests_only';
  url?: string;
  pageTitle?: string;
  locale?: 'bd' | 'global';
  dataTone?: 'valid' | 'edge';
  lang?: 'en' | 'bn';
  imageBase64?: string;
  imageMimeType?: string;
  domFields?: DomScannedFieldInput[];
  pageTextSample?: string;
}): Promise<{ ok: boolean; analysis?: SmartScreenAnalysisResult; error?: string }> {
  const session = await getActiveSession();
  const base = (session.serverUrl || getDefaultServerUrl()).replace(/\/+$/, '');
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session.bearerToken) {
      headers.Authorization = `Bearer ${session.bearerToken}`;
    }
    const resp = await fetch(`${base}/api/ai/scan-analyze`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(params),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      analysis?: SmartScreenAnalysisResult;
      error?: string;
    };
    if (!resp.ok || !data.ok || !data.analysis) {
      return {
        ok: false,
        error: data.error || `Server returned status ${resp.status}`,
      };
    }
    return { ok: true, analysis: data.analysis };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Unable to reach VeriPulse AI backend server.',
    };
  }
}
