import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Code2,
  Copy,
  Diamond,
  Download,
  Eraser,
  GitBranch,
  Image as ImageIcon,
  Link2,
  Megaphone,
  MousePointer2,
  PenTool,
  Pin,
  Plus,
  ShieldAlert,
  Square,
  Trash2,
  Undo2,
  Workflow,
  XCircle,
} from 'lucide-react';
import {
  AppLanguage,
  FlowchartEdge,
  FlowchartNode,
  FlowchartNodeKind,
  ProjectWorkspace,
  QaNotice,
  QaNoticeType,
  SketchStroke,
} from '../types/flowguard';
import { pickLang } from '../i18n/translations';

interface FlowchartStudioViewProps {
  project: ProjectWorkspace;
  lang: AppLanguage;
  onUpdateProject: (updated: ProjectWorkspace) => void;
  onRequestConfirm?: (opts: {
    title: string;
    detail?: string;
    onConfirm: () => void;
  }) => void;
  onNotify?: (message: string) => void;
}

type CanvasTool = 'select' | 'connect' | 'pen' | 'rect' | 'arrow';

const INITIAL_NODES: FlowchartNode[] = [];

const INITIAL_EDGES: FlowchartEdge[] = [];

const SKETCH_COLORS = [
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Violet', hex: '#7c3aed' },
];

