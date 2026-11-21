import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Crosshair,
  Radar,
  ScanSearch,
} from 'lucide-react';
import {
  CoverageElement,
  CoverageScanResult,
  InspectedElement,
} from '../types/flowguard';
import {
  isChromeExtensionContext,
  scanActiveChromeTab,
} from '../utils/extensionBridge';

interface CoverageInspectorViewProps {
  inspected: InspectedElement | null;
  lastScan: CoverageScanResult;
  onUpdateScan: (next: CoverageScanResult) => void;
  onSendSelectorToFlow: (selector: string, title: string) => void;
  onNotify?: (message: string) => void;
}

export const CoverageInspectorView: React.FC<CoverageInspectorViewProps> = ({
  inspected,
  lastScan,
  onUpdateScan,
  onSendSelectorToFlow,
  onNotify,
}) => {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<'all' | 'Tested' | 'Untested'>('all');

  const filteredElements = useMemo(() => {
    return lastScan.elements.filter((el) => {
      if (typeFilter !== 'all' && el.controlType !== typeFilter) return false;
      if (stateFilter !== 'all' && el.testState !== stateFilter) return false;
      return true;
    });
  }, [lastScan.elements, typeFilter, stateFilter]);

  const metrics = useMemo(() => {
    const total = lastScan.elements.length;
    const tested = lastScan.elements.filter((e) => e.testState === 'Tested').length;
    const pct = total > 0 ? Math.round((tested / total) * 100) : 0;
    return { total, tested, untested: total - tested, pct };
  }, [lastScan.elements]);

  const handleToggleElementTested = (id: string) => {
    const nextElements: CoverageElement[] = lastScan.elements.map((el) =>
      el.id === id
        ? { ...el, testState: el.testState === 'Tested' ? 'Untested' : 'Tested' }
        : el
    );
    onUpdateScan({ ...lastScan, elements: nextElements });
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
      'Load VeriPulse as a Chrome Extension and click "Scan Controls" on any live browser tab.'
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
                Element Locator Picker
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect any button or input on a webpage to grab reliable CSS &amp; XPath selectors.
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
              Add Locator to Active Flow
            </button>
          )}
        </div>

        {!inspected ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No element picked yet. Click &quot;Pick Element&quot; in the VeriPulse Chrome Extension popup, then click any control on your webpage.
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
              <span>UI Control Coverage Map</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {lastScan.pageTitle} · {metrics.tested}/{metrics.total} controls tested ({metrics.pct}%)
            </p>
          </div>
          <button
            type="button"
            onClick={handleScanNow}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <ScanSearch className="w-3.5 h-3.5" />
            Scan Open Tab
          </button>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-violet-600 transition-all duration-300"
            style={{ width: `${metrics.pct}%` }}
          />
        </div>
      </div>

      {/* Filters */}
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

      {/* Controls Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-violet-50/50 dark:bg-violet-950/20">
                <th className="py-3 px-4">Control Label</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Element Selector</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {filteredElements.map((el) => (
                <tr key={el.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                  <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                    {el.label}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                    {el.controlType}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {el.selector}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                    {!el.visible ? 'hidden' : el.disabled ? 'disabled' : 'visible'}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
