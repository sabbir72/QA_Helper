import React, { useMemo, useRef, useState } from 'react';
import {
  Bold,
  BookMarked,
  Calculator,
  Check,
  CheckCircle2,
  CheckSquare,
  ClipboardCopy,
  Code,
  Columns2,
  Download,
  Eye,
  FileText,
  Filter,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  MapPin,
  MessageSquareMore,
  Minus,
  Pencil,
  PenLine,
  Pin,
  Plus,
  Printer,
  Quote,
  Search,
  ShieldCheck,
  Sigma,
  StickyNote,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import {
  AppLanguage,
  BusinessDocHighlight,
  BusinessDocItem,
  BusinessDocMarkStatus,
  BusinessPolicy,
  BusinessRuleNote,
  DiscussionPoint,
  HighlightColor,
  ProjectWorkspace,
} from '../types/flowguard';
import {
  buildWordCompatibleDocHtml,
  evaluateDocFormula,
} from '../utils/docRichFormatter';

export type KnowledgeSubTab = 'docs' | 'notes_discussions' | 'policies';

interface BusinessKnowledgePanelsProps {
  mode: KnowledgeSubTab;
  project: ProjectWorkspace;
  lang: AppLanguage;
  onUpdateProject: (updated: ProjectWorkspace) => void;
  onNotify?: (message: string) => void;
}

const HIGHLIGHT_CARD_STYLES: Record<HighlightColor, string> = {
  amber:
    'border-amber-300 dark:border-amber-700/80 bg-amber-50/70 dark:bg-amber-950/25',
  emerald:
    'border-emerald-300 dark:border-emerald-700/80 bg-emerald-50/70 dark:bg-emerald-950/25',
  rose:
    'border-rose-300 dark:border-rose-700/80 bg-rose-50/70 dark:bg-rose-950/25',
  sky:
    'border-sky-300 dark:border-sky-700/80 bg-sky-50/70 dark:bg-sky-950/25',
};

const HIGHLIGHT_MARK_STYLES: Record<HighlightColor, string> = {
  amber: 'bg-amber-200/85 dark:bg-amber-500/35 text-slate-950 dark:text-amber-100 rounded px-1 py-0.5',
  emerald: 'bg-emerald-200/85 dark:bg-emerald-500/35 text-slate-950 dark:text-emerald-100 rounded px-1 py-0.5',
  rose: 'bg-rose-200/85 dark:bg-rose-500/35 text-slate-950 dark:text-rose-100 rounded px-1 py-0.5',
  sky: 'bg-sky-200/85 dark:bg-sky-500/35 text-slate-950 dark:text-sky-100 rounded px-1 py-0.5',
};

const COLOR_DOT_STYLES: Record<HighlightColor, string> = {
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-400',
  rose: 'bg-rose-400',
  sky: 'bg-sky-400',
};

const DOC_MARK_OPTIONS: Array<{
  value: BusinessDocMarkStatus;
  en: string;
  bn: string;
  textClass: string;
}> = [
  {
    value: 'unmarked',
    en: 'Unmarked',
    bn: 'সাধারণ',
    textClass: 'text-slate-600 dark:text-slate-400',
  },
  {
    value: 'important',
    en: 'Important',
    bn: 'গুরুত্বপূর্ণ মার্ক',
    textClass: 'text-amber-700 dark:text-amber-300',
  },
  {
    value: 'needs_review',
    en: 'Needs Review',
    bn: 'রিভিউ প্রয়োজন',
    textClass: 'text-sky-700 dark:text-sky-300',
  },
  {
    value: 'approved',
    en: 'Approved',
    bn: 'অনুমোদিত',
    textClass: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    value: 'risk',
    en: 'Risk / Blocker',
    bn: 'ঝুঁকি / ব্লকার',
    textClass: 'text-rose-700 dark:text-rose-300',
  },
];

const DEFAULT_POLICY_CATEGORIES = [
  'Approval Policy',
  'Calculation & Quota',
  'Refund & SLA',
  'Security & Access',
  'Pricing & Tax',
  'Compliance & Audit',
];

function renderHighlightedText(
  text: string,
  highlights: BusinessDocHighlight[]
): React.ReactNode {
  if (!highlights || highlights.length === 0) {
    return text;
  }

  // Split text progressively across highlight phrases (case-insensitive first occurrences)
  type Segment = { text: string; highlight?: BusinessDocHighlight };
  let segments: Segment[] = [{ text }];

  for (const hl of highlights) {
    const q = hl.quote.trim();
    if (!q) continue;
    const nextSegments: Segment[] = [];
    for (const seg of segments) {
      if (seg.highlight) {
        nextSegments.push(seg);
        continue;
      }
      const lowerSeg = seg.text.toLowerCase();
      const lowerQ = q.toLowerCase();
      let cursor = 0;
      let idx = lowerSeg.indexOf(lowerQ, cursor);
      if (idx === -1) {
        nextSegments.push(seg);
        continue;
      }
      while (idx !== -1) {
        if (idx > cursor) {
          nextSegments.push({ text: seg.text.slice(cursor, idx) });
        }
        nextSegments.push({
          text: seg.text.slice(idx, idx + q.length),
          highlight: hl,
        });
        cursor = idx + q.length;
        idx = lowerSeg.indexOf(lowerQ, cursor);
      }
      if (cursor < seg.text.length) {
        nextSegments.push({ text: seg.text.slice(cursor) });
      }
    }
    segments = nextSegments;
  }

  return segments.map((seg, idx) =>
    seg.highlight ? (
      <mark
        key={`${seg.highlight.id}_${idx}`}
        className={HIGHLIGHT_MARK_STYLES[seg.highlight.color]}
        title={seg.highlight.comment || undefined}
      >
        {seg.text}
      </mark>
    ) : (
      <React.Fragment key={idx}>{seg.text}</React.Fragment>
    )
  );
}

const DOC_SYMBOLS = ['∑', '≥', '≤', '≠', '×', '÷', '±', '≈', '→', '√', 'Δ', '%', '৳', '$'];

const DOC_FORMULA_PRESETS: Array<{ label: string; expr: string }> = [
  { label: 'SUM()', expr: 'SUM(1500, 250, 75)' },
  { label: 'AVG()', expr: 'AVG(120, 150, 180)' },
  { label: 'IF()', expr: 'IF(1200 >= 1000, 1200 * 0.9, 1200)' },
  { label: 'PCT()', expr: 'PCT(45, 200)' },
  { label: 'ROUND()', expr: 'ROUND(199.95 * 1.15, 2)' },
  { label: 'MIN()', expr: 'MIN(500, 350, 420)' },
  { label: 'MAX()', expr: 'MAX(100, 250, 180)' },
];

function renderRichInlineTokens(
  text: string,
  highlights: BusinessDocHighlight[],
  keyPrefix: string
): React.ReactNode {
  const tokenRegex =
    /(\{\{=\s*[^}]+?\s*\}\}|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|==[^=\n]+?==|`[^`\n]+?`|\*[^*\n]+?\*)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let tokenCounter = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(
        <React.Fragment key={`${keyPrefix}_t_${tokenCounter++}`}>
          {renderHighlightedText(text.slice(lastIdx, match.index), highlights)}
        </React.Fragment>
      );
    }

    const tok = match[0];
    if (tok.startsWith('{{=') && tok.endsWith('}}')) {
      const expr = tok.slice(3, -2).trim();
      const evaluated = evaluateDocFormula(expr);
      parts.push(
        <span
          key={`${keyPrefix}_fx_${tokenCounter++}`}
          title={
            evaluated.ok
              ? `Formula: =${expr} → ${evaluated.value}`
              : `Formula error: ${evaluated.error}`
          }
          className={`inline-flex items-center gap-1.5 mx-0.5 px-2 py-0.5 rounded-md border font-mono text-[11px] align-baseline ${
            evaluated.ok
              ? 'border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
              : 'border-rose-300 dark:border-rose-700/80 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
            fx
          </span>
          <span className="opacity-80">={expr}</span>
          <span className="opacity-60">⇒</span>
          <strong className="font-bold">
            {evaluated.ok ? evaluated.value : evaluated.error}
          </strong>
        </span>
      );
    } else if (tok.startsWith('**') && tok.endsWith('**')) {
      parts.push(
        <strong
          key={`${keyPrefix}_b_${tokenCounter++}`}
          className="font-bold text-slate-950 dark:text-white"
        >
          {renderHighlightedText(tok.slice(2, -2), highlights)}
        </strong>
      );
    } else if (tok.startsWith('__') && tok.endsWith('__')) {
      parts.push(
        <span
          key={`${keyPrefix}_u_${tokenCounter++}`}
          className="underline decoration-2 underline-offset-2 decoration-amber-500/80"
        >
          {renderHighlightedText(tok.slice(2, -2), highlights)}
        </span>
      );
    } else if (tok.startsWith('~~') && tok.endsWith('~~')) {
      parts.push(
        <span
          key={`${keyPrefix}_s_${tokenCounter++}`}
          className="line-through opacity-70"
        >
          {renderHighlightedText(tok.slice(2, -2), highlights)}
        </span>
      );
    } else if (tok.startsWith('==') && tok.endsWith('==')) {
      parts.push(
        <mark
          key={`${keyPrefix}_m_${tokenCounter++}`}
          className="bg-amber-200/90 dark:bg-amber-500/35 text-slate-950 dark:text-amber-100 rounded px-1 py-0.5"
        >
          {renderHighlightedText(tok.slice(2, -2), highlights)}
        </mark>
      );
    } else if (tok.startsWith('`') && tok.endsWith('`')) {
      parts.push(
        <code
          key={`${keyPrefix}_c_${tokenCounter++}`}
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 font-mono text-[11px] text-rose-700 dark:text-rose-300"
        >
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith('*') && tok.endsWith('*')) {
      parts.push(
        <em key={`${keyPrefix}_i_${tokenCounter++}`} className="italic">
          {renderHighlightedText(tok.slice(1, -1), highlights)}
        </em>
      );
    }

    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(
      <React.Fragment key={`${keyPrefix}_tail`}>
        {renderHighlightedText(text.slice(lastIdx), highlights)}
      </React.Fragment>
    );
  }

  return parts.length > 0 ? parts : renderHighlightedText(text, highlights);
}

