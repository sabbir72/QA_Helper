import React, { useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import {
  AppLanguage,
  CloudSyncSession,
  UserSyncBundle,
} from '../types/flowguard';
import {
  connectWithPairingToken,
  getDefaultServerUrl,
  isChromeExtensionContext,
  loginAccount,
  logoutAccount,
  pairInstalledBrowserExtension,
  registerAccount,
} from '../utils/extensionBridge';

interface AccountSyncModalProps {
  open: boolean;
  lang: AppLanguage;
  session: CloudSyncSession;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  onClose: () => void;
  onAuthSuccess: (nextSession: CloudSyncSession, bundle: UserSyncBundle) => void;
  onSignedOut: () => void;
  onSyncNow: () => void;
  onNotify?: (msg: string) => void;
}

export const AccountSyncModal: React.FC<AccountSyncModalProps> = ({
  open,
  lang,
  session,
  syncStatus,
  onClose,
  onAuthSuccess,
  onSignedOut,
  onSyncNow,
  onNotify,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'token'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState(
    session.serverUrl || getDefaultServerUrl()
  );
  const [pairingTokenInput, setPairingTokenInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [generatedToken, setGeneratedToken] = useState('');
  const [copiedToken, setCopiedToken] = useState(false);

  if (!open) return null;

  const isExt = isChromeExtensionContext();

  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusy(true);
    try {
      if (mode === 'register') {
        const res = await registerAccount({
          serverUrl,
          name,
          email,
          password,
        });
        if (!res.ok || !res.session || !res.bundle) {
          setErrorMsg(res.error || 'Registration failed.');
          return;
        }
        onAuthSuccess(res.session, res.bundle);
        onNotify?.(
          pickLang(
            lang,
            'Account created with zero data & synced!',
            'নতুন অ্যাকাউন্ট (০ ডাটা সহ) তৈরি ও সিঙ্ক হয়েছে!'
          )
        );
        onClose();
      } else if (mode === 'login') {
        const res = await loginAccount({
          serverUrl,
          email,
          password,
        });
        if (!res.ok || !res.session || !res.bundle) {
          setErrorMsg(res.error || 'Sign in failed.');
          return;
        }
        onAuthSuccess(res.session, res.bundle);
        onNotify?.(
          pickLang(
            lang,
            `Signed in as ${res.session.user?.email}`,
            `${res.session.user?.email} হিসেবে সাইন ইন হয়েছে।`
          )
        );
        onClose();
      } else {
        const res = await connectWithPairingToken({
          serverUrl,
          bearerToken: pairingTokenInput,
        });
        if (!res.ok || !res.session || !res.bundle) {
          setErrorMsg(res.error || 'Token verification failed.');
          return;
        }
        onAuthSuccess(res.session, res.bundle);
        onNotify?.(
          pickLang(
            lang,
            'Connected via Pairing Token!',
            'পেয়ারিং টোকেন দিয়ে সংযুক্ত হয়েছে!'
          )
        );
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePairExtension = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await pairInstalledBrowserExtension();
      if (!res.ok || !res.token) {
        setErrorMsg(res.error || 'Could not generate pairing token.');
        return;
      }
      setGeneratedToken(res.token);
      if (res.pairedInBrowser) {
        onNotify?.(
          pickLang(
            lang,
            'Chrome Extension paired & synced with your account!',
            'ক্রোম এক্সটেনশন সরাসরি আপনার অ্যাকাউন্টের সাথে যুক্ত হয়েছে!'
          )
        );
      } else {
        onNotify?.(
          pickLang(
            lang,
            'Generated pairing token — copy & paste into Chrome Extension.',
            'পেয়ারিং টোকেন তৈরি হয়েছে — এক্সটেনশনে পেস্ট করে সংযুক্ত করুন।'
          )
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopyToken = async () => {
    if (!generatedToken) return;
    try {
      await navigator.clipboard.writeText(generatedToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 1800);
    } catch {
      // Ignore
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await logoutAccount();
      setGeneratedToken('');
      onSignedOut();
      onNotify?.(
        pickLang(
          lang,
          'Signed out — workspace reset cleanly to zero data.',
          'সাইন আউট সম্পন্ন — সব ডাটা ক্লিয়ার করে জিরো-ডাটা মোডে ফিরে এসেছে।'
        )
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {session.user
                  ? pickLang(lang, 'Account & Cloud Sync', 'অ্যাকাউন্ট ও ক্লাউড সিঙ্ক')
                  : pickLang(lang, 'Sign In / Isolated Account', 'সাইন ইন / আলাদা অ্যাকাউন্ট')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'Per-user zero-data isolation + Web ↔ Extension sync',
                  'প্রতিটি ইউজারের জন্য আলাদা জিরো-ডাটা ও এক্সটেনশন সিঙ্ক'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account modal"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {session.user ? (
            <>
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    {session.user.name}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold uppercase">
                    {syncStatus === 'syncing'
                      ? pickLang(lang, 'Syncing...', 'সিঙ্ক হচ্ছে...')
                      : pickLang(lang, 'Isolated & Synced', 'আইসোলেটেড ও সিঙ্কড')}
                  </span>
                </div>
                <div className="text-xs font-mono text-emerald-800 dark:text-emerald-300">
                  {session.user.email}
                </div>
                <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                  {pickLang(
                    lang,
                    'Only your account can read or update this workspace.',
                    'আপনার এই ডাটা অন্য কোনো ইউজার কখনোই দেখতে পারবে না।'
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={onSyncNow}
                  disabled={busy || syncStatus === 'syncing'}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Sync Now', 'এখনই সিঙ্ক')}
                </button>
                <button
                  type="button"
                  onClick={handlePairExtension}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Pair Extension', 'এক্সটেনশন পেয়ার')}
                </button>
              </div>

              {generatedToken && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-2 text-xs">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {pickLang(lang, 'Extension Pairing Token', 'এক্সটেনশন পেয়ারিং টোকেন')}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedToken}
                      className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={handleCopyToken}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-semibold cursor-pointer"
                    >
                      {copiedToken ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedToken ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="text-xs text-rose-600 dark:text-rose-400">{errorMsg}</div>
              )}

              <button
                type="button"
                onClick={handleLogout}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                {pickLang(
                  lang,
                  'Sign Out (Clear Active Screen)',
                  'সাইন আউট করুন (স্ক্রিন খালি হবে)'
                )}
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                  }}
                  className={`py-1.5 rounded-lg font-semibold cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {pickLang(lang, 'Sign In', 'সাইন ইন')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg('');
                  }}
                  className={`py-1.5 rounded-lg font-semibold cursor-pointer ${
                    mode === 'register'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {pickLang(lang, 'New Account', 'নতুন অ্যাকাউন্ট')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('token');
                    setErrorMsg('');
                  }}
                  className={`py-1.5 rounded-lg font-semibold cursor-pointer ${
                    mode === 'token'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {pickLang(lang, 'Pair Token', 'টোকেন দিয়ে')}
                </button>
              </div>

              <div className="rounded-lg border border-blue-200/70 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/30 p-3 flex items-start gap-2 text-[11px] text-blue-900 dark:text-blue-200">
                <ShieldCheck className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                <span>
                  {pickLang(
                    lang,
                    'Every new account starts cleanly with 0 saved items. Data saved in your account is private and connected to your Chrome Extension.',
                    'প্রতিটি নতুন অ্যাকাউন্ট সম্পূর্ণ ০ ডাটা থেকে শুরু হয়। আপনার সেভ করা কোনো ডাটা অন্য ইউজারের কাছে যাবে না এবং ক্রোম এক্সটেনশনের সাথে সিঙ্ক থাকবে।'
                  )}
                </span>
              </div>

              <form onSubmit={handleSubmitAuth} className="space-y-3 text-xs">
                {(isExt || mode === 'token') && (
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      {pickLang(lang, 'Web Server URL', 'ওয়েব অ্যাপ সার্ভার URL')}
                    </span>
                    <input
                      type="url"
                      required
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="https://your-app.run.app"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                    />
                  </label>
                )}

                {mode === 'token' ? (
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      {pickLang(lang, 'Pairing Token', 'পেয়ারিং টোকেন (vp_ext_...)')}
                    </span>
                    <input
                      type="text"
                      required
                      value={pairingTokenInput}
                      onChange={(e) => setPairingTokenInput(e.target.value)}
                      placeholder="vp_ext_..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                    />
                  </label>
                ) : (
                  <>
                    {mode === 'register' && (
                      <label className="block space-y-1">
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          {pickLang(lang, 'Full Name', 'আপনার নাম')}
                        </span>
                        <input
                          type="text"
                          required
                          minLength={2}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Sabbir Ahamed"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </label>
                    )}
                    <label className="block space-y-1">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        {pickLang(lang, 'Email Address', 'ইমেইল')}
                      </span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        {pickLang(lang, 'Password (min 6 chars)', 'পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)')}
                      </span>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </label>
                  </>
                )}

                {errorMsg && (
                  <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-teal-600 hover:brightness-105 disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
                >
                  {mode === 'register' ? (
                    <UserPlus className="w-4 h-4" />
                  ) : mode === 'token' ? (
                    <KeyRound className="w-4 h-4" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  {busy
                    ? pickLang(lang, 'Connecting...', 'কানেক্ট হচ্ছে...')
                    : mode === 'register'
                      ? pickLang(lang, 'Create Isolated Account', 'নতুন অ্যাকাউন্ট তৈরি করুন')
                      : mode === 'token'
                        ? pickLang(lang, 'Connect via Token', 'টোকেন দিয়ে যুক্ত করুন')
                        : pickLang(lang, 'Sign In & Load My Data', 'সাইন ইন করুন')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
