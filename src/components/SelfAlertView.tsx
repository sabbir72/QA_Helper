import React, { useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Clock,
  Play,
  Plus,
  RotateCcw,
  Search,
  Timer,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import { AppLanguage, SelfAlert } from '../types/flowguard';

interface SelfAlertViewProps {
  lang: AppLanguage;
  alerts: SelfAlert[];
  onScheduleAlert: (alert: SelfAlert) => void;
  onDeleteAlert: (id: string) => void;
  onTriggerTestAlert: (alert: SelfAlert) => void;
  onNotify: (msg: string) => void;
}

function getDefaultTimeInput(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatCountdown(msRemaining: number): string {
  const totalSec = Math.max(0, Math.ceil(msRemaining / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
      secs
    ).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const SelfAlertView: React.FC<SelfAlertViewProps> = ({
  lang,
  alerts,
  onScheduleAlert,
  onDeleteAlert,
  onTriggerTestAlert,
  onNotify,
}) => {
  const [mode, setMode] = useState<'timer' | 'time'>('timer');
  const [minutes, setMinutes] = useState<number>(5);
  const [seconds, setSeconds] = useState<number>(0);
  const [targetTimeStr, setTargetTimeStr] = useState<string>(getDefaultTimeInput);
  const [title, setTitle] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [alertQuery, setAlertQuery] = useState<string>('');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(() => {
    if (typeof Notification !== 'undefined') {
      return Notification.permission;
    }
    return 'default';
  });

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const scheduledAlerts = useMemo(() => {
    const q = alertQuery.trim().toLowerCase();
    return alerts
      .filter((a) => a.status === 'scheduled')
      .filter(
        (a) =>
          !q ||
          a.title.toLowerCase().includes(q) ||
          a.message.toLowerCase().includes(q)
      )
      .sort((a, b) => a.triggerAt - b.triggerAt);
  }, [alerts, alertQuery]);

  const triggeredAlerts = useMemo(() => {
    const q = alertQuery.trim().toLowerCase();
    return alerts
      .filter((a) => a.status === 'triggered')
      .filter(
        (a) =>
          !q ||
          a.title.toLowerCase().includes(q) ||
          a.message.toLowerCase().includes(q)
      )
      .sort((a, b) => b.triggerAt - a.triggerAt);
  }, [alerts, alertQuery]);

  const handleRequestPermission = async () => {
    if (typeof Notification === 'undefined') {
      onNotify(
        pickLang(
          lang,
          'Desktop Notifications are handled by Chrome Extension background worker.',
          'ডেস্কটপ নোটিফিকেশন ক্রোম এক্সটেনশনের মাধ্যমে দেখানো হবে।'
        )
      );
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifPerm(result);
      if (result === 'granted') {
        onNotify(
          pickLang(
            lang,
            'Browser notifications enabled!',
            'ব্রাউজার নোটিফিকেশন চালু করা হয়েছে!'
          )
        );
      } else {
        onNotify(
          pickLang(
            lang,
            'Browser permission blocked — popup alert dialog will still appear.',
            'ব্রাউজার অনুমতি ব্লক আছে — তবে পপআপ অ্যালার্ট ঠিকই দেখাবে।'
          )
        );
      }
    } catch {
      // Ignore permission prompt failures
    }
  };

  const applyPreset = (mins: number, secs: number) => {
    setMode('timer');
    setMinutes(mins);
    setSeconds(secs);
  };

  const applyRoutinePreset = (
    mins: number,
    presetTitle: string,
    presetMessage: string
  ) => {
    setMode('timer');
    setMinutes(mins);
    setSeconds(0);
    setTitle(presetTitle);
    setMessage(presetMessage);
    onNotify(
      pickLang(
        lang,
        `Loaded "${presetTitle}" (${mins}m). Click Schedule Self Alert to start.`,
        `"${presetTitle}" (${mins} মি.) লোড হয়েছে — সেট করুন বাটনে চাপ দিন।`
      )
    );
  };

  const handleCreateAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle =
      title.trim() ||
      pickLang(lang, 'VeriPulse Self Alert', 'VeriPulse সেলফ অ্যালার্ট');
    const cleanMessage =
      message.trim() ||
      pickLang(
        lang,
        'Time is up! Please verify your scheduled QA check or release step.',
        'সময় হয়েছে! আপনার নির্ধারিত QA চেক বা কাজটি এখনই যাচাই করুন।'
      );

    let triggerAt = Date.now();
    let totalSec = 0;

    if (mode === 'timer') {
      totalSec = Math.max(1, Math.floor(minutes) * 60 + Math.floor(seconds));
      triggerAt = Date.now() + totalSec * 1000;
    } else {
      const [hhRaw, mmRaw] = targetTimeStr.split(':');
      const hh = Number(hhRaw);
      const mm = Number(mmRaw);
      if (Number.isNaN(hh) || Number.isNaN(mm)) return;
      const target = new Date();
      target.setHours(hh, mm, 0, 0);
      if (target.getTime() <= Date.now()) {
        target.setDate(target.getDate() + 1);
      }
      triggerAt = target.getTime();
      totalSec = Math.max(1, Math.round((triggerAt - Date.now()) / 1000));
    }

    const newAlert: SelfAlert = {
      id: `alert_${Date.now()}`,
      title: cleanTitle,
      message: cleanMessage,
      mode,
      durationSeconds: mode === 'timer' ? totalSec : undefined,
      durationMinutes: mode === 'timer' ? Math.max(1, Math.round(totalSec / 60)) : undefined,
      targetTimeStr: mode === 'time' ? targetTimeStr : undefined,
      soundEnabled,
      triggerAt,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };

    onScheduleAlert(newAlert);
    setTitle('');
    setMessage('');

    const timeFormatted = new Date(triggerAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    onNotify(
      pickLang(
        lang,
        `Self alert set for ${timeFormatted} (${formatCountdown(triggerAt - Date.now())}).`,
        `সেলফ অ্যালার্ট সেট হয়েছে (${timeFormatted}-এ পপআপ ও নোটিফিকেশন পাবেন)।`
      )
    );
  };

  const handleSnooze = (alert: SelfAlert, snoozeMins = 5) => {
    const snoozed: SelfAlert = {
      ...alert,
      id: `alert_${Date.now()}`,
      mode: 'timer',
      durationSeconds: snoozeMins * 60,
      durationMinutes: snoozeMins,
      triggerAt: Date.now() + snoozeMins * 60 * 1000,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };
    onScheduleAlert(snoozed);
    onNotify(
      pickLang(
        lang,
        `Snoozed alert for ${snoozeMins} minutes.`,
        `অ্যালার্ট ${snoozeMins} মিনিটের জন্য স্নুজ করা হয়েছে।`
      )
    );
  };

  const handleClearTriggered = () => {
    if (triggeredAlerts.length === 0) return;
    triggeredAlerts.forEach((a) => onDeleteAlert(a.id));
    onNotify(
      pickLang(
        lang,
        'Cleared completed alert history.',
        'পূর্বের সম্পন্ন অ্যালার্ট তালিকা মুছে ফেলা হয়েছে।'
      )
    );
  };

  const handleTestInstant = () => {
    const demoAlert: SelfAlert = {
      id: `alert_demo_${Date.now()}`,
      title:
        title.trim() ||
        pickLang(lang, 'VeriPulse Instant Self Alert', 'VeriPulse তাৎক্ষণিক অ্যালার্ট'),
      message:
        message.trim() ||
        pickLang(
          lang,
          'This is how your scheduled popup text & notification will look when your timer finishes!',
          'আপনার সেট করা সময় শেষ হলে ঠিক এভাবেই নোটিফিকেশন এবং পপআপ মেসেজ দেখাবে!'
        ),
      mode: 'timer',
      durationSeconds: 0,
      soundEnabled,
      triggerAt: Date.now(),
      status: 'triggered',
      createdAt: new Date().toISOString(),
    };
    onTriggerTestAlert(demoAlert);
  };

  return (
    <div className="space-y-5">
      {/* Header Card */}
      <div className="rounded-xl border border-orange-200/90 dark:border-orange-900/60 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <BellRing className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {pickLang(
                lang,
                'Self Alert & Scheduled Reminder System',
                'সেলফ অ্যালার্ট ও টাইমার রিমাইন্ডার সিস্টেম'
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              {pickLang(
                lang,
                'Set a countdown timer or pick an exact clock time with custom popup text. When the time arrives, VeriPulse sends a desktop notification and opens a popup alert.',
                'একটি টাইমার বা নির্দিষ্ট সময় ও নিজের পছন্দমতো টেক্সট সেট করে রাখুন। সময় হলেই আপনাকে ডেস্কটপ নোটিফিকেশন এবং পপআপের মাধ্যমে মেসেজটি জানিয়ে দেবে।'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {typeof Notification !== 'undefined' && notifPerm !== 'granted' ? (
            <button
              type="button"
              onClick={handleRequestPermission}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 text-xs font-semibold cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/40"
            >
              <Bell className="w-3.5 h-3.5" />
              {pickLang(lang, 'Allow Browser Notifications', 'নোটিফিকেশন চালু করুন')}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {pickLang(lang, 'Notifications Ready', 'নোটিফিকেশন সক্রিয়')}
            </span>
          )}

          <button
            type="button"
            onClick={handleTestInstant}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <Play className="w-3.5 h-3.5 text-orange-600" />
            {pickLang(lang, 'Test Popup Now', 'এখনই টেস্ট পপআপ দেখুন')}
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Create Timer / Time Alert Form */}
        <form
          onSubmit={handleCreateAlert}
          className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <AlarmClock className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              {pickLang(lang, 'Create New Self Alert', 'নতুন সেলফ অ্যালার্ট সেট করুন')}
            </h3>
          </div>

          {/* 1-Click SQA Routine Templates */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {pickLang(lang, 'SQA Routine Presets', 'SQA রুটিন টেমপ্লেট')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                {
                  mins: 2,
                  labelEn: '2m Retest',
                  labelBn: '২মি রি-টেস্ট',
                  title: pickLang(lang, 'Quick Fix Retest', 'কুইক বাগ রি-টেস্ট'),
                  msg: pickLang(
                    lang,
                    'Re-test latest hotfix on staging and mark bug status.',
                    'স্টেজিংয়ে ফিক্স হওয়া বাগটি পুনরায় যাচাই করুন।'
                  ),
                },
                {
                  mins: 10,
                  labelEn: '10m Deploy Watch',
                  labelBn: '১০মি ডিপ্লয় ওয়াচ',
                  title: pickLang(lang, 'Deploy Cutover Check', 'ডিপ্লয়মেন্ট চেক'),
                  msg: pickLang(
                    lang,
                    'Verify production health endpoint and critical login flow.',
                    'লাইভ সার্ভার হেলথ ও লগইন ফ্লো ঠিক আছে কিনা দেখুন।'
                  ),
                },
                {
                  mins: 15,
                  labelEn: '15m Smoke Check',
                  labelBn: '১৫মি স্মোক চেক',
                  title: pickLang(lang, 'Smoke Check Reminder', 'স্মোক চেক রিমাইন্ডার'),
                  msg: pickLang(
                    lang,
                    'Run post-deploy smoke checks across Login, Dashboard & Checkout.',
                    'ডিপ্লয়ের পর লগইন, ড্যাশবোর্ড ও চেকআউট স্মোক টেস্ট যাচাই করুন।'
                  ),
                },
                {
                  mins: 30,
                  labelEn: '30m Build Watch',
                  labelBn: '৩০মি বিল্ড ওয়াচ',
                  title: pickLang(lang, 'Staging Build Verification', 'স্টেজিং বিল্ড যাচাই'),
                  msg: pickLang(
                    lang,
                    'Check CI/CD pipeline & re-verify fixed bug tickets on staging.',
                    'স্টেজিং বিল্ড আপডেট হয়েছে কিনা দেখে ফিক্স হওয়া বাগগুলো রি-টেস্ট করুন।'
                  ),
                },
                {
                  mins: 45,
                  labelEn: '45m Regression',
                  labelBn: '৪৫মি রিগ্রেশন',
                  title: pickLang(lang, 'Regression Sign-off', 'রিগ্রেশন সাইন-অফ'),
                  msg: pickLang(
                    lang,
                    'Review open blocker bugs, export CSV, and share QA sign-off report.',
                    'ওপেন ব্লকার বাগ রিভিউ করে QA সাইন-অফ রিপোর্ট শেয়ার করুন।'
                  ),
                },
              ].map((tpl) => (
                <button
                  key={tpl.labelEn}
                  type="button"
                  onClick={() => applyRoutinePreset(tpl.mins, tpl.title, tpl.msg)}
                  className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:border-orange-400 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer"
                >
                  {pickLang(lang, tpl.labelEn, tpl.labelBn)}
                </button>
              ))}
            </div>
          </div>

          {/* Mode Selector */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMode('timer')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                mode === 'timer'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              {pickLang(lang, 'Countdown Timer', 'কাউন্টডাউন টাইমার')}
            </button>
            <button
              type="button"
              onClick={() => setMode('time')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                mode === 'time'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {pickLang(lang, 'Specific Clock Time', 'নির্দিষ্ট সময়')}
            </button>
          </div>

          {mode === 'timer' ? (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {pickLang(lang, 'Quick Timer Presets', 'দ্রুত টাইমার বেছে নিন')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { labelEn: '10 sec (Quick)', labelBn: '১০ সেকেন্ড (কুইক)', m: 0, s: 10 },
                  { labelEn: '1 min', labelBn: '১ মিনিট', m: 1, s: 0 },
                  { labelEn: '5 min', labelBn: '৫ মিনিট', m: 5, s: 0 },
                  { labelEn: '15 min', labelBn: '১৫ মিনিট', m: 15, s: 0 },
                  { labelEn: '30 min', labelBn: '৩০ মিনিট', m: 30, s: 0 },
                ].map((preset) => {
                  const selected = minutes === preset.m && seconds === preset.s;
                  return (
                    <button
                      key={preset.labelEn}
                      type="button"
                      onClick={() => applyPreset(preset.m, preset.s)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                        selected
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:border-orange-300'
                      }`}
                    >
                      {pickLang(lang, preset.labelEn, preset.labelBn)}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="alert-minutes"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                  >
                    {pickLang(lang, 'Minutes', 'মিনিট')}
                  </label>
                  <input
                    id="alert-minutes"
                    type="number"
                    min={0}
                    max={1440}
                    value={minutes}
                    onChange={(e) => setMinutes(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="alert-seconds"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                  >
                    {pickLang(lang, 'Seconds', 'সেকেন্ড')}
                  </label>
                  <input
                    id="alert-seconds"
                    type="number"
                    min={0}
                    max={59}
                    value={seconds}
                    onChange={(e) =>
                      setSeconds(Math.min(59, Math.max(0, Number(e.target.value) || 0)))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="alert-exact-time"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                {pickLang(
                  lang,
                  'Select Exact Clock Time (Today or Tomorrow if already passed)',
                  'সঠিক ঘড়ির সময় দিন (সময় পেরিয়ে গেলে আগামীকাল সেট হবে)'
                )}
              </label>
              <input
                id="alert-exact-time"
                type="time"
                value={targetTimeStr}
                onChange={(e) => setTargetTimeStr(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono font-bold text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="alert-title"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
            >
              {pickLang(lang, 'Alert Title', 'অ্যালার্ট শিরোনাম')}
            </label>
            <input
              id="alert-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={pickLang(
                lang,
                'e.g. Check Staging Build or Regression',
                'যেমন: স্টেজিং বিল্ড রিচেক করুন'
              )}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="alert-message"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
            >
              {pickLang(
                lang,
                'Popup Notification Text',
                'পপআপ ও নোটিফিকেশনে যা দেখাবে (টেক্সট)'
              )}
            </label>
            <textarea
              id="alert-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={pickLang(
                lang,
                'Write the reminder text you want shown in the popup...',
                'সময় হলে পপআপে যে রিমাইন্ডার টেক্সটটি দেখতে চান তা লিখুন...'
              )}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                soundEnabled
                  ? 'border-orange-200 dark:border-orange-900 bg-orange-50/70 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
              {pickLang(
                lang,
                soundEnabled ? 'Chime Sound ON' : 'Sound Muted',
                soundEnabled ? 'অ্যালার্ট সাউন্ড চালু' : 'সাউন্ড বন্ধ'
              )}
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-rose-600 hover:brightness-105 text-white text-xs font-bold cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              {pickLang(lang, 'Schedule Self Alert', 'সেলফ অ্যালার্ট সেট করুন')}
            </button>
          </div>
        </form>

        {/* Right: Active Countdown Timers & Triggered History */}
        <div className="lg:col-span-7 space-y-5">
          {alerts.length > 0 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={alertQuery}
                onChange={(e) => setAlertQuery(e.target.value)}
                placeholder={pickLang(lang, 'Filter active & past alerts...', 'অ্যালার্ট খুঁজুন...')}
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          {/* Active Timers */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Timer className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                {pickLang(lang, 'Active Scheduled Alerts', 'চলমান সেলফ অ্যালার্ট তালিকা')}
              </h3>
              <span className="px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 text-xs font-mono font-bold">
                {scheduledAlerts.length}
              </span>
            </div>

            {scheduledAlerts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center space-y-1.5">
                <BellOff className="w-6 h-6 text-slate-300 dark:text-slate-700 mx-auto" />
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {pickLang(
                    lang,
                    'No active self alerts yet. Use the form on the left to schedule a timer or clock alert.',
                    'এখনো কোনো অ্যালার্ট চালু নেই। বাম পাশ থেকে ১০ সেকেন্ড বা আপনার পছন্দের সময় সেট করুন।'
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {scheduledAlerts.map((alert) => {
                  const remaining = Math.max(0, alert.triggerAt - nowMs);
                  const totalWindowMs = Math.max(
                    1000,
                    (alert.durationSeconds || (alert.durationMinutes || 5) * 60) * 1000
                  );
                  const pctDone = Math.min(
                    100,
                    Math.max(0, Math.round(((totalWindowMs - remaining) / totalWindowMs) * 100))
                  );
                  const fireTime = new Date(alert.triggerAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  return (
                    <div
                      key={alert.id}
                      className="rounded-xl border border-orange-200/80 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/20 p-3.5 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {alert.title}
                            </span>
                            <span className="text-[11px] font-mono text-orange-700 dark:text-orange-300">
                              @ {fireTime}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 break-words">
                            {alert.message}
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-950 text-orange-400 font-mono text-sm font-bold tabular-nums">
                            {formatCountdown(remaining)}
                          </div>
                          <button
                            type="button"
                            onClick={() => onDeleteAlert(alert.id)}
                            aria-label="Cancel alert"
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:border-rose-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="h-1 w-full rounded-full bg-orange-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-orange-500 transition-all duration-500"
                          style={{ width: `${pctDone}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Triggered Alert History */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {pickLang(lang, 'Triggered Alert History', 'পূর্বের সম্পন্ন অ্যালার্ট')}
              </h3>
              <div className="flex items-center gap-2.5">
                {triggeredAlerts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearTriggered}
                    className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    {pickLang(lang, 'Clear All', 'সব মুছুন')}
                  </button>
                )}
                <span className="text-xs font-mono text-slate-400">
                  {triggeredAlerts.length}
                </span>
              </div>
            </div>

            {triggeredAlerts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'Completed alerts will appear here so you can snooze or repeat them anytime.',
                  'সময় পূর্ণ হওয়া অ্যালার্টগুলো এখানে জমা থাকবে, চাইলে আবার ৫ মিনিট স্নুজ করতে পারবেন।'
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {triggeredAlerts.map((alert) => {
                  const firedAt = new Date(alert.triggerAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={alert.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {alert.title}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {firedAt}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
                          {alert.message}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSnooze(alert, 5)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 text-[11px] font-semibold cursor-pointer hover:bg-orange-100"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {pickLang(lang, '+5m', '+৫মি')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSnooze(alert, 15)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          {pickLang(lang, '+15m', '+১৫মি')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteAlert(alert.id)}
                          aria-label="Delete alert history"
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
