import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCopy,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FlaskConical,
  ImagePlus,
  Import,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import {
  AppLanguage,
  BugPriority,
  BugReportItem,
  BugSeverity,
  BugStatus,
  ProjectWorkspace,
  QaTestCase,
  RecordingState,
  TestCasePriority,
  TestCaseStatus,
} from '../types/flowguard';
import {
  isChromeExtensionContext,
  requestVisibleTabScreenshot,
} from '../utils/extensionBridge';

interface BugAndTestStudioViewProps {
  project: ProjectWorkspace;
  lang: AppLanguage;
  recording: RecordingState;
  screenshotConsentGranted: boolean;
  onGrantScreenshotConsent: () => void;
  onUpdateProject: (updated: ProjectWorkspace) => void;
  onNotify?: (message: string) => void;
}

type StudioTab = 'bugs' | 'test_cases' | 'test_data';

const SEVERITY_TEXT: Record<BugSeverity, string> = {
  blocker: 'text-rose-700 dark:text-rose-400',
  critical: 'text-red-600 dark:text-red-400',
  major: 'text-amber-700 dark:text-amber-400',
  minor: 'text-slate-600 dark:text-slate-400',
};

const STATUS_TEXT: Record<BugStatus, string> = {
  open: 'text-rose-700 dark:text-rose-400',
  in_progress: 'text-sky-700 dark:text-sky-400',
  retest: 'text-amber-700 dark:text-amber-400',
  closed: 'text-emerald-700 dark:text-emerald-400',
};

function detectBrowserEnvironment(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/')) browser = 'Safari';

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  const plat =
    typeof navigator !== 'undefined' && navigator.platform
      ? navigator.platform
      : 'Desktop';
  return `${browser} · ${vw}×${vh} · ${plat}`;
}

