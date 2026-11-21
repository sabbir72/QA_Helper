import React from 'react';
import {
  Blocks,
  GitBranch,
  Layers,
  Radar,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { AppLanguage } from '../types/flowguard';
import { pickLang, UI_COPY } from '../i18n/translations';

interface QaArchitectureDiagramProps {
  lang: AppLanguage;
  activeSection: string;
  onSelectSection: (
    section: 'flows' | 'rbac' | 'logic' | 'coverage' | 'diagram' | 'extension'
  ) => void;
  metrics: {
    passedSteps: number;
    totalSteps: number;
    rbacVerified: number;
    rbacTotal: number;
    logicPassed: number;
    logicTotal: number;
    covPct: number;
    noticesCount: number;
  };
}

export const QaArchitectureDiagram: React.FC<QaArchitectureDiagramProps> = ({
  lang,
  activeSection,
  onSelectSection,
  metrics,
}) => {
  const stages = [
    {
      key: 'extension' as const,
      step: pickLang(lang, 'Step 01', 'ধাপ ০১'),
      title: pickLang(lang, 'Capture Actions', 'অ্যাকশন রেকর্ড'),
      subtitle: pickLang(lang, 'Popup & Recorder', 'পপআপ ও রেকর্ডার'),
      detail: pickLang(
        lang,
        'Grabs clicks & masks passwords automatically',
        'ক্লিক রেকর্ড করে ও পাসওয়ার্ড গোপন রাখে'
      ),
      stat: pickLang(lang, 'Live Extension', 'লাইভ এক্সটেনশন'),
      icon: Blocks,
      border: 'border-rose-200 dark:border-rose-900/70',
      activeRing: 'ring-2 ring-rose-500/40 border-rose-400 dark:border-rose-600',
      iconBg: 'bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400',
      accentText: 'text-rose-600 dark:text-rose-400',
    },
    {
      key: 'flows' as const,
      step: pickLang(lang, 'Step 02', 'ধাপ ০২'),
      title: pickLang(lang, 'Build Test Flows', 'টেস্ট ফ্লো'),
      subtitle: pickLang(lang, 'Journeys & Export', 'ধাপ ও অটোমেশন'),
      detail: pickLang(
        lang,
        `${metrics.passedSteps}/${metrics.totalSteps} steps verified & script ready`,
        `${metrics.passedSteps}/${metrics.totalSteps} ধাপ পাস ও স্ক্রিপ্ট রেডি`
      ),
      stat: `${metrics.passedSteps}/${metrics.totalSteps} ${pickLang(lang, 'Passed', 'পাস')}`,
      icon: Layers,
      border: 'border-blue-200 dark:border-blue-900/70',
      activeRing: 'ring-2 ring-blue-500/40 border-blue-400 dark:border-blue-600',
      iconBg: 'bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400',
      accentText: 'text-blue-600 dark:text-blue-400',
    },
    {
      key: 'rbac' as const,
      step: pickLang(lang, 'Step 03', 'ধাপ ০৩'),
      title: pickLang(lang, 'Check Permissions', 'রোল পারমিশন'),
      subtitle: pickLang(lang, 'Role Access Matrix', 'রোল অ্যাক্সেস'),
      detail: pickLang(
        lang,
        'Verifies hidden, locked & visible controls per role',
        'কোন রোলে কোন বাটন দেখাবে তা যাচাই করে'
      ),
      stat: `${metrics.rbacVerified}/${metrics.rbacTotal} ${pickLang(lang, 'Checked', 'যাচাই')}`,
      icon: ShieldCheck,
      border: 'border-emerald-200 dark:border-emerald-900/70',
      activeRing: 'ring-2 ring-emerald-500/40 border-emerald-400 dark:border-emerald-600',
      iconBg: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400',
      accentText: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'logic' as const,
      step: pickLang(lang, 'Step 04', 'ধাপ ০৪'),
      title: pickLang(lang, 'Validate Logic', 'বিজনেস রুলস'),
      subtitle: pickLang(lang, 'Status & Formulas', 'স্ট্যাটাস ও হিসাব'),
      detail: pickLang(
        lang,
        'Catches illegal status jumps, date cutoffs & math bugs',
        'অবৈধ স্ট্যাটাস জাম্প ও হিসাবের ভুল ধরে'
      ),
      stat: `${metrics.logicPassed}/${metrics.logicTotal} ${pickLang(lang, 'Valid', 'সঠিক')}`,
      icon: GitBranch,
      border: 'border-amber-200 dark:border-amber-900/70',
      activeRing: 'ring-2 ring-amber-500/40 border-amber-400 dark:border-amber-600',
      iconBg: 'bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400',
      accentText: 'text-amber-600 dark:text-amber-400',
    },
    {
      key: 'diagram' as const,
      step: pickLang(lang, 'Step 05', 'ধাপ ০৫'),
      title: pickLang(lang, 'Flowchart & Notices', 'ফ্লোচার্ট ও নোটিশ'),
      subtitle: pickLang(lang, 'Draw, Export & Pin', 'ড্র ও এলাউড নোটিশ'),
      detail: pickLang(
        lang,
        'Draw flowcharts, export PNG/SVG & share Allowed Notices',
        'ফ্লোচার্ট আঁকুন, আউট করুন ও এলাউড নোটিশ দিন'
      ),
      stat: `${metrics.noticesCount} ${pickLang(lang, 'Notices', 'টি নোটিশ')}`,
      icon: Workflow,
      border: 'border-indigo-200 dark:border-indigo-900/70',
      activeRing: 'ring-2 ring-indigo-500/40 border-indigo-400 dark:border-indigo-600',
      iconBg: 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400',
      accentText: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      key: 'coverage' as const,
      step: pickLang(lang, 'Step 06', 'ধাপ ০৬'),
      title: pickLang(lang, 'Measure Coverage', 'UI কভারেজ'),
      subtitle: pickLang(lang, 'Control Radar', 'বাটন ও ইনপুট ম্যাপ'),
      detail: pickLang(
        lang,
        'Tracks every button, input & select tested on page',
        'পেজের প্রতিটি বাটন ও ইনপুট টেস্ট হয়েছে কিনা দেখে'
      ),
      stat: `${metrics.covPct}% ${pickLang(lang, 'Covered', 'সম্পন্ন')}`,
      icon: Radar,
      border: 'border-violet-200 dark:border-violet-900/70',
      activeRing: 'ring-2 ring-violet-500/40 border-violet-400 dark:border-violet-600',
      iconBg: 'bg-violet-100 dark:bg-violet-950/70 text-violet-600 dark:text-violet-400',
      accentText: 'text-violet-600 dark:text-violet-400',
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {pickLang(lang, UI_COPY.pipeline.title.en, UI_COPY.pipeline.title.bn)}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {pickLang(
              lang,
              UI_COPY.pipeline.subtitle.en,
              UI_COPY.pipeline.subtitle.bn
            )}
          </p>
        </div>
        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
          {pickLang(lang, UI_COPY.pipeline.badge.en, UI_COPY.pipeline.badge.bn)}
        </span>
      </div>

      <div className="relative">
        <svg
          className="hidden xl:block w-full h-6 mb-1 pointer-events-none"
          viewBox="0 0 1200 24"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="pipelineLine" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="20%" stopColor="#2563eb" />
              <stop offset="40%" stopColor="#059669" />
              <stop offset="60%" stopColor="#d97706" />
              <stop offset="80%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
          <line
            x1="100"
            y1="12"
            x2="1100"
            y2="12"
            stroke="url(#pipelineLine)"
            strokeWidth="2.5"
            strokeDasharray="6 4"
            strokeOpacity="0.65"
          />
          <circle cx="100" cy="12" r="4.5" fill="#f43f5e" />
          <circle cx="300" cy="12" r="4.5" fill="#2563eb" />
          <circle cx="500" cy="12" r="4.5" fill="#059669" />
          <circle cx="700" cy="12" r="4.5" fill="#d97706" />
          <circle cx="900" cy="12" r="4.5" fill="#4f46e5" />
          <circle cx="1100" cy="12" r="4.5" fill="#7c3aed" />
        </svg>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {stages.map((st) => {
            const Icon = st.icon;
            const isActive = activeSection === st.key;
            return (
              <button
                key={st.key}
                type="button"
                onClick={() => onSelectSection(st.key)}
                className={`text-left rounded-xl border p-3.5 transition-all cursor-pointer bg-slate-50/60 dark:bg-slate-950/60 hover:bg-white dark:hover:bg-slate-900 ${
                  isActive ? st.activeRing : st.border
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${st.iconBg}`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className={`text-[11px] font-mono font-semibold ${st.accentText}`}>
                    {st.step}
                  </span>
                </div>
                <div className="mt-2.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                  {st.title}
                </div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {st.subtitle}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  {st.detail}
                </p>
                <div
                  className={`mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/70 text-[11px] font-mono font-semibold tabular-nums ${st.accentText}`}
                >
                  {st.stat}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
