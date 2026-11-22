import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Code2,
  Copy,
  Download,
  Globe,
  HelpCircle,
  Lock,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  Video,
  Wand2,
  XCircle,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import {
  AppLanguage,
  BugReportItem,
  FlowStep,
  ProjectWorkspace,
  RecordingState,
  StepAction,
  WorkflowFlow,
} from '../types/flowguard';
import {
  CodegenTarget,
  computeFlowRealismReport,
  generateCodeFromFlow,
  generateCodeFromRecordedSteps,
  parseCodegenToSteps,
} from '../utils/codegenGenerator';
import {
  isChromeExtensionContext,
  probeActiveTabSelectors,
} from '../utils/extensionBridge';

interface WorkflowFlowsViewProps {
  project: ProjectWorkspace;
  lang: AppLanguage;
  recording: RecordingState;
  onUpdateProject: (updated: ProjectWorkspace) => void;
  onToggleRecording: (next: boolean) => void;
  onClearRecorded: (silent?: boolean) => void;
  onNotify?: (message: string) => void;
}

const ACTION_LABELS: Record<StepAction, string> = {
  click: 'Click button / link',
  type: 'Type into field',
  select: 'Choose option',
  check: 'Check box',
  uncheck: 'Uncheck box',
  assert: 'Verify visible',
};

const FLOW_BLUEPRINTS: Array<{
  id: string;
  labelEn: string;
  labelBn: string;
  name: string;
  module: string;
  steps: Array<Omit<FlowStep, 'id' | 'status' | 'observedResult'>>;
}> = [
  {
    id: 'auth_login',
    labelEn: 'Auth Login Flow',
    labelBn: 'লগইন ফ্লো',
    name: 'User Authentication & Session Check',
    module: 'Auth & Security',
    steps: [
      {
        title: 'Enter valid email address',
        action: 'type',
        targetElement: '[data-testid="login-email"]',
        testData: 'qa.user@example.com',
        isSensitiveData: false,
        expectedRule: 'Email input accepts valid format without error',
      },
      {
        title: 'Enter account password',
        action: 'type',
        targetElement: '[data-testid="login-password"]',
        testData: '••••••••',
        isSensitiveData: true,
        expectedRule: 'Password stays masked during input',
      },
      {
        title: 'Submit login form',
        action: 'click',
        targetElement: '[data-testid="login-submit"]',
        testData: '',
        isSensitiveData: false,
        expectedRule: 'Redirects to dashboard with valid session cookie',
      },
      {
        title: 'Verify dashboard heading visible',
        action: 'assert',
        targetElement: 'h1',
        testData: '',
        isSensitiveData: false,
        expectedRule: 'Authenticated greeting renders cleanly',
      },
    ],
  },
  {
    id: 'form_crud',
    labelEn: 'Form CRUD Validation',
    labelBn: 'ফর্ম সেভ ও ভ্যালিডেশন',
    name: 'Create & Validate Record Form',
    module: 'Forms & Data',
    steps: [
      {
        title: 'Fill required title field',
        action: 'type',
        targetElement: '[name="title"]',
        testData: 'QA Verification Record',
        isSensitiveData: false,
        expectedRule: 'Input validates non-empty string cleanly',
      },
      {
        title: 'Select category dropdown',
        action: 'select',
        targetElement: 'select[name="category"]',
        testData: 'standard',
        isSensitiveData: false,
        expectedRule: 'Selected option updates form state',
      },
      {
        title: 'Click Save Record button',
        action: 'click',
        targetElement: 'button[type="submit"]',
        testData: '',
        isSensitiveData: false,
        expectedRule: 'API returns 200/201 and new row appears in list',
      },
    ],
  },
  {
    id: 'cart_checkout',
    labelEn: 'Cart & Checkout Flow',
    labelBn: 'কার্ট ও চেকআউট ফ্লো',
    name: 'Add to Cart & Total Calculation',
    module: 'Checkout & Billing',
    steps: [
      {
        title: 'Click Add to Cart button',
        action: 'click',
        targetElement: '[data-testid="add-to-cart"]',
        testData: '',
        isSensitiveData: false,
        expectedRule: 'Cart badge increments immediately',
      },
      {
        title: 'Open Checkout summary',
        action: 'click',
        targetElement: '[data-testid="checkout-btn"]',
        testData: '',
        isSensitiveData: false,
        expectedRule: 'Subtotal, VAT, and Net Total compute accurately',
      },
      {
        title: 'Verify payable total visible',
        action: 'assert',
        targetElement: '[data-testid="order-total"]',
        testData: '',
        isSensitiveData: false,
        expectedRule: 'Final payable total is non-zero and formatted',
      },
    ],
  },
  {
    id: 'search_pagination',
    labelEn: 'Search & Table Filter',
    labelBn: 'সার্চ ও টেবিল ফিল্টার',
    name: 'Search, Filter & Pagination Reset',
    module: 'Listing & Search',
    steps: [
      {
        title: 'Type search keyword into filter box',
        action: 'type',
        targetElement: '[data-testid="search-input"]',
        testData: 'Order-102',
        isSensitiveData: false,
        expectedRule: 'Results narrow down and reset pagination to page 1',
      },
      {
        title: 'Verify matching table row renders',
        action: 'assert',
        targetElement: 'table tbody tr',
        testData: '',
        isSensitiveData: false,
        expectedRule: 'Matching record shows cleanly without console errors',
      },
      {
        title: 'Clear search filter',
        action: 'click',
        targetElement: '[data-testid="clear-filter"]',
        testData: '',
        isSensitiveData: false,
        expectedRule: 'Full paginated list restores cleanly',
      },
    ],
  },
  {
    id: 'negative_validation',
    labelEn: 'Negative Validation',
    labelBn: 'নেগেটিভ ভ্যালিডেশন',
    name: 'Empty & Invalid Input Guard',
    module: 'Form Validation',
    steps: [
      {
        title: 'Enter whitespace only into required field',
        action: 'type',
        targetElement: 'input[required]',
        testData: '   ',
        isSensitiveData: false,
        expectedRule: 'Whitespace should not bypass required check',
      },
      {
        title: 'Click Submit without valid input',
        action: 'click',
        targetElement: 'button[type="submit"]',
        testData: '',
        isSensitiveData: false,
        expectedRule: 'Submission blocked; no 500 API error triggered',
      },
      {
        title: 'Verify inline validation message shown',
        action: 'assert',
        targetElement: '[role="alert"]',
        testData: '',
        isSensitiveData: false,
        expectedRule: 'Clear validation message appears under invalid field',
      },
    ],
  },
];