export const FlowchartStudioView: React.FC<FlowchartStudioViewProps> = ({
  project,
  lang,
  onUpdateProject,
  onRequestConfirm,
  onNotify,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeTab, setActiveTab] = useState<'canvas' | 'notices'>('canvas');

  // Flowchart state
  const [nodes, setNodes] = useState<FlowchartNode[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<FlowchartEdge[]>(INITIAL_EDGES);
  const [strokes, setStrokes] = useState<SketchStroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<SketchStroke | null>(null);

  const [tool, setTool] = useState<CanvasTool>('select');
  const [sketchColor, setSketchColor] = useState<string>('#2563eb');
  const [connectTone, setConnectTone] = useState<'flow' | 'allowed' | 'blocked'>('flow');
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedFlowId, setSelectedFlowId] = useState<string>(
    project.flows[0]?.id || ''
  );
  const [showMermaid, setShowMermaid] = useState(false);

  // Notice composer state
  const [noticeType, setNoticeType] = useState<QaNoticeType>('allowed');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [noticeScope, setNoticeScope] = useState('');
  const [noticePinned, setNoticePinned] = useState(true);

  const notices = project.notices || [];

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  // Convert SVG client coordinates to viewBox (920 x 400) coordinates
  const getSvgCoords = (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 920);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 400);
    return {
      x: Math.max(20, Math.min(900, x)),
      y: Math.max(20, Math.min(380, y)),
    };
  };

  const handleGenerateFromFlow = () => {
    const flow =
      project.flows.find((f) => f.id === selectedFlowId) || project.flows[0];
    if (!flow) return;

    const newNodes: FlowchartNode[] = [];
    const newEdges: FlowchartEdge[] = [];

    const startId = `fc_start_${Date.now()}`;
    newNodes.push({
      id: startId,
      kind: 'start',
      label: flow.name.slice(0, 22),
      x: 95,
      y: 190,
    });

    let prevId = startId;
    const stepsSlice = flow.steps.slice(0, 4);
    stepsSlice.forEach((step, idx) => {
      const id = `fc_step_${idx}_${Date.now()}`;
      const col = idx + 1;
      const x = 95 + col * 165;
      const y = idx % 2 === 0 ? 120 : 250;
      newNodes.push({
        id,
        kind: step.status === 'failed' ? 'blocked' : 'step',
        label: step.title.slice(0, 22),
        x: Math.min(760, x),
        y,
      });
      newEdges.push({
        id: `fe_${idx}_${Date.now()}`,
        from: prevId,
        to: id,
        label: step.action,
        tone: step.status === 'failed' ? 'blocked' : 'flow',
      });
      prevId = id;
    });

    const decId = `fc_dec_${Date.now()}`;
    newNodes.push({
      id: decId,
      kind: 'decision',
      label: 'All Checks Pass?',
      x: 785,
      y: 190,
    });
    newEdges.push({
      id: `fe_end_${Date.now()}`,
      from: prevId,
      to: decId,
      label: 'Verify',
      tone: 'allowed',
    });

    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNodeId(decId);
    onNotify?.(
      pickLang(
        lang,
        `Generated flowchart from "${flow.name}".`,
        `"${flow.name}" থেকে ফ্লোচার্ট তৈরি হয়েছে।`
      )
    );
  };

  const handleGenerateFromStateRules = () => {
    if (project.stateTransitions.length === 0) return;
    const stateSet = new Set<string>();
    project.stateTransitions.forEach((r) => {
      stateSet.add(r.fromState);
      stateSet.add(r.toState);
    });
    const list = Array.from(stateSet).slice(0, 5);
    const cols = list.map((name, i) => ({
      id: `st_node_${i}`,
      kind: (name.toLowerCase().includes('reject')
        ? 'blocked'
        : name.toLowerCase().includes('approv') || name.toLowerCase().includes('complet')
          ? 'allowed'
          : i === 0
            ? 'start'
            : 'step') as FlowchartNodeKind,
      label: name,
      x: 110 + i * 175,
      y: i % 2 === 0 ? 150 : 260,
    }));

    const idByState = new Map(cols.map((c) => [c.label, c.id]));
    const builtEdges: FlowchartEdge[] = project.stateTransitions
      .filter((r) => idByState.has(r.fromState) && idByState.has(r.toState))
      .map((r, i) => ({
        id: `ste_${i}_${Date.now()}`,
        from: idByState.get(r.fromState)!,
        to: idByState.get(r.toState)!,
        label: r.allowed ? 'Allowed' : 'Blocked',
        tone: r.allowed ? 'allowed' : 'blocked',
      }));

    setNodes(cols);
    setEdges(builtEdges);
    setSelectedNodeId(cols[0]?.id || null);
    onNotify?.(
      pickLang(
        lang,
        'Built flowchart from Business State Rules.',
        'বিজনেস স্টেট রুলস থেকে ফ্লোচার্ট তৈরি হয়েছে।'
      )
    );
  };

  const handleAddNode = (kind: FlowchartNodeKind, customLabel?: string) => {
    const defaultLabels: Record<FlowchartNodeKind, string> = {
      start: pickLang(lang, 'Start / End', 'শুরু / শেষ'),
      step: pickLang(lang, 'QA Test Step', 'নতুন স্টেপ'),
      decision: pickLang(lang, 'Valid Check?', 'শর্ত ঠিক?'),
      allowed: pickLang(lang, 'Allowed Notice', 'অনুমোদিত'),
      blocked: pickLang(lang, 'Blocked / Bug', 'নিষিদ্ধ / বাগ'),
      note: pickLang(lang, 'QA Note', 'QA নোট'),
    };
    const id = `node_${Date.now()}`;
    const created: FlowchartNode = {
      id,
      kind,
      label: customLabel || defaultLabels[kind],
      x: 180 + ((nodes.length * 67) % 520),
      y: 95 + ((nodes.length * 53) % 210),
    };
    setNodes((prev) => [...prev, created]);
    setSelectedNodeId(id);
    setTool('select');
  };

  const handleNodeMouseDown = (
    e: React.MouseEvent<SVGGElement>,
    node: FlowchartNode
  ) => {
    e.stopPropagation();
    const pt = getSvgCoords(e as unknown as React.MouseEvent<SVGSVGElement>);

    if (tool === 'connect') {
      if (!connectSourceId) {
        setConnectSourceId(node.id);
        setSelectedNodeId(node.id);
        onNotify?.(
          pickLang(
            lang,
            `Selected "${node.label}". Click target node to connect.`,
            `"${node.label}" নির্বাচিত — সংযুক্ত করতে লক্ষ্য বক্সে ক্লিক করুন।`
          )
        );
      } else if (connectSourceId !== node.id) {
        const edge: FlowchartEdge = {
          id: `edge_${Date.now()}`,
          from: connectSourceId,
          to: node.id,
          label:
            connectTone === 'allowed'
              ? 'Allowed'
              : connectTone === 'blocked'
                ? 'Blocked'
                : 'Next',
          tone: connectTone,
        };
        setEdges((prev) => [...prev, edge]);
        setConnectSourceId(null);
      } else {
        setConnectSourceId(null);
      }
      return;
    }

    if (tool === 'select') {
      setSelectedNodeId(node.id);
      setDraggingNodeId(node.id);
      setDragOffset({ x: pt.x - node.x, y: pt.y - node.y });
    }
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === 'pen' || tool === 'rect' || tool === 'arrow') {
      const pt = getSvgCoords(e);
      setActiveStroke({
        id: `stroke_${Date.now()}`,
        tool,
        color: sketchColor,
        points: [pt],
      });
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getSvgCoords(e);
    if (draggingNodeId && tool === 'select') {
      const nx = Math.max(75, Math.min(845, pt.x - dragOffset.x));
      const ny = Math.max(36, Math.min(364, pt.y - dragOffset.y));
      setNodes((prev) =>
        prev.map((n) => (n.id === draggingNodeId ? { ...n, x: nx, y: ny } : n))
      );
      return;
    }
    if (activeStroke) {
      if (activeStroke.tool === 'pen') {
        setActiveStroke((prev) =>
          prev ? { ...prev, points: [...prev.points, pt] } : null
        );
      } else {
        setActiveStroke((prev) =>
          prev ? { ...prev, points: [prev.points[0], pt] } : null
        );
      }
    }
  };

  const handleSvgMouseUp = () => {
    setDraggingNodeId(null);
    if (activeStroke) {
      if (activeStroke.points.length >= 2) {
        setStrokes((prev) => [...prev, activeStroke]);
      }
      setActiveStroke(null);
    }
  };

  const handleDeleteSelectedNode = () => {
    if (!selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    const execute = () => {
      setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
      setEdges((prev) =>
        prev.filter((e) => e.from !== selectedNodeId && e.to !== selectedNodeId)
      );
      setSelectedNodeId(null);
    };
    if (onRequestConfirm) {
      onRequestConfirm({
        title: node?.label || pickLang(lang, 'Flowchart Node', 'ফ্লোচার্ট নোড'),
        detail: pickLang(lang, 'Flowchart Node', 'ফ্লোচার্ট নোড'),
        onConfirm: execute,
      });
    } else {
      execute();
    }
  };

  // Mermaid Code Export
  const mermaidCode = useMemo(() => {
    const lines = ['flowchart LR'];
    for (const n of nodes) {
      const safe = n.label.replace(/"/g, "'");
      if (n.kind === 'start') lines.push(`  ${n.id}(["${safe}"])`);
      else if (n.kind === 'decision') lines.push(`  ${n.id}{"${safe}"}`);
      else lines.push(`  ${n.id}["${safe}"]`);
    }
    for (const e of edges) {
      const arrow = e.tone === 'blocked' ? '-.->' : '-->';
      const lbl = e.label ? `|"${e.label}"|` : '';
      lines.push(`  ${e.from} ${arrow}${lbl} ${e.to}`);
    }
    return lines.join('\n');
  }, [nodes, edges]);

  const exportSvgString = () => {
    if (!svgRef.current) return '';
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', '920');
    clone.setAttribute('height', '400');
    // Insert clean solid background for standalone viewing
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '920');
    bg.setAttribute('height', '400');
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);
    return new XMLSerializer().serializeToString(clone);
  };

  const handleDownloadSvg = () => {
    const svgText = exportSvgString();
    if (!svgText) return;
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veripulse-flowchart-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.(
      pickLang(lang, 'Exported SVG flowchart.', 'ফ্লোচার্ট SVG হিসেবে ডাউনলোড হয়েছে।')
    );
  };

  const handleDownloadPng = () => {
    const svgText = exportSvgString();
    if (!svgText) return;
    const img = new Image();
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1840;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) return;
          const pngUrl = URL.createObjectURL(pngBlob);
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `veripulse-flowchart-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(pngUrl);
        }, 'image/png');
      }
      URL.revokeObjectURL(url);
      onNotify?.(
        pickLang(lang, 'Exported PNG flowchart image.', 'ফ্লোচার্ট PNG ছবি হিসেবে ডাউনলোড হয়েছে।')
      );
    };
    img.src = url;
  };

  const handleCopyMermaid = async () => {
    try {
      await navigator.clipboard.writeText(mermaidCode);
      onNotify?.(
        pickLang(lang, 'Copied Mermaid flowchart code.', 'Mermaid ফ্লোচার্ট কোড কপি হয়েছে।')
      );
    } catch {
      // Ignore
    }
  };

  // Notice Handlers
  const handleCreateNotice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noticeTitle.trim() || !noticeMessage.trim()) return;
    const created: QaNotice = {
      id: `notice_${Date.now()}`,
      type: noticeType,
      title: noticeTitle.trim(),
      message: noticeMessage.trim(),
      scope: noticeScope.trim() || 'All QA Flows',
      pinnedOnTop: noticePinned,
      createdAt: new Date().toISOString(),
    };
    onUpdateProject({
      ...project,
      notices: [created, ...notices],
    });
    setNoticeTitle('');
    setNoticeMessage('');
    setNoticeScope('');
    onNotify?.(
      pickLang(
        lang,
        `Published "${created.title}" notice.`,
        `"${created.title}" নোটিশ প্রকাশিত হয়েছে।`
      )
    );
  };

  const handleTogglePinNotice = (id: string) => {
    onUpdateProject({
      ...project,
      notices: notices.map((n) =>
        n.id === id ? { ...n, pinnedOnTop: !n.pinnedOnTop } : n
      ),
    });
  };

  const handleDeleteNotice = (id: string) => {
    onUpdateProject({
      ...project,
      notices: notices.filter((n) => n.id !== id),
    });
  };

  const handleCopyNotice = async (notice: QaNotice) => {
    const tag =
      notice.type === 'allowed'
        ? '[ALLOWED NOTICE]'
        : notice.type === 'blocked'
          ? '[BLOCKED NOTICE]'
          : notice.type === 'restricted'
            ? '[RESTRICTED NOTICE]'
            : '[QA ADVISORY]';
    const text = `${tag} ${notice.title}\nScope: ${notice.scope}\nDetails: ${notice.message}`;
    try {
      await navigator.clipboard.writeText(text);
      onNotify?.(
        pickLang(lang, 'Copied QA Notice to clipboard.', 'QA নোটিশ ক্লিপবোর্ডে কপি হয়েছে।')
      );
    } catch {
      // Ignore
    }
  };

  const handleDropNoticeToFlowchart = (notice: QaNotice) => {
    const kind: FlowchartNodeKind =
      notice.type === 'allowed'
        ? 'allowed'
        : notice.type === 'blocked'
          ? 'blocked'
          : 'note';
    handleAddNode(kind, notice.title.slice(0, 24));
    setActiveTab('canvas');
    onNotify?.(
      pickLang(lang, 'Added notice card onto Flowchart.', 'নোটিশটি ফ্লোচার্ট ক্যানভাসে যোগ হয়েছে।')
    );
  };

  const renderStroke = (st: SketchStroke) => {
    if (st.points.length < 2) return null;
    if (st.tool === 'pen') {
      const d = st.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
        .join(' ');
      return (
        <path
          key={st.id}
          d={d}
          fill="none"
          stroke={st.color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }
    const start = st.points[0];
    const end = st.points[st.points.length - 1];
    if (st.tool === 'rect') {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      return (
        <rect
          key={st.id}
          x={x}
          y={y}
          width={w}
          height={h}
          rx={8}
          fill={st.color}
          fillOpacity={0.08}
          stroke={st.color}
          strokeWidth={2.5}
          strokeDasharray="6 4"
        />
      );
    }
    return (
      <line
        key={st.id}
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={st.color}
        strokeWidth={2.75}
        strokeLinecap="round"
        markerEnd="url(#sketch-arrow)"
      />
    );
  };

  const getNodeStyle = (kind: FlowchartNodeKind) => {
    switch (kind) {
      case 'start':
        return { fill: '#0d9488', stroke: '#0f766e', text: '#ffffff' };
      case 'step':
        return { fill: '#2563eb', stroke: '#1d4ed8', text: '#ffffff' };
      case 'decision':
        return { fill: '#f59e0b', stroke: '#d97706', text: '#0f172a' };
      case 'allowed':
        return { fill: '#059669', stroke: '#047857', text: '#ffffff' };
      case 'blocked':
        return { fill: '#e11d48', stroke: '#be123c', text: '#ffffff' };
      case 'note':
        return { fill: '#7c3aed', stroke: '#6d28d9', text: '#ffffff' };
    }
  };

  return (
    <div className="space-y-5">
      {/* Indigo-Teal Module Header */}
      <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Workflow className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {pickLang(
                lang,
                'QA Flowchart, Drawing & Allowed Notice Studio',
                'QA ফ্লোচার্ট, ড্রয়িং এবং এলাউড নোটিশ স্টুডিও'
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {pickLang(
                lang,
                'Build or auto-generate flowcharts, draw highlights directly on canvas, export SVG/PNG/Mermaid, and broadcast Allowed Notices.',
                'টেস্ট ফ্লো থেকে অটো ফ্লোচার্ট বানান, ক্যানভাসে ড্র করুন, SVG/PNG/Mermaid হিসেবে আউট করুন এবং টিমের জন্য এলাউড নোটিশ প্রকাশ করুন।'
              )}
            </p>
          </div>
        </div>

        <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('canvas')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'canvas'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            {pickLang(lang, 'Flowchart & Draw', 'ফ্লোচার্ট ও ড্রয়িং')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notices')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'notices'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            {pickLang(
              lang,
              `Allowed Notices (${notices.length})`,
              `এলাউড নোটিশ (${notices.length})`
            )}
          </button>
        </div>
      </div>

      {activeTab === 'canvas' ? (
        <div className="space-y-4">
          {/* Auto-Generate & Export Bar */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Select flow to convert"
                value={selectedFlowId}
                onChange={(e) => setSelectedFlowId(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                {project.flows.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleGenerateFromFlow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Workflow className="w-3.5 h-3.5" />
                {pickLang(lang, 'Flow → Flowchart', 'ফ্লো থেকে ফ্লোচার্ট')}
              </button>
              <button
                type="button"
                onClick={handleGenerateFromStateRules}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-semibold cursor-pointer"
              >
                <GitBranch className="w-3.5 h-3.5" />
                {pickLang(lang, 'Rules → Flowchart', 'রুলস থেকে ফ্লোচার্ট')}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMermaid((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" />
                {pickLang(lang, 'Mermaid Code', 'Mermaid কোড')}
              </button>
              <button
                type="button"
                onClick={handleDownloadSvg}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                SVG
              </button>
              <button
                type="button"
                onClick={handleDownloadPng}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-teal-600 text-white text-xs font-semibold cursor-pointer hover:brightness-105"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {pickLang(lang, 'Export PNG', 'PNG আউট করুন')}
              </button>
            </div>
          </div>

          {/* Drawing & Node Creation Toolbar */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
            {/* Interaction / Drawing Tools */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setTool('select');
                  setConnectSourceId(null);
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tool === 'select'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <MousePointer2 className="w-3.5 h-3.5" />
                {pickLang(lang, 'Move', 'সরান')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTool('connect');
                  setConnectSourceId(null);
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tool === 'connect'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                {pickLang(lang, 'Connect', 'সংযুক্ত')}
              </button>
              {tool === 'connect' && (
                <select
                  aria-label="Connector tone"
                  value={connectTone}
                  onChange={(e) =>
                    setConnectTone(e.target.value as 'flow' | 'allowed' | 'blocked')
                  }
                  className="px-2 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950 text-xs font-medium text-indigo-800 dark:text-indigo-200"
                >
                  <option value="flow">Normal Arrow</option>
                  <option value="allowed">Allowed (Green)</option>
                  <option value="blocked">Blocked (Red)</option>
                </select>
              )}
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
              <button
                type="button"
                onClick={() => setTool('pen')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tool === 'pen'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                {pickLang(lang, 'Draw Pen', 'পেন ড্র')}
              </button>
              <button
                type="button"
                onClick={() => setTool('rect')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tool === 'rect'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Square className="w-3.5 h-3.5" />
                {pickLang(lang, 'Box', 'বক্স')}
              </button>
              <button
                type="button"
                onClick={() => setTool('arrow')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tool === 'arrow'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                {pickLang(lang, 'Pointer', 'তীর')}
              </button>

              {/* Color Swatches */}
              <div className="flex items-center gap-1 ml-1">
                {SKETCH_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    aria-label={c.name}
                    onClick={() => setSketchColor(c.hex)}
                    className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                      sketchColor === c.hex
                        ? 'scale-115 ring-2 ring-offset-1 ring-slate-900 dark:ring-white'
                        : ''
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                disabled={strokes.length === 0}
                title="Undo drawing"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer ml-1"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onRequestConfirm) {
                    onRequestConfirm({
                      title: pickLang(
                        lang,
                        `Clear ${strokes.length} drawing stroke(s)`,
                        `${strokes.length}টি ড্রয়িং স্ট্রোক মুছুন`
                      ),
                      detail: pickLang(lang, 'Flowchart Sketch', 'ফ্লোচার্ট স্কেচ'),
                      onConfirm: () => setStrokes([]),
                    });
                  } else {
                    setStrokes([]);
                  }
                }}
                disabled={strokes.length === 0}
                title="Clear drawing"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Add Flowchart Node Shapes */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleAddNode('step')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                {pickLang(lang, 'Step', 'স্টেপ')}
              </button>
              <button
                type="button"
                onClick={() => handleAddNode('decision')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-pointer"
              >
                <Diamond className="w-3 h-3" />
                {pickLang(lang, 'Decision', 'শর্ত')}
              </button>
              <button
                type="button"
                onClick={() => handleAddNode('allowed')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold cursor-pointer"
              >
                <CheckCircle2 className="w-3 h-3" />
                {pickLang(lang, 'Allowed', 'অনুমোদিত')}
              </button>
              <button
                type="button"
                onClick={() => handleAddNode('blocked')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-semibold cursor-pointer"
              >
                <XCircle className="w-3 h-3" />
                {pickLang(lang, 'Blocked', 'নিষিদ্ধ')}
              </button>
            </div>
          </div>

          {/* Interactive SVG Canvas + Node Label Editor */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden shadow-xs">
              <svg
                ref={svgRef}
                viewBox="0 0 920 400"
                onMouseDown={handleSvgMouseDown}
                onMouseMove={handleSvgMouseMove}
                onMouseUp={handleSvgMouseUp}
                onMouseLeave={handleSvgMouseUp}
                className={`w-full h-auto select-none ${
                  tool === 'pen' || tool === 'rect' || tool === 'arrow'
                    ? 'cursor-crosshair'
                    : tool === 'connect'
                      ? 'cursor-alias'
                      : 'cursor-default'
                }`}
              >
                <defs>
                  <pattern
                    id="qa-grid"
                    width="24"
                    height="24"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="2" cy="2" r="1" fill="#94a3b8" fillOpacity="0.28" />
                  </pattern>
                  <marker
                    id="edge-flow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="#4f46e5" />
                  </marker>
                  <marker
                    id="edge-allowed"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="#059669" />
                  </marker>
                  <marker
                    id="edge-blocked"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="#e11d48" />
                  </marker>
                  <marker
                    id="sketch-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill={sketchColor} />
                  </marker>
                </defs>

                <rect width="920" height="400" fill="url(#qa-grid)" />

                {nodes.length === 0 && strokes.length === 0 && (
                  <g>
                    <text
                      x="460"
                      y="188"
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight="600"
                      fill="#64748b"
                    >
                      {pickLang(
                        lang,
                        'Clean Flowchart Canvas — Add nodes above or Auto-Generate from a Flow',
                        'ফাঁকা ফ্লোচার্ট ক্যানভাস — উপরের বাটন থেকে নোড যোগ করুন বা ফ্লো থেকে অটো তৈরি করুন'
                      )}
                    </text>
                    <text
                      x="460"
                      y="212"
                      textAnchor="middle"
                      fontSize="11.5"
                      fill="#94a3b8"
                    >
                      {pickLang(
                        lang,
                        'Drag nodes, connect steps, or draw freehand annotations directly here.',
                        'এখানে নোড ড্র্যাগ করুন, কানেক্ট করুন অথবা ফ্রি-হ্যান্ড পেন দিয়ে এঁকে নিন।'
                      )}
                    </text>
                  </g>
                )}

                {/* Edges */}
                {edges.map((edge) => {
                  const fromNode = nodes.find((n) => n.id === edge.from);
                  const toNode = nodes.find((n) => n.id === edge.to);
                  if (!fromNode || !toNode) return null;
                  const midX = (fromNode.x + toNode.x) / 2;
                  const midY = (fromNode.y + toNode.y) / 2 - 12;
                  const strokeColor =
                    edge.tone === 'allowed'
                      ? '#059669'
                      : edge.tone === 'blocked'
                        ? '#e11d48'
                        : '#4f46e5';
                  const marker =
                    edge.tone === 'allowed'
                      ? 'url(#edge-allowed)'
                      : edge.tone === 'blocked'
                        ? 'url(#edge-blocked)'
                        : 'url(#edge-flow)';
                  return (
                    <g key={edge.id}>
                      <path
                        d={`M ${fromNode.x} ${fromNode.y} Q ${midX} ${midY} ${toNode.x} ${toNode.y}`}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={2.2}
                        strokeDasharray={edge.tone === 'blocked' ? '6 4' : undefined}
                        markerEnd={marker}
                      />
                      {edge.label && (
                        <g transform={`translate(${midX}, ${midY + 6})`}>
                          <rect
                            x={-34}
                            y={-9}
                            width={68}
                            height={18}
                            rx={4}
                            fill="#ffffff"
                            fillOpacity={0.92}
                            stroke={strokeColor}
                            strokeWidth={1}
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={10}
                            fontWeight={600}
                            fill={strokeColor}
                          >
                            {edge.label}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Nodes */}
                {nodes.map((node) => {
                  const style = getNodeStyle(node.kind);
                  const isSel = selectedNodeId === node.id;
                  const isSrc = connectSourceId === node.id;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      onMouseDown={(e) => handleNodeMouseDown(e, node)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      {node.kind === 'decision' ? (
                        <polygon
                          points="0,-32 68,0 0,32 -68,0"
                          fill={style.fill}
                          stroke={isSel || isSrc ? '#0f172a' : style.stroke}
                          strokeWidth={isSel || isSrc ? 3 : 2}
                        />
                      ) : (
                        <rect
                          x={-68}
                          y={-22}
                          width={136}
                          height={44}
                          rx={node.kind === 'start' ? 22 : 9}
                          fill={style.fill}
                          stroke={isSel || isSrc ? '#0f172a' : style.stroke}
                          strokeWidth={isSel || isSrc ? 3 : 2}
                        />
                      )}
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={11.5}
                        fontWeight={700}
                        fill={style.text}
                      >
                        {node.label.length > 20
                          ? `${node.label.slice(0, 19)}…`
                          : node.label}
                      </text>
                    </g>
                  );
                })}

                {/* Freehand & Shape Drawings */}
                {strokes.map(renderStroke)}
                {activeStroke && renderStroke(activeStroke)}
              </svg>
            </div>

            {/* Right Inspector Card for Selected Node */}
            <div className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4 shadow-xs">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                {pickLang(lang, 'Node Properties', 'বক্সের বিবরণ')}
              </div>

              {selectedNode ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {pickLang(lang, 'Label Text', 'বক্সের লেখা')}
                    </label>
                    <input
                      type="text"
                      value={selectedNode.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id ? { ...n, label: val } : n
                          )
                        );
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {pickLang(lang, 'Shape Style', 'ধরন')}
                    </label>
                    <select
                      value={selectedNode.kind}
                      onChange={(e) => {
                        const kind = e.target.value as FlowchartNodeKind;
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id ? { ...n, kind } : n
                          )
                        );
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="start">Start / End Pill</option>
                      <option value="step">Test Step Box</option>
                      <option value="decision">Decision Diamond</option>
                      <option value="allowed">Allowed (Green)</option>
                      <option value="blocked">Blocked (Red)</option>
                      <option value="note">QA Note (Violet)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleDeleteSelectedNode}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-semibold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {pickLang(lang, 'Remove Node', 'বক্স মুছুন')}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pickLang(
                    lang,
                    'Click any node on the canvas to edit its label or drag to reposition it.',
                    'যেকোনো বক্সে ক্লিক করে লেখা পরিবর্তন করুন অথবা ড্র্যাগ করে জায়গা বদলান।'
                  )}
                </p>
              )}
            </div>
          </div>

          {showMermaid && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-mono font-semibold">
                  Mermaid Flowchart Export (Jira / GitHub / Notion)
                </span>
                <button
                  type="button"
                  onClick={handleCopyMermaid}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-700 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  {pickLang(lang, 'Copy Code', 'কোড কপি করুন')}
                </button>
              </div>
              <pre className="text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed">
                {mermaidCode}
              </pre>
            </div>
          )}
        </div>
      ) : (
        /* Allowed Notice Center */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Publish New Allowed Notice Form */}
          <form
            onSubmit={handleCreateNotice}
            className="lg:col-span-5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-white dark:bg-slate-900 p-5 space-y-3.5 shadow-xs"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Megaphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                {pickLang(
                  lang,
                  'Create Allowed / QA Notice',
                  'নতুন এলাউড / QA নোটিশ তৈরি করুন'
                )}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {pickLang(lang, 'Notice Decision Type', 'নোটিশের ধরন')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      id: 'allowed',
                      en: 'Allowed',
                      bn: 'এলাউড (অনুমোদিত)',
                      cls: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
                    },
                    {
                      id: 'restricted',
                      en: 'Restricted',
                      bn: 'সীমাবদ্ধ (শর্তযুক্ত)',
                      cls: 'border-amber-500 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
                    },
                    {
                      id: 'blocked',
                      en: 'Blocked',
                      bn: 'ব্লকড (নিষিদ্ধ)',
                      cls: 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
                    },
                    {
                      id: 'advisory',
                      en: 'QA Advisory',
                      bn: 'QA পরামর্শ',
                      cls: 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setNoticeType(item.id)}
                    className={`px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      noticeType === item.id
                        ? item.cls
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {pickLang(lang, item.en, item.bn)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {pickLang(lang, 'Notice Headline', 'নোটিশের শিরোনাম')}
              </label>
              <input
                type="text"
                required
                placeholder={pickLang(
                  lang,
                  'e.g. Allowed: Reviewers can approve requests up to 14 days',
                  'যেমন: অনুমোদিত — রিভিউয়ার সর্বোচ্চ ১৪ দিনের রিকোয়েস্ট অনুমোদন করতে পারবেন'
                )}
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {pickLang(lang, 'Target Scope / Role', 'কোন রোল বা অংশের জন্য')}
              </label>
              <input
                type="text"
                placeholder={pickLang(
                  lang,
                  'e.g. Reviewer Role · Staging',
                  'যেমন: Reviewer Role · Staging'
                )}
                value={noticeScope}
                onChange={(e) => setNoticeScope(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {pickLang(lang, 'Clear QA Guidance', 'বিস্তারিত নির্দেশনা')}
              </label>
              <textarea
                rows={3}
                required
                placeholder={pickLang(
                  lang,
                  'Explain what is allowed or blocked and what the QA check confirmed...',
                  'কোন কাজটি করা যাবে বা যাবে না তা সহজভাবে লিখুন...'
                )}
                value={noticeMessage}
                onChange={(e) => setNoticeMessage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={noticePinned}
                onChange={(e) => setNoticePinned(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700"
              />
              <span>
                {pickLang(
                  lang,
                  'Pin as Live Banner at top of workspace',
                  'ওয়ার্কস্পেসের ওপরে লাইভ ব্যানার হিসেবে পিন করুন'
                )}
              </span>
            </label>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
            >
              {pickLang(lang, 'Publish QA Notice', 'QA নোটিশ প্রকাশ করুন')}
            </button>
          </form>

          {/* Notice Board List */}
          <div className="lg:col-span-7 space-y-3">
            {notices.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500">
                {pickLang(
                  lang,
                  'No QA notices yet. Publish an Allowed or Blocked notice on the left.',
                  'এখনও কোনো QA নোটিশ নেই। বাম পাশ থেকে একটি নতুন নোটিশ তৈরি করুন।'
                )}
              </div>
            ) : (
              notices.map((n) => {
                const badgeStyle =
                  n.type === 'allowed'
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : n.type === 'blocked'
                      ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20'
                      : n.type === 'restricted'
                        ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20'
                        : 'border-sky-200 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20';

                const pillStyle =
                  n.type === 'allowed'
                    ? 'bg-emerald-600 text-white'
                    : n.type === 'blocked'
                      ? 'bg-rose-600 text-white'
                      : n.type === 'restricted'
                        ? 'bg-amber-600 text-white'
                        : 'bg-sky-600 text-white';

                return (
                  <div
                    key={n.id}
                    className={`rounded-xl border ${badgeStyle} p-4 space-y-2.5 shadow-xs`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${pillStyle}`}
                        >
                          {n.type}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {n.scope}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleTogglePinNotice(n.id)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            n.pinnedOnTop
                              ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                              : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <Pin className="w-3 h-3" />
                          {n.pinnedOnTop
                            ? pickLang(lang, 'Pinned', 'পিন করা')
                            : pickLang(lang, 'Pin Banner', 'পিন করুন')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDropNoticeToFlowchart(n)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-indigo-300 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer"
                        >
                          <Workflow className="w-3 h-3" />
                          {pickLang(lang, 'To Flowchart', 'ফ্লোচার্টে নিন')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyNotice(n)}
                          title="Copy notice"
                          className="p-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNotice(n.id)}
                          title="Delete notice"
                          className="p-1.5 rounded border border-slate-300 dark:border-slate-700 text-rose-600 dark:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      {n.type === 'blocked' && (
                        <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {n.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {n.message}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
