import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BellRing,
  Blocks,
  BookOpen,
  Bug,
  Calculator,
  CheckCircle2,
  Cloud,
  GitBranch,
  Layers,
  LogIn,
  Megaphone,
  Menu,
  Moon,
  Navigation,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  ScanEye,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UserCheck,
  Workflow,
  X,
} from 'lucide-react';
import { AccountSyncModal } from './components/AccountSyncModal';
import { BugAndTestStudioView } from './components/BugAndTestStudioView';
import { BusinessLogicView } from './components/BusinessLogicView';
import { ContentFormulaView } from './components/ContentFormulaView';
import { CoverageInspectorView } from './components/CoverageInspectorView';
import { ExtensionSandboxView } from './components/ExtensionSandboxView';
import { FakeGpsView } from './components/FakeGpsView';
import { FlowchartStudioView } from './components/FlowchartStudioView';
import { QaArchitectureDiagram } from './components/QaArchitectureDiagram';
import { QaGuideView } from './components/QaGuideView';
import { RecycleBinView } from './components/RecycleBinView';
import { RoleMatrixView } from './components/RoleMatrixView';
import { SelfAlertView } from './components/SelfAlertView';
import { SettingsView } from './components/SettingsView';
import { SmartScreenQaView } from './components/SmartScreenQaView';
import { VisualMatchView } from './components/VisualMatchView';
import { WorkflowFlowsView } from './components/WorkflowFlowsView';
import {
  DEFAULT_FAKE_GPS_CONFIG,
  DEFAULT_SCAN_RESULT,
  DEFAULT_WORKSPACE,
} from './data/defaultWorkspace';
import { pickLang, UI_COPY } from './i18n/translations';
import {
  AppLanguage,
  CloudSyncSession,
  CoverageScanResult,
  EnvironmentName,
  FakeGpsConfig,
  InspectedElement,
  ProjectWorkspace,
  RecordedStep,
  RecordingState,
  RecycleBinItem,
  SelfAlert,
  UserSyncBundle,
  WorkspaceState,
} from './types/flowguard';
import {
  appendRecordedStep,
  clearAllStoredData,
  clearRecordedSteps,
  deleteSelfAlert,
  dismissFiredAlert,
  getDefaultServerUrl,
  isChromeExtensionContext,
  loadInitialBundle,
  loadSelfAlerts,
  markSelfAlertTriggered,
  pullCloudBundle,
  pushCloudBundle,
  saveFakeGpsConfig,
  saveInspectedElement,
  saveScanResult,
  saveTheme,
  saveWorkspace,
  scheduleSelfAlert,
  setRecordingActive,
  STORAGE_KEYS,
  subscribeStorageChanges,
} from './utils/extensionBridge';
import {
  createRecycleBinItem,
  detectProjectDeletions,
  purgeExpiredRecycleBin,
  restoreFromRecycleBin,
} from './utils/recycleBin';

type SectionKey =
  | 'overview'
  | 'flows'
  | 'rbac'
  | 'logic'
  | 'content'
  | 'visual'
  | 'bugStudio'
  | 'coverage'
  | 'diagram'
  | 'alerts'
  | 'fakeGps'
  | 'smartScan'
  | 'recycleBin'
  | 'guide'
  | 'extension'
  | 'settings';

const NAV_ITEMS: Array<{
  key: SectionKey;
  stepNum?: string;
  group: 'suite' | 'runtime';
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
  iconBgClass: string;
}> = [
  {
    key: 'flows',
    stepNum: '01',
    group: 'suite',
    icon: Layers,
    activeClass: 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold',
    iconBgClass: 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400',
  },
  {
    key: 'rbac',
    stepNum: '02',
    group: 'suite',
    icon: ShieldCheck,
    activeClass: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold',
    iconBgClass: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'logic',
    stepNum: '03',
    group: 'suite',
    icon: GitBranch,
    activeClass: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-semibold',
    iconBgClass: 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400',
  },
  {
    key: 'content',
    stepNum: '04',
    group: 'suite',
    icon: Calculator,
    activeClass: 'bg-fuchsia-50 dark:bg-fuchsia-950/50 text-fuchsia-700 dark:text-fuchsia-300 font-semibold',
    iconBgClass: 'bg-fuchsia-100 dark:bg-fuchsia-950 text-fuchsia-600 dark:text-fuchsia-400',
  },
  {
    key: 'visual',
    stepNum: '05',
    group: 'suite',
    icon: ScanEye,
    activeClass: 'bg-pink-50 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300 font-semibold',
    iconBgClass: 'bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-400',
  },
  {
    key: 'bugStudio',
    stepNum: '06',
    group: 'suite',
    icon: Bug,
    activeClass: 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-semibold',
    iconBgClass: 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400',
  },
  {
    key: 'diagram',
    stepNum: '07',
    group: 'suite',
    icon: Workflow,
    activeClass: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold',
    iconBgClass: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400',
  },
  {
    key: 'coverage',
    stepNum: '08',
    group: 'suite',
    icon: Radar,
    activeClass: 'bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 font-semibold',
    iconBgClass: 'bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400',
  },
  {
    key: 'extension',
    stepNum: '09',
    group: 'suite',
    icon: Blocks,
    activeClass: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-semibold',
    iconBgClass: 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400',
  },
  {
    key: 'alerts',
    stepNum: '10',
    group: 'suite',
    icon: BellRing,
    activeClass: 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 font-semibold',
    iconBgClass: 'bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400',
  },
  {
    key: 'fakeGps',
    stepNum: '11',
    group: 'suite',
    icon: Navigation,
    activeClass: 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 font-semibold',
    iconBgClass: 'bg-cyan-100 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400',
  },
  {
    key: 'smartScan',
    stepNum: '12',
    group: 'suite',
    icon: Sparkles,
    activeClass: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold',
    iconBgClass: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400',
  },
  {
    key: 'overview',
    group: 'runtime',
    icon: Network,
    activeClass: 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 font-semibold',
    iconBgClass: 'bg-cyan-100 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400',
  },
  {
    key: 'recycleBin',
    group: 'runtime',
    icon: Trash2,
    activeClass: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-semibold',
    iconBgClass: 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400',
  },
  {
    key: 'guide',
    group: 'runtime',
    icon: BookOpen,
    activeClass: 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-semibold',
    iconBgClass: 'bg-teal-100 dark:bg-teal-950 text-teal-600 dark:text-teal-400',
  },
  {
    key: 'settings',
    group: 'runtime',
    icon: Settings,
    activeClass: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-semibold',
    iconBgClass: 'bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400',
  },
];

function getInitialSection(): SectionKey {
  const hash = window.location.hash.replace('#', '') as SectionKey;
  if (NAV_ITEMS.some((i) => i.key === hash)) return hash;
  return 'flows';
}

function playAlertChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [587.33, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.36);
    });
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [section, setSection] = useState<SectionKey>(getInitialSection);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('veripulse_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [workspace, setWorkspace] = useState<WorkspaceState>(DEFAULT_WORKSPACE);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [lang, setLang] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem('testally_lang');
      return saved === 'bn' ? 'bn' : 'en';
    } catch {
      return 'en';
    }
  });
  const [recording, setRecording] = useState<RecordingState>({
    isRecording: false,
    recordedSteps: [],
  });
  const [inspected, setInspected] = useState<InspectedElement | null>(null);
  const [lastScan, setLastScan] = useState<CoverageScanResult>(DEFAULT_SCAN_RESULT);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDomain, setNewProjDomain] = useState('');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [selfAlerts, setSelfAlerts] = useState<SelfAlert[]>([]);
  const [activeAlertPopup, setActiveAlertPopup] = useState<SelfAlert | null>(null);
  const [fakeGps, setFakeGps] = useState<FakeGpsConfig>(DEFAULT_FAKE_GPS_CONFIG);
  const [session, setSession] = useState<CloudSyncSession>(() => ({
    user: null,
    serverUrl: getDefaultServerUrl(),
    bearerToken: '',
    lastSyncedAt: null,
  }));
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const skipNextPushRef = useRef(false);
  const [pendingDelete, setPendingDelete] = useState<{
    title: string;
    categoryLabel: string;
    isPermanent?: boolean;
    staysInBin?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const notify = (msg: string) => {
    setToastMessage(msg);
  };

  const handleToggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('veripulse_sidebar_collapsed', next ? '1' : '0');
      } catch {
        // Ignore storage restrictions
      }
      return next;
    });
  };

  const handleChangeLanguage = (nextLang: AppLanguage) => {
    setLang(nextLang);
    try {
      localStorage.setItem('testally_lang', nextLang);
    } catch {
      // Ignore
    }
    notify(
      nextLang === 'bn'
        ? 'ভাষা বাংলায় পরিবর্তন করা হয়েছে।'
        : 'Language switched to English.'
    );
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(''), 2600);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingDelete(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingDelete]);

  useEffect(() => {
    let active = true;
    Promise.all([loadInitialBundle(), loadSelfAlerts()]).then(([bundle, alertState]) => {
      if (!active) return;
      skipNextPushRef.current = true;
      const cleanedBin = purgeExpiredRecycleBin(bundle.workspace.recycleBin);
      const initialWs =
        cleanedBin.length !== (bundle.workspace.recycleBin || []).length
          ? { ...bundle.workspace, recycleBin: cleanedBin }
          : bundle.workspace;
      if (initialWs !== bundle.workspace) {
        saveWorkspace(initialWs);
      }
      setWorkspace(initialWs);
      setTheme(bundle.preferences.theme);
      setRecording(bundle.recording);
      setInspected(bundle.inspected);
      setLastScan(bundle.lastScan);
      setFakeGps(bundle.fakeGps);
      setSelfAlerts(alertState.alerts);
      setSession(bundle.session);
      setSyncStatus(bundle.session.user ? 'synced' : 'idle');
      if (alertState.firedAlert) {
        setActiveAlertPopup(alertState.firedAlert);
      }
      setLoaded(true);
    });

    const unsub = subscribeStorageChanges((key, value) => {
      if (key === STORAGE_KEYS.WORKSPACE && value) {
        skipNextPushRef.current = true;
        const ws = value as WorkspaceState;
        setWorkspace({ ...ws, recycleBin: purgeExpiredRecycleBin(ws.recycleBin) });
      } else if (key === STORAGE_KEYS.PREFERENCES && value) {
        const prefs = value as { theme?: 'light' | 'dark' };
        if (prefs.theme) setTheme(prefs.theme);
      } else if (key === STORAGE_KEYS.RECORDING && value) {
        skipNextPushRef.current = true;
        setRecording(value as RecordingState);
      } else if (key === STORAGE_KEYS.INSPECTED) {
        skipNextPushRef.current = true;
        setInspected((value as InspectedElement | null) || null);
      } else if (key === STORAGE_KEYS.LAST_SCAN && value) {
        skipNextPushRef.current = true;
        setLastScan(value as CoverageScanResult);
      } else if (key === STORAGE_KEYS.ALERTS) {
        skipNextPushRef.current = true;
        setSelfAlerts(Array.isArray(value) ? (value as SelfAlert[]) : []);
      } else if (key === STORAGE_KEYS.FAKE_GPS && value) {
        skipNextPushRef.current = true;
        setFakeGps(value as FakeGpsConfig);
      } else if (key === STORAGE_KEYS.FIRED_ALERT) {
        const fired = (value as SelfAlert | null) || null;
        setActiveAlertPopup(fired);
        if (fired && fired.soundEnabled !== false) {
          playAlertChime();
        }
      } else if (key === 'veripulse_ext_sync_conn_v1') {
        const conn = value as CloudSyncSession | undefined;
        if (conn?.user) {
          setSession(conn);
          setSyncStatus('synced');
        } else {
          setSession({
            user: null,
            serverUrl: getDefaultServerUrl(),
            bearerToken: '',
            lastSyncedAt: null,
          });
          setSyncStatus('idle');
        }
      }
    });

    const onHashChange = () => setSection(getInitialSection());
    window.addEventListener('hashchange', onHashChange);

    return () => {
      active = false;
      unsub();
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  // Auto-sync user workspace changes to the per-user isolated server store
  useEffect(() => {
    if (!loaded || !session.user) return;
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    setSyncStatus('syncing');
    const timer = setTimeout(() => {
      pushCloudBundle({
        workspace,
        fakeGps,
        alerts: selfAlerts,
        lastScan,
        recording,
        inspected,
      }).then((res) => {
        if (res.ok) {
          setSyncStatus('synced');
          if (res.updatedAt) {
            setSession((prev) =>
              prev.user ? { ...prev, lastSyncedAt: res.updatedAt! } : prev
            );
          }
        } else {
          setSyncStatus('error');
        }
      });
    }, 850);
    return () => clearTimeout(timer);
  }, [
    loaded,
    session.user?.id,
    workspace,
    fakeGps,
    selfAlerts,
    lastScan,
    recording,
    inspected,
  ]);

  const triggerPopupAndNotification = (alert: SelfAlert, persist = true) => {
    const triggered: SelfAlert = { ...alert, status: 'triggered' };
    if (persist) {
      markSelfAlertTriggered(triggered);
      setSelfAlerts((prev) =>
        prev.map((a) => (a.id === triggered.id ? triggered : a))
      );
    }
    setActiveAlertPopup(triggered);
    if (triggered.soundEnabled !== false) {
      playAlertChime();
    }
    if (
      !isChromeExtensionContext() &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(triggered.title || 'VeriPulse Self Alert', {
          body: triggered.message,
          icon: '/icons/icon128.png',
        });
      } catch {
        // Ignore browser notification failure
      }
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const due = selfAlerts.filter(
        (a) => a.status === 'scheduled' && a.triggerAt <= now
      );
      if (due.length === 0) return;
      for (const item of due) {
        triggerPopupAndNotification(item, true);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [selfAlerts]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Studio-level navigator.geolocation override when Fake GPS is enabled (so live probe works in preview too)
  useEffect(() => {
    if (!fakeGps.enabled || typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }
    const geo = navigator.geolocation;
    const origGetCurrent = geo.getCurrentPosition.bind(geo);
    const spoofedGetCurrent: Geolocation['getCurrentPosition'] = (success) => {
      if (typeof success !== 'function') return;
      const pos = {
        coords: {
          latitude: fakeGps.latitude,
          longitude: fakeGps.longitude,
          accuracy: Math.max(1, fakeGps.accuracy || 15),
          altitude: fakeGps.altitude,
          altitudeAccuracy: fakeGps.altitude !== null ? 5 : null,
          heading: fakeGps.heading,
          speed: fakeGps.speed,
          toJSON() {
            return this;
          },
        },
        timestamp: Date.now(),
        __veripulseSpoofed: true,
        toJSON() {
          return { coords: this.coords, timestamp: this.timestamp };
        },
      };
      setTimeout(() => success(pos as unknown as GeolocationPosition), 15);
    };
    try {
      Object.defineProperty(geo, 'getCurrentPosition', {
        value: spoofedGetCurrent,
        configurable: true,
        writable: true,
      });
    } catch {
      geo.getCurrentPosition = spoofedGetCurrent;
    }
    return () => {
      try {
        Object.defineProperty(geo, 'getCurrentPosition', {
          value: origGetCurrent,
          configurable: true,
          writable: true,
        });
      } catch {
        geo.getCurrentPosition = origGetCurrent;
      }
    };
  }, [fakeGps]);

  const applyCloudBundleToState = (bundle: UserSyncBundle) => {
    skipNextPushRef.current = true;
    const cleanedBin = purgeExpiredRecycleBin(bundle.workspace?.recycleBin);
    const ws: WorkspaceState = {
      ...(bundle.workspace || DEFAULT_WORKSPACE),
      recycleBin: cleanedBin,
    };
    setWorkspace(ws);
    if (ws.settings?.theme) {
      setTheme(ws.settings.theme);
    }
    setFakeGps(bundle.fakeGps || DEFAULT_FAKE_GPS_CONFIG);
    setSelfAlerts(Array.isArray(bundle.alerts) ? bundle.alerts : []);
    setLastScan(bundle.lastScan || DEFAULT_SCAN_RESULT);
    setRecording(bundle.recording || { isRecording: false, recordedSteps: [] });
    setInspected(bundle.inspected || null);
    setActiveAlertPopup(null);
  };

  const handleAuthSuccess = (
    nextSession: CloudSyncSession,
    bundle: UserSyncBundle
  ) => {
    setSession(nextSession);
    applyCloudBundleToState(bundle);
    setSyncStatus('synced');
  };

  const handleSignedOut = () => {
    skipNextPushRef.current = true;
    setSession({
      user: null,
      serverUrl: getDefaultServerUrl(),
      bearerToken: '',
      lastSyncedAt: null,
    });
    setWorkspace(DEFAULT_WORKSPACE);
    setFakeGps(DEFAULT_FAKE_GPS_CONFIG);
    setSelfAlerts([]);
    setActiveAlertPopup(null);
    setLastScan(DEFAULT_SCAN_RESULT);
    setRecording({ isRecording: false, recordedSteps: [] });
    setInspected(null);
    setSyncStatus('idle');
  };

  const handleSyncNow = async () => {
    if (!session.user) {
      setAccountModalOpen(true);
      return;
    }
    setSyncStatus('syncing');
    const res = await pullCloudBundle();
    if (res.ok && res.bundle) {
      if (isChromeExtensionContext()) {
        const alertsRes = await loadSelfAlerts();
        applyCloudBundleToState({ ...res.bundle, alerts: alertsRes.alerts });
      } else {
        applyCloudBundleToState(res.bundle);
      }
      setSession((prev) => ({
        ...prev,
        user: res.user || prev.user,
        lastSyncedAt: res.updatedAt || new Date().toISOString(),
      }));
      setSyncStatus('synced');
      notify(
        pickLang(
          lang,
          'Workspace synced with your isolated account.',
          'আপনার অ্যাকাউন্টের সাথে ওয়ার্কস্পেস সিঙ্ক সম্পন্ন হয়েছে।'
        )
      );
    } else {
      setSyncStatus('error');
      notify(res.error || 'Sync failed.');
    }
  };

  const activeProject = useMemo<ProjectWorkspace>(() => {
    return (
      workspace.projects.find((p) => p.id === workspace.activeProjectId) ||
      workspace.projects[0]
    );
  }, [workspace]);

  const pinnedNotices = useMemo(
    () => (activeProject.notices || []).filter((n) => n.pinnedOnTop),
    [activeProject.notices]
  );

  const handleSelectSection = (next: SectionKey) => {
    setSection(next);
    window.location.hash = next;
    setSidebarOpen(false);
  };

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    saveTheme(next);
    const updated: WorkspaceState = {
      ...workspace,
      settings: { ...workspace.settings, theme: next },
    };
    setWorkspace(updated);
    saveWorkspace(updated);
  };

  const activeRecycleBin = useMemo(
    () => purgeExpiredRecycleBin(workspace.recycleBin),
    [workspace.recycleBin]
  );

  const handleUpdateWorkspace = (next: WorkspaceState) => {
    const cleaned: WorkspaceState = {
      ...next,
      recycleBin: purgeExpiredRecycleBin(next.recycleBin),
    };
    setWorkspace(cleaned);
    saveWorkspace(cleaned);
  };

  const applyProjectDirect = (
    updatedProject: ProjectWorkspace,
    addedRecycleItems: RecycleBinItem[] = []
  ) => {
    const existingBin = purgeExpiredRecycleBin(workspace.recycleBin);
    const next: WorkspaceState = {
      ...workspace,
      projects: workspace.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
      recycleBin:
        addedRecycleItems.length > 0
          ? [...addedRecycleItems, ...existingBin]
          : existingBin,
    };
    handleUpdateWorkspace(next);
  };

  const handleUpdateProject = (updatedProject: ProjectWorkspace) => {
    const detected = detectProjectDeletions(activeProject, updatedProject, lang);
    if (detected.items.length > 0) {
      setPendingDelete({
        title: detected.summaryTitle,
        categoryLabel: detected.categoryLabel,
        staysInBin: true,
        onConfirm: () => {
          applyProjectDirect(updatedProject, detected.items);
          notify(
            pickLang(
              lang,
              'Moved to Recycle Bin (kept safely for 3 days).',
              'রিসাইকেল বিনে পাঠানো হয়েছে (৩ দিন পর্যন্ত সুরক্ষিত থাকবে)।'
            )
          );
        },
      });
      return;
    }
    applyProjectDirect(updatedProject);
  };

  const handleSwitchProject = (projectId: string) => {
    handleUpdateWorkspace({ ...workspace, activeProjectId: projectId });
  };

  const handleSwitchEnvironment = (env: EnvironmentName) => {
    handleUpdateProject({ ...activeProject, activeEnvironment: env });
    notify(
      pickLang(
        lang,
        `Switched target environment to ${env}.`,
        `টার্গেট এনভায়রনমেন্ট ${env}-এ পরিবর্তন হয়েছে।`
      )
    );
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    const id = `proj_${Date.now()}`;
    const created: ProjectWorkspace = {
      id,
      name: newProjName.trim(),
      domain: newProjDomain.trim() || 'app.example.test',
      activeEnvironment: 'staging',
      flows: [
        {
          id: `flow_${Date.now()}`,
          name: 'Primary Test Flow',
          module: 'Core Forms',
          targetUrl: `https://${newProjDomain.trim() || 'app.example.test'}/`,
          lastRunAt: null,
          steps: [],
        },
      ],
      rbacRules: [],
      stateTransitions: [],
      dateTimeRules: [],
      dataDependencies: [],
      notices: [],
      approvalChain: [],
    };
    handleUpdateWorkspace({
      ...workspace,
      activeProjectId: id,
      projects: [...workspace.projects, created],
    });
    setNewProjName('');
    setNewProjDomain('');
    setShowNewProject(false);
    notify(
      pickLang(
        lang,
        `Created QA workspace "${created.name}".`,
        `"${created.name}" প্রজেক্ট তৈরি হয়েছে।`
      )
    );
  };

  const handleToggleRecording = (next: boolean) => {
    setRecording((prev) => ({ ...prev, isRecording: next }));
    setRecordingActive(next);
    notify(
      next
        ? pickLang(
            lang,
            'Recording started — interact with the page.',
            'রেকর্ডিং শুরু হয়েছে — পেজে ক্লিক বা টাইপ করুন।'
          )
        : pickLang(lang, 'Recording paused.', 'রেকর্ডিং থামানো হয়েছে।')
    );
  };

  const handleClearRecorded = (silent = false) => {
    if (silent || recording.recordedSteps.length === 0) {
      setRecording((prev) => ({ ...prev, recordedSteps: [] }));
      clearRecordedSteps();
      return;
    }
    const stepsCopy = [...recording.recordedSteps];
    setPendingDelete({
      title: pickLang(
        lang,
        `${stepsCopy.length} Recorded Step(s)`,
        `রেকর্ড করা ${stepsCopy.length}টি স্টেপ`
      ),
      categoryLabel: pickLang(lang, 'Recorded Steps', 'রেকর্ড করা স্টেপস'),
      staysInBin: true,
      onConfirm: () => {
        const rbItem = createRecycleBinItem({
          category: 'recorded_steps',
          projectId: activeProject.id,
          projectName: activeProject.name,
          title: `${stepsCopy.length} Recorded Step(s)`,
          subtitle: stepsCopy[0]?.title || 'Action recorder buffer',
          payload: stepsCopy,
        });
        handleUpdateWorkspace({
          ...workspace,
          recycleBin: [rbItem, ...activeRecycleBin],
        });
        setRecording((prev) => ({ ...prev, recordedSteps: [] }));
        clearRecordedSteps();
        notify(
          pickLang(
            lang,
            'Recorded steps moved to Recycle Bin (3 days).',
            'রেকর্ড করা স্টেপগুলো রিসাইকেল বিনে পাঠানো হয়েছে (৩ দিন থাকবে)।'
          )
        );
      },
    });
  };

  const handleInspectElement = (el: InspectedElement) => {
    setInspected(el);
    saveInspectedElement(el);
  };

  const handleUpdateScan = (scan: CoverageScanResult) => {
    setLastScan(scan);
    saveScanResult(scan);
  };

  const handleSendSelectorToFlow = (selector: string, title: string) => {
    const newStep = {
      id: `step_ins_${Date.now()}`,
      title,
      action: 'click' as const,
      targetElement: selector,
      testData: '',
      isSensitiveData: false,
      expectedRule: 'Verify picked control interaction',
      observedResult: 'Added from Element Picker',
      status: 'pending' as const,
    };
    const nextFlows =
      activeProject.flows.length === 0
        ? [
            {
              id: `flow_${Date.now()}`,
              name: 'Captured Flow 1',
              module: 'Picked Controls',
              targetUrl: `https://${activeProject.domain}/`,
              lastRunAt: null,
              steps: [newStep],
            },
          ]
        : activeProject.flows.map((f, idx) =>
            idx === 0 ? { ...f, steps: [...f.steps, newStep] } : f
          );
    handleUpdateProject({ ...activeProject, flows: nextFlows });
    handleSelectSection('flows');
    notify(`Added locator ${selector} to active flow.`);
  };

  const handleUnpinNotice = (id: string) => {
    handleUpdateProject({
      ...activeProject,
      notices: (activeProject.notices || []).map((n) =>
        n.id === id ? { ...n, pinnedOnTop: false } : n
      ),
    });
  };

  const metrics = useMemo(() => {
    const totalSteps = activeProject.flows.reduce(
      (sum, f) => sum + f.steps.length,
      0
    );
    const passedSteps = activeProject.flows.reduce(
      (sum, f) => sum + f.steps.filter((s) => s.status === 'passed').length,
      0
    );
    const stepPct = totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 0;

    const rbacVerified = activeProject.rbacRules.filter(
      (r) => r.observed === r.expected
    ).length;
    const rbacPct = activeProject.rbacRules.length
      ? Math.round((rbacVerified / activeProject.rbacRules.length) * 100)
      : 0;

    const logicTotal =
      activeProject.stateTransitions.length +
      activeProject.dateTimeRules.length +
      activeProject.dataDependencies.length;
    const logicPassed =
      activeProject.stateTransitions.filter((s) => s.lastVerifiedStatus === 'passed')
        .length +
      activeProject.dateTimeRules.filter((d) => d.actualOutcome === d.expectedOutcome)
        .length +
      activeProject.dataDependencies.filter((d) => d.status === 'passed').length;
    const logicPct = logicTotal > 0 ? Math.round((logicPassed / logicTotal) * 100) : 0;

    const covTotal = lastScan.elements.length;
    const covTested = lastScan.elements.filter(
      (e) => e.testState === 'Tested'
    ).length;
    const covPct = covTotal > 0 ? Math.round((covTested / covTotal) * 100) : 0;

    return {
      flowsCount: activeProject.flows.length,
      totalSteps,
      passedSteps,
      stepPct,
      rbacTotal: activeProject.rbacRules.length,
      rbacVerified,
      rbacPct,
      logicTotal,
      logicPassed,
      logicPct,
      covPct,
      covTested,
      covTotal,
      noticesCount: (activeProject.notices || []).length,
    };
  }, [activeProject, lastScan]);

  const currentNavTitle = pickLang(
    lang,
    UI_COPY.nav[section].en,
    UI_COPY.nav[section].bn
  );

  if (!loaded) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-3">
          <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-24 w-full rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Navigation Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 ${
          sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-64'
        } border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col transition-all duration-150 lg:static lg:translate-x-0 shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div
          className={`h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center ${
            sidebarCollapsed ? 'justify-between lg:justify-center lg:px-2' : 'justify-between'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/icons/icon48.png"
              alt="VeriPulse"
              className="w-7 h-7 rounded-md shrink-0"
            />
            <div className={`leading-tight ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
              <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                VeriPulse
              </div>
              <div className="text-[10px] font-medium text-teal-600 dark:text-teal-400 whitespace-nowrap">
                {pickLang(lang, UI_COPY.brandSub.en, UI_COPY.brandSub.bn)}
              </div>
            </div>
          </div>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={handleToggleSidebarCollapse}
              title={pickLang(lang, 'Collapse sidebar', 'সাইডবার ছোট করুন')}
              aria-label="Collapse sidebar"
              className="hidden lg:inline-flex p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-md text-slate-500 lg:hidden cursor-pointer"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Project & Environment Switcher */}
        <div
          className={`p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5 ${
            sidebarCollapsed ? 'lg:hidden' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <label
              htmlFor="project-select"
              className="text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              {pickLang(lang, UI_COPY.workspaceLabel.en, UI_COPY.workspaceLabel.bn)}
            </label>
            <button
              type="button"
              onClick={() => setShowNewProject(!showNewProject)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              {pickLang(lang, UI_COPY.newBtn.en, UI_COPY.newBtn.bn)}
            </button>
          </div>
          <select
            id="project-select"
            value={activeProject.id}
            onChange={(e) => handleSwitchProject(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-slate-100"
          >
            {workspace.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
            {(['staging', 'qa', 'production'] as const).map((env) => (
              <button
                key={env}
                type="button"
                onClick={() => handleSwitchEnvironment(env)}
                className={`py-1 rounded-md text-[11px] font-semibold capitalize transition-colors cursor-pointer ${
                  activeProject.activeEnvironment === env
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {env === 'production' ? 'prod' : env}
              </button>
            ))}
          </div>

          {showNewProject && (
            <form onSubmit={handleCreateProject} className="pt-2 space-y-2">
              <input
                type="text"
                placeholder={pickLang(lang, 'Workspace name', 'প্রজেক্টের নাম')}
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                placeholder={pickLang(lang, 'Target website domain', 'ওয়েবসাইট ডোমেইন')}
                value={newProjDomain}
                onChange={(e) => setNewProjDomain(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="submit"
                className="w-full py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                {pickLang(lang, 'Create Workspace', 'প্রজেক্ট তৈরি করুন')}
              </button>
            </form>
          )}
        </div>

        {/* Compact Environment Pill when Collapsed on Desktop */}
        {sidebarCollapsed && (
          <div className="hidden lg:flex flex-col items-center gap-1.5 py-2.5 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleToggleSidebarCollapse}
              title={pickLang(lang, 'Expand sidebar', 'সাইডবার বড় করুন')}
              aria-label="Expand sidebar"
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const envs: EnvironmentName[] = ['staging', 'qa', 'production'];
                const next = envs[(envs.indexOf(activeProject.activeEnvironment) + 1) % envs.length];
                handleSwitchEnvironment(next);
              }}
              title={`${activeProject.name} · ${activeProject.activeEnvironment.toUpperCase()} (Click to cycle)`}
              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[10px] font-mono font-bold uppercase text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              {activeProject.activeEnvironment === 'production'
                ? 'PRD'
                : activeProject.activeEnvironment === 'staging'
                  ? 'STG'
                  : 'QA'}
            </button>
          </div>
        )}

        {/* Sequential Module Navigation */}
        <nav className={`flex-1 overflow-y-auto ${sidebarCollapsed ? 'p-3 lg:p-2 space-y-4' : 'p-3 space-y-5'}`}>
          <div className="space-y-1">
            <div className={`px-3 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
              {pickLang(lang, UI_COPY.suiteGroup.en, UI_COPY.suiteGroup.bn)}
            </div>
            {NAV_ITEMS.filter((i) => i.group === 'suite').map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              const navLabel = pickLang(lang, UI_COPY.nav[item.key].en, UI_COPY.nav[item.key].bn);
              const alertCount =
                item.key === 'alerts'
                  ? selfAlerts.filter((a) => a.status === 'scheduled').length
                  : 0;
              return (
                <button
                  key={item.key}
                  type="button"
                  title={navLabel}
                  onClick={() => handleSelectSection(item.key)}
                  className={`relative w-full flex items-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    sidebarCollapsed ? 'justify-between px-2.5 lg:justify-center lg:px-2' : 'justify-between px-2.5'
                  } ${
                    active
                      ? item.activeClass
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${item.iconBgClass}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className={`truncate ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                      {navLabel}
                    </span>
                  </span>
                  {item.key === 'alerts' && alertCount > 0 ? (
                    <>
                      <span
                        className={`px-1.5 py-0.5 rounded-full bg-orange-600 text-white text-[10px] font-mono font-bold shrink-0 ${
                          sidebarCollapsed ? 'lg:hidden' : ''
                        }`}
                      >
                        {alertCount}
                      </span>
                      {sidebarCollapsed && (
                        <span className="hidden lg:block absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-600" />
                      )}
                    </>
                  ) : item.key === 'fakeGps' && fakeGps.enabled ? (
                    <>
                      <span
                        className={`px-1.5 py-0.5 rounded-full bg-cyan-600 text-white text-[9px] font-mono font-bold shrink-0 ${
                          sidebarCollapsed ? 'lg:hidden' : ''
                        }`}
                      >
                        ON
                      </span>
                      {sidebarCollapsed && (
                        <span className="hidden lg:block absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-600" />
                      )}
                    </>
                  ) : (
                    item.stepNum && (
                      <span
                        className={`text-[10px] font-mono opacity-55 shrink-0 ${
                          sidebarCollapsed ? 'lg:hidden' : ''
                        }`}
                      >
                        {item.stepNum}
                      </span>
                    )
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-1">
            <div className={`px-3 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
              {pickLang(lang, UI_COPY.studioGroup.en, UI_COPY.studioGroup.bn)}
            </div>
            {NAV_ITEMS.filter((i) => i.group === 'runtime').map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              const navLabel = pickLang(lang, UI_COPY.nav[item.key].en, UI_COPY.nav[item.key].bn);
              return (
                <button
                  key={item.key}
                  type="button"
                  title={navLabel}
                  onClick={() => handleSelectSection(item.key)}
                  className={`relative w-full flex items-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    sidebarCollapsed ? 'justify-between px-2.5 lg:justify-center lg:px-2' : 'justify-between px-2.5'
                  } ${
                    active
                      ? item.activeClass
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${item.iconBgClass}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className={`truncate ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                      {navLabel}
                    </span>
                  </span>
                  {item.key === 'recycleBin' && activeRecycleBin.length > 0 && (
                    <>
                      <span
                        className={`px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-mono font-bold shrink-0 ${
                          sidebarCollapsed ? 'lg:hidden' : ''
                        }`}
                      >
                        {activeRecycleBin.length}
                      </span>
                      {sidebarCollapsed && (
                        <span className="hidden lg:block absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-600" />
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <div
          className={`border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-2 ${
            sidebarCollapsed ? 'p-4 lg:p-2' : 'p-4'
          }`}
        >
          <button
            type="button"
            title={
              session.user
                ? session.user.name
                : pickLang(lang, 'Guest (0-Leak Mode)', 'গেস্ট সেশন (সাইন ইন)')
            }
            onClick={() => setAccountModalOpen(true)}
            className={`w-full flex items-center gap-2 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-blue-300 dark:hover:border-blue-700 transition-colors text-left cursor-pointer ${
              sidebarCollapsed ? 'justify-between px-2.5 lg:justify-center lg:px-2' : 'justify-between px-2.5'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              {session.user ? (
                <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <LogIn className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              )}
              <span className={`truncate font-semibold text-slate-800 dark:text-slate-200 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                {session.user
                  ? session.user.name
                  : pickLang(lang, 'Guest (0-Leak Mode)', 'গেস্ট সেশন (সাইন ইন)')}
              </span>
            </span>
            {session.user && (
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  syncStatus === 'syncing'
                    ? 'bg-amber-500'
                    : syncStatus === 'error'
                      ? 'bg-rose-500'
                      : 'bg-emerald-500'
                }`}
              />
            )}
          </button>
          <div className={`space-y-0.5 px-0.5 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
            <div className="font-semibold text-slate-700 dark:text-slate-300">
              {isChromeExtensionContext()
                ? pickLang(lang, 'Chrome Extension Active', 'ক্রোম এক্সটেনশন সক্রিয়')
                : pickLang(lang, 'Full Web + Extension Sync', 'ফুল ওয়েব ও এক্সটেনশন সিঙ্ক')}
            </div>
            <div className="font-mono truncate">{activeProject.domain}</div>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 lg:hidden cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToggleSidebarCollapse}
              title={
                sidebarCollapsed
                  ? pickLang(lang, 'Expand sidebar', 'সাইডবার বড় করুন')
                  : pickLang(lang, 'Collapse sidebar', 'সাইডবার ছোট করুন')
              }
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:inline-flex p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0 truncate">
              <span className="text-slate-500 dark:text-slate-400 truncate">
                {activeProject.name}
              </span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentNavTitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Bilingual Language Switcher (English / বাংলা) */}
            <div
              className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              role="group"
              aria-label="Language switch"
            >
              <button
                type="button"
                onClick={() => handleChangeLanguage('en')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                  lang === 'en'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => handleChangeLanguage('bn')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                  lang === 'bn'
                    ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                বাংলা
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleSelectSection('overview')}
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                section === 'overview'
                  ? 'border-cyan-300 dark:border-cyan-800 bg-cyan-50/70 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              {pickLang(lang, UI_COPY.topBar.showDiagram.en, UI_COPY.topBar.showDiagram.bn)}
            </button>

            <button
              type="button"
              onClick={() => handleSelectSection('guide')}
              className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                section === 'guide'
                  ? 'border-teal-400 dark:border-teal-700 bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200'
                  : 'border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              {pickLang(lang, UI_COPY.topBar.openGuide.en, UI_COPY.topBar.openGuide.bn)}
            </button>

            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label="Toggle theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setAccountModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                session.user
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {syncStatus === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : session.user ? (
                <Cloud className="w-3.5 h-3.5" />
              ) : (
                <LogIn className="w-3.5 h-3.5" />
              )}
              <span className="max-w-[110px] truncate">
                {session.user
                  ? session.user.name
                  : pickLang(lang, 'Sign In', 'সাইন ইন')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectSection('extension')}
              className="px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-teal-600 hover:brightness-105 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-all"
            >
              {pickLang(
                lang,
                UI_COPY.topBar.getExtension.en,
                UI_COPY.topBar.getExtension.bn
              )}
            </button>
          </div>
        </header>

        {/* Main Viewport — Clean Single-Module Focus */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-5"
            >
              {section === 'overview' && (
                <>
                  {/* Pinned Allowed / QA Notice Banner (Shown in Overview) */}
                  {pinnedNotices.length > 0 && (
                    <div className="space-y-2">
                      {pinnedNotices.map((notice) => {
                        const bannerTheme =
                          notice.type === 'allowed'
                            ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100'
                            : notice.type === 'blocked'
                              ? 'border-rose-300 dark:border-rose-800 bg-rose-50/90 dark:bg-rose-950/40 text-rose-950 dark:text-rose-100'
                              : notice.type === 'restricted'
                                ? 'border-amber-300 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100'
                                : 'border-sky-300 dark:border-sky-800 bg-sky-50/90 dark:bg-sky-950/40 text-sky-950 dark:text-sky-100';

                        const tagBg =
                          notice.type === 'allowed'
                            ? 'bg-emerald-600 text-white'
                            : notice.type === 'blocked'
                              ? 'bg-rose-600 text-white'
                              : notice.type === 'restricted'
                                ? 'bg-amber-600 text-white'
                                : 'bg-sky-600 text-white';

                        return (
                          <div
                            key={notice.id}
                            className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs ${bannerTheme}`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="mt-0.5 shrink-0">
                                {notice.type === 'blocked' ? (
                                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                                ) : (
                                  <Megaphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                )}
                              </div>
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${tagBg}`}
                                  >
                                    {notice.type} Notice
                                  </span>
                                  <span className="text-xs font-bold">{notice.title}</span>
                                  <span className="text-[11px] font-mono opacity-75">
                                    · {notice.scope}
                                  </span>
                                </div>
                                <p className="text-xs opacity-90">{notice.message}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleSelectSection('diagram')}
                                className="px-2.5 py-1 rounded-md border border-current/25 text-[11px] font-semibold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                              >
                                {pickLang(lang, 'Manage Notices', 'নোটিশ দেখুন')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUnpinNotice(notice.id)}
                                aria-label="Dismiss notice banner"
                                className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Colorful Summary Strip */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <button
                      type="button"
                      onClick={() => handleSelectSection('flows')}
                      className="text-left rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-white dark:bg-slate-900 p-4 hover:border-blue-400 dark:hover:border-blue-700 transition-colors shadow-xs cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-blue-700 dark:text-blue-400">
                          {pickLang(
                            lang,
                            UI_COPY.summary.stepsTitle.en,
                            UI_COPY.summary.stepsTitle.bn
                          )}
                        </span>
                        <span className="font-mono tabular-nums">{metrics.stepPct}%</span>
                      </div>
                      <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {metrics.passedSteps} / {metrics.totalSteps}
                      </div>
                      <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${metrics.stepPct}%` }}
                        />
                      </div>
                      <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {metrics.flowsCount}{' '}
                        {pickLang(
                          lang,
                          UI_COPY.summary.activeFlows.en,
                          UI_COPY.summary.activeFlows.bn
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectSection('rbac')}
                      className="text-left rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-white dark:bg-slate-900 p-4 hover:border-emerald-400 dark:hover:border-emerald-700 transition-colors shadow-xs cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">
                          {pickLang(
                            lang,
                            UI_COPY.summary.rbacTitle.en,
                            UI_COPY.summary.rbacTitle.bn
                          )}
                        </span>
                        <span className="font-mono tabular-nums">{metrics.rbacPct}%</span>
                      </div>
                      <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {metrics.rbacVerified} / {metrics.rbacTotal}
                      </div>
                      <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${metrics.rbacPct}%` }}
                        />
                      </div>
                      <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {pickLang(
                          lang,
                          UI_COPY.summary.rbacSub.en,
                          UI_COPY.summary.rbacSub.bn
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectSection('logic')}
                      className="text-left rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-white dark:bg-slate-900 p-4 hover:border-amber-400 dark:hover:border-amber-700 transition-colors shadow-xs cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          {pickLang(
                            lang,
                            UI_COPY.summary.logicTitle.en,
                            UI_COPY.summary.logicTitle.bn
                          )}
                        </span>
                        <span className="font-mono tabular-nums">{metrics.logicPct}%</span>
                      </div>
                      <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {metrics.logicPassed} / {metrics.logicTotal}
                      </div>
                      <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 transition-all duration-300"
                          style={{ width: `${metrics.logicPct}%` }}
                        />
                      </div>
                      <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {pickLang(
                          lang,
                          UI_COPY.summary.logicSub.en,
                          UI_COPY.summary.logicSub.bn
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectSection('coverage')}
                      className="text-left rounded-xl border border-violet-200/80 dark:border-violet-900/50 bg-white dark:bg-slate-900 p-4 hover:border-violet-400 dark:hover:border-violet-700 transition-colors shadow-xs cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-violet-700 dark:text-violet-400">
                          {pickLang(
                            lang,
                            UI_COPY.summary.covTitle.en,
                            UI_COPY.summary.covTitle.bn
                          )}
                        </span>
                        <span className="font-mono tabular-nums">{metrics.covPct}%</span>
                      </div>
                      <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {metrics.covPct}%
                      </div>
                      <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-violet-600 transition-all duration-300"
                          style={{ width: `${metrics.covPct}%` }}
                        />
                      </div>
                      <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {metrics.covTested} / {metrics.covTotal}{' '}
                        {pickLang(
                          lang,
                          UI_COPY.summary.covSub.en,
                          UI_COPY.summary.covSub.bn
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Interactive 6-Stage QA Pipeline Diagram */}
                  <QaArchitectureDiagram
                    lang={lang}
                    activeSection={section}
                    onSelectSection={(s) => handleSelectSection(s)}
                    metrics={metrics}
                  />
                </>
              )}

              {section === 'flows' && (
                <WorkflowFlowsView
                  project={activeProject}
                  lang={lang}
                  recording={recording}
                  onUpdateProject={handleUpdateProject}
                  onToggleRecording={handleToggleRecording}
                  onClearRecorded={handleClearRecorded}
                  onNotify={notify}
                />
              )}

              {section === 'rbac' && (
                <RoleMatrixView
                  project={activeProject}
                  lang={lang}
                  onUpdateProject={handleUpdateProject}
                  onNotify={notify}
                />
              )}

              {section === 'logic' && (
                <BusinessLogicView
                  project={activeProject}
                  lang={lang}
                  onUpdateProject={handleUpdateProject}
                  onNotify={notify}
                />
              )}

              {section === 'content' && (
                <ContentFormulaView
                  project={activeProject}
                  lang={lang}
                  onUpdateProject={handleUpdateProject}
                  onNotify={notify}
                />
              )}

              {section === 'visual' && (
                <VisualMatchView
                  project={activeProject}
                  lang={lang}
                  screenshotConsentGranted={workspace.settings.screenshotConsentGranted}
                  onGrantScreenshotConsent={() =>
                    handleUpdateWorkspace({
                      ...workspace,
                      settings: {
                        ...workspace.settings,
                        screenshotConsentGranted: true,
                      },
                    })
                  }
                  onUpdateProject={handleUpdateProject}
                  onNotify={notify}
                />
              )}

              {section === 'bugStudio' && (
                <BugAndTestStudioView
                  project={activeProject}
                  lang={lang}
                  recording={recording}
                  screenshotConsentGranted={workspace.settings.screenshotConsentGranted}
                  onGrantScreenshotConsent={() =>
                    handleUpdateWorkspace({
                      ...workspace,
                      settings: {
                        ...workspace.settings,
                        screenshotConsentGranted: true,
                      },
                    })
                  }
                  onUpdateProject={handleUpdateProject}
                  onNotify={notify}
                />
              )}

              {section === 'coverage' && (
                <CoverageInspectorView
                  lang={lang}
                  inspected={inspected}
                  lastScan={lastScan}
                  onUpdateScan={handleUpdateScan}
                  onSendSelectorToFlow={handleSendSelectorToFlow}
                  onNotify={notify}
                />
              )}

              {section === 'diagram' && (
                <FlowchartStudioView
                  project={activeProject}
                  lang={lang}
                  onUpdateProject={handleUpdateProject}
                  onRequestConfirm={({ title, detail, onConfirm }) => {
                    setPendingDelete({
                      title,
                      categoryLabel: detail || pickLang(lang, 'Canvas Item', 'ক্যানভাস আইটেম'),
                      staysInBin: false,
                      onConfirm,
                    });
                  }}
                  onNotify={notify}
                />
              )}

              {section === 'alerts' && (
                <SelfAlertView
                  lang={lang}
                  alerts={selfAlerts}
                  onScheduleAlert={(alert) => {
                    setSelfAlerts((prev) => [
                      alert,
                      ...prev.filter((a) => a.id !== alert.id),
                    ]);
                    scheduleSelfAlert(alert);
                  }}
                  onDeleteAlert={(id) => {
                    const targetAlert = selfAlerts.find((a) => a.id === id);
                    if (!targetAlert) return;
                    setPendingDelete({
                      title: targetAlert.title,
                      categoryLabel: pickLang(lang, 'Self Alert', 'সেলফ অ্যালার্ট'),
                      staysInBin: true,
                      onConfirm: () => {
                        const rbItem = createRecycleBinItem({
                          category: 'self_alert',
                          projectId: activeProject.id,
                          projectName: activeProject.name,
                          title: targetAlert.title,
                          subtitle: targetAlert.message.slice(0, 60),
                          payload: targetAlert,
                        });
                        handleUpdateWorkspace({
                          ...workspace,
                          recycleBin: [rbItem, ...activeRecycleBin],
                        });
                        setSelfAlerts((prev) => prev.filter((a) => a.id !== id));
                        if (activeAlertPopup?.id === id) {
                          setActiveAlertPopup(null);
                        }
                        deleteSelfAlert(id);
                        notify(
                          pickLang(
                            lang,
                            'Alert moved to Recycle Bin (3 days).',
                            'অ্যালার্ট রিসাইকেল বিনে পাঠানো হয়েছে (৩ দিন থাকবে)।'
                          )
                        );
                      },
                    });
                  }}
                  onTriggerTestAlert={(demoAlert) => {
                    triggerPopupAndNotification(demoAlert, false);
                  }}
                  onNotify={notify}
                />
              )}

              {section === 'fakeGps' && (
                <FakeGpsView
                  project={activeProject}
                  lang={lang}
                  config={fakeGps}
                  onUpdateConfig={(nextCfg) => {
                    setFakeGps(nextCfg);
                    saveFakeGpsConfig(nextCfg);
                  }}
                  onUpdateProject={handleUpdateProject}
                  onNotify={notify}
                />
              )}

              {section === 'smartScan' && (
                <SmartScreenQaView
                  project={activeProject}
                  lang={lang}
                  screenshotConsentGranted={workspace.settings.screenshotConsentGranted}
                  onUpdateProject={handleUpdateProject}
                  onOpenSection={(s) => handleSelectSection(s as SectionKey)}
                  onNotify={notify}
                />
              )}

              {section === 'recycleBin' && (
                <RecycleBinView
                  lang={lang}
                  items={activeRecycleBin}
                  onRestoreItem={(item) => {
                    const res = restoreFromRecycleBin(workspace, item);
                    handleUpdateWorkspace(res.workspace);
                    if (res.restoredAlert) {
                      const restoredAlert = res.restoredAlert;
                      setSelfAlerts((prev) => [
                        restoredAlert,
                        ...prev.filter((a) => a.id !== restoredAlert.id),
                      ]);
                      scheduleSelfAlert(restoredAlert);
                    }
                    if (res.restoredRecordedSteps) {
                      const steps = res.restoredRecordedSteps;
                      setRecording((prev) => ({
                        ...prev,
                        recordedSteps: [...prev.recordedSteps, ...steps],
                      }));
                      steps.forEach((s) => appendRecordedStep(s));
                    }
                    notify(
                      pickLang(
                        lang,
                        `Restored "${item.title}"!`,
                        `"${item.title}" সফলভাবে রিস্টোর করা হয়েছে!`
                      )
                    );
                  }}
                  onRestoreAll={() => {
                    if (activeRecycleBin.length === 0) return;
                    let nextWs = workspace;
                    const restoredAlerts: SelfAlert[] = [];
                    const restoredSteps: RecordedStep[] = [];
                    for (const item of [...activeRecycleBin].reverse()) {
                      const res = restoreFromRecycleBin(nextWs, item);
                      nextWs = res.workspace;
                      if (res.restoredAlert) restoredAlerts.push(res.restoredAlert);
                      if (res.restoredRecordedSteps) {
                        restoredSteps.push(...res.restoredRecordedSteps);
                      }
                    }
                    handleUpdateWorkspace(nextWs);
                    if (restoredAlerts.length > 0) {
                      setSelfAlerts((prev) => [...restoredAlerts, ...prev]);
                      restoredAlerts.forEach((a) => scheduleSelfAlert(a));
                    }
                    if (restoredSteps.length > 0) {
                      setRecording((prev) => ({
                        ...prev,
                        recordedSteps: [...prev.recordedSteps, ...restoredSteps],
                      }));
                      restoredSteps.forEach((s) => appendRecordedStep(s));
                    }
                    notify(
                      pickLang(
                        lang,
                        `Restored ${activeRecycleBin.length} item(s) from Recycle Bin.`,
                        `রিসাইকেল বিন থেকে ${activeRecycleBin.length}টি আইটেম রিস্টোর করা হয়েছে।`
                      )
                    );
                  }}
                  onPermanentDeleteItem={(item) => {
                    setPendingDelete({
                      title: item.title,
                      categoryLabel: pickLang(
                        lang,
                        'Permanent Delete',
                        'স্থায়ীভাবে ডিলিট'
                      ),
                      isPermanent: true,
                      staysInBin: false,
                      onConfirm: () => {
                        handleUpdateWorkspace({
                          ...workspace,
                          recycleBin: activeRecycleBin.filter((rb) => rb.id !== item.id),
                        });
                        notify(
                          pickLang(
                            lang,
                            `Permanently deleted "${item.title}".`,
                            `"${item.title}" স্থায়ীভাবে মুছে ফেলা হয়েছে।`
                          )
                        );
                      },
                    });
                  }}
                  onEmptyRecycleBin={() => {
                    if (activeRecycleBin.length === 0) return;
                    setPendingDelete({
                      title: pickLang(
                        lang,
                        `All ${activeRecycleBin.length} Recycle Bin Item(s)`,
                        `রিসাইকেল বিনের সব ${activeRecycleBin.length}টি আইটেম`
                      ),
                      categoryLabel: pickLang(lang, 'Empty Recycle Bin', 'বিন খালি করুন'),
                      isPermanent: true,
                      staysInBin: false,
                      onConfirm: () => {
                        handleUpdateWorkspace({
                          ...workspace,
                          recycleBin: [],
                        });
                        notify(
                          pickLang(
                            lang,
                            'Recycle Bin emptied permanently.',
                            'রিসাইকেল বিন স্থায়ীভাবে খালি করা হয়েছে।'
                          )
                        );
                      },
                    });
                  }}
                />
              )}

              {section === 'guide' && (
                <QaGuideView
                  lang={lang}
                  onChangeLang={handleChangeLanguage}
                  onOpenSection={(s) => handleSelectSection(s)}
                />
              )}

              {section === 'extension' && (
                <ExtensionSandboxView
                  project={activeProject}
                  lang={lang}
                  session={session}
                  onOpenSection={(s) => handleSelectSection(s as SectionKey)}
                  onOpenAccountModal={() => setAccountModalOpen(true)}
                  onSyncNow={handleSyncNow}
                  onNotify={notify}
                />
              )}

              {section === 'settings' && (
                <SettingsView
                  workspace={workspace}
                  theme={theme}
                  lang={lang}
                  session={session}
                  onOpenAccountModal={() => setAccountModalOpen(true)}
                  onToggleTheme={handleToggleTheme}
                  onUpdateWorkspace={handleUpdateWorkspace}
                  onResetWorkspace={() => {
                    setPendingDelete({
                      title: pickLang(
                        lang,
                        'All Active Workspace Data',
                        'সকল সক্রিয় ওয়ার্কস্পেস ডাটা'
                      ),
                      categoryLabel: pickLang(lang, 'Workspace Reset', 'ওয়ার্কস্পেস রিসেট'),
                      staysInBin: true,
                      onConfirm: () => {
                        const snapshot = createRecycleBinItem({
                          category: 'workspace_snapshot',
                          projectId: activeProject.id,
                          projectName: activeProject.name,
                          title: pickLang(
                            lang,
                            `Workspace Backup (${workspace.projects.length} project)`,
                            `ওয়ার্কস্পেস ব্যাকআপ (${workspace.projects.length}টি প্রজেক্ট)`
                          ),
                          subtitle: new Date().toLocaleString(),
                          payload: {
                            activeProjectId: workspace.activeProjectId,
                            projects: workspace.projects,
                          },
                        });
                        clearAllStoredData();
                        const nextWs: WorkspaceState = {
                          ...DEFAULT_WORKSPACE,
                          settings: workspace.settings,
                          recycleBin: [snapshot, ...activeRecycleBin],
                        };
                        handleUpdateWorkspace(nextWs);
                        setLastScan(DEFAULT_SCAN_RESULT);
                        setInspected(null);
                        setRecording({ isRecording: false, recordedSteps: [] });
                        setSelfAlerts([]);
                        setActiveAlertPopup(null);
                        setFakeGps(DEFAULT_FAKE_GPS_CONFIG);
                        notify(
                          pickLang(
                            lang,
                            'Workspace cleared — a 3-day backup was saved in Recycle Bin.',
                            'ডাটা খালি হয়েছে — ৩ দিনের ব্যাকআপ রিসাইকেল বিনে রাখা আছে।'
                          )
                        );
                      },
                    });
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Universal Delete Confirmation Modal (Prevents Accidental Deletion) */}
      <AnimatePresence>
        {pendingDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPendingDelete(null)}
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.14 }}
              onClick={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-confirm-dialog-title"
              className="w-full max-w-md rounded-2xl border border-rose-200 dark:border-rose-900/70 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-rose-50/70 dark:bg-rose-950/30">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">
                      {pendingDelete.categoryLabel}
                    </div>
                    <h3
                      id="delete-confirm-dialog-title"
                      className="text-sm font-bold text-slate-900 dark:text-slate-100"
                    >
                      {pendingDelete.isPermanent
                        ? pickLang(
                            lang,
                            'Delete Permanently?',
                            'স্থায়ীভাবে ডিলিট করবেন?'
                          )
                        : pickLang(
                            lang,
                            'Are you sure you want to delete?',
                            'আপনি কি নিশ্চিতভাবে ডিলিট করতে চান?'
                          )}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingDelete(null)}
                  aria-label="Cancel delete"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 break-words">
                  {pendingDelete.title}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {pendingDelete.isPermanent
                    ? pickLang(
                        lang,
                        'This action cannot be undone. This item will be erased permanently and cannot be restored from Recycle Bin.',
                        'সতর্কতা: এটি স্থায়ীভাবে মুছে যাবে এবং পরবর্তীতে আর রিসাইকেল বিন থেকে রিস্টোর করা যাবে না।'
                      )
                    : pendingDelete.staysInBin !== false
                      ? pickLang(
                          lang,
                          'Protected by VeriPulse: After confirming, this item will be moved to the Recycle Bin and stored safely for 3 days (72 hours) before permanent removal.',
                          'সুরক্ষা ব্যবস্থা: নিশ্চিত করলে এটি এখনই হারিয়ে যাবে না — রিসাইকেল বিনে ৩ দিন (৭২ ঘণ্টা) পর্যন্ত সংরক্ষিত থাকবে এবং চাইলে যেকোনো সময় রিস্টোর করতে পারবেন।'
                        )
                      : pickLang(
                          lang,
                          'Please confirm if you want to remove this item from the current canvas.',
                          'বর্তমান ক্যানভাস থেকে এটি মুছে ফেলতে চান কি না অনুগ্রহ করে নিশ্চিত করুন।'
                        )}
                </p>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPendingDelete(null)}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {pickLang(lang, 'No, Keep It', 'না, থাকুক (বাতিল)')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fn = pendingDelete.onConfirm;
                      setPendingDelete(null);
                      fn();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {pendingDelete.isPermanent
                      ? pickLang(lang, 'Yes, Delete Forever', 'হ্যাঁ, স্থায়ীভাবে মুছুন')
                      : pendingDelete.staysInBin !== false
                        ? pickLang(
                            lang,
                            'Yes, Move to Recycle Bin',
                            'হ্যাঁ, রিসাইকেল বিনে পাঠান'
                          )
                        : pickLang(lang, 'Yes, Delete', 'হ্যাঁ, ডিলিট করুন')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Self Alert Popup Modal (Non-blocking UI AlertDialog) */}
      <AnimatePresence>
        {activeAlertPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.16 }}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="self-alert-dialog-title"
              className="w-full max-w-md rounded-2xl border-2 border-orange-500 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              <div className="bg-gradient-to-r from-orange-600 to-rose-600 px-5 py-4 text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <BellRing className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-orange-100">
                      {pickLang(lang, 'VeriPulse Self Alert', 'VeriPulse সেলফ অ্যালার্ট')}
                    </div>
                    <h3 id="self-alert-dialog-title" className="text-sm font-bold">
                      {activeAlertPopup.title}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveAlertPopup(null);
                    dismissFiredAlert();
                  }}
                  aria-label="Close alert popup"
                  className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-50/70 dark:bg-orange-950/30 p-4 text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                  {activeAlertPopup.message}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const snoozed: SelfAlert = {
                        ...activeAlertPopup,
                        id: `alert_${Date.now()}`,
                        mode: 'timer',
                        durationSeconds: 300,
                        durationMinutes: 5,
                        triggerAt: Date.now() + 5 * 60 * 1000,
                        status: 'scheduled',
                        createdAt: new Date().toISOString(),
                      };
                      setSelfAlerts((prev) => [snoozed, ...prev]);
                      scheduleSelfAlert(snoozed);
                      setActiveAlertPopup(null);
                      dismissFiredAlert();
                      notify(
                        pickLang(
                          lang,
                          'Snoozed for 5 minutes.',
                          '৫ মিনিটের জন্য স্নুজ করা হয়েছে।'
                        )
                      );
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-300 text-xs font-semibold cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-950/40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {pickLang(lang, 'Snooze +5 min', 'স্নুজ +৫ মি.')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAlertPopup(null);
                      dismissFiredAlert();
                    }}
                    className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold cursor-pointer hover:opacity-90"
                  >
                    {pickLang(lang, 'Got It, Dismiss', 'ঠিক আছে, বন্ধ করুন')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account & Cross-Device Extension Sync Modal */}
      <AccountSyncModal
        open={accountModalOpen}
        lang={lang}
        session={session}
        syncStatus={syncStatus}
        onClose={() => setAccountModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        onSignedOut={handleSignedOut}
        onSyncNow={handleSyncNow}
        onNotify={notify}
      />

      {/* Non-intrusive Action Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            role="status"
            className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium shadow-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