function getSelectorHealth(selector: string): {
  tier: 'resilient' | 'moderate' | 'fragile';
  labelEn: string;
  labelBn: string;
} {
  const s = selector.trim();
  if (!s) return { tier: 'fragile', labelEn: 'Empty', labelBn: 'খালি' };
  if (/data-testid|data-qa|data-cy|^#[a-zA-Z][\w-]*$/i.test(s)) {
    return { tier: 'resilient', labelEn: 'Resilient', labelBn: 'স্থায়ী' };
  }
  if (/\[(?:name|aria-label|role|type|placeholder)=/i.test(s)) {
    return { tier: 'moderate', labelEn: 'Moderate', labelBn: 'মোটামুটি' };
  }
  if (/nth-child|nth-of-type|\s>\s|\./.test(s) && s.split(/\s+/).length >= 3) {
    return { tier: 'fragile', labelEn: 'Fragile', labelBn: 'দুর্বল' };
  }
  return { tier: 'moderate', labelEn: 'Moderate', labelBn: 'মোটামুটি' };
}

export const WorkflowFlowsView: React.FC<WorkflowFlowsViewProps> = ({
  project,
  lang,
  recording,
  onUpdateProject,
  onToggleRecording,
  onClearRecorded,
  onNotify,
}) => {
  const [selectedFlowId, setSelectedFlowId] = useState<string>(
    project.flows[0]?.id || ''
  );
  const [flowSearch, setFlowSearch] = useState('');
  const [stepSearch, setStepSearch] = useState('');
  const [stepStatusFilter, setStepStatusFilter] = useState<'all' | FlowStep['status']>('all');
  const [showStagedDrawer, setShowStagedDrawer] = useState(false);
  const [showCodegenStudio, setShowCodegenStudio] = useState(false);
  const [codegenLang, setCodegenLang] = useState<CodegenTarget>('pytest-py');
  const [showRealismInfo, setShowRealismInfo] = useState(false);
  const [probingLiveDom, setProbingLiveDom] = useState(false);
  const [copiedRunReport, setCopiedRunReport] = useState(false);

  // Optional Screen Video Recorder (.webm)
  const [screenRecActive, setScreenRecActive] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [showAddStep, setShowAddStep] = useState(false);
  const [addStepMode, setAddStepMode] = useState<'manual' | 'record' | 'codegen'>('manual');
  const [autoSyncRecordedToFlow, setAutoSyncRecordedToFlow] = useState(false);
  const [codegenInput, setCodegenInput] = useState('');
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [showNewFlow, setShowNewFlow] = useState(false);
  const [editingFlowMeta, setEditingFlowMeta] = useState(false);
  const [editFlowName, setEditFlowName] = useState('');
  const [editFlowModule, setEditFlowModule] = useState('');
  const [editFlowUrl, setEditFlowUrl] = useState('');
  const [exportPreview, setExportPreview] = useState<
    'pytest-py' | 'playwright-ts' | 'playwright-js' | 'json' | null
  >(null);

  // Add/edit step form state
  const [newTitle, setNewTitle] = useState('');
  const [newAction, setNewAction] = useState<StepAction>('click');
  const [newSelector, setNewSelector] = useState('');
  const [newTestData, setNewTestData] = useState('');
  const [newExpectedRule, setNewExpectedRule] = useState('');

  // New flow form state
  const [flowName, setFlowName] = useState('');
  const [flowModule, setFlowModule] = useState('');
  const [flowUrl, setFlowUrl] = useState(`https://${project.domain}/`);

  useEffect(() => {
    if (recording.isRecording || recording.recordedSteps.length > 0) {
      setShowCodegenStudio(true);
    }
  }, [recording.isRecording, recording.recordedSteps.length]);

  useEffect(() => {
    return () => {
      if (recordedVideoUrl) {
        URL.revokeObjectURL(recordedVideoUrl);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [recordedVideoUrl]);

  const activeFlow: WorkflowFlow | undefined = useMemo(
    () =>
      project.flows.find((f) => f.id === selectedFlowId) || project.flows[0],
    [project.flows, selectedFlowId]
  );

  const filteredFlows = useMemo(() => {
    const q = flowSearch.trim().toLowerCase();
    if (!q) return project.flows;
    return project.flows.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.module.toLowerCase().includes(q) ||
        f.targetUrl.toLowerCase().includes(q)
    );
  }, [project.flows, flowSearch]);

  const filteredSteps = useMemo(() => {
    if (!activeFlow) return [];
    const q = stepSearch.trim().toLowerCase();
    return activeFlow.steps.filter((s) => {
      if (stepStatusFilter !== 'all' && s.status !== stepStatusFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.targetElement.toLowerCase().includes(q) ||
        s.expectedRule.toLowerCase().includes(q)
      );
    });
  }, [activeFlow, stepSearch, stepStatusFilter]);

  const summary = useMemo(() => {
    if (!activeFlow) return { total: 0, passed: 0, failed: 0, pending: 0, pct: 0 };
    const total = activeFlow.steps.length;
    const passed = activeFlow.steps.filter((s) => s.status === 'passed').length;
    const failed = activeFlow.steps.filter((s) => s.status === 'failed').length;
    const pending = total - passed - failed;
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
    return { total, passed, failed, pending, pct };
  }, [activeFlow]);

  const realism = useMemo(
    () => computeFlowRealismReport(activeFlow?.steps || []),
    [activeFlow?.steps]
  );

  const liveCodegenOutput = useMemo(
    () =>
      generateCodeFromRecordedSteps(
        recording.recordedSteps,
        codegenLang,
        activeFlow?.name || 'recorded_qa_journey',
        activeFlow?.targetUrl || `https://${project.domain}/`
      ),
    [recording.recordedSteps, codegenLang, activeFlow?.name, activeFlow?.targetUrl, project.domain]
  );

  const parsedCodegen = useMemo(
    () => parseCodegenToSteps(codegenInput),
    [codegenInput]
  );

  useEffect(() => {
    if (!autoSyncRecordedToFlow || !activeFlow || recording.recordedSteps.length === 0) {
      return;
    }
    const imported: FlowStep[] = recording.recordedSteps.map((rs, idx) => ({
      id: `step_rec_${Date.now()}_${idx}`,
      title: rs.title,
      action: rs.action,
      targetElement: rs.targetElement,
      testData: rs.isSensitiveData ? '••••••••' : rs.testData,
      isSensitiveData: rs.isSensitiveData,
      expectedRule: `Confirm action completes on ${rs.targetElement}`,
      observedResult: rs.observedResult,
      status: 'pending',
      verificationMode: 'manual',
    }));
    const nextFlows = project.flows.map((f) =>
      f.id === activeFlow.id ? { ...f, steps: [...f.steps, ...imported] } : f
    );
    onUpdateProject({ ...project, flows: nextFlows });
    onClearRecorded(true);
    onNotify?.(
      pickLang(
        lang,
        `Auto-added ${imported.length} recorded step(s) to "${activeFlow.name}".`,
        `রেকর্ড হওয়া ${imported.length}টি স্টেপ অটোমেটিক ফ্লো-তে যোগ হয়েছে।`
      )
    );
  }, [autoSyncRecordedToFlow, recording.recordedSteps.length]);

  const handleToggleScreenVideo = async () => {
    if (screenRecActive && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setScreenRecActive(false);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      onNotify?.(
        pickLang(
          lang,
          'Screen video capture is unavailable here. Live Codegen still records all your DOM steps!',
          'এই ব্রাউজার মোডে স্ক্রিন ভিডিও চালু নেই — তবে লাইভ কোডজেন ঠিকই কোড রেকর্ড করবে!'
        )
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      mediaStreamRef.current = stream;
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      });

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'video/webm' });
          if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
          setRecordedVideoUrl(URL.createObjectURL(blob));
          onNotify?.(
            pickLang(
              lang,
              'Screen video saved! Click Download Video (.webm) to keep it.',
              'স্ক্রিন ভিডিও তৈরি হয়েছে! ডাউনলোড করে সেভ করুন।'
            )
          );
        }
        setScreenRecActive(false);
      };

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop();
      });

      mediaRecorderRef.current = recorder;
      recorder.start();
      setScreenRecActive(true);
      if (!recording.isRecording) {
        onToggleRecording(true);
      }
      onNotify?.(
        pickLang(
          lang,
          'Screen + Live Codegen recording started!',
          'স্ক্রিন ও লাইভ পাইথন কোডজেন রেকর্ডিং শুরু হয়েছে!'
        )
      );
    } catch {
      onNotify?.(
        pickLang(
          lang,
          'Screen capture was cancelled or blocked by preview frame. Action-to-Codegen still works!',
          'স্ক্রিন ভিডিও পারমিশন বাতিল বা ব্লক হয়েছে। তবে অ্যাকশন-টু-কোডজেন স্বাভাবিকভাবেই কাজ করবে!'
        )
      );
    }
  };

  const handleImportRecorded = () => {
    if (recording.recordedSteps.length === 0) return;
    const count = recording.recordedSteps.length;
    const imported: FlowStep[] = recording.recordedSteps.map((rs, idx) => ({
      id: `step_rec_${Date.now()}_${idx}`,
      title: rs.title,
      action: rs.action,
      targetElement: rs.targetElement,
      testData: rs.isSensitiveData ? '••••••••' : rs.testData,
      isSensitiveData: rs.isSensitiveData,
      expectedRule: `Confirm action completes on ${rs.targetElement}`,
      observedResult: rs.observedResult,
      status: 'pending',
      verificationMode: 'manual',
    }));

    if (!activeFlow) {
      const createdFlow: WorkflowFlow = {
        id: `flow_${Date.now()}`,
        name: 'Recorded Flow 1',
        module: 'Recorded Actions',
        targetUrl: recording.recordedSteps[0]?.pageUrl || `https://${project.domain}/`,
        lastRunAt: null,
        steps: imported,
      };
      onUpdateProject({ ...project, flows: [createdFlow] });
      setSelectedFlowId(createdFlow.id);
      onClearRecorded(true);
      setShowStagedDrawer(false);
      onNotify?.(`Created "${createdFlow.name}" with ${count} recorded steps.`);
      return;
    }

    const nextFlows = project.flows.map((f) =>
      f.id === activeFlow.id ? { ...f, steps: [...f.steps, ...imported] } : f
    );
    onUpdateProject({ ...project, flows: nextFlows });
    onClearRecorded(true);
    setShowStagedDrawer(false);
    onNotify?.(`Added ${count} recorded steps to "${activeFlow.name}".`);
  };

  const handleRunSpecCheck = () => {
    if (!activeFlow) return;
    const now = new Date().toISOString();
    const updatedSteps: FlowStep[] = activeFlow.steps.map((step) => {
      if (!step.targetElement.trim()) {
        return {
          ...step,
          status: 'failed',
          verificationMode: 'spec_check',
          verifiedAt: now,
          observedResult: 'Missing element locator — please add a CSS selector or data-testid',
        };
      }
      if (step.action === 'type' && !step.testData && !step.isSensitiveData) {
        return {
          ...step,
          status: 'failed',
          verificationMode: 'spec_check',
          verifiedAt: now,
          observedResult: 'Typing step needs sample text to enter into the field',
        };
      }
      return {
        ...step,
        status: 'passed',
        verificationMode: 'spec_check',
        verifiedAt: now,
        observedResult: step.isSensitiveData
          ? 'Spec Check: Sensitive input masked safely'
          : `Spec Check: Locator & rule valid (${step.expectedRule || 'Ready for Playwright'})`,
      };
    });

    const passedCount = updatedSteps.filter((s) => s.status === 'passed').length;
    const nextFlows = project.flows.map((f) =>
      f.id === activeFlow.id
        ? { ...f, lastRunAt: now, steps: updatedSteps }
        : f
    );
    onUpdateProject({ ...project, flows: nextFlows });
    onNotify?.(
      pickLang(
        lang,
        `Spec Check completed (${passedCount}/${updatedSteps.length}). For live browser DOM verification, use "Probe Live Tab" in Chrome Extension or run exported pytest.`,
        `স্পেক চেক সম্পন্ন (${passedCount}/${updatedSteps.length})। রিয়েল ওয়েবসাইটে যাচাই করতে ক্রোম এক্সটেনশনে "Probe Live Tab" বা ডাউনলোড করা pytest কোড রান করুন।`
      )
    );
  };

  const handleProbeLiveDom = async () => {
    if (!activeFlow) return;
    if (!isChromeExtensionContext()) {
      onNotify?.(
        pickLang(
          lang,
          'Live Tab DOM Probe runs inside the installed Chrome Extension against your open website tab. Open "Chrome Extension" to install.',
          'লাইভ ট্যাব DOM প্রোব ক্রোম এক্সটেনশন ইনস্টল করা অবস্থায় আসল ওয়েবপেজে কাজ করে। "ক্রোম এক্সটেনশন" থেকে প্যাকেজ নিন।'
        )
      );
      return;
    }

    setProbingLiveDom(true);
    const selectors = Array.from(
      new Set(activeFlow.steps.map((s) => s.targetElement.trim()).filter(Boolean))
    );
    const probe = await probeActiveTabSelectors(selectors);
    setProbingLiveDom(false);

    if (!probe.ok) {
      onNotify?.(probe.error || 'Could not probe active Chrome tab.');
      return;
    }

    const now = new Date().toISOString();
    const updatedSteps: FlowStep[] = activeFlow.steps.map((step) => {
      const sel = step.targetElement.trim();
      const observed = sel ? probe.results[sel] : 'hidden';

      if (!sel || observed === 'hidden' || observed === 'not_checked') {
        return {
          ...step,
          status: 'failed',
          verificationMode: 'live_dom',
          verifiedAt: now,
          observedResult: `Live DOM: Element not visible or not found on active tab (${sel || 'empty'})`,
        };
      }
      if (
        observed === 'disabled' &&
        ['click', 'type', 'select', 'check', 'uncheck'].includes(step.action)
      ) {
        return {
          ...step,
          status: 'failed',
          verificationMode: 'live_dom',
          verifiedAt: now,
          observedResult: 'Live DOM: Element found but currently disabled on page',
        };
      }
      return {
        ...step,
        status: 'passed',
        verificationMode: 'live_dom',
        verifiedAt: now,
        observedResult: `Live DOM: Found & ${observed} on active browser tab`,
      };
    });

    const passedCount = updatedSteps.filter((s) => s.status === 'passed').length;
    const nextFlows = project.flows.map((f) =>
      f.id === activeFlow.id ? { ...f, lastRunAt: now, steps: updatedSteps } : f
    );
    onUpdateProject({ ...project, flows: nextFlows });
    onNotify?.(
      pickLang(
        lang,
        `Live DOM Probe finished: ${passedCount}/${updatedSteps.length} elements verified on active tab.`,
        `লাইভ DOM যাচাই সম্পন্ন: সক্রিয় ট্যাবে ${passedCount}/${updatedSteps.length}টি এলিমেন্ট পাওয়া গেছে।`
      )
    );
  };

  const handleMoveStep = (stepIndex: number, direction: -1 | 1) => {
    if (!activeFlow) return;
    const targetIdx = stepIndex + direction;
    if (targetIdx < 0 || targetIdx >= activeFlow.steps.length) return;
    const copy = [...activeFlow.steps];
    const [moved] = copy.splice(stepIndex, 1);
    copy.splice(targetIdx, 0, moved);
    const nextFlows = project.flows.map((f) =>
      f.id === activeFlow.id ? { ...f, steps: copy } : f
    );
    onUpdateProject({ ...project, flows: nextFlows });
  };

  const handleDeleteStep = (stepId: string) => {
    if (!activeFlow) return;
    const nextFlows = project.flows.map((f) =>
      f.id === activeFlow.id
        ? { ...f, steps: f.steps.filter((s) => s.id !== stepId) }
        : f
    );
    onUpdateProject({ ...project, flows: nextFlows });
  };

  const handleToggleStepStatus = (stepId: string) => {
    if (!activeFlow) return;
    const order: Array<FlowStep['status']> = ['pending', 'passed', 'failed'];
    const nextFlows = project.flows.map((f) =>
      f.id === activeFlow.id
        ? {
            ...f,
            steps: f.steps.map((s) => {
              if (s.id !== stepId) return s;
              const nextStatus =
                order[(order.indexOf(s.status) + 1) % order.length];
              return {
                ...s,
                status: nextStatus,
                verificationMode: 'manual' as const,
              };
            }),
          }
        : f
    );
    onUpdateProject({ ...project, flows: nextFlows });
  };

  const startEditingStep = (step: FlowStep) => {
    setEditingStepId(step.id);
    setNewTitle(step.title);
    setNewAction(step.action);
    setNewSelector(step.targetElement);
    setNewTestData(step.isSensitiveData ? '' : step.testData);
    setNewExpectedRule(step.expectedRule);
    setShowAddStep(true);
  };

  const resetStepForm = () => {
    setEditingStepId(null);
    setNewTitle('');
    setNewAction('click');
    setNewSelector('');
    setNewTestData('');
    setNewExpectedRule('');
    setShowAddStep(false);
  };

  const handleSaveStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFlow || !newTitle.trim() || !newSelector.trim()) return;
    const isSensitive = /password|passwd|secret|token|pin|cvv|salary/i.test(
      `${newTitle} ${newSelector}`
    );

    if (editingStepId) {
      const nextFlows = project.flows.map((f) =>
        f.id === activeFlow.id
          ? {
              ...f,
              steps: f.steps.map((s) =>
                s.id === editingStepId
                  ? {
                      ...s,
                      title: newTitle.trim(),
                      action: newAction,
                      targetElement: newSelector.trim(),
                      testData: isSensitive
                        ? '••••••••'
                        : newTestData.trim() || s.testData,
                      isSensitiveData: isSensitive,
                      expectedRule:
                        newExpectedRule.trim() ||
                        'Element responds and updates workflow state',
                    }
                  : s
              ),
            }
          : f
      );
      onUpdateProject({ ...project, flows: nextFlows });
      onNotify?.(`Updated step "${newTitle.trim()}".`);
      resetStepForm();
      return;
    }

    const created: FlowStep = {
      id: `step_${Date.now()}`,
      title: newTitle.trim(),
      action: newAction,
      targetElement: newSelector.trim(),
      testData: isSensitive ? '••••••••' : newTestData.trim(),
      isSensitiveData: isSensitive,
      expectedRule:
        newExpectedRule.trim() || 'Element responds and updates workflow state',
      observedResult: 'Ready to verify',
      status: 'pending',
    };
    const nextFlows = project.flows.map((f) =>
      f.id === activeFlow.id ? { ...f, steps: [...f.steps, created] } : f
    );
    onUpdateProject({ ...project, flows: nextFlows });
    onNotify?.(`Added step "${created.title}".`);
    resetStepForm();
  };

  const handleCreateFlow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flowName.trim()) return;
    const id = `flow_${Date.now()}`;
    const created: WorkflowFlow = {
      id,
      name: flowName.trim(),
      module: flowModule.trim() || 'Core Workflow',
      targetUrl: flowUrl.trim() || `https://${project.domain}/`,
      lastRunAt: null,
      steps: [],
    };
    onUpdateProject({
      ...project,
      flows: [...project.flows, created],
    });
    setSelectedFlowId(id);
    setFlowName('');
    setFlowModule('');
    setShowNewFlow(false);
    onNotify?.(`Created test flow "${created.name}".`);
  };

  const handleCreateFromBlueprint = (bpId: string) => {
    const bp = FLOW_BLUEPRINTS.find((b) => b.id === bpId);
    if (!bp) return;
    const nowStamp = Date.now();
    const id = `flow_${nowStamp}`;
    const created: WorkflowFlow = {
      id,
      name: bp.name,
      module: bp.module,
      targetUrl: flowUrl.trim() || `https://${project.domain}/`,
      lastRunAt: null,
      steps: bp.steps.map((s, idx) => ({
        ...s,
        id: `step_${nowStamp}_${idx}`,
        observedResult: 'Ready to verify',
        status: 'pending',
      })),
    };
    onUpdateProject({
      ...project,
      flows: [...project.flows, created],
    });
    setSelectedFlowId(id);
    setShowNewFlow(false);
    onNotify?.(
      pickLang(
        lang,
        `Created "${created.name}" (${created.steps.length} steps).`,
        `"${created.name}" ফ্লো (${created.steps.length}টি স্টেপসহ) তৈরি হয়েছে।`
      )
    );
  };

  const handleDuplicateFlow = () => {
    if (!activeFlow) return;
    const nowStamp = Date.now();
    const copyId = `flow_${nowStamp}`;
    const duplicated: WorkflowFlow = {
      ...activeFlow,
      id: copyId,
      name: `${activeFlow.name} (Copy)`,
      lastRunAt: null,
      steps: activeFlow.steps.map((s, idx) => ({
        ...s,
        id: `step_${nowStamp}_${idx}`,
        status: 'pending',
        verificationMode: 'manual',
        observedResult: 'Cloned — ready to verify',
      })),
    };
    onUpdateProject({
      ...project,
      flows: [...project.flows, duplicated],
    });
    setSelectedFlowId(copyId);
    onNotify?.(
      pickLang(
        lang,
        `Duplicated flow as "${duplicated.name}".`,
        `"${duplicated.name}" নামে ফ্লো কপি করা হয়েছে।`
      )
    );
  };

  const handleCloneStep = (step: FlowStep) => {
    if (!activeFlow) return;
    const cloned: FlowStep = {
      ...step,
      id: `step_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      title: `${step.title} (Copy)`,
      status: 'pending',
      verificationMode: 'manual',
      observedResult: 'Cloned — ready to verify',
    };
    const nextFlows = project.flows.map((f) =>
      f.id === activeFlow.id ? { ...f, steps: [...f.steps, cloned] } : f
    );
    onUpdateProject({ ...project, flows: nextFlows });
    onNotify?.(
      pickLang(
        lang,
        `Cloned step "${step.title}".`,
        `"${step.title}" স্টেপটি কপি করা হয়েছে।`
      )
    );
  };

  const startEditingFlowMeta = () => {
    if (!activeFlow) return;
    setEditFlowName(activeFlow.name);
    setEditFlowModule(activeFlow.module);
    setEditFlowUrl(activeFlow.targetUrl);
    setEditingFlowMeta(true);
  };

  const handleSaveFlowMeta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFlow || !editFlowName.trim()) return;
    const nextFlows = project.flows.map((f) =>
      f.id === activeFlow.id
        ? {
            ...f,
            name: editFlowName.trim(),
            module: editFlowModule.trim() || 'Core Workflow',
            targetUrl: editFlowUrl.trim() || `https://${project.domain}/`,
          }
        : f
    );
    onUpdateProject({ ...project, flows: nextFlows });
    setEditingFlowMeta(false);
    onNotify?.(
      pickLang(lang, 'Flow details updated.', 'ফ্লো-এর তথ্য আপডেট হয়েছে।')
    );
  };

  const handleDeleteActiveFlow = () => {
    if (!activeFlow) return;
    onUpdateProject({
      ...project,
      flows: project.flows.filter((f) => f.id !== activeFlow.id),
    });
  };

  const handleBulkStepStatus = (nextStatus: 'pending' | 'passed') => {
    if (!activeFlow || activeFlow.steps.length === 0) return;
    const now = new Date().toISOString();
    const nextFlows = project.flows.map((f) =>
      f.id === activeFlow.id
        ? {
            ...f,
            lastRunAt: nextStatus === 'passed' ? now : f.lastRunAt,
            steps: f.steps.map((s) => ({
              ...s,
              status: nextStatus,
              verificationMode: 'manual' as const,
              observedResult:
                nextStatus === 'passed'
                  ? 'Marked passed in manual regression'
                  : 'Reset — ready to verify',
            })),
          }
        : f
    );
    onUpdateProject({ ...project, flows: nextFlows });
    onNotify?.(
      nextStatus === 'passed'
        ? pickLang(
            lang,
            `Marked all ${activeFlow.steps.length} steps as Passed.`,
            `সব ${activeFlow.steps.length}টি স্টেপ পাস হিসেবে মার্ক হয়েছে।`
          )
        : pickLang(
            lang,
            `Reset all ${activeFlow.steps.length} steps to Not Run.`,
            `সব ${activeFlow.steps.length}টি স্টেপ রিসেট করা হয়েছে।`
          )
    );
  };

  const handleLogBugFromStep = (step: FlowStep) => {
    if (!activeFlow) return;
    const existingBugs = project.bugReports || [];
    const now = new Date().toISOString();
    const stepIndex = activeFlow.steps.findIndex((s) => s.id === step.id);
    const replaySteps = activeFlow.steps
      .slice(0, stepIndex >= 0 ? stepIndex + 1 : activeFlow.steps.length)
      .map(
        (s, i) =>
          `${i + 1}. [${s.action.toUpperCase()}] ${s.title} (${s.targetElement})${
            s.testData ? ` -> "${s.testData}"` : ''
          }`
      )
      .join('\n');

    const newBug: BugReportItem = {
      id: `bug_flow_${Date.now()}`,
      bugKey: `BUG-${String(existingBugs.length + 1).padStart(2, '0')}`,
      title: `[Flow: ${activeFlow.name}] ${step.title}`,
      module: activeFlow.module || 'Workflow Flow',
      severity: step.status === 'failed' ? 'critical' : 'major',
      priority: step.status === 'failed' ? 'P0' : 'P1',
      status: 'open',
      environment: `${project.activeEnvironment.toUpperCase()} · ${activeFlow.targetUrl}`,
      browserInfo:
        typeof navigator !== 'undefined' ? navigator.platform || 'Browser' : 'Browser',
      stepsToReproduce: replaySteps || `1. Target ${step.targetElement}`,
      expectedResult: step.expectedRule || 'Step completes successfully',
      actualResult:
        step.observedResult || `Failed on selector ${step.targetElement}`,
      consoleOrApiNote: `Flow ID: ${activeFlow.id} | Selector: ${step.targetElement}`,
      createdAt: now,
      updatedAt: now,
    };

    onUpdateProject({
      ...project,
      bugReports: [newBug, ...existingBugs],
    });
    onNotify?.(
      pickLang(
        lang,
        `Logged ${newBug.bugKey} to Bug Studio from step "${step.title}".`,
        `"${step.title}" স্টেপ থেকে ${newBug.bugKey} বাগ রিপোর্টে সেভ হয়েছে।`
      )
    );
  };

  const handleCopyFlowRunReport = async () => {
    if (!activeFlow) return;
    const lines = [
      `## Flow Execution Report — ${activeFlow.name}`,
      `- **Module:** ${activeFlow.module}`,
      `- **URL:** ${activeFlow.targetUrl}`,
      `- **Environment:** ${project.activeEnvironment.toUpperCase()}`,
      `- **Progress:** ${summary.passed}/${summary.total} Passed (${summary.pct}%) · ${summary.failed} Failed · ${summary.pending} Not Run`,
      ``,
      `| # | Step | Locator | Status | Observed |`,
      `|---|---|---|---|---|`,
      ...activeFlow.steps.map(
        (s, idx) =>
          `| ${idx + 1} | ${s.title} | \`${s.targetElement}\` | ${s.status.toUpperCase()} | ${s.observedResult || '-'} |`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedRunReport(true);
      setTimeout(() => setCopiedRunReport(false), 1800);
      onNotify?.(
        pickLang(
          lang,
          'Copied Markdown flow run report!',
          'ফ্লো টেস্ট রিপোর্ট কপি হয়েছে!'
        )
      );
    } catch {
      onNotify?.('Clipboard unavailable.');
    }
  };

  const generatedJson = useMemo(
    () => (activeFlow ? JSON.stringify(activeFlow, null, 2) : ''),
    [activeFlow]
  );

  const activeExportContent = useMemo(() => {
    if (!activeFlow || !exportPreview) return '';
    if (exportPreview === 'json') return generatedJson;
    return generateCodeFromFlow(activeFlow, exportPreview);
  }, [activeFlow, exportPreview, generatedJson]);

  const handleCopyExport = async (content: string, label: string) => {
    try {
      await navigator.clipboard.writeText(content);
      onNotify?.(`${label} copied to clipboard.`);
    } catch {
      onNotify?.('Clipboard unavailable.');
    }
  };

  const downloadCodeFile = (content: string, target: CodegenTarget | 'json', baseName: string) => {
    const extMap = {
      'playwright-ts': { ext: '.spec.ts', mime: 'text/typescript' },
      'playwright-js': { ext: '.spec.js', mime: 'text/javascript' },
      'pytest-py': { ext: '_test.py', mime: 'text/x-python' },
      json: { ext: '.json', mime: 'application/json' },
    } as const;
    const { ext, mime } = extMap[target];
    const safeId = baseName.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'veripulse_flow';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeId}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.(`Downloaded ${safeId}${ext}`);
  };

  return (
    <div className="space-y-5">
      {/* Recorder & Live Codegen Control Bar — Cobalt Blue Identity */}
      <div className="rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                recording.isRecording
                  ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400'
                  : 'bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400'
              }`}
            >
              <Radio className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    'Action Recorder & Live Playwright Codegen',
                    'অ্যাকশন রেকর্ডার ও লাইভ Playwright কোডজেন (Python / TS / JS)'
                  )}
                </span>
                {recording.isRecording && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold uppercase tracking-wide">
                    REC LIVE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {recording.isRecording
                  ? pickLang(
                      lang,
                      'Recording is ON — every click or input on screen streams directly into Python pytest / Playwright code below.',
                      'রেকর্ডিং চালু — স্ক্রিনে ক্লিক বা টাইপ করার সাথে সাথেই নিচে Python pytest / Playwright কোড তৈরি হচ্ছে।'
                    )
                  : recording.recordedSteps.length > 0
                    ? `${recording.recordedSteps.length} ${pickLang(
                        lang,
                        'actions captured & converted to live code.',
                        'টি অ্যাকশন রেকর্ড হয়ে কোডবেস তৈরি আছে।'
                      )}`
                    : pickLang(
                        lang,
                        'Record interactions on any screen to auto-generate Python pytest or Playwright code (like playwright codegen).',
                        'স্ক্রিনে কাজ করার সাথে সাথেই অটোমেটিক Python pytest বা Playwright কোডবেস রেডি হয়ে যাবে (Playwright Codegen এর মতো)।'
                      )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCodegenStudio(!showCodegenStudio)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                showCodegenStudio
                  ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              {pickLang(lang, 'Live Codegen', 'লাইভ কোডজেন')}
            </button>

            <button
              type="button"
              onClick={handleToggleScreenVideo}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                screenRecActive
                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              {screenRecActive
                ? pickLang(lang, 'Stop Screen Video', 'ভিডিও থামান')
                : pickLang(lang, 'Screen Video (.webm)', 'স্ক্রিন ভিডিও')}
            </button>

            {recordedVideoUrl && (
              <a
                href={recordedVideoUrl}
                download={`veripulse_recording_${Date.now()}.webm`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                {pickLang(lang, 'Save Video', 'ভিডিও সেভ')}
              </a>
            )}

            <button
              type="button"
              onClick={() => {
                const next = !recording.isRecording;
                onToggleRecording(next);
                if (next) setShowCodegenStudio(true);
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                recording.isRecording
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {recording.isRecording
                ? pickLang(lang, 'Stop Recording', 'রেকর্ডিং থামান')
                : pickLang(lang, 'Start Codegen Record', 'কোডজেন রেকর্ড শুরু')}
            </button>

            {recording.recordedSteps.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowStagedDrawer(!showStagedDrawer)}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  {showStagedDrawer ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  Steps ({recording.recordedSteps.length})
                </button>
                <button
                  type="button"
                  onClick={handleImportRecorded}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {pickLang(lang, 'Add to Flow', 'ফ্লো-তে যোগ করুন')}
                </button>
                <button
                  type="button"
                  onClick={() => onClearRecorded(false)}
                  className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Discard
                </button>
              </>
            )}
          </div>
        </div>

        {/* Live Playwright Codegen Streaming Console */}
        {showCodegenStudio && (
          <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Code2 className="w-4 h-4" />
                  {pickLang(
                    lang,
                    'Live Codegen Output (Auto-written as you interact)',
                    'লাইভ কোডজেন আউটপুট (স্ক্রিনে কাজের সাথে সাথেই কোড লিখছে)'
                  )}
                </span>
                <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800">
                  {(
                    [
                      { id: 'pytest-py', label: 'Python pytest' },
                      { id: 'playwright-ts', label: 'Playwright TS' },
                      { id: 'playwright-js', label: 'Playwright JS' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCodegenLang(item.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                        codegenLang === item.id
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleCopyExport(liveCodegenOutput, `Live Codegen (${codegenLang})`)
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  {pickLang(lang, 'Copy Code', 'কোড কপি')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadCodeFile(
                      liveCodegenOutput,
                      codegenLang,
                      activeFlow?.id || 'recorded_codegen'
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  {codegenLang === 'pytest-py'
                    ? 'Download _test.py'
                    : codegenLang === 'playwright-ts'
                      ? 'Download .spec.ts'
                      : 'Download .spec.js'}
                </button>
              </div>
            </div>

            <pre className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-emerald-200 overflow-x-auto max-h-56 leading-relaxed">
              {liveCodegenOutput}
            </pre>
          </div>
        )}

        {showStagedDrawer && recording.recordedSteps.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-4 py-3 space-y-2 max-h-56 overflow-y-auto">
            {recording.recordedSteps.map((rs, idx) => (
              <div
                key={`${rs.timestamp}_${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5 border-b border-slate-200/70 dark:border-slate-800/70 last:border-none"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-slate-400 tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {rs.title}
                  </span>
                  <code className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                    {rs.targetElement}
                  </code>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
                  {rs.isSensitiveData && (
                    <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  )}
                  <span>{rs.testData || rs.action}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Flow Directory */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {pickLang(lang, 'Test Flows', 'টেস্ট ফ্লো')} ({project.flows.length})
            </h2>
            <button
              type="button"
              onClick={() => setShowNewFlow(!showNewFlow)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {pickLang(lang, 'New Flow', 'নতুন ফ্লো')}
            </button>
          </div>

          {project.flows.length > 0 && (
            <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={flowSearch}
                  onChange={(e) => setFlowSearch(e.target.value)}
                  placeholder={pickLang(lang, 'Filter flows by name or URL...', 'ফ্লো খুঁজুন...')}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          {showNewFlow && (
            <form
              onSubmit={handleCreateFlow}
              className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2.5"
            >
              <div className="space-y-1.5 pb-1.5 border-b border-slate-200/80 dark:border-slate-700/70">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {pickLang(lang, 'Quick 1-Click SQA Blueprints', 'এক ক্লিকে রেডি ফ্লো')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FLOW_BLUEPRINTS.map((bp) => (
                    <button
                      key={bp.id}
                      type="button"
                      onClick={() => handleCreateFromBlueprint(bp.id)}
                      className="px-2 py-1 rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 text-[11px] font-semibold hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                    >
                      + {pickLang(lang, bp.labelEn, bp.labelBn)}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="text"
                placeholder={pickLang(
                  lang,
                  'What are you testing? (e.g. Request Approval)',
                  'কী টেস্ট করছেন? (যেমন: রিকোয়েস্ট অ্যাপ্রুভাল)'
                )}
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                placeholder={pickLang(lang, 'Feature area (e.g. Request Forms)', 'মডিউল / ফিচার')}
                value={flowModule}
                onChange={(e) => setFlowModule(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
              <input
                type="url"
                placeholder="Page URL"
                value={flowUrl}
                onChange={(e) => setFlowUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewFlow(false)}
                  className="px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  {pickLang(lang, 'Cancel', 'বাতিল')}
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white cursor-pointer"
                >
                  {pickLang(lang, 'Create Flow', 'ফ্লো তৈরি করুন')}
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredFlows.length === 0 && project.flows.length > 0 && (
              <div className="p-5 text-center text-xs text-slate-500">
                {pickLang(lang, 'No matching flows.', 'কোনো ফ্লো পাওয়া যায়নি।')}
              </div>
            )}
            {filteredFlows.map((flow) => {
              const isSelected = activeFlow?.id === flow.id;
              const passCount = flow.steps.filter((s) => s.status === 'passed').length;
              const failCount = flow.steps.filter((s) => s.status === 'failed').length;
              const ratio = flow.steps.length
                ? Math.round((passCount / flow.steps.length) * 100)
                : 0;
              return (
                <button
                  key={flow.id}
                  type="button"
                  onClick={() => {
                    setSelectedFlowId(flow.id);
                    setEditingFlowMeta(false);
                  }}
                  className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/80 dark:bg-blue-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {flow.name}
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {ratio}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span>{flow.module}</span>
                    <span aria-hidden="true">·</span>
                    <span>{flow.steps.length} steps</span>
                    {failCount > 0 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          {failCount} failed
                        </span>
                      </>
                    ) : passCount > 0 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {passCount} passed
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-2 h-1 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        failCount > 0
                          ? 'bg-red-500'
                          : passCount === flow.steps.length && flow.steps.length > 0
                            ? 'bg-emerald-500'
                            : 'bg-blue-600'
                      }`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Flow Editor, Realism Meter & Runner */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          {activeFlow ? (
            <>
              <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {activeFlow.name}
                      </h2>
                      <button
                        type="button"
                        onClick={startEditingFlowMeta}
                        title={pickLang(lang, 'Edit flow name & URL', 'ফ্লো নাম ও URL পরিবর্তন করুন')}
                        aria-label="Edit flow metadata"
                        className="p-1 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteActiveFlow}
                        title={pickLang(lang, 'Delete flow (moves to 3-day Recycle Bin)', 'ফ্লো ডিলিট করুন (রিসাইকেল বিনে যাবে)')}
                        aria-label="Delete flow"
                        className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{activeFlow.module}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono truncate max-w-xs">
                        {activeFlow.targetUrl}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {summary.passed}/{summary.total} {pickLang(lang, 'passed', 'পাস')} ({summary.pct}%)
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (showAddStep && !editingStepId && addStepMode === 'manual') {
                          resetStepForm();
                        } else {
                          resetStepForm();
                          setAddStepMode('manual');
                          setShowAddStep(true);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {pickLang(lang, 'Add Step', 'স্টেপ যোগ করুন')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (showAddStep && addStepMode === 'codegen') {
                          setShowAddStep(false);
                        } else {
                          resetStepForm();
                          setAddStepMode('codegen');
                          setShowAddStep(true);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100/80 whitespace-nowrap cursor-pointer"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      {pickLang(lang, 'Setup via Codegen', 'কোডজেন দিয়ে সেটআপ')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setExportPreview(exportPreview ? null : 'pytest-py')
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      {pickLang(lang, 'Export Test', 'কোড এক্সপোর্ট')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyFlowRunReport}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      {copiedRunReport ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <ClipboardCopy className="w-3.5 h-3.5" />
                      )}
                      {pickLang(lang, 'Copy Report', 'রিপোর্ট কপি')}
                    </button>
                    <button
                      type="button"
                      onClick={handleDuplicateFlow}
                      title={pickLang(lang, 'Clone this flow', 'ফ্লোটি কপি করুন')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {pickLang(lang, 'Duplicate', 'কপি করুন')}
                    </button>
                    <button
                      type="button"
                      onClick={handleProbeLiveDom}
                      disabled={probingLiveDom}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold whitespace-nowrap cursor-pointer hover:bg-emerald-100/80 disabled:opacity-60"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      {probingLiveDom
                        ? pickLang(lang, 'Probing...', 'যাচাই হচ্ছে...')
                        : pickLang(lang, 'Probe Live Tab', 'লাইভ পেজ যাচাই')}
                    </button>
                    <button
                      type="button"
                      onClick={handleRunSpecCheck}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {pickLang(lang, 'Run Spec Check', 'স্পেক চেক চালান')}
                    </button>
                  </div>
                </div>

                {editingFlowMeta && (
                  <form
                    onSubmit={handleSaveFlowMeta}
                    className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                  >
                    <input
                      type="text"
                      value={editFlowName}
                      onChange={(e) => setEditFlowName(e.target.value)}
                      required
                      placeholder={pickLang(lang, 'Flow Name', 'ফ্লো নাম')}
                      className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <input
                      type="text"
                      value={editFlowModule}
                      onChange={(e) => setEditFlowModule(e.target.value)}
                      placeholder={pickLang(lang, 'Module', 'মডিউল')}
                      className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        type="url"
                        value={editFlowUrl}
                        onChange={(e) => setEditFlowUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        {pickLang(lang, 'Save', 'সেভ')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingFlowMeta(false)}
                        className="px-2 py-1.5 text-xs text-slate-500 cursor-pointer"
                      >
                        {pickLang(lang, 'Cancel', 'বাতিল')}
                      </button>
                    </div>
                  </form>
                )}

                {/* Test Realism & Verification Transparency Bar */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                        <Activity
                          className={`w-3.5 h-3.5 ${
                            realism.tier === 'high'
                              ? 'text-emerald-600'
                              : realism.tier === 'medium'
                                ? 'text-amber-600'
                                : 'text-slate-500'
                          }`}
                        />
                        {pickLang(lang, 'Realism Confidence:', 'টেস্ট রিয়েলিজম স্কোর:')}{' '}
                        <span className="font-mono font-bold">{realism.score}%</span>
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {pickLang(lang, 'Stable Locators', 'সঠিক লোকেটর')}:{' '}
                        {realism.stableLocators}/{realism.totalSteps}
                      </span>
                      <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                        {pickLang(lang, 'Live DOM Probed', 'লাইভ DOM যাচাই')}:{' '}
                        {realism.liveDomVerified}/{realism.totalSteps}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowRealismInfo(!showRealismInfo)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      {pickLang(
                        lang,
                        showRealismInfo ? 'Hide Explanation' : 'How realistic is this?',
                        showRealismInfo ? 'ব্যাখ্যা লুকান' : 'এটা কতটুকু রিয়েলিস্টিক?'
                      )}
                    </button>
                  </div>

                  {showRealismInfo && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-1 leading-relaxed">
                      <p>
                        <strong>1. {pickLang(lang, 'Spec Check (Syntax & Rules):', 'স্পেক চেক (সিনট্যাক্স ও ইনপুট যাচাই):')}</strong>{' '}
                        {pickLang(
                          lang,
                          'Checks locally that every step has a valid selector and sample data. It does NOT verify a live website.',
                          'এটি শুধু আপনার লেখা সিলেক্টর এবং ইনপুট ডেটা ঠিক আছে কিনা তা চেক করে—আসল ওয়েবসাইটে হিট করে না।'
                        )}
                      </p>
                      <p>
                        <strong>2. {pickLang(lang, 'Probe Live Tab (Real Browser DOM):', 'লাইভ পেজ যাচাই (আসল ব্রাউজার DOM প্রোব):')}</strong>{' '}
                        {pickLang(
                          lang,
                          'When using the Chrome Extension on a live site, "Probe Live Tab" inspects the real DOM to confirm elements exist, are visible, and are enabled.',
                          'ক্রোম এক্সটেনশন দিয়ে আসল ওয়েবসাইট খুলে "লাইভ পেজ যাচাই" দিলে ব্রাউজারের আসল DOM-এ বাটন/ফিল্ড আছে এবং সক্রিয় কিনা তা পরীক্ষা করে।'
                        )}
                      </p>
                      <p>
                        <strong>3. {pickLang(lang, 'Full Real E2E Run (pytest / Playwright):', 'শতভাগ রিয়েল অটোমেশন রান (pytest / Playwright):')}</strong>{' '}
                        {pickLang(
                          lang,
                          'Export or live-record your flow as Python pytest (_test.py) and run "pytest -v --headed" locally to execute real browser clicks, API calls, and database assertions.',
                          'লাইভ কোডজেন বা Export Test থেকে Python pytest (_test.py) নিয়ে টার্মিনালে "pytest -v --headed" চালালে আসল ক্রোম ব্রাউজারে ১০০% রিয়েল এন্ড-টু-এন্ড টেস্ট রান হবে।'
                        )}
                      </p>
                    </div>
                  )}
                </div>

                {/* Search, Status Filter & Bulk Regression Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                    <div className="relative flex-1 min-w-[160px] max-w-xs">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={stepSearch}
                        onChange={(e) => setStepSearch(e.target.value)}
                        placeholder={pickLang(lang, 'Search steps...', 'স্টেপ খুঁজুন...')}
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                      />
                    </div>
                    <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px]">
                      {(
                        [
                          { id: 'all', labelEn: 'All', labelBn: 'সব' },
                          { id: 'passed', labelEn: 'Passed', labelBn: 'পাস' },
                          { id: 'failed', labelEn: 'Failed', labelBn: 'ফেইল' },
                          { id: 'pending', labelEn: 'Not Run', labelBn: 'বাকি' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setStepStatusFilter(tab.id)}
                          className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                            stepStatusFilter === tab.id
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {pickLang(lang, tab.labelEn, tab.labelBn)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeFlow.steps.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleBulkStepStatus('passed')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-900 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {pickLang(lang, 'Pass All', 'সব পাস')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBulkStepStatus('pending')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {pickLang(lang, 'Reset All', 'সব রিসেট')}
                        </button>
                      </>
                    )}
                    <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      <div className="w-20 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-200"
                          style={{ width: `${summary.pct}%` }}
                        />
                      </div>
                      <span>{summary.pct}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {exportPreview && (
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex flex-wrap items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 gap-1">
                      <button
                        type="button"
                        onClick={() => setExportPreview('pytest-py')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                          exportPreview === 'pytest-py'
                            ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        pytest / Python (.py)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportPreview('playwright-ts')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                          exportPreview === 'playwright-ts'
                            ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        TypeScript (.spec.ts)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportPreview('playwright-js')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                          exportPreview === 'playwright-js'
                            ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        JavaScript (.spec.js)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportPreview('json')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                          exportPreview === 'json'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        JSON Schema
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyExport(
                            activeExportContent,
                            exportPreview === 'playwright-ts'
                              ? 'Playwright TS'
                              : exportPreview === 'playwright-js'
                                ? 'Playwright JS'
                                : exportPreview === 'pytest-py'
                                  ? 'pytest Python'
                                  : 'Flow JSON'
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Copy Code
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadCodeFile(activeExportContent, exportPreview, activeFlow.id)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        {exportPreview === 'playwright-ts'
                          ? 'Download .spec.ts'
                          : exportPreview === 'playwright-js'
                            ? 'Download .spec.js'
                            : exportPreview === 'pytest-py'
                              ? 'Download _test.py'
                              : 'Download .json'}
                      </button>
                    </div>
                  </div>
                  <pre className="p-3.5 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto max-h-64 leading-relaxed">
                    {activeExportContent}
                  </pre>
                </div>
              )}

              {showAddStep && (
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-4">
                  {/* 3-Mode Step Input Switcher */}
                  {!editingStepId && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex flex-wrap items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 gap-1">
                        <button
                          type="button"
                          onClick={() => setAddStepMode('record')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                            addStepMode === 'record'
                              ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <Radio className="w-3.5 h-3.5" />
                          {pickLang(lang, 'Record Steps Live', 'রেকর্ড করে যোগ করুন')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddStepMode('codegen')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                            addStepMode === 'codegen'
                              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          {pickLang(lang, 'Setup via Codegen', 'কোডজেন পেস্ট করে সেটআপ')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddStepMode('manual')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                            addStepMode === 'manual'
                              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          {pickLang(lang, 'Manual Step', 'ম্যানুয়াল স্টেপ')}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={resetStepForm}
                        className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {pickLang(lang, 'Close', 'বন্ধ করুন')}
                      </button>
                    </div>
                  )}

                  {/* MODE 1: Record Live Steps directly into Active Flow */}
                  {addStepMode === 'record' && !editingStepId && (
                    <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {pickLang(
                              lang,
                              `Record actions directly into "${activeFlow.name}"`,
                              `সরাসরি "${activeFlow.name}" ফ্লো-তে স্টেপ রেকর্ড করুন`
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {pickLang(
                              lang,
                              'Turn on Recording and click/type on any live website via Chrome Extension — captured steps will populate here automatically.',
                              'রেকর্ডিং চালু করে ক্রোম এক্সটেনশনের মাধ্যমে যেকোনো ওয়েবসাইটে ক্লিক ও টাইপ করুন — সাথে সাথেই স্টেপগুলো এই টেস্ট ফ্লো-তে ইনপুট হয়ে যাবে।'
                            )}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next = !recording.isRecording;
                              onToggleRecording(next);
                              if (next) setShowCodegenStudio(true);
                            }}
                            className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                              recording.isRecording
                                ? 'bg-rose-600 text-white'
                                : 'bg-blue-600 text-white'
                            }`}
                          >
                            {recording.isRecording
                              ? pickLang(lang, 'Stop Recording', 'রেকর্ডিং থামান')
                              : pickLang(lang, 'Start Recording Into Flow', 'ফ্লো-তে রেকর্ড শুরু')}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-medium">
                          <input
                            type="checkbox"
                            checked={autoSyncRecordedToFlow}
                            onChange={(e) => setAutoSyncRecordedToFlow(e.target.checked)}
                          />
                          <span>
                            {pickLang(
                              lang,
                              'Auto-insert recorded actions straight into this flow (zero extra clicks)',
                              'রেকর্ড করার সাথে সাথেই অটোমেটিক এই ফ্লো-তে স্টেপ যোগ হয়ে যাবে'
                            )}
                          </span>
                        </label>

                        {recording.recordedSteps.length > 0 && (
                          <button
                            type="button"
                            onClick={handleImportRecorded}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            {pickLang(
                              lang,
                              `Insert ${recording.recordedSteps.length} Recorded Step(s)`,
                              `${recording.recordedSteps.length}টি রেকর্ড স্টেপ যোগ করুন`
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* MODE 2: Setup Steps via Playwright Codegen (Python pytest / TS / JS) */}
                  {addStepMode === 'codegen' && !editingStepId && (
                    <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {pickLang(
                              lang,
                              'Paste Playwright Codegen Script to Auto-Setup Test Steps',
                              'Playwright Codegen কোড পেস্ট করে অটোমেটিক টেস্ট স্টেপ সেটআপ করুন'
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {pickLang(
                              lang,
                              'Supports Python pytest (page.get_by_test_id / get_by_role / locator) as well as Playwright TypeScript & JavaScript.',
                              'Python pytest, Playwright TypeScript বা JavaScript — যেকোনো Codegen স্ক্রিপ্ট পেস্ট করলেই স্টেপগুলো অটো তৈরি হয়ে যাবে।'
                            )}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {recording.recordedSteps.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setCodegenInput(liveCodegenOutput)}
                              className="px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold cursor-pointer"
                            >
                              {pickLang(lang, 'Use Live Recording Code', 'লাইভ রেকর্ডের কোড নিন')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setCodegenInput(`from playwright.sync_api import Page, expect

def test_codegen_setup(page: Page) -> None:
    page.goto("https://${project.domain}/requests/new")
    page.get_by_test_id("request-type-select").select_option("Annual Time Off")
    page.get_by_test_id("request-days-input").fill("4")
    page.get_by_test_id("approval-password-input").fill("1234")
    page.get_by_test_id("submit-request-btn").click()
    expect(page.get_by_test_id("request-status-badge")).to_be_visible()`)
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            {pickLang(lang, 'Load Sample pytest Codegen', 'নমুনা pytest কোড দিন')}
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={6}
                        value={codegenInput}
                        onChange={(e) => setCodegenInput(e.target.value)}
                        placeholder={`Paste output from "playwright codegen" (Python pytest or TS/JS), e.g.\npage.goto("https://...")\npage.get_by_test_id("email").fill("qa@example.com")\npage.get_by_role("button", name="Sign in").click()`}
                        className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-950 text-emerald-200 font-mono text-xs leading-relaxed"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          {codegenInput.trim() ? (
                            parsedCodegen.steps.length > 0 ? (
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                ✓ {parsedCodegen.steps.length}{' '}
                                {pickLang(lang, 'steps detected', 'টি স্টেপ পাওয়া গেছে')}
                                {parsedCodegen.detectedUrl && (
                                  <span className="ml-2 font-mono text-[11px] text-slate-500">
                                    ({parsedCodegen.detectedUrl})
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">
                                {pickLang(
                                  lang,
                                  'No Playwright actions recognized yet — paste lines containing page.locator(...) or page.get_by_...().',
                                  'কোনো Playwright অ্যাকশন পাওয়া যায়নি — page.locator(...) বা page.get_by_...() যুক্ত লাইন পেস্ট করুন।'
                                )}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400">
                              {pickLang(
                                lang,
                                'Ready to parse Python pytest or TypeScript/JavaScript Codegen.',
                                'Python pytest বা TypeScript/JavaScript কোড পার্স করতে প্রস্তুত।'
                              )}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={parsedCodegen.steps.length === 0}
                            onClick={() => {
                              if (parsedCodegen.steps.length === 0) return;
                              const nextFlows = project.flows.map((f) =>
                                f.id === activeFlow.id
                                  ? {
                                      ...f,
                                      targetUrl: parsedCodegen.detectedUrl || f.targetUrl,
                                      steps: [...f.steps, ...parsedCodegen.steps],
                                    }
                                  : f
                              );
                              onUpdateProject({ ...project, flows: nextFlows });
                              onNotify?.(
                                `Appended ${parsedCodegen.steps.length} Codegen steps to "${activeFlow.name}".`
                              );
                              setCodegenInput('');
                              setShowAddStep(false);
                            }}
                            className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                          >
                            {pickLang(
                              lang,
                              `Append (${parsedCodegen.steps.length}) Steps`,
                              `ফ্লো-তে যোগ করুন (${parsedCodegen.steps.length})`
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={parsedCodegen.steps.length === 0}
                            onClick={() => {
                              if (parsedCodegen.steps.length === 0) return;
                              const nextFlows = project.flows.map((f) =>
                                f.id === activeFlow.id
                                  ? {
                                      ...f,
                                      targetUrl: parsedCodegen.detectedUrl || f.targetUrl,
                                      steps: parsedCodegen.steps,
                                    }
                                  : f
                              );
                              onUpdateProject({ ...project, flows: nextFlows });
                              onNotify?.(
                                `Replaced "${activeFlow.name}" with ${parsedCodegen.steps.length} Codegen steps.`
                              );
                              setCodegenInput('');
                              setShowAddStep(false);
                            }}
                            className="px-3 py-2 rounded-lg border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 disabled:opacity-40 text-xs font-semibold cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                          >
                            {pickLang(lang, 'Replace All Steps', 'আগের স্টেপ বদলে দিন')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MODE 3: Manual Single-Step Form (also used when Editing an existing step) */}
                  {(addStepMode === 'manual' || editingStepId) && (
                    <form
                      onSubmit={handleSaveStep}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                    >
                      <div className="sm:col-span-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {editingStepId ? 'Edit Step Details' : 'Add a New Step Manually'}
                      </div>
                      <input
                        type="text"
                        placeholder="What happens? (e.g. Enter Requested Days)"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        required
                        className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <select
                        value={newAction}
                        onChange={(e) => setNewAction(e.target.value as StepAction)}
                        className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      >
                        {(Object.keys(ACTION_LABELS) as StepAction[]).map((k) => (
                          <option key={k} value={k}>
                            {ACTION_LABELS[k]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder='Element locator (e.g. [data-testid="request-days-input"])'
                        value={newSelector}
                        onChange={(e) => setNewSelector(e.target.value)}
                        required
                        className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        placeholder="Sample text to enter (passwords masked automatically)"
                        value={newTestData}
                        onChange={(e) => setNewTestData(e.target.value)}
                        className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        placeholder="What should happen? (Expected business rule)"
                        value={newExpectedRule}
                        onChange={(e) => setNewExpectedRule(e.target.value)}
                        className="sm:col-span-2 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <div className="sm:col-span-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={resetStepForm}
                          className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white cursor-pointer"
                        >
                          {editingStepId ? 'Update Step' : 'Save Step'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {filteredSteps.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {activeFlow.steps.length === 0
                      ? 'This test flow has no steps yet'
                      : 'No matching steps found'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    {activeFlow.steps.length === 0
                      ? 'Click "Start Codegen Record" to capture steps & generate Python pytest automatically, or click "Add Step".'
                      : 'Clear your search filter to see all steps in this flow.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-800/40">
                        <th className="py-2.5 px-4 w-10">#</th>
                        <th className="py-2.5 px-4">
                          {pickLang(lang, 'Step & Locator', 'স্টেপ ও লোকেটর')}
                        </th>
                        <th className="py-2.5 px-4">
                          {pickLang(lang, 'Action / Input', 'অ্যাকশন ও ইনপুট')}
                        </th>
                        <th className="py-2.5 px-4">
                          {pickLang(lang, 'Expected Rule', 'প্রত্যাশিত ফলাফল')}
                        </th>
                        <th className="py-2.5 px-4">
                          {pickLang(lang, 'Status & Source', 'স্ট্যাটাস ও উৎস')}
                        </th>
                        <th className="py-2.5 px-4 text-right">
                          {pickLang(lang, 'Actions', 'অ্যাকশন')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {filteredSteps.map((step, index) => {
                        const selHealth = getSelectorHealth(step.targetElement);
                        return (
                          <tr
                            key={step.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="py-3.5 px-4 font-mono tabular-nums text-slate-400">
                              {String(index + 1).padStart(2, '0')}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {step.title}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                                  {step.targetElement}
                                </span>
                                <span
                                  className={`text-[10px] font-mono font-semibold ${
                                    selHealth.tier === 'resilient'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : selHealth.tier === 'moderate'
                                        ? 'text-sky-600 dark:text-sky-400'
                                        : 'text-amber-600 dark:text-amber-400'
                                  }`}
                                >
                                  · {pickLang(lang, selHealth.labelEn, selHealth.labelBn)}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="text-slate-700 dark:text-slate-300 font-medium">
                                {ACTION_LABELS[step.action] || step.action}
                              </div>
                              {step.testData && (
                                <div className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                  {step.isSensitiveData && (
                                    <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  )}
                                  <span>{step.testData}</span>
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 max-w-[240px]">
                              <div className="text-slate-700 dark:text-slate-300">
                                {step.expectedRule}
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                {step.observedResult}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <button
                                type="button"
                                onClick={() => handleToggleStepStatus(step.id)}
                                title={pickLang(lang, 'Click to toggle status', 'স্ট্যাটাস পরিবর্তন করতে ক্লিক করুন')}
                                className="inline-flex items-center gap-1.5 font-medium cursor-pointer whitespace-nowrap"
                              >
                                {step.status === 'passed' ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {pickLang(lang, 'Passed', 'পাস')}
                                  </span>
                                ) : step.status === 'failed' ? (
                                  <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
                                    <XCircle className="w-3.5 h-3.5" />
                                    {pickLang(lang, 'Needs Fix', 'সমস্যা আছে')}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 dark:text-slate-400">
                                    {pickLang(lang, 'Not Run', 'রান হয়নি')}
                                  </span>
                                )}
                              </button>
                              <div className="mt-1 text-[10px] font-mono">
                                {step.verificationMode === 'live_dom' ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                                    <ShieldCheck className="w-3 h-3" />
                                    Live DOM
                                  </span>
                                ) : step.verificationMode === 'spec_check' ? (
                                  <span className="text-slate-400">Spec Check</span>
                                ) : step.status !== 'pending' ? (
                                  <span className="text-slate-400">Recorded / Manual</span>
                                ) : null}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center gap-0.5">
                                {!stepSearch && stepStatusFilter === 'all' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveStep(index, -1)}
                                      disabled={index === 0}
                                      aria-label="Move step up"
                                      className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveStep(index, 1)}
                                      disabled={index === filteredSteps.length - 1}
                                      aria-label="Move step down"
                                      className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleLogBugFromStep(step)}
                                  title={pickLang(lang, 'Log Bug from this step', 'এই স্টেপ থেকে বাগ রিপোর্ট তৈরি করুন')}
                                  aria-label={`Log bug from step ${step.title}`}
                                  className={`p-1.5 rounded cursor-pointer ${
                                    step.status === 'failed'
                                      ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                      : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
                                  }`}
                                >
                                  <Bug className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCloneStep(step)}
                                  title={pickLang(lang, 'Clone step', 'স্টেপ কপি করুন')}
                                  aria-label={`Clone step ${step.title}`}
                                  className="p-1.5 rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEditingStep(step)}
                                  aria-label={`Edit step ${step.title}`}
                                  className="p-1.5 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStep(step.id)}
                                  aria-label={`Delete step ${step.title}`}
                                  className="p-1.5 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'No test flows created yet. Start by creating a flow or recording steps.',
                  'এখনো কোনো টেস্ট ফ্লো তৈরি করা হয়নি। নতুন ফ্লো তৈরি করুন অথবা অ্যাকশন রেকর্ড করুন।'
                )}
              </p>
              <button
                type="button"
                onClick={() => setShowNewFlow(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {pickLang(lang, 'Create First Flow', 'প্রথম ফ্লো তৈরি করুন')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