function escapeCsvCell(val: string): string {
  const safe = String(val ?? '').replace(/"/g, '""');
  return `"${safe}"`;
}

function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function generateFreshIdentity() {
  const stamp = Date.now().toString().slice(-6);
  const firstNames = ['Rafiq', 'Nadia', 'Tariq', 'Farhana', 'Sabbir', 'Anika', 'Imran'];
  const lastNames = ['Ahmed', 'Karim', 'Chowdhury', 'Rahman', 'Hasan', 'Islam'];
  const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
  const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
  const phoneDigits = String(1700000000 + Math.floor(Math.random() * 299999999));

  return {
    fullName: `${fn} ${ln}`,
    email: `qa.${fn.toLowerCase()}+${stamp}@testmail.dev`,
    bdPhone: `+880${phoneDigits}`,
    localPhone: `0${phoneDigits}`,
    strongPassword: `Qa#${stamp}!Aa9`,
    weakPassword: '123456',
    orderRef: `ORD-${new Date().getFullYear()}-${stamp}`,
    uuid:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `qa-${stamp}-4b2e-91c0`,
  };
}

const NEGATIVE_PACKS: Record<
  string,
  Array<{
    title: string;
    module: string;
    priority: TestCasePriority;
    precondition: string;
    steps: string;
    testData: string;
    expectedResult: string;
  }>
> = {
  form: [
    {
      title: 'Submit form with all required fields empty / whitespace only',
      module: 'Form Validation',
      priority: 'P0',
      precondition: 'Target form is open on staging',
      steps: '1. Enter spaces ("   ") in required fields\n2. Click Submit',
      testData: 'input = "   "',
      expectedResult: 'Trim validation triggers inline error; no empty record created.',
    },
    {
      title: 'Verify max-length boundary (255 vs 256 chars) & long text wrapping',
      module: 'Form Validation',
      priority: 'P1',
      precondition: 'Text input field active',
      steps: '1. Paste 256+ character string\n2. Save and reload view',
      testData: '256 chars ("A".repeat(256))',
      expectedResult: 'Field enforces max limit cleanly without 500 error or UI overflow.',
    },
    {
      title: 'Prevent duplicate submission on rapid double-click',
      module: 'Form Validation',
      priority: 'P0',
      precondition: 'All valid fields filled',
      steps: '1. Rapidly click Submit button 3 times within 300ms',
      testData: 'Valid payload',
      expectedResult: 'Submit button shows loading/disabled lock; only 1 API request sent.',
    },
    {
      title: 'Sanitize XSS / HTML script tags & Unicode/Bangla UTF-8 text',
      module: 'Security & Encoding',
      priority: 'P1',
      precondition: 'Text/Notes input available',
      steps: '1. Submit "<script>alert(1)</script> ও বাংলা ✅"\n2. Re-open saved record',
      testData: '<script>alert(1)</script> বাংলা ✅',
      expectedResult: 'Script never executes; renders escaped plain text and UTF-8 safely.',
    },
  ],
  auth: [
    {
      title: 'Reject invalid password & verify generic non-leaky error message',
      module: 'Authentication',
      priority: 'P0',
      precondition: 'Registered test account exists',
      steps: '1. Enter valid email + wrong password\n2. Click Sign In',
      testData: 'wrongpass123',
      expectedResult: 'Login blocked with generic "Invalid credentials" without revealing user existence.',
    },
    {
      title: 'Enforce lockout / rate-limit after repeated failed login attempts',
      module: 'Authentication',
      priority: 'P1',
      precondition: 'Fresh login session',
      steps: '1. Submit wrong password 5 consecutive times',
      testData: '5x failed attempts',
      expectedResult: 'Captcha or temporary cooldown blocks 6th automated attempt.',
    },
    {
      title: 'Block access to protected routes after Logout & browser Back button',
      module: 'Session Security',
      priority: 'P0',
      precondition: 'User logged in and navigated to protected page',
      steps: '1. Click Logout\n2. Press browser Back button',
      testData: 'Cleared session token',
      expectedResult: 'Protected data never renders; redirects cleanly to login.',
    },
  ],
  payment: [
    {
      title: 'Reject negative, zero, or non-numeric quantity/amount values',
      module: 'Checkout & Totals',
      priority: 'P0',
      precondition: 'Cart or amount input active',
      steps: '1. Enter -5, 0, or "abc" in quantity/amount\n2. Attempt checkout',
      testData: 'qty = -5 | 0',
      expectedResult: 'Blocked on both UI & API; subtotal never becomes negative.',
    },
    {
      title: 'Verify rounding parity between Cart UI, Coupon Discount & Invoice',
      module: 'Checkout & Totals',
      priority: 'P0',
      precondition: 'Percentage discount active',
      steps: '1. Add item priced 333\n2. Apply 15% coupon\n3. Complete order & check invoice',
      testData: 'price=333, discount=15%',
      expectedResult: 'Cart, gateway charge, and invoice match to exact decimal cent.',
    },
    {
      title: 'Prevent expired or already-used promo code reuse',
      module: 'Checkout & Totals',
      priority: 'P1',
      precondition: 'Expired/redeemed coupon code ready',
      steps: '1. Enter expired promo code\n2. Click Apply',
      testData: 'EXPIRED2025',
      expectedResult: 'Coupon rejected with clear reason; total unchanged.',
    },
  ],
  search: [
    {
      title: 'Handle special characters (%, _, quotes) in Search without 500 error',
      module: 'Search & Filter',
      priority: 'P1',
      precondition: 'List view with search input',
      steps: '1. Search for "\' OR 1=1", "%", and emoji\n2. Observe API response',
      testData: "' OR 1=1; %",
      expectedResult: 'Returns safe empty state; API responds 200 without SQL syntax crash.',
    },
    {
      title: 'Reset pagination to Page 1 when changing filter or search query',
      module: 'Search & Filter',
      priority: 'P1',
      precondition: 'Dataset has >2 pages; user is on Page 3',
      steps: '1. Navigate to Page 3\n2. Apply narrow search filter',
      testData: 'page=3 -> filter applied',
      expectedResult: 'Resets to Page 1 automatically so matching results are not hidden.',
    },
  ],
};

export const BugAndTestStudioView: React.FC<BugAndTestStudioViewProps> = ({
  project,
  lang,
  recording,
  screenshotConsentGranted,
  onGrantScreenshotConsent,
  onUpdateProject,
  onNotify,
}) => {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en);
  const [activeTab, setActiveTab] = useState<StudioTab>('bugs');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const bugs = project.bugReports || [];
  const testCases = project.testCases || [];

  // -------------------- BUG REPORT COMPOSER STATE --------------------
  const [bugTitle, setBugTitle] = useState('');
  const [bugModule, setBugModule] = useState('');
  const [bugSeverity, setBugSeverity] = useState<BugSeverity>('major');
  const [bugPriority, setBugPriority] = useState<BugPriority>('P1');
  const [bugEnv, setBugEnv] = useState(
    `${project.activeEnvironment.toUpperCase()} · ${project.domain}`
  );
  const [bugBrowser, setBugBrowser] = useState(detectBrowserEnvironment);
  const [bugSteps, setBugSteps] = useState('');
  const [bugExpected, setBugExpected] = useState('');
  const [bugActual, setBugActual] = useState('');
  const [bugConsoleNote, setBugConsoleNote] = useState('');
  const [bugScreenshot, setBugScreenshot] = useState<string>('');
  const [capturingTab, setCapturingTab] = useState(false);

  const [bugSearch, setBugSearch] = useState('');
  const [bugStatusFilter, setBugStatusFilter] = useState<'all' | BugStatus>('all');
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  // -------------------- TEST CASE STATE --------------------
  const [tcTitle, setTcTitle] = useState('');
  const [tcModule, setTcModule] = useState('');
  const [tcPriority, setTcPriority] = useState<TestCasePriority>('P1');
  const [tcPrecondition, setTcPrecondition] = useState('');
  const [tcSteps, setTcSteps] = useState('');
  const [tcTestData, setTcTestData] = useState('');
  const [tcExpected, setTcExpected] = useState('');
  const [tcPackType, setTcPackType] = useState<keyof typeof NEGATIVE_PACKS>('form');
  const [tcFilter, setTcFilter] = useState<'all' | TestCaseStatus>('all');
  const [tcSearch, setTcSearch] = useState('');

  // -------------------- TEST DATA & TOOLS STATE --------------------
  const [freshIdentity, setFreshIdentity] = useState(generateFreshIdentity);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonResult, setJsonResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [utilityInput, setUtilityInput] = useState('');

  const markCopied = (id: string, text: string, label?: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
    if (label) {
      onNotify?.(label);
    }
  };

  // ==================== BUG REPORT HANDLERS ====================
  const handleImportFlowSteps = (flowId: string) => {
    const flow = project.flows.find((f) => f.id === flowId);
    if (!flow) return;
    const failedSteps = flow.steps.filter((s) => s.status === 'failed');
    const sourceSteps = failedSteps.length > 0 ? flow.steps : flow.steps;
    const formatted = sourceSteps
      .map((s, idx) => `${idx + 1}. [${s.action.toUpperCase()}] ${s.title} (${s.targetElement})${s.testData ? ` -> "${s.testData}"` : ''}`)
      .join('\n');

    setBugModule(flow.module);
    setBugSteps(formatted);
    if (failedSteps[0]) {
      setBugTitle(failedSteps[0].title);
      setBugExpected(failedSteps[0].expectedRule);
      setBugActual(failedSteps[0].observedResult);
    }
    onNotify?.(
      t(`Imported ${flow.steps.length} steps from "${flow.name}".`, `"${flow.name}" থেকে স্টেপগুলো লোড হয়েছে।`)
    );
  };

  const handleImportRecordedSteps = () => {
    if (recording.recordedSteps.length === 0) {
      onNotify?.(
        t('No live recorded steps available yet.', 'এখনো কোনো রেকর্ড করা স্টেপ নেই।')
      );
      return;
    }
    const formatted = recording.recordedSteps
      .map(
        (s, idx) =>
          `${idx + 1}. [${s.action.toUpperCase()}] ${s.title} (${s.targetElement})${
            s.testData ? ` -> "${s.testData}"` : ''
          }`
      )
      .join('\n');
    setBugSteps(formatted);
    onNotify?.(
      t(
        `Imported ${recording.recordedSteps.length} recorded steps.`,
        `${recording.recordedSteps.length}টি রেকর্ডকৃত স্টেপ যুক্ত হয়েছে।`
      )
    );
  };

  const handleScreenshotFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBugScreenshot(reader.result);
        onNotify?.(t('Screenshot attached to bug draft.', 'স্ক্রিনশট বাগ রিপোর্টে যুক্ত হয়েছে।'));
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasteScreenshot = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleScreenshotFile(file);
          return;
        }
      }
    }
  };

  const handleCaptureTabEvidence = async () => {
    if (!isChromeExtensionContext()) {
      onNotify?.(
        t(
          'Active tab capture works inside the Chrome Extension. Paste (Ctrl+V) or upload any screenshot here.',
          'অ্যাক্টিভ ট্যাব ক্যাপচার Chrome এক্সটেনশনে কাজ করে। এখানে যেকোনো স্ক্রিনশট Paste বা আপলোড করুন।'
        )
      );
      return;
    }
    setCapturingTab(true);
    try {
      if (!screenshotConsentGranted) {
        onGrantScreenshotConsent();
      }
      const res = await requestVisibleTabScreenshot(true);
      if (res.ok && res.dataUrl) {
        setBugScreenshot(res.dataUrl);
        onNotify?.(t('Captured active tab screenshot.', 'বর্তমান ট্যাবের স্ক্রিনশট নেওয়া হয়েছে।'));
      } else {
        onNotify?.(res.error || t('Could not capture active tab.', 'ট্যাব ক্যাপচার করা যায়নি।'));
      }
    } finally {
      setCapturingTab(false);
    }
  };

  const handleCreateBug = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugTitle.trim()) return;
    const now = new Date().toISOString();
    const nextNum = bugs.length + 1;
    const item: BugReportItem = {
      id: `bug_${Date.now()}`,
      bugKey: `BUG-${String(nextNum).padStart(2, '0')}`,
      title: bugTitle.trim(),
      module: bugModule.trim() || 'General UI',
      severity: bugSeverity,
      priority: bugPriority,
      status: 'open',
      environment: bugEnv.trim() || `${project.activeEnvironment} · ${project.domain}`,
      browserInfo: bugBrowser.trim() || detectBrowserEnvironment(),
      stepsToReproduce: bugSteps.trim() || '1. Open target page\n2. Perform action',
      expectedResult: bugExpected.trim() || 'Expected compliant behavior',
      actualResult: bugActual.trim() || 'Observed unexpected failure',
      consoleOrApiNote: bugConsoleNote.trim() || undefined,
      screenshotDataUrl: bugScreenshot || undefined,
      createdAt: now,
      updatedAt: now,
    };

    onUpdateProject({ ...project, bugReports: [item, ...bugs] });
    setBugTitle('');
    setBugSteps('');
    setBugExpected('');
    setBugActual('');
    setBugConsoleNote('');
    setBugScreenshot('');
    onNotify?.(t(`${item.bugKey} created & saved.`, `${item.bugKey} তৈরি ও সেভ হয়েছে।`));
  };

  const handleBugStatusChange = (id: string, status: BugStatus) => {
    onUpdateProject({
      ...project,
      bugReports: bugs.map((b) =>
        b.id === id ? { ...b, status, updatedAt: new Date().toISOString() } : b
      ),
    });
  };

  const handleDeleteBug = (id: string) => {
    onUpdateProject({
      ...project,
      bugReports: bugs.filter((b) => b.id !== id),
    });
  };

  const formatBugForJira = (b: BugReportItem) =>
    `h3. [${b.bugKey}] ${b.title}
*Severity:* ${b.severity.toUpperCase()} | *Priority:* ${b.priority} | *Status:* ${b.status.toUpperCase()}
*Module:* ${b.module}
*Environment:* ${b.environment} (${b.browserInfo})

*Steps to Reproduce:*
{noformat}
${b.stepsToReproduce}
{noformat}

*Expected Result:*
${b.expectedResult}

*Actual Result:*
${b.actualResult}${b.consoleOrApiNote ? `\n\n*Console / API Trace:*\n{code}\n${b.consoleOrApiNote}\n{code}` : ''}`;

  const formatBugForMarkdown = (b: BugReportItem) =>
    `### [${b.bugKey}] ${b.title}
- **Severity:** ${b.severity.toUpperCase()} · **Priority:** ${b.priority} · **Status:** ${b.status}
- **Module:** ${b.module}
- **Environment:** ${b.environment} · ${b.browserInfo}

**Steps to Reproduce:**
\`\`\`text
${b.stepsToReproduce}
\`\`\`

- **Expected:** ${b.expectedResult}
- **Actual:** ${b.actualResult}${b.consoleOrApiNote ? `\n- **Trace:** \`${b.consoleOrApiNote}\`` : ''}`;

  const formatBugForSlack = (b: BugReportItem) =>
    `*[${b.bugKey}] ${b.title}*\nSeverity: *${b.severity.toUpperCase()}* (${b.priority}) | Module: _${b.module}_ | Env: ${b.environment}\n• *Expected:* ${b.expectedResult}\n• *Actual:* ${b.actualResult}`;

  const handleExportBugsCsv = () => {
    const header = [
      'Key',
      'Title',
      'Module',
      'Severity',
      'Priority',
      'Status',
      'Environment',
      'Browser',
      'Steps',
      'Expected',
      'Actual',
      'Trace',
    ];
    const rows = bugs.map((b) =>
      [
        b.bugKey,
        b.title,
        b.module,
        b.severity,
        b.priority,
        b.status,
        b.environment,
        b.browserInfo,
        b.stepsToReproduce,
        b.expectedResult,
        b.actualResult,
        b.consoleOrApiNote || '',
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    downloadTextFile(
      `${project.name.toLowerCase().replace(/\s+/g, '-')}-bugs.csv`,
      [header.join(','), ...rows].join('\n')
    );
    onNotify?.(t('Bug report CSV exported.', 'বাগ রিপোর্ট CSV ডাউনলোড হয়েছে।'));
  };

  const filteredBugs = useMemo(() => {
    const q = bugSearch.trim().toLowerCase();
    return bugs.filter((b) => {
      if (bugStatusFilter !== 'all' && b.status !== bugStatusFilter) return false;
      if (
        q &&
        !b.title.toLowerCase().includes(q) &&
        !b.bugKey.toLowerCase().includes(q) &&
        !b.module.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [bugs, bugSearch, bugStatusFilter]);

  // ==================== TEST CASE HANDLERS ====================
  const handleAddTestCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tcTitle.trim() || !tcExpected.trim()) return;
    const item: QaTestCase = {
      id: `tc_${Date.now()}`,
      tcKey: `TC-${String(testCases.length + 1).padStart(3, '0')}`,
      title: tcTitle.trim(),
      module: tcModule.trim() || 'General',
      priority: tcPriority,
      precondition: tcPrecondition.trim() || 'User authenticated on target module',
      steps: tcSteps.trim() || '1. Open screen\n2. Perform action',
      testData: tcTestData.trim() || 'Standard valid payload',
      expectedResult: tcExpected.trim(),
      actualResult: '',
      status: 'untested',
      updatedAt: new Date().toISOString(),
    };
    onUpdateProject({ ...project, testCases: [item, ...testCases] });
    setTcTitle('');
    setTcPrecondition('');
    setTcSteps('');
    setTcTestData('');
    setTcExpected('');
    onNotify?.(t(`${item.tcKey} added.`, `${item.tcKey} যোগ করা হয়েছে।`));
  };

  const handleGenerateNegativePack = () => {
    const templates = NEGATIVE_PACKS[tcPackType] || NEGATIVE_PACKS.form;
    const now = new Date().toISOString();
    const baseNum = testCases.length;
    const created: QaTestCase[] = templates.map((tpl, idx) => ({
      id: `tc_${Date.now()}_${idx}`,
      tcKey: `TC-${String(baseNum + idx + 1).padStart(3, '0')}`,
      title: tpl.title,
      module: tpl.module,
      priority: tpl.priority,
      precondition: tpl.precondition,
      steps: tpl.steps,
      testData: tpl.testData,
      expectedResult: tpl.expectedResult,
      actualResult: '',
      status: 'untested',
      updatedAt: now,
    }));
    onUpdateProject({ ...project, testCases: [...created, ...testCases] });
    onNotify?.(
      t(
        `Added ${created.length} SQA edge/negative test cases.`,
        `${created.length}টি নেগেটিভ/বাউন্ডারি টেস্ট কেস যোগ হয়েছে।`
      )
    );
  };

  const handleUpdateTestCaseStatus = (id: string, status: TestCaseStatus) => {
    onUpdateProject({
      ...project,
      testCases: testCases.map((tc) =>
        tc.id === id ? { ...tc, status, updatedAt: new Date().toISOString() } : tc
      ),
    });
  };

  const handleUpdateTestCaseActual = (id: string, actualResult: string) => {
    onUpdateProject({
      ...project,
      testCases: testCases.map((tc) => (tc.id === id ? { ...tc, actualResult } : tc)),
    });
  };

  const handleConvertFailedTcToBug = (tc: QaTestCase) => {
    setBugTitle(`[${tc.tcKey}] ${tc.title}`);
    setBugModule(tc.module);
    setBugPriority(tc.priority);
    setBugSeverity(tc.priority === 'P0' ? 'critical' : 'major');
    setBugSteps(`${tc.steps}\n\nTest Data: ${tc.testData}`);
    setBugExpected(tc.expectedResult);
    setBugActual(tc.actualResult || 'Failed during test case execution.');
    setActiveTab('bugs');
    onNotify?.(
      t(
        `Pre-filled Bug Draft from ${tc.tcKey}. Review & save!`,
        `${tc.tcKey} থেকে বাগ ড্রাফট তৈরি হয়েছে।`
      )
    );
  };

  const handleDeleteTestCase = (id: string) => {
    onUpdateProject({
      ...project,
      testCases: testCases.filter((tc) => tc.id !== id),
    });
  };

  const handleExportTestCasesCsv = () => {
    const header = [
      'TC ID',
      'Title',
      'Module',
      'Priority',
      'Precondition',
      'Steps',
      'Test Data',
      'Expected Result',
      'Actual Result',
      'Status',
    ];
    const rows = testCases.map((tc) =>
      [
        tc.tcKey,
        tc.title,
        tc.module,
        tc.priority,
        tc.precondition,
        tc.steps,
        tc.testData,
        tc.expectedResult,
        tc.actualResult,
        tc.status,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    downloadTextFile(
      `${project.name.toLowerCase().replace(/\s+/g, '-')}-test-cases.csv`,
      [header.join(','), ...rows].join('\n')
    );
    onNotify?.(t('Test cases CSV exported.', 'টেস্ট কেস CSV ডাউনলোড হয়েছে।'));
  };

  const filteredTestCases = useMemo(() => {
    const q = tcSearch.trim().toLowerCase();
    return testCases.filter((tc) => {
      if (tcFilter !== 'all' && tc.status !== tcFilter) return false;
      if (
        q &&
        !tc.title.toLowerCase().includes(q) &&
        !tc.tcKey.toLowerCase().includes(q) &&
        !tc.module.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [testCases, tcFilter, tcSearch]);

  // ==================== TEST DATA & TOOLS HELPERS ====================
  const boundaryDataItems = useMemo(() => {
    const now = new Date();
    const yest = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    const future = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    return [
      {
        id: 'bd_whitespace',
        group: t('Boundary', 'বাউন্ডারি'),
        label: t('Whitespace Only (3 spaces)', 'শুধু স্পেস (খালি চেক)'),
        value: '   ',
        display: '"   " (3 spaces)',
      },
      {
        id: 'bd_255',
        group: t('Boundary', 'বাউন্ডারি'),
        label: t('Exact 255 Chars String', 'ঠিক ২৫৫ অক্ষরের টেক্সট'),
        value: 'A'.repeat(255),
        display: 'AAA... (255 chars)',
      },
      {
        id: 'bd_256',
        group: t('Boundary', 'বাউন্ডারি'),
        label: t('Overflow 256 Chars String', '২৫৬ অক্ষর (লিমিট ওভারফ্লো)'),
        value: 'B'.repeat(256),
        display: 'BBB... (256 chars)',
      },
      {
        id: 'bd_unicode',
        group: t('Unicode', 'ইউনিকোড'),
        label: t('Bangla + Emoji + Symbols', 'বাংলা + ইমোজি + সিম্বল'),
        value: 'সাব্বির টেস্ট ✅🔥 (৳১,২৫০.৫০) — O’Connor & Co.',
        display: 'সাব্বির টেস্ট ✅🔥 (৳১,২৫০.৫০)',
      },
      {
        id: 'bd_neg',
        group: t('Numeric', 'সংখ্যা'),
        label: t('Negative / Zero / Decimal Edge', 'নেগেটিভ ও ডেসিমেল'),
        value: '-1',
        display: '-1',
      },
      {
        id: 'bd_big_num',
        group: t('Numeric', 'সংখ্যা'),
        label: t('Large Currency Amount', 'বড় টাকার সংখ্যা'),
        value: '999999999.99',
        display: '999999999.99',
      },
      {
        id: 'bd_past_date',
        group: t('Date', 'তারিখ'),
        label: t('Yesterday ISO Date', 'গতকালের তারিখ'),
        value: yest,
        display: yest,
      },
      {
        id: 'bd_leap_date',
        group: t('Date', 'তারিখ'),
        label: t('Leap Year / Future +30d', 'লিপ-ইয়ার / +৩০ দিন'),
        value: future,
        display: `${future} (or 2024-02-29)`,
      },
      {
        id: 'sec_xss',
        group: t('Sanity', 'স্যানিটি'),
        label: t('Harmless XSS Escaping Probe', 'XSS ইনপুট চেক (সেফ)'),
        value: `<img src=x onerror="console.log('xss-check')">`,
        display: `<img src=x onerror="console.log('xss-check')">`,
      },
      {
        id: 'sec_sql',
        group: t('Sanity', 'স্যানিটি'),
        label: t('SQL Quote & Wildcard Probe', 'SQL কোট ও % চেক'),
        value: `' OR '1'='1' -- %_`,
        display: `' OR '1'='1' -- %_`,
      },
    ];
  }, [lang]);

  const handleFormatJson = (minify = false) => {
    try {
      const parsed = JSON.parse(jsonInput);
      const formatted = JSON.stringify(parsed, null, minify ? 0 : 2);
      setJsonInput(formatted);
      setJsonResult({
        ok: true,
        text: t('Valid JSON.', 'সঠিক JSON।'),
      });
    } catch (err) {
      setJsonResult({
        ok: false,
        text: err instanceof Error ? err.message : 'Invalid JSON syntax',
      });
    }
  };

  // Summary metrics
  const openBugsCount = bugs.filter((b) => b.status === 'open' || b.status === 'in_progress').length;
  const tcPassedCount = testCases.filter((tc) => tc.status === 'passed').length;
  const tcFailedCount = testCases.filter((tc) => tc.status === 'failed').length;
  const tcPassPct =
    testCases.length > 0 ? Math.round((tcPassedCount / testCases.length) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header + Segmented Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-red-200/80 dark:border-red-900/60 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            <Bug className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t(
                'Daily SQA Workbench — Bug Studio, Test Cases & Edge Data',
                'দৈনন্দিন SQA স্টুডিও — বাগ রিপোর্ট, টেস্ট কেস ও টেস্ট ডাটা'
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span>
                {openBugsCount} {t('open bugs', 'টি ওপেন বাগ')}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {tcPassedCount}/{testCases.length} {t('TC pass', 'টিসি পাস')} ({tcPassPct}%)
              </span>
              <span aria-hidden="true">·</span>
              <span className={tcFailedCount > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}>
                {tcFailedCount} {t('failed', 'ফেইলড')}
              </span>
            </div>
          </div>
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('bugs')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'bugs'
                ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Bug className="w-3.5 h-3.5" />
            {t('Bug Reports', 'বাগ রিপোর্ট')} ({bugs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('test_cases')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'test_cases'
                ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            {t('Test Cases', 'টেস্ট কেস')} ({testCases.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('test_data')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'test_data'
                ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            {t('Test Data & Tools', 'টেস্ট ডাটা ও টুলস')}
          </button>
        </div>
      </div>

      {/* ==================== TAB 1: BUG REPORT STUDIO ==================== */}
      {activeTab === 'bugs' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Bug Ticket Composer */}
          <form
            onSubmit={handleCreateBug}
            onPaste={handlePasteScreenshot}
            className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('Log Reproducible Bug Ticket', 'নতুন বাগ রিপোর্ট তৈরি করুন')}
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                {t('Ctrl+V pastes screenshot', 'Ctrl+V দিয়ে স্ক্রিনশট দিন')}
              </span>
            </div>

            {/* Quick Step Importers */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-2.5">
              <Import className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                aria-label="Import steps from workflow flow"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) handleImportFlowSteps(e.target.value);
                  e.target.value = '';
                }}
                className="flex-1 min-w-[140px] px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <option value="">
                  {t('Import steps from Flow...', 'টেস্ট ফ্লো থেকে স্টেপ আনুন...')}
                </option>
                {project.flows.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.steps.length})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleImportRecordedSteps}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                {t('Recorded Steps', 'রেকর্ডেড স্টেপ')} ({recording.recordedSteps.length})
              </button>
            </div>

            <input
              type="text"
              value={bugTitle}
              onChange={(e) => setBugTitle(e.target.value)}
              placeholder={t(
                'Bug Title (What failed & where)...',
                'বাগের শিরোনাম (কোথায় কী সমস্যা হচ্ছে)...'
              )}
              required
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={bugModule}
                onChange={(e) => setBugModule(e.target.value)}
                placeholder={t('Module / Page', 'মডিউল / পেজ')}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <select
                value={bugSeverity}
                onChange={(e) => setBugSeverity(e.target.value as BugSeverity)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="blocker">Blocker</option>
                <option value="critical">Critical</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </select>
              <select
                value={bugPriority}
                onChange={(e) => setBugPriority(e.target.value as BugPriority)}
                className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="P0">P0 · Urgent</option>
                <option value="P1">P1 · High</option>
                <option value="P2">P2 · Medium</option>
                <option value="P3">P3 · Low</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={bugEnv}
                onChange={(e) => setBugEnv(e.target.value)}
                placeholder="Environment"
                className="px-3 py-1.5 text-[11px] font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              />
              <input
                type="text"
                value={bugBrowser}
                onChange={(e) => setBugBrowser(e.target.value)}
                placeholder="Browser / Viewport"
                className="px-3 py-1.5 text-[11px] font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              />
            </div>

            <textarea
              rows={3}
              value={bugSteps}
              onChange={(e) => setBugSteps(e.target.value)}
              placeholder={t(
                'Steps to Reproduce:\n1. Go to...\n2. Click...',
                'রিপ্রোডিউস করার ধাপসমূহ:\n১. পেজে যান...\n২. ক্লিক করুন...'
              )}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <textarea
                rows={2}
                value={bugExpected}
                onChange={(e) => setBugExpected(e.target.value)}
                placeholder={t('Expected Result...', 'কী হওয়া উচিত ছিল...')}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <textarea
                rows={2}
                value={bugActual}
                onChange={(e) => setBugActual(e.target.value)}
                placeholder={t('Actual Result...', 'বাস্তবে কী ঘটল...')}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            <input
              type="text"
              value={bugConsoleNote}
              onChange={(e) => setBugConsoleNote(e.target.value)}
              placeholder={t(
                'Console Error / Failed API Endpoint (optional)',
                'কনসোল এরর বা API স্ট্যাটাস কোড (ঐচ্ছিক)'
              )}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />

            {/* Evidence Screenshot Controls */}
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <ImagePlus className="w-3.5 h-3.5" />
                  {t('Screenshot Evidence', 'স্ক্রিনশট প্রুফ')}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCaptureTabEvidence}
                    disabled={capturingTab}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                  >
                    <Camera className="w-3 h-3" />
                    {capturingTab
                      ? t('Capturing...', 'ক্যাপচার হচ্ছে...')
                      : t('Capture Tab', 'ট্যাব ক্যাপচার')}
                  </button>
                  <button
                    type="button"
                    onClick={() => screenshotInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3 h-3" />
                    {t('Upload', 'আপলোড')}
                  </button>
                  <input
                    ref={screenshotInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleScreenshotFile(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              {bugScreenshot && (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                  <img
                    src={bugScreenshot}
                    alt="Bug evidence preview"
                    className="w-full max-h-40 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setBugScreenshot('')}
                    aria-label="Remove screenshot"
                    className="absolute top-2 right-2 p-1 rounded-md bg-slate-900/80 text-white hover:bg-rose-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t('Save Bug Report', 'বাগ রিপোর্ট সেভ করুন')}
            </button>
          </form>

          {/* Bug List & 1-Click Exporters */}
          <div className="xl:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={bugSearch}
                  onChange={(e) => setBugSearch(e.target.value)}
                  placeholder={t('Search BUG-01, title, module...', 'বাগ খুঁজুন...')}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={bugStatusFilter}
                  onChange={(e) =>
                    setBugStatusFilter(e.target.value as 'all' | BugStatus)
                  }
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
                >
                  <option value="all">{t('All Status', 'সব স্ট্যাটাস')}</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="retest">Retest Ready</option>
                  <option value="closed">Closed</option>
                </select>

                <button
                  type="button"
                  onClick={handleExportBugsCsv}
                  disabled={bugs.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t('Export CSV', 'CSV ডাউনলোড')}
                </button>
              </div>
            </div>

            {filteredBugs.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
                <Bug className="w-7 h-7 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-500">
                  {t('No bug tickets match this filter.', 'কোনো বাগ রিপোর্ট পাওয়া যায়নি।')}
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredBugs.map((bug) => (
                  <article
                    key={bug.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {bug.bugKey}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className={`font-semibold uppercase ${SEVERITY_TEXT[bug.severity]}`}>
                            {bug.severity}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{bug.priority}</span>
                          <span aria-hidden="true">·</span>
                          <span>{bug.module}</span>
                          <span aria-hidden="true">·</span>
                          <span className={`font-semibold uppercase ${STATUS_TEXT[bug.status]}`}>
                            {bug.status.replace('_', ' ')}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {bug.title}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          aria-label="Update bug status"
                          value={bug.status}
                          onChange={(e) =>
                            handleBugStatusChange(bug.id, e.target.value as BugStatus)
                          }
                          className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="retest">Retest Ready</option>
                          <option value="closed">Closed</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleDeleteBug(bug.id)}
                          aria-label="Delete bug"
                          className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {bug.environment} · {bug.browserInfo}
                    </div>

                    <pre className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {bug.stepsToReproduce}
                    </pre>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      <div className="rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-2.5">
                        <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-0.5">
                          {t('Expected', 'প্রত্যাশিত')}
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">{bug.expectedResult}</p>
                      </div>
                      <div className="rounded-lg border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 p-2.5">
                        <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 mb-0.5">
                          {t('Actual', 'বাস্তবে যা হয়েছে')}
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">{bug.actualResult}</p>
                      </div>
                    </div>

                    {bug.consoleOrApiNote && (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-amber-300 px-3 py-2 text-[11px] font-mono">
                        {bug.consoleOrApiNote}
                      </div>
                    )}

                    {bug.screenshotDataUrl && (
                      <button
                        type="button"
                        onClick={() => setPreviewImg(bug.screenshotDataUrl || null)}
                        className="block w-full max-w-xs rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-90"
                      >
                        <img
                          src={bug.screenshotDataUrl}
                          alt={`${bug.bugKey} screenshot`}
                          className="w-full h-28 object-cover"
                        />
                      </button>
                    )}

                    {/* 1-Click Copy Ticket Exporters */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('Copy Ticket:', 'টিকিট কপি:')}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          markCopied(
                            `jira_${bug.id}`,
                            formatBugForJira(bug),
                            t(`${bug.bugKey} copied for Jira!`, `${bug.bugKey} Jira ফরম্যাটে কপি হয়েছে!`)
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                      >
                        {copiedId === `jira_${bug.id}` ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <ClipboardCopy className="w-3 h-3" />
                        )}
                        Jira Wiki
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          markCopied(
                            `md_${bug.id}`,
                            formatBugForMarkdown(bug),
                            t(`${bug.bugKey} copied as Markdown!`, `${bug.bugKey} Markdown-এ কপি হয়েছে!`)
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                      >
                        {copiedId === `md_${bug.id}` ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <ClipboardCopy className="w-3 h-3" />
                        )}
                        GitHub / Linear
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          markCopied(
                            `slack_${bug.id}`,
                            formatBugForSlack(bug),
                            t(`${bug.bugKey} copied for Slack!`, `${bug.bugKey} Slack-এর জন্য কপি হয়েছে!`)
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                      >
                        {copiedId === `slack_${bug.id}` ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <ClipboardCopy className="w-3 h-3" />
                        )}
                        Slack Ping
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: TEST CASES & NEGATIVE PACK GENERATOR ==================== */}
      {activeTab === 'test_cases' && (
        <div className="space-y-5">
          {/* Top Bar: Add TC + 1-Click Negative/Edge Pack Generator */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <form
              onSubmit={handleAddTestCase}
              className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs"
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('Add Test Case', 'নতুন টেস্ট কেস যোগ করুন')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <input
                  type="text"
                  value={tcTitle}
                  onChange={(e) => setTcTitle(e.target.value)}
                  placeholder={t('Test Case Title...', 'টেস্ট কেসের নাম...')}
                  required
                  className="sm:col-span-2 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  value={tcModule}
                  onChange={(e) => setTcModule(e.target.value)}
                  placeholder={t('Module', 'মডিউল')}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                <select
                  value={tcPriority}
                  onChange={(e) => setTcPriority(e.target.value as TestCasePriority)}
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="P0">P0 · Smoke</option>
                  <option value="P1">P1 · Critical</option>
                  <option value="P2">P2 · Regression</option>
                  <option value="P3">P3 · Edge</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={tcPrecondition}
                  onChange={(e) => setTcPrecondition(e.target.value)}
                  placeholder={t('Precondition...', 'পূর্বশর্ত...')}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  value={tcTestData}
                  onChange={(e) => setTcTestData(e.target.value)}
                  placeholder={t('Test Data (e.g. days=3)', 'টেস্ট ডাটা')}
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <textarea
                  rows={2}
                  value={tcSteps}
                  onChange={(e) => setTcSteps(e.target.value)}
                  placeholder={t('Test Steps...', 'টেস্ট স্টেপস...')}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                <textarea
                  rows={2}
                  value={tcExpected}
                  onChange={(e) => setTcExpected(e.target.value)}
                  placeholder={t('Expected Result...', 'প্রত্যাশিত ফলাফল...')}
                  required
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('Add Test Case', 'টেস্ট কেস যোগ করুন')}
                </button>
              </div>
            </form>

            {/* Negative & Edge Pack Generator */}
            <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-red-600 dark:text-red-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('1-Click Edge Case Pack', '১-ক্লিক নেগেটিভ ও এজ প্যাক')}
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'Instantly append battle-tested negative, boundary, and security sanity test cases for common modules.',
                  'যেকোনো ফিচারের জন্য বাউন্ডারি ও নেগেটিভ টেস্ট কেস এক ক্লিকেই তৈরি করে ফেলুন।'
                )}
              </p>
              <select
                value={tcPackType}
                onChange={(e) =>
                  setTcPackType(e.target.value as keyof typeof NEGATIVE_PACKS)
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="form">
                  {t('Form Validation & Security (4 cases)', 'ফর্ম ও সিকিউরিটি (৪টি কেস)')}
                </option>
                <option value="auth">
                  {t('Login & Session Security (3 cases)', 'লগইন ও সেশন (৩টি কেস)')}
                </option>
                <option value="payment">
                  {t('Checkout, Pricing & Rounding (3 cases)', 'পেমেন্ট ও হিসাব (৩টি কেস)')}
                </option>
                <option value="search">
                  {t('Search & Pagination Filters (2 cases)', 'সার্চ ও ফিল্টার (২টি কেস)')}
                </option>
              </select>
              <button
                type="button"
                onClick={handleGenerateNegativePack}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-red-50/70 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100/70 text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('Generate Negative Cases', 'নেগেটিভ কেস যোগ করুন')}
              </button>
              <button
                type="button"
                onClick={handleExportTestCasesCsv}
                disabled={testCases.length === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {t('Export Excel / CSV', 'CSV / Excel ডাউনলোড')}
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tcSearch}
                onChange={(e) => setTcSearch(e.target.value)}
                placeholder={t('Search TC-001, title, module...', 'টেস্ট কেস খুঁজুন...')}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
              {[
                { id: 'all', label: t('All', 'সব') },
                { id: 'passed', label: t('Passed', 'পাস') },
                { id: 'failed', label: t('Failed', 'ফেইলড') },
                { id: 'blocked', label: t('Blocked', 'ব্লকড') },
                { id: 'untested', label: t('Untested', 'বাকি') },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTcFilter(tab.id as 'all' | TestCaseStatus)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    tcFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Test Cases Execution Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            {filteredTestCases.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {t('No test cases found.', 'কোনো টেস্ট কেস নেই।')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950">
                      <th className="py-3 px-4">ID / Priority</th>
                      <th className="py-3 px-4">Test Case &amp; Steps</th>
                      <th className="py-3 px-4">Expected &amp; Actual</th>
                      <th className="py-3 px-4">Execution Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {filteredTestCases.map((tc) => (
                      <tr
                        key={tc.id}
                        className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                      >
                        <td className="py-3.5 px-4 font-mono tabular-nums whitespace-nowrap">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {tc.tcKey}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {tc.priority} · {tc.module}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 space-y-1 max-w-xs">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {tc.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-pre-line font-mono">
                            {tc.steps}
                          </div>
                          {tc.testData && (
                            <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                              Data: {tc.testData}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 space-y-1.5 max-w-xs">
                          <div className="text-slate-700 dark:text-slate-300">
                            <span className="font-semibold text-slate-500">Exp: </span>
                            {tc.expectedResult}
                          </div>
                          <input
                            type="text"
                            value={tc.actualResult}
                            onChange={(e) =>
                              handleUpdateTestCaseActual(tc.id, e.target.value)
                            }
                            placeholder={t('Type actual result...', 'বাস্তব রেজাল্ট লিখুন...')}
                            className="w-full px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                          />
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {(
                              [
                                { s: 'passed', label: 'Pass', icon: CheckCircle2, cls: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' },
                                { s: 'failed', label: 'Fail', icon: XCircle, cls: 'border-rose-400 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300' },
                                { s: 'blocked', label: 'Block', icon: AlertTriangle, cls: 'border-amber-400 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' },
                              ] as const
                            ).map((btn) => {
                              const Icon = btn.icon;
                              const active = tc.status === btn.s;
                              return (
                                <button
                                  key={btn.s}
                                  type="button"
                                  onClick={() => handleUpdateTestCaseStatus(tc.id, btn.s)}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                                    active
                                      ? btn.cls
                                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  <Icon className="w-3 h-3" />
                                  {btn.label}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1.5">
                          {(tc.status === 'failed' || tc.status === 'blocked') && (
                            <button
                              type="button"
                              onClick={() => handleConvertFailedTcToBug(tc)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              <Bug className="w-3 h-3" />
                              {t('Log Bug', 'বাগ লগ')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteTestCase(tc.id)}
                            aria-label="Delete test case"
                            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 cursor-pointer align-middle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 3: TEST DATA & DAILY QA UTILITIES ==================== */}
      {activeTab === 'test_data' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Fresh QA Identity Generator */}
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('Fresh QA Identity Generator', 'ফ্রেশ টেস্ট ইউজার ডাটা')}
                </h3>
                <button
                  type="button"
                  onClick={() => setFreshIdentity(generateFreshIdentity())}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('Regenerate', 'নতুন তৈরি')}
                </button>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {[
                  { k: 'fullName', label: t('Full Name', 'নাম'), val: freshIdentity.fullName },
                  { k: 'email', label: t('Unique Email', 'ইউনিক ইমেইল'), val: freshIdentity.email },
                  { k: 'bdPhone', label: t('Phone (+880)', 'ফোন (+880)'), val: freshIdentity.bdPhone },
                  { k: 'localPhone', label: t('Local Phone', 'লোকাল ফোন'), val: freshIdentity.localPhone },
                  { k: 'strongPwd', label: t('Strong Pass', 'শক্তিশালী পাসওয়ার্ড'), val: freshIdentity.strongPassword },
                  { k: 'orderRef', label: t('Order / Ref ID', 'অর্ডার রেফারেন্স'), val: freshIdentity.orderRef },
                  { k: 'uuid', label: 'UUID v4', val: freshIdentity.uuid },
                ].map((row) => (
                  <div key={row.k} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {row.label}
                      </div>
                      <div className="font-mono text-slate-900 dark:text-slate-100 truncate">
                        {row.val}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        markCopied(row.k, row.val, `${row.label}: ${t('copied!', 'কপি হয়েছে!')}`)
                      }
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                    >
                      {copiedId === row.k ? t('Copied', 'কপি') : t('Copy', 'কপি')}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 1-Click Boundary, Negative & Sanity Strings */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t(
                    '1-Click Boundary, Negative & Sanity Inputs',
                    '১-ক্লিক বাউন্ডারি ও এজ-কেস ইনপুট'
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t(
                    'Click Copy on any edge string to test form limits, UTF-8/Bangla support, numbers, or input escaping.',
                    'যেকোনো ফর্মে লিমিট, বাংলা/ইমোজি সাপোর্ট বা নিরাপত্তা যাচাই করতে ১ ক্লিকে কপি করুন।'
                  )}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {boundaryDataItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {item.group} · {item.label}
                      </div>
                      <div className="text-xs font-mono text-slate-900 dark:text-slate-100 truncate mt-0.5">
                        {item.display}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        markCopied(item.id, item.value, t('Test input copied!', 'টেস্ট ডাটা কপি হয়েছে!'))
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer shrink-0"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <ClipboardCopy className="w-3 h-3" />
                      )}
                      {copiedId === item.id ? t('Copied', 'কপি') : t('Copy', 'কপি')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Daily QA JSON & Encoding Utility */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t('JSON Payload Formatter & Validator', 'JSON ফরম্যাটার ও ভ্যালিডেটর')}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleFormatJson(false)}
                    className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Prettify
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatJson(true)}
                    className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Minify
                  </button>
                </div>
              </div>
              <textarea
                rows={4}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='{"orderId":"ORD-101","amount":500}'
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              {jsonResult && (
                <div
                  className={`text-xs font-mono px-3 py-1.5 rounded-lg border ${
                    jsonResult.ok
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                      : 'border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {jsonResult.text}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('URL / Base64 & String Length Inspector', 'URL / Base64 ও টেক্সট দৈর্ঘ্য চেকার')}
              </h3>
              <textarea
                rows={3}
                value={utilityInput}
                onChange={(e) => setUtilityInput(e.target.value)}
                placeholder="https://app.example.com/search?q=test"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {t('Length:', 'দৈর্ঘ্য:')} {utilityInput.length} chars ·{' '}
                  {new Blob([utilityInput]).size} bytes
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setUtilityInput(encodeURIComponent(utilityInput))}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    URL Encode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        setUtilityInput(decodeURIComponent(utilityInput));
                      } catch {
                        // ignore invalid escape sequence
                      }
                    }}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    URL Decode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        setUtilityInput(
                          btoa(unescape(encodeURIComponent(utilityInput)))
                        );
                      } catch {
                        // ignore
                      }
                    }}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Base64 Encode
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      markCopied('util_out', utilityInput, t('Output copied!', 'কপি হয়েছে!'))
                    }
                    className="px-2.5 py-1 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-semibold cursor-pointer"
                  >
                    {t('Copy', 'কপি')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Screenshot Evidence Modal */}
      {previewImg && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}
        >
          <div
            className="relative max-w-4xl w-full rounded-xl overflow-hidden border border-slate-700 bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImg(null)}
              aria-label="Close preview"
              className="absolute top-3 right-3 p-2 rounded-lg bg-slate-900/90 text-white hover:bg-rose-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewImg}
              alt="Full size bug screenshot"
              className="w-full max-h-[85vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
