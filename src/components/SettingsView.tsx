import React, { useState } from 'react';
import {
  Camera,
  Cloud,
  Download,
  Lock,
  RotateCcw,
  Settings,
  Upload,
  UserCheck,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import {
  AppLanguage,
  CloudSyncSession,
  WorkspaceState,
} from '../types/flowguard';
import { requestVisibleTabScreenshot } from '../utils/extensionBridge';

interface SettingsViewProps {
  workspace: WorkspaceState;
  theme: 'light' | 'dark';
  lang?: AppLanguage;
  session?: CloudSyncSession;
  onOpenAccountModal?: () => void;
  onToggleTheme: () => void;
  onUpdateWorkspace: (next: WorkspaceState) => void;
  onResetWorkspace: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  workspace,
  theme,
  lang = 'en',
  session,
  onOpenAccountModal,
  onToggleTheme,
  onUpdateWorkspace,
  onResetWorkspace,
}) => {
  const [screenshotPreview, setScreenshotPreview] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');

  const handleToggleScreenshotConsent = () => {
    onUpdateWorkspace({
      ...workspace,
      settings: {
        ...workspace.settings,
        screenshotConsentGranted: !workspace.settings.screenshotConsentGranted,
      },
    });
  };

  const handleTestScreenshot = async () => {
    const res = await requestVisibleTabScreenshot(
      workspace.settings.screenshotConsentGranted
    );
    if (!res.ok) {
      setStatusMessage(res.error || 'Screenshot unavailable.');
      return;
    }
    if (res.dataUrl) {
      setScreenshotPreview(res.dataUrl);
      setStatusMessage('Captured active tab screenshot locally.');
    }
  };

  const handleExportWorkspace = () => {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veripulse-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportWorkspace = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as WorkspaceState;
        if (parsed && Array.isArray(parsed.projects)) {
          onUpdateWorkspace(parsed);
          setStatusMessage('Backup restored successfully.');
        } else {
          setStatusMessage('This file does not look like a VeriPulse backup.');
        }
      } catch {
        setStatusMessage('Could not read that JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-3xl space-y-5">
      {/* Sky/Cyan Module Header */}
      <div className="rounded-xl border border-sky-200/80 dark:border-sky-900/60 bg-white dark:bg-slate-900 p-4 shadow-xs flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
          <Settings className="w-5 h-5" />
        </div>
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {pickLang(
              lang,
              'VeriPulse Preferences, Account & Privacy',
              'VeriPulse সেটিংস, অ্যাকাউন্ট ও প্রাইভেসি'
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {pickLang(
              lang,
              'Manage per-user isolated cloud sync, Chrome Extension pairing, appearance, secret masking, and JSON backups.',
              'আলাদা ইউজার অ্যাকাউন্ট সিঙ্ক, ক্রোম এক্সটেনশন পেয়ারিং, থিম ও লোকাল ব্যাকআপ নিয়ন্ত্রণ করুন।'
            )}
          </p>
        </div>
      </div>

      {/* Per-User Account Isolation & Extension Sync Banner */}
      {onOpenAccountModal && (
        <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              {session?.user ? (
                <UserCheck className="w-5 h-5" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </div>
            <div className="space-y-0.5 min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {session?.user
                  ? `${session.user.name} (${session.user.email})`
                  : pickLang(
                      lang,
                      'Zero-Data Isolated Account Not Connected',
                      'এখনো অ্যাকাউন্ট লগইন করা হয়নি (গেস্ট সেশন)'
                    )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {session?.user
                  ? pickLang(
                      lang,
                      'Your workspace is stored exclusively under your user account and synced with your paired Chrome Extension.',
                      'আপনার ডাটা শুধু আপনার অ্যাকাউন্টে সংরক্ষিত আছে এবং পেয়ার করা ক্রোম এক্সটেনশনের সাথে অটো-সিঙ্ক হচ্ছে।'
                    )
                  : pickLang(
                      lang,
                      'Create a new account to start from zero data and keep your saved flows/GPS profiles 100% isolated from other users.',
                      'নতুন অ্যাকাউন্ট খুললে ০ ডাটা দিয়ে শুরু হবে এবং আপনার সেভ করা ডাটা কখনোই অন্য ইউজারের কাছে যাবে না।'
                    )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAccountModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-teal-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Cloud className="w-3.5 h-3.5" />
            {session?.user
              ? pickLang(lang, 'Manage Account & Sync', 'অ্যাকাউন্ট ও সিঙ্ক')
              : pickLang(lang, 'Sign In / Create Account', 'সাইন ইন / অ্যাকাউন্ট')}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 shadow-xs">
        {/* Theme */}
        <div className="p-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Light or Dark Appearance
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Automatically stays in sync between the Chrome Extension popup and this workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          </button>
        </div>

        {/* Screenshot Consent */}
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Allow Tab Screenshots
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                VeriPulse never captures screenshots silently — enable this only if you want to capture bug evidence on demand.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleScreenshotConsent}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                workspace.settings.screenshotConsentGranted
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {workspace.settings.screenshotConsentGranted
                ? 'Allowed'
                : 'Enable Screenshots'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTestScreenshot}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              Take Test Screenshot
            </button>
            {statusMessage && (
              <span className="text-xs text-slate-600 dark:text-slate-300">
                {statusMessage}
              </span>
            )}
          </div>
          {screenshotPreview && (
            <img
              src={screenshotPreview}
              alt="Captured tab screenshot"
              className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800 max-h-48 object-contain"
            />
          )}
        </div>

        {/* Sensitive Field Masking */}
        <div className="p-5 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Automatic Password &amp; Secret Protection
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Any field matching these keywords is automatically replaced with <code className="font-mono">••••••••</code> while recording:
          </p>
          <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-700 dark:text-slate-300">
            {workspace.settings.maskSensitivePatterns}
          </div>
        </div>

        {/* Backup & Reset */}
        <div className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Backup &amp; Restore Data
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              All your test flows and rules stay 100% private on your computer.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportWorkspace}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Save Backup
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Restore Backup
              <input
                type="file"
                accept="application/json"
                onChange={handleImportWorkspace}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={onResetWorkspace}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear All Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