function renderFormattedDocContent(
  content: string,
  highlights: BusinessDocHighlight[],
  onToggleChecklistLine?: (lineIndex: number) => void
): React.ReactNode {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      blocks.push(
        <hr
          key={`hr_${i}`}
          className="my-3 border-t border-slate-200 dark:border-slate-800"
        />
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h5
          key={`h3_${i}`}
          className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 pt-1.5"
        >
          {renderRichInlineTokens(trimmed.slice(4), highlights, `h3_${i}`)}
        </h5>
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h4
          key={`h2_${i}`}
          className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200/80 dark:border-slate-800 pb-1 pt-2"
        >
          {renderRichInlineTokens(trimmed.slice(3), highlights, `h2_${i}`)}
        </h4>
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h3
          key={`h1_${i}`}
          className="text-base sm:text-lg font-extrabold text-slate-950 dark:text-white tracking-tight pt-1"
        >
          {renderRichInlineTokens(trimmed.slice(2), highlights, `h1_${i}`)}
        </h3>
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quoteLines: Array<{ idx: number; text: string }> = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push({ idx: i, text: lines[i].trim().slice(2) });
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`bq_${quoteLines[0].idx}`}
          className="border-l-4 border-amber-500 bg-amber-50/70 dark:bg-amber-950/25 px-3.5 py-2 rounded-r-lg text-xs sm:text-[13px] text-slate-700 dark:text-slate-300 space-y-1"
        >
          {quoteLines.map((q) => (
            <p key={`bq_l_${q.idx}`}>
              {renderRichInlineTokens(q.text, highlights, `bq_${q.idx}`)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Markdown Table block
    if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      const startIdx = i;
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      const parsedRows = tableLines
        .filter((r) => !/^\|[\s:|-]+\|?$/.test(r))
        .map((r) =>
          r
            .slice(1, r.endsWith('|') ? -1 : undefined)
            .split('|')
            .map((cell) => cell.trim())
        );
      if (parsedRows.length > 0) {
        const [headerRow, ...bodyRows] = parsedRows;
        blocks.push(
          <div
            key={`tbl_${startIdx}`}
            className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 my-1.5"
          >
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                  {headerRow.map((cell, cIdx) => (
                    <th
                      key={cIdx}
                      className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100 border-r last:border-r-0 border-slate-200 dark:border-slate-700"
                    >
                      {renderRichInlineTokens(cell, highlights, `th_${startIdx}_${cIdx}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {bodyRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="bg-white dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  >
                    {headerRow.map((_, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-3 py-2 text-slate-700 dark:text-slate-300 border-r last:border-r-0 border-slate-200 dark:border-slate-800"
                      >
                        {renderRichInlineTokens(
                          row[cIdx] ?? '',
                          highlights,
                          `td_${startIdx}_${rIdx}_${cIdx}`
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Bullet / Checklist block
    if (/^[-*]\s+/.test(trimmed)) {
      const startIdx = i;
      const items: Array<{ idx: number; raw: string }> = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push({ idx: i, raw: lines[i].trim().replace(/^[-*]\s+/, '') });
        i += 1;
      }
      blocks.push(
        <ul key={`ul_${startIdx}`} className="space-y-1.5 pl-1">
          {items.map((item) => {
            const isUnchecked = item.raw.startsWith('[ ] ');
            const isChecked =
              item.raw.startsWith('[x] ') || item.raw.startsWith('[X] ');
            if (isUnchecked || isChecked) {
              return (
                <li
                  key={`chk_${item.idx}`}
                  className="flex items-start gap-2 text-xs sm:text-[13px]"
                >
                  <button
                    type="button"
                    disabled={!onToggleChecklistLine}
                    onClick={() => onToggleChecklistLine?.(item.idx)}
                    aria-label={isChecked ? 'Uncheck item' : 'Check item'}
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isChecked
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                    } ${onToggleChecklistLine ? 'cursor-pointer hover:border-emerald-500' : 'cursor-default'}`}
                  >
                    {isChecked && <Check className="w-3 h-3" />}
                  </button>
                  <span
                    className={
                      isChecked
                        ? 'line-through text-slate-400 dark:text-slate-500'
                        : 'text-slate-800 dark:text-slate-200'
                    }
                  >
                    {renderRichInlineTokens(
                      item.raw.slice(4),
                      highlights,
                      `chk_${item.idx}`
                    )}
                  </span>
                </li>
              );
            }
            return (
              <li
                key={`li_${item.idx}`}
                className="flex items-start gap-2 text-xs sm:text-[13px] text-slate-800 dark:text-slate-200"
              >
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>
                  {renderRichInlineTokens(item.raw, highlights, `li_${item.idx}`)}
                </span>
              </li>
            );
          })}
        </ul>
      );
      continue;
    }

    // Numbered List block
    if (/^\d+\.\s+/.test(trimmed)) {
      const startIdx = i;
      const items: Array<{ idx: number; num: string; text: string }> = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.*)$/);
        if (m) {
          items.push({ idx: i, num: m[1], text: m[2] });
        }
        i += 1;
      }
      blocks.push(
        <ol key={`ol_${startIdx}`} className="space-y-1.5 pl-1">
          {items.map((item) => (
            <li
              key={`oli_${item.idx}`}
              className="flex items-start gap-2 text-xs sm:text-[13px] text-slate-800 dark:text-slate-200"
            >
              <span className="font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5 shrink-0">
                {item.num}.
              </span>
              <span>
                {renderRichInlineTokens(item.text, highlights, `oli_${item.idx}`)}
              </span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Regular Paragraph
    blocks.push(
      <p
        key={`p_${i}`}
        className="text-xs sm:text-[13px] leading-relaxed text-slate-800 dark:text-slate-200"
      >
        {renderRichInlineTokens(rawLine, highlights, `p_${i}`)}
      </p>
    );
    i += 1;
  }

  return <div className="space-y-2">{blocks}</div>;
}

export const BusinessKnowledgePanels: React.FC<BusinessKnowledgePanelsProps> = ({
  mode,
  project,
  lang,
  onUpdateProject,
  onNotify,
}) => {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en);

  const docs = project.businessDocs || [];
  const notes = project.businessNotes || [];
  const discussions = project.discussionPoints || [];
  const policies = project.businessPolicies || [];

  // -------------------- DOCUMENTATION STATE --------------------
  const docTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [docSearch, setDocSearch] = useState('');
  const [docMarkFilter, setDocMarkFilter] = useState<
    'all' | 'marked_only' | 'highlighted' | BusinessDocMarkStatus
  >('all');
  const [docTitle, setDocTitle] = useState('');
  const [docSectionRef, setDocSectionRef] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docMarkStatus, setDocMarkStatus] = useState<BusinessDocMarkStatus>('important');
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docEditorView, setDocEditorView] = useState<'write' | 'split' | 'preview'>('split');
  const [showFormulaBar, setShowFormulaBar] = useState(true);
  const [showSymbolsBar, setShowSymbolsBar] = useState(false);
  const [formulaInput, setFormulaInput] = useState('SUM(1500, 250) - 100');
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);

  // Text-selection highlighter state per document
  const [hlDocId, setHlDocId] = useState<string | null>(null);
  const [hlQuote, setHlQuote] = useState('');
  const [hlColor, setHlColor] = useState<HighlightColor>('amber');
  const [hlComment, setHlComment] = useState('');

  // -------------------- NOTES STATE --------------------
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<BusinessRuleNote['category']>('general');
  const [noteColor, setNoteColor] = useState<HighlightColor>('amber');
  const [noteHighlighted, setNoteHighlighted] = useState(false);
  const [noteFilter, setNoteFilter] = useState<'all' | 'highlighted' | 'pinned'>('all');
  const [noteSearch, setNoteSearch] = useState('');

  // -------------------- DISCUSSION POINTS STATE --------------------
  const [discTopic, setDiscTopic] = useState('');
  const [discWhere, setDiscWhere] = useState('');
  const [discParticipants, setDiscParticipants] = useState('');
  const [discDetails, setDiscDetails] = useState('');
  const [discPriority, setDiscPriority] = useState<DiscussionPoint['priority']>('normal');
  const [discFilter, setDiscFilter] = useState<
    'all' | 'open' | 'discussed' | 'resolved' | 'highlighted'
  >('all');
  const [editingResolutionId, setEditingResolutionId] = useState<string | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState('');

  // -------------------- POLICIES STATE --------------------
  const [polCode, setPolCode] = useState('');
  const [polTitle, setPolTitle] = useState('');
  const [polCategory, setPolCategory] = useState('Approval Policy');
  const [polCustomCategory, setPolCustomCategory] = useState('');
  const [polStatement, setPolStatement] = useState('');
  const [polException, setPolException] = useState('');
  const [polOwner, setPolOwner] = useState('');
  const [polEffectiveDate, setPolEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [polStatus, setPolStatus] = useState<BusinessPolicy['status']>('active');
  const [polHighlightColor, setPolHighlightColor] = useState<HighlightColor>('emerald');
  const [polHighlighted, setPolHighlighted] = useState(false);
  const [polFilter, setPolFilter] = useState<'all' | 'active' | 'draft' | 'highlighted'>('all');
  const [polCategoryFilter, setPolCategoryFilter] = useState<string>('all');
  const [polSearch, setPolSearch] = useState('');
  const [copiedPolicyMd, setCopiedPolicyMd] = useState(false);

  // ==================== DOCS HANDLERS ====================
  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    return docs.filter((d) => {
      if (docMarkFilter === 'marked_only' && d.markStatus === 'unmarked') return false;
      if (docMarkFilter === 'highlighted' && !d.highlighted && d.highlights.length === 0)
        return false;
      if (
        docMarkFilter !== 'all' &&
        docMarkFilter !== 'marked_only' &&
        docMarkFilter !== 'highlighted' &&
        d.markStatus !== docMarkFilter
      ) {
        return false;
      }
      if (
        q &&
        !d.title.toLowerCase().includes(q) &&
        !d.content.toLowerCase().includes(q) &&
        !d.sectionRef.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [docs, docSearch, docMarkFilter]);

  const handleSaveDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim() || !docContent.trim()) return;
    const now = new Date().toISOString();

    if (editingDocId) {
      const nextDocs = docs.map((d) =>
        d.id === editingDocId
          ? {
              ...d,
              title: docTitle.trim(),
              sectionRef: docSectionRef.trim() || 'General Rule',
              content: docContent.trim(),
              markStatus: docMarkStatus,
              updatedAt: now,
            }
          : d
      );
      onUpdateProject({ ...project, businessDocs: nextDocs });
      setEditingDocId(null);
      onNotify?.(t('Documentation updated.', 'ডকুমেন্টেশন আপডেট হয়েছে।'));
    } else {
      const item: BusinessDocItem = {
        id: `bdoc_${Date.now()}`,
        title: docTitle.trim(),
        sectionRef: docSectionRef.trim() || 'General Business Rule',
        content: docContent.trim(),
        markStatus: docMarkStatus,
        highlighted: false,
        highlightColor: 'amber',
        highlights: [],
        updatedAt: now,
      };
      onUpdateProject({ ...project, businessDocs: [item, ...docs] });
      onNotify?.(t('Documentation added.', 'নতুন ডকুমেন্টেশন যোগ হয়েছে।'));
    }
    setDocTitle('');
    setDocSectionRef('');
    setDocContent('');
    setDocMarkStatus('important');
  };

  const handleCaptureSelectionForDoc = (docId: string) => {
    const selected = window.getSelection()?.toString().trim() || '';
    setHlDocId(docId);
    if (selected) {
      setHlQuote(selected);
    }
  };

  const handleAddInlineHighlight = (e: React.FormEvent, docId: string) => {
    e.preventDefault();
    if (!hlQuote.trim()) return;
    const newHl: BusinessDocHighlight = {
      id: `hl_${Date.now()}`,
      quote: hlQuote.trim(),
      color: hlColor,
      comment: hlComment.trim() || undefined,
    };
    const nextDocs = docs.map((d) =>
      d.id === docId ? { ...d, highlights: [...d.highlights, newHl] } : d
    );
    onUpdateProject({ ...project, businessDocs: nextDocs });
    setHlQuote('');
    setHlComment('');
    onNotify?.(t('Text highlighted inside document.', 'ডকুমেন্টের অংশ হাইলাইট করা হয়েছে।'));
  };

  const handleRemoveInlineHighlight = (docId: string, hlId: string) => {
    const nextDocs = docs.map((d) =>
      d.id === docId
        ? { ...d, highlights: d.highlights.filter((h) => h.id !== hlId) }
        : d
    );
    onUpdateProject({ ...project, businessDocs: nextDocs });
  };

  const handleUpdateDocMark = (docId: string, markStatus: BusinessDocMarkStatus) => {
    const nextDocs = docs.map((d) =>
      d.id === docId ? { ...d, markStatus, updatedAt: new Date().toISOString() } : d
    );
    onUpdateProject({ ...project, businessDocs: nextDocs });
    onNotify?.(t('Document mark updated.', 'ডকুমেন্ট মার্ক আপডেট হয়েছে।'));
  };

  const handleToggleDocHighlight = (docId: string, color?: HighlightColor) => {
    const nextDocs = docs.map((d) => {
      if (d.id !== docId) return d;
      if (color) {
        return { ...d, highlighted: true, highlightColor: color };
      }
      return { ...d, highlighted: !d.highlighted };
    });
    onUpdateProject({ ...project, businessDocs: nextDocs });
  };

  const handleDeleteDoc = (docId: string) => {
    onUpdateProject({
      ...project,
      businessDocs: docs.filter((d) => d.id !== docId),
    });
  };

  const handleToggleChecklistInDoc = (docId: string, lineIndex: number) => {
    const nextDocs = docs.map((d) => {
      if (d.id !== docId) return d;
      const lines = d.content.split(/\r?\n/);
      const target = lines[lineIndex];
      if (!target) return d;
      if (/^(\s*[-*]\s+)\[ \](\s+.*)$/.test(target)) {
        lines[lineIndex] = target.replace(/^(\s*[-*]\s+)\[ \](\s+.*)$/, '$1[x]$2');
      } else if (/^(\s*[-*]\s+)\[[xX]\](\s+.*)$/.test(target)) {
        lines[lineIndex] = target.replace(/^(\s*[-*]\s+)\[[xX]\](\s+.*)$/, '$1[ ]$2');
      }
      return {
        ...d,
        content: lines.join('\n'),
        updatedAt: new Date().toISOString(),
      };
    });
    onUpdateProject({ ...project, businessDocs: nextDocs });
  };

  const insertAroundSelection = (
    prefix: string,
    suffix: string,
    placeholder: string
  ) => {
    const el = docTextareaRef.current;
    if (!el) {
      setDocContent((prev) => `${prev}${prefix}${placeholder}${suffix}`);
      return;
    }
    const start = el.selectionStart ?? docContent.length;
    const end = el.selectionEnd ?? docContent.length;
    const selected = docContent.slice(start, end) || placeholder;
    const updated =
      docContent.slice(0, start) + prefix + selected + suffix + docContent.slice(end);
    setDocContent(updated);
    requestAnimationFrame(() => {
      el.focus();
      const selStart = start + prefix.length;
      el.setSelectionRange(selStart, selStart + selected.length);
    });
  };

  const insertLineOrBlock = (snippet: string, ensureNewLine = true) => {
    const el = docTextareaRef.current;
    if (!el) {
      setDocContent((prev) =>
        prev ? `${prev}${ensureNewLine ? '\n' : ''}${snippet}` : snippet
      );
      return;
    }
    const start = el.selectionStart ?? docContent.length;
    const end = el.selectionEnd ?? docContent.length;
    const before = docContent.slice(0, start);
    const needLeadNewLine = ensureNewLine && before.length > 0 && !before.endsWith('\n');
    const insertion = (needLeadNewLine ? '\n' : '') + snippet;
    const updated = before + insertion + docContent.slice(end);
    setDocContent(updated);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + insertion.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const handleInsertFormulaIntoDoc = () => {
    const cleaned = formulaInput.trim().replace(/^=+/, '').trim();
    if (!cleaned) return;
    insertLineOrBlock(`{{=${cleaned}}}`, false);
    onNotify?.(t('Formula inserted into document.', 'ডকুমেন্টে ফর্মুলা যুক্ত হয়েছে।'));
  };

  const handleInsertWordSpecTemplate = () => {
    const template = `# Checkout & Discount Calculation Spec
## 1. Business Formula Rule
Final Payable: {{=ROUND(SUM(1500, 250) * 0.9, 2)}} (10% VIP discount applied)

| Tier | Min Cart | Discount Rule | Max Cap |
| --- | --- | --- | --- |
| Silver | 1000 | **5%** | 200 |
| Gold | 2000 | **10%** | 500 |

> Note: Promo code and loyalty points cannot exceed ==30%== of order subtotal.

- [ ] Verify tax applies *after* discount deduction
- [ ] Verify negative balance triggers \`ERR_INVALID_TOTAL\``;
    setDocContent((prev) => (prev.trim() ? `${prev}\n\n${template}` : template));
    if (!docTitle.trim()) {
      setDocTitle(t('Discount & Tax Business Spec', 'ডিসকাউন্ট ও ট্যাক্স বিজনেস স্পেক'));
    }
  };

  const handleExportDocAsWord = (doc: BusinessDocItem) => {
    const html = buildWordCompatibleDocHtml({
      title: doc.title,
      sectionRef: doc.sectionRef,
      markStatus: doc.markStatus,
      updatedAt: doc.updatedAt,
      content: doc.content,
    });
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = doc.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    a.href = url;
    a.download = `${slug || 'business-rule'}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify?.(t('Exported as Microsoft Word (.doc).', 'MS Word (.doc) ফাইলে ডাউনলোড হয়েছে।'));
  };

  const handleCopyDocContent = (doc: BusinessDocItem) => {
    const text = `# ${doc.title}\nRef: ${doc.sectionRef} · Status: ${doc.markStatus}\n\n${doc.content}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedDocId(doc.id);
    setTimeout(() => setCopiedDocId(null), 1600);
    onNotify?.(t('Document copied.', 'ডকুমেন্ট কপি করা হয়েছে।'));
  };

  // ==================== NOTES HANDLERS ====================
  const filteredNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    const list = notes.filter((n) => {
      if (noteFilter === 'highlighted' && !n.highlighted) return false;
      if (noteFilter === 'pinned' && !n.pinned) return false;
      if (
        q &&
        !n.title.toLowerCase().includes(q) &&
        !n.content.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [notes, noteFilter, noteSearch]);

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;
    const item: BusinessRuleNote = {
      id: `bnote_${Date.now()}`,
      title: noteTitle.trim(),
      content: noteContent.trim(),
      category: noteCategory,
      highlighted: noteHighlighted,
      highlightColor: noteColor,
      pinned: false,
      updatedAt: new Date().toISOString(),
    };
    onUpdateProject({ ...project, businessNotes: [item, ...notes] });
    setNoteTitle('');
    setNoteContent('');
    setNoteHighlighted(false);
    onNotify?.(t('Note saved.', 'নোট সংরক্ষণ করা হয়েছে।'));
  };

  const handleToggleNoteHighlight = (id: string, color?: HighlightColor) => {
    const next = notes.map((n) => {
      if (n.id !== id) return n;
      if (color) return { ...n, highlighted: true, highlightColor: color };
      return { ...n, highlighted: !n.highlighted };
    });
    onUpdateProject({ ...project, businessNotes: next });
  };

  const handleToggleNotePin = (id: string) => {
    onUpdateProject({
      ...project,
      businessNotes: notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
    });
  };

  const handleDeleteNote = (id: string) => {
    onUpdateProject({
      ...project,
      businessNotes: notes.filter((n) => n.id !== id),
    });
  };

  // ==================== DISCUSSIONS HANDLERS ====================
  const filteredDiscussions = useMemo(() => {
    return discussions.filter((d) => {
      if (discFilter === 'highlighted') return d.highlighted;
      if (discFilter !== 'all' && d.status !== discFilter) return false;
      return true;
    });
  }, [discussions, discFilter]);

  const handleAddDiscussion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discTopic.trim() || !discWhere.trim()) return;
    const item: DiscussionPoint = {
      id: `disc_${Date.now()}`,
      topic: discTopic.trim(),
      whereToDiscuss: discWhere.trim(),
      participants: discParticipants.trim() || 'PM · Tech Lead · QA',
      details: discDetails.trim(),
      priority: discPriority,
      status: 'open',
      highlighted: discPriority === 'high',
      createdAt: new Date().toISOString(),
    };
    onUpdateProject({
      ...project,
      discussionPoints: [item, ...discussions],
    });
    setDiscTopic('');
    setDiscWhere('');
    setDiscParticipants('');
    setDiscDetails('');
    setDiscPriority('normal');
    onNotify?.(t('Discussion point added.', 'ডিসকাশন পয়েন্ট যোগ করা হয়েছে।'));
  };

  const handleUpdateDiscussionStatus = (
    id: string,
    status: DiscussionPoint['status']
  ) => {
    onUpdateProject({
      ...project,
      discussionPoints: discussions.map((d) => (d.id === id ? { ...d, status } : d)),
    });
  };

  const handleToggleDiscussionHighlight = (id: string) => {
    onUpdateProject({
      ...project,
      discussionPoints: discussions.map((d) =>
        d.id === id ? { ...d, highlighted: !d.highlighted } : d
      ),
    });
  };

  const handleSaveResolution = (id: string) => {
    onUpdateProject({
      ...project,
      discussionPoints: discussions.map((d) =>
        d.id === id
          ? {
              ...d,
              resolutionNote: resolutionDraft.trim(),
              status: resolutionDraft.trim() ? 'resolved' : d.status,
            }
          : d
      ),
    });
    setEditingResolutionId(null);
    setResolutionDraft('');
    onNotify?.(t('Discussion outcome saved.', 'ডিসকাশনের সিদ্ধান্ত সংরক্ষিত হয়েছে।'));
  };

  const handleDeleteDiscussion = (id: string) => {
    onUpdateProject({
      ...project,
      discussionPoints: discussions.filter((d) => d.id !== id),
    });
  };

  // ==================== POLICIES HANDLERS ====================
  const allPolicyCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_POLICY_CATEGORIES);
    for (const p of policies) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set);
  }, [policies]);

  const filteredPolicies = useMemo(() => {
    const q = polSearch.trim().toLowerCase();
    return policies.filter((p) => {
      if (polFilter === 'highlighted' && !p.highlighted) return false;
      if (polFilter === 'active' && p.status !== 'active') return false;
      if (polFilter === 'draft' && p.status !== 'draft') return false;
      if (polCategoryFilter !== 'all' && p.category !== polCategoryFilter) return false;
      if (
        q &&
        !p.title.toLowerCase().includes(q) &&
        !p.statement.toLowerCase().includes(q) &&
        !p.code.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [policies, polFilter, polCategoryFilter, polSearch]);

  const handleAddPolicy = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedCategory =
      polCategory === '__custom__'
        ? polCustomCategory.trim() || 'Custom Policy'
        : polCategory;
    if (!polTitle.trim() || !polStatement.trim()) return;

    const nextCode =
      polCode.trim() || `POL-${String(policies.length + 1).padStart(2, '0')}`;
    const item: BusinessPolicy = {
      id: `pol_${Date.now()}`,
      code: nextCode,
      title: polTitle.trim(),
      category: resolvedCategory,
      statement: polStatement.trim(),
      exceptionRule: polException.trim() || undefined,
      owner: polOwner.trim() || 'QA & Product',
      status: polStatus,
      highlighted: polHighlighted,
      highlightColor: polHighlightColor,
      effectiveDate: polEffectiveDate || new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
    };

    onUpdateProject({
      ...project,
      businessPolicies: [item, ...policies],
    });
    setPolCode('');
    setPolTitle('');
    setPolCustomCategory('');
    setPolStatement('');
    setPolException('');
    setPolOwner('');
    setPolHighlighted(false);
    onNotify?.(t(`Policy ${item.code} added.`, `পলিসি ${item.code} যোগ করা হয়েছে।`));
  };

  const handleTogglePolicyHighlight = (id: string, color?: HighlightColor) => {
    onUpdateProject({
      ...project,
      businessPolicies: policies.map((p) => {
        if (p.id !== id) return p;
        if (color) return { ...p, highlighted: true, highlightColor: color };
        return { ...p, highlighted: !p.highlighted };
      }),
    });
  };

  const handleUpdatePolicyStatus = (id: string, status: BusinessPolicy['status']) => {
    onUpdateProject({
      ...project,
      businessPolicies: policies.map((p) =>
        p.id === id ? { ...p, status, updatedAt: new Date().toISOString() } : p
      ),
    });
  };

  const handleDeletePolicy = (id: string) => {
    onUpdateProject({
      ...project,
      businessPolicies: policies.filter((p) => p.id !== id),
    });
  };

  const handleCopyPoliciesMarkdown = () => {
    const lines = [
      `# ${project.name} — Business Policies`,
      '',
      ...policies.map(
        (p) =>
          `## ${p.code}: ${p.title} (${p.status.toUpperCase()})\n- Category: ${p.category} · Owner: ${p.owner} · Effective: ${p.effectiveDate}\n- Policy: ${p.statement}${p.exceptionRule ? `\n- Exception: ${p.exceptionRule}` : ''}\n`
      ),
    ];
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    setCopiedPolicyMd(true);
    setTimeout(() => setCopiedPolicyMd(false), 1800);
    onNotify?.(t('Policies copied as Markdown.', 'সব পলিসি Markdown হিসেবে কপি হয়েছে।'));
  };

  // ==================== RENDER: DOCUMENTATION & MS WORD / FORMULA STUDIO ====================
  if (mode === 'docs') {
    const markedCount = docs.filter((d) => d.markStatus !== 'unmarked').length;
    const totalInlineHighlights = docs.reduce((sum, d) => sum + d.highlights.length, 0);
    const liveFormulaEval = evaluateDocFormula(formulaInput);
    const wordCount = docContent.trim() ? docContent.trim().split(/\s+/).length : 0;
    const formulaCount = (docContent.match(/\{\{=\s*[^}]+?\s*\}\}/g) || []).length;

    return (
      <div className="space-y-5">
        {/* MS Word / Google Docs Composer Form */}
        <form
          onSubmit={handleSaveDoc}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {editingDocId
                  ? t('Edit Business Rule Document', 'বিজনেস রুল ডকুমেন্ট এডিট করুন')
                  : t('MS Word & Formula Document Studio', 'MS Word ও ফর্মুলা ডকুমেন্ট স্টুডিও')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t(
                  'Format specs like MS Word / Google Docs, embed live {{=SUM(...)}} calculations, and export to .doc.',
                  'MS Word / Google Docs-এর মতো হেডিং, টেবিল, চেকলিস্ট ও লাইভ {{=SUM(...)}} ফর্মুলা লিখে ডকুমেন্ট তৈরি এবং .doc এক্সপোর্ট করুন।'
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span>{docs.length} {t('docs', 'ডক')}</span>
              <span aria-hidden="true">·</span>
              <span>{markedCount} {t('marked', 'মার্কড')}</span>
              <span aria-hidden="true">·</span>
              <span>{totalInlineHighlights} {t('highlights', 'হাইলাইট')}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder={t('Document Title (e.g. Discount Stacking Spec)', 'ডকুমেন্টের শিরোনাম')}
              required
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              value={docSectionRef}
              onChange={(e) => setDocSectionRef(e.target.value)}
              placeholder={t('Module / Version Ref (e.g. Checkout · v1.2)', 'মডিউল বা ভার্সন রেফারেন্স')}
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <select
              value={docMarkStatus}
              onChange={(e) => setDocMarkStatus(e.target.value as BusinessDocMarkStatus)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {DOC_MARK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.en, opt.bn)}
                </option>
              ))}
            </select>
          </div>

          {/* MS Word / Google Docs Formatting Ribbon */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80 p-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => insertLineOrBlock('# Heading Title')}
                  title={t('Heading 1', 'হেডিং ১')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Heading1 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertLineOrBlock('## Section Heading')}
                  title={t('Heading 2', 'হেডিং ২')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Heading2 className="w-3.5 h-3.5" />
                </button>
                <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />
                <button
                  type="button"
                  onClick={() => insertAroundSelection('**', '**', 'bold text')}
                  title={t('Bold', 'বোল্ড')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertAroundSelection('*', '*', 'italic text')}
                  title={t('Italic', 'ইটালিক')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertAroundSelection('__', '__', 'underlined')}
                  title={t('Underline', 'আন্ডারলাইন')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertAroundSelection('~~', '~~', 'removed')}
                  title={t('Strikethrough', 'স্ট্রাইকথ্রু')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertAroundSelection('==', '==', 'important')}
                  title={t('Text Highlight', 'টেক্সট হাইলাইট')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-amber-600 dark:text-amber-400 cursor-pointer"
                >
                  <Highlighter className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertAroundSelection('`', '`', 'ERR_CODE')}
                  title={t('Inline Code', 'কোড')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>
                <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />
                <button
                  type="button"
                  onClick={() => insertLineOrBlock('- Bullet item')}
                  title={t('Bullet List', 'বুলেট লিস্ট')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertLineOrBlock('1. Step description')}
                  title={t('Numbered List', 'নাম্বারড লিস্ট')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertLineOrBlock('- [ ] QA verification check')}
                  title={t('Checklist', 'চেকলিস্ট')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertLineOrBlock('> Business Policy Note: ')}
                  title={t('Callout Quote', 'কোটেশন / নোট')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Quote className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    insertLineOrBlock(
                      '| Condition | Rule Formula | Expected Output |\n| --- | --- | --- |\n| Standard | {{=1000 * 0.9}} | 900 |\n| VIP | {{=SUM(1000, 200) * 0.85}} | 1020 |'
                    )
                  }
                  title={t('Insert 3x3 Table', '৩×৩ টেবিল যুক্ত করুন')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Table className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertLineOrBlock('---')}
                  title={t('Page Divider', 'ডিভাইডার')}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />
                <button
                  type="button"
                  onClick={() => setShowFormulaBar((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                    showFormulaBar
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Calculator className="w-3 h-3" />
                  <span>fx {t('Formula', 'ফর্মুলা')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSymbolsBar((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                    showSymbolsBar
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Sigma className="w-3 h-3" />
                  <span>{t('Symbols', 'সিম্বল')}</span>
                </button>
              </div>

              {/* Editor View Mode */}
              <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-200/75 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setDocEditorView('write')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    docEditorView === 'write'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <PenLine className="w-3 h-3" />
                  <span>{t('Write', 'লিখুন')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDocEditorView('split')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    docEditorView === 'split'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Columns2 className="w-3 h-3" />
                  <span>{t('Split', 'স্প্লিট')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDocEditorView('preview')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    docEditorView === 'preview'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  <span>{t('Word Page', 'ওয়ার্ড পেজ')}</span>
                </button>
              </div>
            </div>

            {/* Collapsible Math / Business Symbols Strip */}
            {showSymbolsBar && (
              <div className="flex flex-wrap items-center gap-1 pt-1.5 border-t border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
                  {t('Insert Symbol:', 'সিম্বল:')}
                </span>
                {DOC_SYMBOLS.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => insertLineOrBlock(sym, false)}
                    className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            )}

            {/* Collapsible MS Word / Google Sheets Style Formula Builder Bar */}
            {showFormulaBar && (
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-mono text-xs font-bold shrink-0">
                    <span>fx</span>
                    <span>=</span>
                  </div>
                  <input
                    type="text"
                    value={formulaInput}
                    onChange={(e) => setFormulaInput(e.target.value)}
                    placeholder="SUM(1500, 250) * 0.9"
                    className="flex-1 min-w-[200px] px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
                  />
                  <div
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold border whitespace-nowrap ${
                      liveFormulaEval.ok
                        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {liveFormulaEval.ok
                      ? `= ${liveFormulaEval.value}`
                      : liveFormulaEval.error}
                  </div>
                  <button
                    type="button"
                    disabled={!liveFormulaEval.ok}
                    onClick={handleInsertFormulaIntoDoc}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('Insert Formula', 'ফর্মুলা বসাও')}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t('Functions:', 'ফাংশন:')}
                  </span>
                  {DOC_FORMULA_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setFormulaInput(preset.expr)}
                      className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-mono text-slate-700 dark:text-slate-300 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">
                    {t(
                      'Supports +, -, *, /, ^, %, <, >, >=, <=, IF, SUM, AVG, PCT, ROUND, SQRT',
                      '+, -, *, /, ^, %, IF, SUM, AVG, PCT, ROUND, SQRT সাপোর্ট করে'
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Document Editor + Live MS Word Page Canvas */}
          <div
            className={`grid gap-3 ${
              docEditorView === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {docEditorView !== 'preview' && (
              <textarea
                ref={docTextareaRef}
                rows={8}
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                placeholder={t(
                  'Write detailed business specs, tables, checklists, and live {{=SUM(100, 200)}} formulas...',
                  'বিস্তারিত বিজনেস রুলস, টেবিল, চেকলিস্ট এবং {{=SUM(100, 200)}} ফর্মুলা লিখুন...'
                )}
                required
                className="w-full px-3.5 py-2.5 text-xs font-mono leading-relaxed rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            )}

            {docEditorView !== 'write' && (
              <div className="rounded-lg border border-slate-300/90 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-950 p-3 max-h-[320px] overflow-y-auto">
                <div className="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs min-h-[180px] space-y-2">
                  <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      {docSectionRef.trim() || 'Document Page Preview'}
                    </p>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      {docTitle.trim() || t('Untitled Business Document', 'শিরোনামহীন ডকুমেন্ট')}
                    </h4>
                  </div>
                  {docContent.trim() ? (
                    renderFormattedDocContent(docContent, [])
                  ) : (
                    <p className="text-xs text-slate-400 italic py-4">
                      {t(
                        'Live MS Word / Google Docs preview & calculated formula results appear here...',
                        'এখানে লাইভ MS Word / Google Docs প্রিভিউ এবং ফর্মুলার ফলাফল দেখা যাবে...'
                      )}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <span>{wordCount} {t('words', 'শব্দ')}</span>
              <span aria-hidden="true">·</span>
              <span>{docContent.length} {t('chars', 'অক্ষর')}</span>
              <span aria-hidden="true">·</span>
              <span>{formulaCount} {t('formulas', 'ফর্মুলা')}</span>
              <button
                type="button"
                onClick={handleInsertWordSpecTemplate}
                className="text-amber-600 dark:text-amber-400 hover:underline font-sans font-semibold cursor-pointer"
              >
                + {t('Insert Spec Template', 'স্পেক টেমপ্লেট বসাও')}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {editingDocId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingDocId(null);
                    setDocTitle('');
                    setDocSectionRef('');
                    setDocContent('');
                    setDocMarkStatus('important');
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {t('Cancel Edit', 'বাতিল')}
                </button>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                {editingDocId
                  ? t('Update Document', 'ডকুমেন্ট আপডেট করুন')
                  : t('Save Documentation', 'ডকুমেন্টেশন সেভ করুন')}
              </button>
            </div>
          </div>
        </form>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder={t('Search documentation...', 'ডকুমেন্টেশন খুঁজুন...')}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
            {[
              { id: 'all', label: t('All', 'সব') },
              { id: 'marked_only', label: t('Marked Only', 'শুধু মার্কড') },
              { id: 'important', label: t('Important', 'গুরুত্বপূর্ণ') },
              { id: 'needs_review', label: t('Needs Review', 'রিভিউ') },
              { id: 'approved', label: t('Approved', 'অনুমোদিত') },
              { id: 'risk', label: t('Risk', 'ঝুঁকি') },
              { id: 'highlighted', label: t('Highlighted', 'হাইলাইটেড') },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setDocMarkFilter(
                    tab.id as 'all' | 'marked_only' | 'highlighted' | BusinessDocMarkStatus
                  )
                }
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  docMarkFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Document Cards */}
        {filteredDocs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
            <FileText className="w-7 h-7 text-slate-400 mx-auto" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t(
                'No matching documentation found.',
                'এই ফিল্টারে কোনো ডকুমেন্টেশন পাওয়া যায়নি।'
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDocs.map((doc) => {
              const markMeta =
                DOC_MARK_OPTIONS.find((m) => m.value === doc.markStatus) ||
                DOC_MARK_OPTIONS[0];
              const cardSurface = doc.highlighted
                ? HIGHLIGHT_CARD_STYLES[doc.highlightColor]
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';

              return (
                <article
                  key={doc.id}
                  className={`rounded-xl border p-5 space-y-3.5 shadow-xs transition-colors ${cardSurface}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{doc.sectionRef}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`font-semibold ${markMeta.textClass}`}>
                          {t(markMeta.en, markMeta.bn)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {new Date(doc.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {doc.title}
                      </h4>
                    </div>

                    {/* Markable, Word Export & Card Highlight Controls */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleExportDocAsWord(doc)}
                        title={t('Download as MS Word (.doc)', 'MS Word (.doc) ডাউনলোড')}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-800/80 bg-blue-50/70 dark:bg-blue-950/30 text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100/80 dark:hover:bg-blue-900/40 cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3 h-3" />
                        <span>.doc</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyDocContent(doc)}
                        title={t('Copy document text', 'ডকুমেন্ট কপি করুন')}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {copiedDocId === doc.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ClipboardCopy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => window.print()}
                        title={t('Print document', 'প্রিন্ট করুন')}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>

                      <select
                        aria-label="Mark document status"
                        value={doc.markStatus}
                        onChange={(e) =>
                          handleUpdateDocMark(
                            doc.id,
                            e.target.value as BusinessDocMarkStatus
                          )
                        }
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        {DOC_MARK_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {t(opt.en, opt.bn)}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleToggleDocHighlight(doc.id)}
                        title={t('Highlight entire document', 'পুরো ডকুমেন্ট হাইলাইট করুন')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                          doc.highlighted
                            ? 'border-amber-400 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Highlighter className="w-3 h-3" />
                        {doc.highlighted
                          ? t('Highlighted', 'হাইলাইটেড')
                          : t('Highlight Card', 'কার্ড হাইলাইট')}
                      </button>

                      {(['amber', 'emerald', 'rose', 'sky'] as HighlightColor[]).map(
                        (clr) => (
                          <button
                            key={clr}
                            type="button"
                            onClick={() => handleToggleDocHighlight(doc.id, clr)}
                            aria-label={`Highlight card ${clr}`}
                            className={`w-4 h-4 rounded-full cursor-pointer border ${COLOR_DOT_STYLES[clr]} ${
                              doc.highlighted && doc.highlightColor === clr
                                ? 'ring-2 ring-offset-1 ring-slate-700 dark:ring-slate-200 border-white'
                                : 'border-black/15 opacity-75 hover:opacity-100'
                            }`}
                          />
                        )
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setEditingDocId(doc.id);
                          setDocTitle(doc.title);
                          setDocSectionRef(doc.sectionRef);
                          setDocContent(doc.content);
                          setDocMarkStatus(doc.markStatus);
                        }}
                        aria-label="Edit document"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDoc(doc.id)}
                        aria-label="Delete document"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Formatted MS Word / Google Docs Paper Body with Live Formulas & Inline Highlights */}
                  <div
                    onMouseUp={() => handleCaptureSelectionForDoc(doc.id)}
                    className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-950/80 p-5 select-text shadow-2xs"
                  >
                    {renderFormattedDocContent(
                      doc.content,
                      doc.highlights,
                      (lineIdx) => handleToggleChecklistInDoc(doc.id, lineIdx)
                    )}
                  </div>

                  {/* Inline Text Highlighter Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleCaptureSelectionForDoc(doc.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-[11px] font-semibold text-amber-800 dark:text-amber-300 cursor-pointer"
                    >
                      <Highlighter className="w-3 h-3" />
                      {t(
                        'Highlight Text Inside Doc',
                        'ডকুমেন্টের লেখা সিলেক্ট করে হাইলাইট করুন'
                      )}
                    </button>

                    {doc.highlights.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono tabular-nums">
                          {doc.highlights.length} {t('marked phrases', 'হাইলাইট অংশ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {hlDocId === doc.id && (
                    <form
                      onSubmit={(e) => handleAddInlineHighlight(e, doc.id)}
                      className="rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50/50 dark:bg-amber-950/20 p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                    >
                      <input
                        type="text"
                        value={hlQuote}
                        onChange={(e) => setHlQuote(e.target.value)}
                        placeholder={t(
                          'Exact phrase from doc above (or select text first)',
                          'উপরের ডকুমেন্ট থেকে হাইলাইট করার অংশ'
                        )}
                        required
                        className="sm:col-span-5 px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        value={hlComment}
                        onChange={(e) => setHlComment(e.target.value)}
                        placeholder={t('Optional QA note', 'ঐচ্ছিক নোট লিখুন')}
                        className="sm:col-span-3 px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                      <div className="sm:col-span-2 flex items-center gap-1.5 justify-center">
                        {(['amber', 'emerald', 'rose', 'sky'] as HighlightColor[]).map(
                          (clr) => (
                            <button
                              key={clr}
                              type="button"
                              onClick={() => setHlColor(clr)}
                              className={`w-5 h-5 rounded-full cursor-pointer border ${COLOR_DOT_STYLES[clr]} ${
                                hlColor === clr
                                  ? 'ring-2 ring-offset-1 ring-slate-800 dark:ring-white border-white'
                                  : 'border-black/15 opacity-75'
                              }`}
                            />
                          )
                        )}
                      </div>
                      <div className="sm:col-span-2 flex items-center gap-1 justify-end">
                        <button
                          type="submit"
                          className="px-2.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                        >
                          {t('Apply', 'হাইলাইট')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setHlDocId(null)}
                          className="p-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-500 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Highlighted Phrases Index */}
                  {doc.highlights.length > 0 && (
                    <div className="border-t border-slate-200/70 dark:border-slate-800 pt-2.5 space-y-1.5">
                      {doc.highlights.map((hl) => (
                        <div
                          key={hl.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className={HIGHLIGHT_MARK_STYLES[hl.color]}>
                              &ldquo;{hl.quote}&rdquo;
                            </span>
                            {hl.comment && (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                — {hl.comment}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveInlineHighlight(doc.id, hl.id)}
                            aria-label="Remove highlight"
                            className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ==================== RENDER: NOTES & WHERE TO DISCUSS ====================
  if (mode === 'notes_discussions') {
    const openDiscCount = discussions.filter((d) => d.status === 'open').length;

    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        {/* LEFT COLUMN: QA & BUSINESS RULE NOTES */}
        <section className="space-y-4">
          <form
            onSubmit={handleAddNote}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('Business Rule Notes', 'বিজনেস রুল নোটস')}
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {notes.length} {t('notes', 'নোট')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder={t('Note heading...', 'নোটের শিরোনাম...')}
                required
                className="sm:col-span-2 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <select
                value={noteCategory}
                onChange={(e) =>
                  setNoteCategory(e.target.value as BusinessRuleNote['category'])
                }
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="general">{t('General Note', 'সাধারণ নোট')}</option>
                <option value="edge_case">{t('Edge Case', 'এজ কেস')}</option>
                <option value="bug_risk">{t('Bug Risk', 'বাগ ঝুঁকি')}</option>
                <option value="clarification">{t('Clarification', 'স্পষ্টীকরণ')}</option>
              </select>
            </div>

            <textarea
              rows={2}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder={t(
                'Write edge cases, unexpected UI/API findings, or QA reminders...',
                'কাজের নিয়ম, ব্যতিক্রম বা পরীক্ষার নোট লিখুন...'
              )}
              required
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNoteHighlighted((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                    noteHighlighted
                      ? 'border-amber-400 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Highlighter className="w-3 h-3" />
                  {t('Highlight Note', 'হাইলাইট')}
                </button>
                {(['amber', 'emerald', 'rose', 'sky'] as HighlightColor[]).map((clr) => (
                  <button
                    key={clr}
                    type="button"
                    onClick={() => {
                      setNoteColor(clr);
                      setNoteHighlighted(true);
                    }}
                    className={`w-4 h-4 rounded-full cursor-pointer border ${COLOR_DOT_STYLES[clr]} ${
                      noteHighlighted && noteColor === clr
                        ? 'ring-2 ring-offset-1 ring-slate-700 dark:ring-slate-200 border-white'
                        : 'border-black/15 opacity-75'
                    }`}
                  />
                ))}
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('Add Note', 'নোট যোগ করুন')}
              </button>
            </div>
          </form>

          {/* Notes Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              type="text"
              value={noteSearch}
              onChange={(e) => setNoteSearch(e.target.value)}
              placeholder={t('Filter notes...', 'নোট খুঁজুন...')}
              className="flex-1 min-w-[160px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
              {[
                { id: 'all', label: t('All', 'সব') },
                { id: 'highlighted', label: t('Highlighted', 'হাইলাইটেড') },
                { id: 'pinned', label: t('Pinned', 'পিন করা') },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setNoteFilter(tab.id as 'all' | 'highlighted' | 'pinned')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    noteFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredNotes.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center text-xs text-slate-500">
                {t('No notes saved yet.', 'এখনো কোনো নোট যোগ করা হয়নি।')}
              </div>
            ) : (
              filteredNotes.map((note) => (
                <div
                  key={note.id}
                  className={`rounded-xl border p-4 space-y-2 shadow-xs transition-colors ${
                    note.highlighted
                      ? HIGHLIGHT_CARD_STYLES[note.highlightColor]
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-medium capitalize">
                          {note.category.replace('_', ' ')}
                        </span>
                        {note.pinned && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-amber-700 dark:text-amber-300">
                              {t('Pinned', 'পিন করা')}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {new Date(note.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {note.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {(['amber', 'emerald', 'rose', 'sky'] as HighlightColor[]).map(
                        (clr) => (
                          <button
                            key={clr}
                            type="button"
                            onClick={() => handleToggleNoteHighlight(note.id, clr)}
                            aria-label={`Highlight note ${clr}`}
                            className={`w-3.5 h-3.5 rounded-full cursor-pointer border ${COLOR_DOT_STYLES[clr]} ${
                              note.highlighted && note.highlightColor === clr
                                ? 'ring-2 ring-offset-1 ring-slate-700 dark:ring-slate-200 border-white'
                                : 'border-black/15 opacity-70 hover:opacity-100'
                            }`}
                          />
                        )
                      )}
                      {note.highlighted && (
                        <button
                          type="button"
                          onClick={() => handleToggleNoteHighlight(note.id)}
                          title={t('Remove highlight', 'হাইলাইট সরান')}
                          className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleNotePin(note.id)}
                        title={t('Pin note', 'পিন করুন')}
                        className={`p-1 rounded cursor-pointer ${
                          note.pinned
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(note.id)}
                        aria-label="Delete note"
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {note.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: WHERE & WHAT TO DISCUSS */}
        <section className="space-y-4">
          <form
            onSubmit={handleAddDiscussion}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquareMore className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('Where & What to Discuss', 'কোথায় কি ডিসকাশন প্রয়োজন')}
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {openDiscCount} {t('open', 'বাকি')}
              </span>
            </div>

            <input
              type="text"
              value={discTopic}
              onChange={(e) => setDiscTopic(e.target.value)}
              placeholder={t(
                'Discussion topic / question...',
                'কি বিষয়ে ডিসকাশন করতে হবে...'
              )}
              required
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={discWhere}
                onChange={(e) => setDiscWhere(e.target.value)}
                placeholder={t(
                  'Where? (Screen / API / Meeting)',
                  'কোথায়? (কোন পেজ / মিটিং / মডিউল)'
                )}
                required
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={discParticipants}
                onChange={(e) => setDiscParticipants(e.target.value)}
                placeholder={t('With whom? (e.g. PM, Backend)', 'কার সাথে আলোচনা')}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            <textarea
              rows={2}
              value={discDetails}
              onChange={(e) => setDiscDetails(e.target.value)}
              placeholder={t(
                'Context or ambiguity to clarify...',
                'বিস্তারিত পয়েন্ট বা কোন জায়গায় কনফিউশন আছে...'
              )}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <select
                value={discPriority}
                onChange={(e) =>
                  setDiscPriority(e.target.value as DiscussionPoint['priority'])
                }
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="high">{t('High Priority (Auto Highlight)', 'জরুরি (অটো হাইলাইট)')}</option>
                <option value="normal">{t('Normal Priority', 'সাধারণ')}</option>
                <option value="low">{t('Low Priority', 'কম জরুরি')}</option>
              </select>

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('Log Discussion', 'ডিসকাশন যোগ করুন')}
              </button>
            </div>
          </form>

          {/* Discussion Filter */}
          <div className="flex items-center justify-end">
            <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
              {[
                { id: 'all', label: t('All', 'সব') },
                { id: 'open', label: t('Open', 'বাকি') },
                { id: 'discussed', label: t('Discussed', 'আলোচিত') },
                { id: 'resolved', label: t('Resolved', 'সমাধান') },
                { id: 'highlighted', label: t('Highlighted', 'হাইলাইটেড') },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setDiscFilter(
                      tab.id as 'all' | 'open' | 'discussed' | 'resolved' | 'highlighted'
                    )
                  }
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    discFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredDiscussions.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center text-xs text-slate-500">
                {t('No discussion items logged.', 'কোনো ডিসকাশন পয়েন্ট নেই।')}
              </div>
            ) : (
              filteredDiscussions.map((disc) => (
                <div
                  key={disc.id}
                  className={`rounded-xl border p-4 space-y-2.5 shadow-xs transition-colors ${
                    disc.highlighted
                      ? HIGHLIGHT_CARD_STYLES.amber
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span
                          className={`font-semibold ${
                            disc.priority === 'high'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {disc.priority === 'high'
                            ? t('High Priority', 'জরুরি')
                            : disc.priority === 'normal'
                              ? t('Normal', 'সাধারণ')
                              : t('Low', 'কম')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{disc.participants}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            disc.status === 'resolved'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : disc.status === 'discussed'
                                ? 'text-sky-700 dark:text-sky-400'
                                : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {disc.status === 'resolved'
                            ? t('Resolved', 'সমাধান হয়েছে')
                            : disc.status === 'discussed'
                              ? t('Discussed', 'আলোচিত')
                              : t('Open', 'বাকি')}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {disc.topic}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleDiscussionHighlight(disc.id)}
                        title={t('Highlight discussion', 'হাইলাইট করুন')}
                        className={`p-1.5 rounded-lg border cursor-pointer ${
                          disc.highlighted
                            ? 'border-amber-400 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200'
                            : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700'
                        }`}
                      >
                        <Highlighter className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDiscussion(disc.id)}
                        aria-label="Delete discussion"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Where to Discuss */}
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {t('Where:', 'কোথায়:')} {disc.whereToDiscuss}
                    </span>
                  </div>

                  {disc.details && (
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {disc.details}
                    </p>
                  )}

                  {disc.resolutionNote && (
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/25 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
                      <span className="font-semibold">
                        {t('Decision:', 'সিদ্ধান্ত:')}{' '}
                      </span>
                      {disc.resolutionNote}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="inline-flex items-center gap-1">
                      {(['open', 'discussed', 'resolved'] as DiscussionPoint['status'][]).map(
                        (st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleUpdateDiscussionStatus(disc.id, st)}
                            className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                              disc.status === st
                                ? 'border-amber-400 bg-amber-100/80 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200'
                                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800'
                            }`}
                          >
                            {st === 'open'
                              ? t('Open', 'বাকি')
                              : st === 'discussed'
                                ? t('Discussed', 'আলোচিত')
                                : t('Resolved', 'সমাধান')}
                          </button>
                        )
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingResolutionId(disc.id);
                        setResolutionDraft(disc.resolutionNote || '');
                      }}
                      className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
                    >
                      {disc.resolutionNote
                        ? t('Edit Decision Note', 'সিদ্ধান্ত এডিট')
                        : t('+ Add Decision Note', '+ সিদ্ধান্ত লিখুন')}
                    </button>
                  </div>

                  {editingResolutionId === disc.id && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={resolutionDraft}
                        onChange={(e) => setResolutionDraft(e.target.value)}
                        placeholder={t(
                          'Record final outcome after discussion...',
                          'আলোচনার পর চূড়ান্ত সিদ্ধান্ত লিখুন...'
                        )}
                        className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveResolution(disc.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        {t('Save', 'সেভ')}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    );
  }

  // ==================== RENDER: BUSINESS POLICIES ====================
  return (
    <div className="space-y-5">
      {/* Add Custom Policy Form */}
      <form
        onSubmit={handleAddPolicy}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('Add Business Policy', 'নতুন পলিসি যোগ করুন')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'Create approval, SLA, pricing, security, or any custom policy that QA must enforce.',
                  'অ্যাপ্রুভাল, রিফান্ড, প্রাইসিং, সিকিউরিটি বা যেকোনো কাস্টম বিজনেস পলিসি এখানে যোগ করুন এবং হাইলাইট করুন।'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyPoliciesMarkdown}
            disabled={policies.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {copiedPolicyMd ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <ClipboardCopy className="w-3.5 h-3.5" />
            )}
            {copiedPolicyMd
              ? t('Copied Markdown', 'কপি হয়েছে')
              : t('Copy Policies Markdown', 'Markdown কপি')}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            value={polCode}
            onChange={(e) => setPolCode(e.target.value)}
            placeholder={t(
              `Policy ID (e.g. POL-0${policies.length + 1})`,
              `পলিসি কোড (যেমন POL-0${policies.length + 1})`
            )}
            className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
          <input
            type="text"
            value={polTitle}
            onChange={(e) => setPolTitle(e.target.value)}
            placeholder={t('Policy Title...', 'পলিসির নাম...')}
            required
            className="sm:col-span-2 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
          <select
            value={polCategory}
            onChange={(e) => setPolCategory(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          >
            {allPolicyCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
            <option value="__custom__">
              {t('+ Custom Category...', '+ নতুন ক্যাটাগরি...')}
            </option>
          </select>
        </div>

        {polCategory === '__custom__' && (
          <input
            type="text"
            value={polCustomCategory}
            onChange={(e) => setPolCustomCategory(e.target.value)}
            placeholder={t('Enter custom category name...', 'নতুন ক্যাটাগরির নাম লিখুন...')}
            required
            className="w-full sm:w-80 px-3 py-2 text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
        )}

        <textarea
          rows={2}
          value={polStatement}
          onChange={(e) => setPolStatement(e.target.value)}
          placeholder={t(
            'Policy statement / enforcement rule...',
            'পলিসির মূল নিয়ম বা শর্ত লিখুন...'
          )}
          required
          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={polException}
            onChange={(e) => setPolException(e.target.value)}
            placeholder={t('Exception rule (optional)', 'ব্যতিক্রম শর্ত (ঐচ্ছিক)')}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
          <input
            type="text"
            value={polOwner}
            onChange={(e) => setPolOwner(e.target.value)}
            placeholder={t('Owner / Dept (e.g. Finance)', 'দায়িত্বপ্রাপ্ত দল (যেমন Finance)')}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={polEffectiveDate}
              onChange={(e) => setPolEffectiveDate(e.target.value)}
              className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <select
              value={polStatus}
              onChange={(e) => setPolStatus(e.target.value as BusinessPolicy['status'])}
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="active">{t('Active', 'সক্রিয়')}</option>
              <option value="draft">{t('Draft', 'খসড়া')}</option>
              <option value="deprecated">{t('Deprecated', 'বাতিল')}</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPolHighlighted((v) => !v)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                polHighlighted
                  ? 'border-amber-400 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Highlighter className="w-3 h-3" />
              {t('Highlight Policy', 'হাইলাইট')}
            </button>
            {(['emerald', 'amber', 'rose', 'sky'] as HighlightColor[]).map((clr) => (
              <button
                key={clr}
                type="button"
                onClick={() => {
                  setPolHighlightColor(clr);
                  setPolHighlighted(true);
                }}
                className={`w-4 h-4 rounded-full cursor-pointer border ${COLOR_DOT_STYLES[clr]} ${
                  polHighlighted && polHighlightColor === clr
                    ? 'ring-2 ring-offset-1 ring-slate-700 dark:ring-slate-200 border-white'
                    : 'border-black/15 opacity-75'
                }`}
              />
            ))}
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('Add Policy', 'পলিসি যোগ করুন')}
          </button>
        </div>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={polSearch}
              onChange={(e) => setPolSearch(e.target.value)}
              placeholder={t('Search policies...', 'পলিসি খুঁজুন...')}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="inline-flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={polCategoryFilter}
              onChange={(e) => setPolCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
            >
              <option value="all">{t('All Categories', 'সব ক্যাটাগরি')}</option>
              {allPolicyCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
          {[
            { id: 'all', label: t('All', 'সব') },
            { id: 'active', label: t('Active', 'সক্রিয়') },
            { id: 'draft', label: t('Draft', 'খসড়া') },
            { id: 'highlighted', label: t('Highlighted', 'হাইলাইটেড') },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setPolFilter(tab.id as 'all' | 'active' | 'draft' | 'highlighted')
              }
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                polFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Policies List */}
      {filteredPolicies.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
          <BookMarked className="w-7 h-7 text-slate-400 mx-auto" />
          <p className="text-xs text-slate-500">
            {t('No policies match the current filter.', 'এই ফিল্টারে কোনো পলিসি নেই।')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredPolicies.map((pol) => (
            <div
              key={pol.id}
              className={`rounded-xl border p-4 space-y-3 shadow-xs transition-colors ${
                pol.highlighted
                  ? HIGHLIGHT_CARD_STYLES[pol.highlightColor]
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {pol.code}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{pol.category}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        pol.status === 'active'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : pol.status === 'draft'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {pol.status === 'active' && <CheckCircle2 className="w-3 h-3" />}
                      {pol.status === 'active'
                        ? t('Active', 'সক্রিয়')
                        : pol.status === 'draft'
                          ? t('Draft', 'খসড়া')
                          : t('Deprecated', 'বাতিল')}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {pol.title}
                  </h4>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {(['emerald', 'amber', 'rose', 'sky'] as HighlightColor[]).map(
                    (clr) => (
                      <button
                        key={clr}
                        type="button"
                        onClick={() => handleTogglePolicyHighlight(pol.id, clr)}
                        aria-label={`Highlight policy ${clr}`}
                        className={`w-3.5 h-3.5 rounded-full cursor-pointer border ${COLOR_DOT_STYLES[clr]} ${
                          pol.highlighted && pol.highlightColor === clr
                            ? 'ring-2 ring-offset-1 ring-slate-700 dark:ring-slate-200 border-white'
                            : 'border-black/15 opacity-70 hover:opacity-100'
                        }`}
                      />
                    )
                  )}
                  {pol.highlighted && (
                    <button
                      type="button"
                      onClick={() => handleTogglePolicyHighlight(pol.id)}
                      title={t('Remove highlight', 'হাইলাইট সরান')}
                      className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeletePolicy(pol.id)}
                    aria-label="Delete policy"
                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-200">
                {pol.statement}
              </p>

              {pol.exceptionRule && (
                <div className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-950/60 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {t('Exception:', 'ব্যতিক্রম:')}{' '}
                  </span>
                  {pol.exceptionRule}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <span>{pol.owner}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t('Effective', 'কার্যকর')} {pol.effectiveDate}
                  </span>
                </div>

                <select
                  aria-label="Change policy status"
                  value={pol.status}
                  onChange={(e) =>
                    handleUpdatePolicyStatus(
                      pol.id,
                      e.target.value as BusinessPolicy['status']
                    )
                  }
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <option value="active">{t('Active', 'সক্রিয়')}</option>
                  <option value="draft">{t('Draft', 'খসড়া')}</option>
                  <option value="deprecated">{t('Deprecated', 'বাতিল')}</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
