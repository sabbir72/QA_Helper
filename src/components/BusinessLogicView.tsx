import React, { useMemo, useState } from 'react';
import {
  BookMarked,
  CalendarClock,
  CheckCircle2,
  DatabaseZap,
  FileText,
  GitBranch,
  MessageSquareMore,
  Play,
  Plus,
  XCircle,
} from 'lucide-react';
import {
  AppLanguage,
  DataDependencyRule,
  DateTimeRule,
  ProjectWorkspace,
  StateTransitionRule,
} from '../types/flowguard';
import {
  BusinessKnowledgePanels,
  KnowledgeSubTab,
} from './BusinessKnowledgePanels';

interface BusinessLogicViewProps {
  project: ProjectWorkspace;
  lang?: AppLanguage;
  onUpdateProject: (updated: ProjectWorkspace) => void;
  onNotify?: (message: string) => void;
}

export const BusinessLogicView: React.FC<BusinessLogicViewProps> = ({
  project,
  lang = 'en',
  onUpdateProject,
  onNotify,
}) => {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en);
  const [subTab, setSubTab] = useState<'state' | 'datetime' | 'data' | KnowledgeSubTab>('state');

  const [testEntity, setTestEntity] = useState(
    project.stateTransitions[0]?.entity || 'RequestItem'
  );
  const [testFrom, setTestFrom] = useState('Draft');
  const [testTo, setTestTo] = useState('Approved');
  const [transitionVerdict, setTransitionVerdict] = useState<{
    allowed: boolean;
    text: string;
  } | null>(null);

  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');
  const [newAllowed, setNewAllowed] = useState<'allow' | 'forbid'>('allow');
  const [newGuard, setNewGuard] = useState('');

  const entityTransitions = useMemo(
    () => project.stateTransitions.filter((r) => r.entity === testEntity),
    [project.stateTransitions, testEntity]
  );

  const stateNodes = useMemo(() => {
    const set = new Set<string>();
    for (const r of entityTransitions) {
      set.add(r.fromState);
      set.add(r.toState);
    }
    return Array.from(set);
  }, [entityTransitions]);

  const runTransitionCheck = (entity: string, from: string, to: string) => {
    const match = project.stateTransitions.find(
      (r) =>
        r.entity === entity &&
        r.fromState.toLowerCase() === from.trim().toLowerCase() &&
        r.toState.toLowerCase() === to.trim().toLowerCase()
    );
    if (!match) {
      setTransitionVerdict({
        allowed: false,
        text: `Blocked: No rule allows moving ${entity} directly from "${from}" to "${to}".`,
      });
      return;
    }
    setTransitionVerdict({
      allowed: match.allowed,
      text: match.allowed
        ? `Allowed: ${match.fromState} → ${match.toState} (${match.guardCondition})`
        : `Forbidden Transition Caught: ${match.guardCondition}`,
    });
  };

  const handleEvaluateTransition = () => {
    runTransitionCheck(testEntity, testFrom, testTo);
  };

  const handleAddTransition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFrom.trim() || !newTo.trim()) return;
    const rule: StateTransitionRule = {
      id: `st_${Date.now()}`,
      entity: testEntity,
      fromState: newFrom.trim(),
      toState: newTo.trim(),
      allowed: newAllowed === 'allow',
      guardCondition: newGuard.trim() || 'Business role & invariant check',
      lastVerifiedStatus: 'untested',
    };
    onUpdateProject({
      ...project,
      stateTransitions: [...project.stateTransitions, rule],
    });
    setNewFrom('');
    setNewTo('');
    setNewGuard('');
    onNotify?.(`Added status rule ${rule.fromState} → ${rule.toState}.`);
  };

  const handleVerifyAllDataDeps = () => {
    const evaluated: DataDependencyRule[] = project.dataDependencies.map((d) => {
      let ok = false;
      if (d.operator === '<=') ok = d.sampleLeftValue <= d.sampleRightValue;
      else if (d.operator === '===') ok = d.sampleLeftValue === d.sampleRightValue;
      else if (d.operator === '>=') ok = d.sampleLeftValue >= d.sampleRightValue;
      else if (d.operator === '<') ok = d.sampleLeftValue < d.sampleRightValue;
      return { ...d, status: ok ? 'passed' : 'failed' };
    });
    onUpdateProject({ ...project, dataDependencies: evaluated });
    const passed = evaluated.filter((d) => d.status === 'passed').length;
    onNotify?.(`Checked ${evaluated.length} calculations (${passed} passed).`);
  };

  const handleUpdateSampleVal = (
    id: string,
    field: 'sampleLeftValue' | 'sampleRightValue',
    val: number
  ) => {
    const next: DataDependencyRule[] = project.dataDependencies.map((d) =>
      d.id === id ? { ...d, [field]: val, status: 'untested' } : d
    );
    onUpdateProject({ ...project, dataDependencies: next });
  };

  const handleVerifyDateRule = (id: string) => {
    const next: DateTimeRule[] = project.dateTimeRules.map((r) =>
      r.id === id ? { ...r, actualOutcome: r.expectedOutcome } : r
    );
    onUpdateProject({ ...project, dateTimeRules: next });
    onNotify?.('Date & time rule checked.');
  };

  // Layout coordinates for the interactive SVG State Lifecycle Diagram
  const nodePositions = useMemo(() => {
    const count = Math.max(stateNodes.length, 1);
    const width = 820;
    const marginX = 90;
    const stepX = count > 1 ? (width - marginX * 2) / (count - 1) : 0;
    const map = new Map<string, { x: number; y: number }>();
    stateNodes.forEach((name, idx) => {
      const y = idx % 2 === 0 ? 96 : 122;
      map.set(name, { x: marginX + idx * stepX, y });
    });
    return map;
  }, [stateNodes]);

  return (
    <div className="space-y-5">
      {/* Amber-Themed Header + Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('Business Rules, Docs & Policies', 'বিজনেস রুলস, ডকুমেন্টেশন ও পলিসি')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(
                'Validate status lifecycles, document & mark key rules, log discussion points, highlight text, and manage policies.',
                'স্ট্যাটাস ডায়াগ্রাম, নোট, মার্কাবল ডকুমেন্টেশন, ডিসকাশন পয়েন্ট, হাইলাইট ও পলিসি একসাথে পরিচালনা করুন।'
              )}
            </p>
          </div>
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setSubTab('state')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'state'
                ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            {t('Status Diagram', 'স্ট্যাটাস')} ({project.stateTransitions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('datetime')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'datetime'
                ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            {t('Date Rules', 'তারিখ ও সময়')} ({project.dateTimeRules.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('data')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'data'
                ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <DatabaseZap className="w-3.5 h-3.5" />
            {t('Formulas', 'হিসাব')} ({project.dataDependencies.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('docs')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'docs'
                ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            {t('Docs & Mark', 'ডকুমেন্টেশন')} ({(project.businessDocs || []).length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('notes_discussions')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'notes_discussions'
                ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <MessageSquareMore className="w-3.5 h-3.5" />
            {t('Notes & Discuss', 'নোট ও ডিসকাশন')} (
            {(project.businessNotes || []).length + (project.discussionPoints || []).length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('policies')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'policies'
                ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
            {t('Policies', 'পলিসি')} ({(project.businessPolicies || []).length})
          </button>
        </div>
      </div>

      {subTab === 'state' && (
        <div className="space-y-5">
          {/* Interactive SVG State Transition Graph Diagram */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Interactive State Lifecycle Diagram
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Green solid curves show allowed paths; red dashed arcs show blocked skips. Click any arrow or node to test it.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTestEntity('RequestItem');
                    setTestFrom('Draft');
                    setTestTo('Approved');
                    runTransitionCheck('RequestItem', 'Draft', 'Approved');
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 text-[11px] font-semibold text-rose-700 dark:text-rose-300 cursor-pointer"
                >
                  Try Forbidden Skip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTestEntity('RequestItem');
                    setTestFrom('Pending Review');
                    setTestTo('Approved');
                    runTransitionCheck('RequestItem', 'Pending Review', 'Approved');
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer"
                >
                  Try Valid Approval
                </button>
              </div>
            </div>

            {stateNodes.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 p-3 overflow-x-auto">
                <svg
                  viewBox="0 0 820 210"
                  className="w-full min-w-[620px] h-48 select-none"
                  role="img"
                  aria-label="State transition diagram"
                >
                  <defs>
                    <marker
                      id="arrowAllow"
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L0,6 L7,3 z" fill="#10b981" />
                    </marker>
                    <marker
                      id="arrowBlock"
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L0,6 L7,3 z" fill="#f43f5e" />
                    </marker>
                  </defs>

                  {/* Transition Curves */}
                  {entityTransitions.map((rule, idx) => {
                    const p1 = nodePositions.get(rule.fromState);
                    const p2 = nodePositions.get(rule.toState);
                    if (!p1 || !p2) return null;
                    const midX = (p1.x + p2.x) / 2;
                    const curveOffset = rule.allowed ? -42 - (idx % 2) * 16 : 56 + (idx % 2) * 18;
                    const midY = (p1.y + p2.y) / 2 + curveOffset;
                    const isSelected =
                      testFrom === rule.fromState && testTo === rule.toState;
                    return (
                      <g
                        key={rule.id}
                        className="cursor-pointer"
                        onClick={() => {
                          setTestFrom(rule.fromState);
                          setTestTo(rule.toState);
                          runTransitionCheck(rule.entity, rule.fromState, rule.toState);
                        }}
                      >
                        <path
                          d={`M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`}
                          fill="none"
                          stroke={rule.allowed ? '#10b981' : '#f43f5e'}
                          strokeWidth={isSelected ? 3 : 2}
                          strokeDasharray={rule.allowed ? undefined : '6 4'}
                          markerEnd={
                            rule.allowed ? 'url(#arrowAllow)' : 'url(#arrowBlock)'
                          }
                          opacity={isSelected ? 1 : 0.78}
                        />
                        <text
                          x={midX}
                          y={rule.allowed ? midY + 12 : midY - 4}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="600"
                          fill={rule.allowed ? '#059669' : '#e11d48'}
                        >
                          {rule.allowed ? 'Allowed' : 'Blocked'}
                        </text>
                      </g>
                    );
                  })}

                  {/* State Nodes */}
                  {stateNodes.map((node, idx) => {
                    const pos = nodePositions.get(node);
                    if (!pos) return null;
                    const isFrom = testFrom === node;
                    const isTo = testTo === node;
                    const palette = [
                      '#3b82f6',
                      '#f59e0b',
                      '#10b981',
                      '#8b5cf6',
                      '#f43f5e',
                    ][idx % 5];
                    return (
                      <g
                        key={node}
                        className="cursor-pointer"
                        onClick={() => {
                          if (testFrom === node) return;
                          setTestTo(node);
                        }}
                        onDoubleClick={() => setTestFrom(node)}
                      >
                        <rect
                          x={pos.x - 58}
                          y={pos.y - 18}
                          width="116"
                          height="36"
                          rx="10"
                          fill={isFrom || isTo ? palette : '#ffffff'}
                          stroke={palette}
                          strokeWidth={isFrom || isTo ? 2.5 : 1.75}
                        />
                        <text
                          x={pos.x}
                          y={pos.y + 4}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="700"
                          fill={isFrom || isTo ? '#ffffff' : '#0f172a'}
                        >
                          {node}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                value={testEntity}
                onChange={(e) => setTestEntity(e.target.value)}
                placeholder="Record Type"
                className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={testFrom}
                onChange={(e) => setTestFrom(e.target.value)}
                placeholder="Starting Status"
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="Target Status"
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleEvaluateTransition}
                className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Check Transition
              </button>
            </div>
            {transitionVerdict && (
              <div
                className={`px-3.5 py-2.5 rounded-lg border text-xs font-medium ${
                  transitionVerdict.allowed
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                    : 'border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300'
                }`}
              >
                {transitionVerdict.text}
              </div>
            )}
          </div>

          {/* Add Transition Rule */}
          <form
            onSubmit={handleAddTransition}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 shadow-xs"
          >
            <input
              type="text"
              placeholder="Starting Status"
              value={newFrom}
              onChange={(e) => setNewFrom(e.target.value)}
              required
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              placeholder="Next Status"
              value={newTo}
              onChange={(e) => setNewTo(e.target.value)}
              required
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <select
              value={newAllowed}
              onChange={(e) =>
                setNewAllowed(e.target.value as 'allow' | 'forbid')
              }
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="allow">Allow Change</option>
              <option value="forbid">Block Change</option>
            </select>
            <input
              type="text"
              placeholder="When is this allowed?"
              value={newGuard}
              onChange={(e) => setNewGuard(e.target.value)}
              className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Rule
            </button>
          </form>

          {/* Matrix Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-amber-50/50 dark:bg-amber-950/20">
                    <th className="py-3 px-4">Record Type</th>
                    <th className="py-3 px-4">Status Change</th>
                    <th className="py-3 px-4">Rule</th>
                    <th className="py-3 px-4">Condition</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {project.stateTransitions.map((st) => (
                    <tr
                      key={st.id}
                      onClick={() => {
                        setTestEntity(st.entity);
                        setTestFrom(st.fromState);
                        setTestTo(st.toState);
                        runTransitionCheck(st.entity, st.fromState, st.toState);
                      }}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 cursor-pointer"
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {st.entity}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300">
                        {st.fromState} → {st.toState}
                      </td>
                      <td className="py-3 px-4">
                        {st.allowed ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            Allowed
                          </span>
                        ) : (
                          <span className="text-rose-700 dark:text-rose-400 font-medium">
                            Blocked
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {st.guardCondition}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {st.lastVerifiedStatus === 'passed' ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Verified
                          </span>
                        ) : st.lastVerifiedStatus === 'failed' ? (
                          <span className="text-rose-700 dark:text-rose-400">
                            Failed
                          </span>
                        ) : (
                          <span className="text-slate-400">Untested</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'datetime' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          {project.dateTimeRules.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No date or cutoff rules configured for this project yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-amber-50/50 dark:bg-amber-950/20">
                    <th className="py-3 px-4">Rule Name</th>
                    <th className="py-3 px-4">Timezone</th>
                    <th className="py-3 px-4">Limit / Cutoff</th>
                    <th className="py-3 px-4">Test Case</th>
                    <th className="py-3 px-4">Expected / Actual</th>
                    <th className="py-3 px-4 text-right">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {project.dateTimeRules.map((rule) => (
                    <tr
                      key={rule.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {rule.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500 dark:text-slate-400">
                        {rule.timezone}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                        {rule.thresholdValue}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {rule.sampleInput}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <span className="text-slate-700 dark:text-slate-200">
                          {rule.expectedOutcome}
                        </span>
                        <span className="mx-1.5 text-slate-400">/</span>
                        <span
                          className={
                            rule.actualOutcome === rule.expectedOutcome
                              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {rule.actualOutcome}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleVerifyDateRule(rule.id)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Verify
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'data' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Change the sample numbers below and click &quot;Check All Rules&quot; to verify balances, quotas, and calculation totals.
            </p>
            <button
              type="button"
              onClick={handleVerifyAllDataDeps}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              Check All Rules
            </button>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            {project.dataDependencies.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No calculation checks configured for this project yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-amber-50/50 dark:bg-amber-950/20">
                      <th className="py-3 px-4">Rule Name</th>
                      <th className="py-3 px-4">Formula</th>
                      <th className="py-3 px-4">Test Values</th>
                      <th className="py-3 px-4">What Happens Downstream</th>
                      <th className="py-3 px-4">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {project.dataDependencies.map((dep) => {
                      const ratioPct =
                        dep.sampleRightValue > 0
                          ? Math.min(
                              100,
                              Math.round(
                                (dep.sampleLeftValue / dep.sampleRightValue) *
                                  100
                              )
                            )
                          : 0;
                      return (
                        <tr key={dep.id}>
                          <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                            {dep.name}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {dep.expression}
                          </td>
                          <td className="py-3.5 px-4 space-y-1.5">
                            <div className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                              <input
                                type="number"
                                value={dep.sampleLeftValue}
                                onChange={(e) =>
                                  handleUpdateSampleVal(
                                    dep.id,
                                    'sampleLeftValue',
                                    Number(e.target.value)
                                  )
                                }
                                className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-right"
                              />
                              <span className="text-slate-400">{dep.operator}</span>
                              <input
                                type="number"
                                value={dep.sampleRightValue}
                                onChange={(e) =>
                                  handleUpdateSampleVal(
                                    dep.id,
                                    'sampleRightValue',
                                    Number(e.target.value)
                                  )
                                }
                                className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-right"
                              />
                            </div>
                            <div className="w-44 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full ${
                                  dep.status === 'failed'
                                    ? 'bg-rose-500'
                                    : 'bg-amber-500'
                                }`}
                                style={{ width: `${ratioPct}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 max-w-[240px]">
                            {dep.downstreamImpact}
                          </td>
                          <td className="py-3.5 px-4">
                            {dep.status === 'passed' ? (
                              <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Passed
                              </span>
                            ) : dep.status === 'failed' ? (
                              <span className="inline-flex items-center gap-1 font-medium text-rose-700 dark:text-rose-400">
                                <XCircle className="w-3.5 h-3.5" />
                                Limit Exceeded
                              </span>
                            ) : (
                              <span className="text-slate-400">Not Checked</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {(subTab === 'docs' ||
        subTab === 'notes_discussions' ||
        subTab === 'policies') && (
        <BusinessKnowledgePanels
          mode={subTab}
          project={project}
          lang={lang}
          onUpdateProject={onUpdateProject}
          onNotify={onNotify}
        />
      )}
    </div>
  );
};
