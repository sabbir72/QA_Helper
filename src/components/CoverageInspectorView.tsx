import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Crosshair,
  Download,
  Radar,
  ScanSearch,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import {
  AppLanguage,
  CoverageElement,
  CoverageScanResult,
  InspectedElement,
} from '../types/flowguard';
import {
  isChromeExtensionContext,
  scanActiveChromeTab,
} from '../utils/extensionBridge';

interface CoverageInspectorViewProps {
  lang?: AppLanguage;
  inspected: InspectedElement | null;
  lastScan: CoverageScanResult;
  onUpdateScan: (next: CoverageScanResult) => void;
  onSendSelectorToFlow: (selector: string, title: string) => void;
  onNotify?: (message: string) => void;
}

function getSelectorStability(selector: string): {
  tier: 'resilient' | 'moderate' | 'fragile';
  labelEn: string;
  labelBn: string;
} {
  if (/data-testid|data-qa|data-cy/i.test(selector) || /^#[a-zA-Z][\w-]*$/.test(selector)) {
    return { tier: 'resilient', labelEn: 'Resilient', labelBn: 'শক্তিশালী' };
  }
  if (/\[name=|\[aria-label=|\[type=/.test(selector) && !selector.includes('nth-')) {
    return { tier: 'moderate', labelEn: 'Moderate', labelBn: 'মাঝারি' };
  }
  return { tier: 'fragile', labelEn: 'Fragile', labelBn: 'ভঙ্গুর (পরিবর্তনশীল)' };
}

export const CoverageInspectorView: React.FC<CoverageInspectorViewProps> = ({
  lang = 'en',
  inspected,
  lastScan,
  onUpdateScan,
  onSendSelectorToFlow,
  onNotify,
}) => {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<'all' | 'Tested' | 'Untested'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredElements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return lastScan.elements.filter((el) => {
      if (typeFilter !== 'all' && el.controlType !== typeFilter) return false;
      if (stateFilter !== 'all' && el.testState !== stateFilter) return false;
      if (
        q &&
        !el.label.toLowerCase().includes(q) &&
        !el.selector.toLowerCase().includes(q) &&
        !el.controlType.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [lastScan.elements, typeFilter, stateFilter, searchQuery]);

  const metrics = useMemo(() => {
    const total = lastScan.elements.length;
    const tested = lastScan.elements.filter((e) => e.testState === 'Tested').length;
    const fragileCount = lastScan.elements.filter(
      (e) => getSelectorStability(e.selector).tier === 'fragile'
    ).length;
    const pct = total > 0 ? Math.round((tested / total) * 100) : 0;
    return { total, tested, untested: total - tested, fragileCount, pct };
  }, [lastScan.elements]);

  const handleToggleElementTested = (id: string) => {
    const nextElements: CoverageElement[] = lastScan.elements.map((el) =>
      el.id === id
        ? { ...el, testState: el.testState === 'Tested' ? 'Untested' : 'Tested' }
        : el
    );
    onUpdateScan({ ...lastScan, elements: nextElements });
  };

  const handleMarkFilteredTested = (nextState: 'Tested' | 'Untested') => {
    if (filteredElements.length === 0) return;
    const ids = new Set(filteredElements.map((e) => e.id));
    const nextElements: CoverageElement[] = lastScan.elements.map((el) =>
      ids.has(el.id) ? { ...el, testState: nextState } : el
    );
    onUpdateScan({ ...lastScan, elements: nextElements });
    onNotify?.(
      pickLang(
        lang,
        `Marked ${ids.size} control(s) as ${nextState}.`,
        `${ids.size}টি কন্ট্রোল ${nextState} হিসেবে মার্ক করা হয়েছে।`
      )
    );
  };

  const handleExportCoverageCsv = () => {
    if (lastScan.elements.length === 0) return;
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Label', 'Type', 'Selector', 'Stability', 'Visibility', 'Test State', 'Page URL'];
    const rows = lastScan.elements.map((el) => {
      const stab = getSelectorStability(el.selector);
      return [
        el.label,
        el.controlType,
        el.selector,
        stab.labelEn,
        !el.visible ? 'hidden' : el.disabled ? 'disabled' : 'visible',
        el.testState,
        el.pageUrl,
      ]
        .map(esc)
        .join(',');
    });
    const blob = new Blob([[header.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veripulse-ui-coverage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onNotify?.(pickLang(lang, 'UI Coverage CSV exported.', 'UI কভারেজ CSV ডাউনলোড হয়েছে।'));
  };

  const handleScanNow = async () => {
    if (isChromeExtensionContext()) {
      const res = await scanActiveChromeTab();
      if (res) {
        onUpdateScan(res);
        onNotify?.(`Scanned ${res.elements.length} controls on "${res.pageTitle}".`);
      } else {
        onNotify?.('Active tab could not be scanned (internal browser page).');
      }
      return;
    }

    onNotify?.(
      pickLang(
        lang,
        'Load VeriPulse as a Chrome Extension and click "Scan Controls" on any live browser tab.',
        'যেকোনো লাইভ ওয়েবপেজ স্ক্যান করতে VeriPulse ক্রোম এক্সটেনশন হিসেবে ব্যবহার করুন।'
      )
    );
  };

  const copyValue = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify?.(`${label} copied to clipboard.`);
    } catch {
      onNotify?.('Clipboard unavailable.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Violet-Themed Last Inspected Element Panel */}
      <div className="rounded-xl border border-violet-200/80 dark:border-violet-900/60 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-400 flex items-center justify-center shrink-0">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {pickLang(lang, 'Element Locator Picker', 'এলিমেন্ট লোকেটর পিকার')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'Inspect any button or input on a webpage to grab reliable CSS & XPath selectors.',
                  'ওয়েবপেজের যেকোনো বাটন বা ইনপুট পিক করে CSS ও XPath লোকেটর নিন।'
                )}
              </p>
            </div>
          </div>
          {inspected && (
            <button
              type="button"
              onClick={() =>
                onSendSelectorToFlow(
                  inspected.cssSelector,
                  `Interact with ${inspected.accessibleName || inspected.tagName}`
                )
              }
              className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {pickLang(lang, 'Add Locator to Active Flow', 'অ্যাক্টিভ ফ্লো-তে যোগ করুন')}
            </button>
          )}
        </div>

        {!inspected ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {pickLang(
              lang,
              'No element picked yet. Click "Pick Element" in the VeriPulse Chrome Extension popup, then click any control on your webpage.',
              'এখনো কোনো এলিমেন্ট পিক করা হয়নি। ক্রোম এক্সটেনশন পপআপ থেকে "Pick Element" চেপে পেজের যেকোনো বাটনে ক্লিক করুন।'
            )}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">CSS Selector</span>
                <span
                  className={`font-medium ${
                    inspected.cssIsUnique
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {inspected.cssIsUnique ? 'Unique Match' : 'Multiple Matches'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <code className="font-mono text-slate-900 dark:text-slate-100 truncate">
                  {inspected.cssSelector}
                </code>
                <button
                  type="button"
                  onClick={() => copyValue(inspected.cssSelector, 'CSS selector')}
                  className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer shrink-0"
                  title="Copy CSS selector"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">XPath Suggestion</span>
                <span className="font-mono text-slate-500 dark:text-slate-400">
                  &lt;{inspected.tagName}&gt; {inspected.role ? `· role=${inspected.role}` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <code className="font-mono text-slate-900 dark:text-slate-100 truncate">
                  {inspected.xpathSuggestion}
                </code>
                <button
                  type="button"
                  onClick={() => copyValue(inspected.xpathSuggestion, 'XPath')}
                  className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer shrink-0"
                  title="Copy XPath"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="md:col-span-2 flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-400 pt-1">
              <span>
                Label:{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {inspected.accessibleName || '—'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono truncate max-w-md">{inspected.pageUrl}</span>
            </div>
          </div>
        )}
      </div>

      {/* Coverage Radar Header + Progress Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Radar className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span>{pickLang(lang, 'UI Control Coverage & Locator Health', 'UI কন্ট্রোল কভারেজ ও লোকেটর হেলথ')}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {lastScan.pageTitle} · {metrics.tested}/{metrics.total}{' '}
              {pickLang(lang, 'tested', 'টেস্টেড')} ({metrics.pct}%)
              {metrics.fragileCount > 0 &&
                ` · ${metrics.fragileCount} ${pickLang(lang, 'fragile locators', 'ভঙ্গুর লোকেটর')}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastScan.elements.length > 0 && (
              <button
                type="button"
                onClick={handleExportCoverageCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                {pickLang(lang, 'Export CSV', 'CSV এক্সপোর্ট')}
              </button>
            )}
            <button
              type="button"
              onClick={handleScanNow}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <ScanSearch className="w-3.5 h-3.5" />
              {pickLang(lang, 'Scan Open Tab', 'ওপেন ট্যাব স্ক্যান')}
            </button>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-violet-600 transition-all duration-300"
            style={{ width: `${metrics.pct}%` }}
          />
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
          {['all', 'button', 'input', 'select', 'checkbox', 'link'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize cursor-pointer whitespace-nowrap transition-colors ${
                typeFilter === t
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={pickLang(lang, 'Filter label or selector...', 'লোকেটর বা নাম খুঁজুন...')}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
            {(['all', 'Tested', 'Untested'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStateFilter(st)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${
                  stateFilter === st
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {st === 'all' ? 'All States' : st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Controls Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        {filteredElements.length > 0 && (
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50/70 dark:bg-slate-950/40">
            <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {filteredElements.length} {pickLang(lang, 'matching controls', 'টি কন্ট্রোল')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleMarkFilteredTested('Tested')}
                className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                {pickLang(lang, 'Mark All Tested', 'সব Tested মার্ক করুন')}
              </button>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <button
                type="button"
                onClick={() => handleMarkFilteredTested('Untested')}
                className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
              >
                {pickLang(lang, 'Reset Untested', 'সব Untested করুন')}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-violet-50/50 dark:bg-violet-950/20">
                <th className="py-3 px-4">{pickLang(lang, 'Control Label', 'কন্ট্রোল নাম')}</th>
                <th className="py-3 px-4">{pickLang(lang, 'Type', 'ধরন')}</th>
                <th className="py-3 px-4">{pickLang(lang, 'Element Selector', 'সিলেক্টর')}</th>
                <th className="py-3 px-4">{pickLang(lang, 'Locator Health', 'স্থায়িত্ব')}</th>
                <th className="py-3 px-4">{pickLang(lang, 'Coverage', 'কভারেজ')}</th>
                <th className="py-3 px-4 text-right">{pickLang(lang, 'Action', 'অ্যাকশন')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {filteredElements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-slate-500 dark:text-slate-400">
                    {pickLang(
                      lang,
                      'No UI controls scanned yet. Click "Scan Open Tab" via the Chrome Extension to map elements.',
                      'এখনো কোনো UI কন্ট্রোল স্ক্যান করা হয়নি। ক্রোম এক্সটেনশন দিয়ে যেকোনো পেজ স্ক্যান করুন।'
                    )}
                  </td>
                </tr>
              ) : (
                filteredElements.map((el) => {
                  const stability = getSelectorStability(el.selector);
                  return (
                    <tr key={el.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        <div>{el.label}</div>
                        <div className="text-[11px] font-mono font-normal text-slate-400">
                          {!el.visible ? 'hidden' : el.disabled ? 'disabled' : 'visible'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {el.controlType}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{el.selector}</span>
                          <button
                            type="button"
                            onClick={() => copyValue(el.selector, 'Selector')}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
                            aria-label="Copy selector"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            stability.tier === 'resilient'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : stability.tier === 'moderate'
                                ? 'text-sky-700 dark:text-sky-400'
                                : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {stability.tier === 'fragile' && <ShieldAlert className="w-3.5 h-3.5" />}
                          {pickLang(lang, stability.labelEn, stability.labelBn)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleElementTested(el.id)}
                          className={`inline-flex items-center gap-1.5 font-medium cursor-pointer ${
                            el.testState === 'Tested'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {el.testState}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            onSendSelectorToFlow(el.selector, `${el.controlType}: ${el.label}`)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-violet-200 dark:border-violet-800 text-[11px] font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 cursor-pointer whitespace-nowrap"
                        >
                          <span>{pickLang(lang, 'Add to Flow', 'ফ্লো-তে নিন')}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
