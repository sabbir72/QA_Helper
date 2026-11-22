import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Code2,
  Download,
  FileCheck2,
  Globe,
  ImagePlus,
  Layers,
  ListChecks,
  Monitor,
  Play,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import {
  AppLanguage,
  FlowStep,
  ProjectWorkspace,
  QaTestCase,
  ScannedFormField,
  SmartScreenAnalysisResult,
  WebsiteTestRecommendation,
  WorkflowFlow,
} from '../types/flowguard';
import {
  analyzeScreenOrWebsiteWithAi,
  autofillActiveTabFields,
  DomScannedFieldInput,
  isChromeExtensionContext,
  requestVisibleTabScreenshot,
  scanActiveTabFormFields,
} from '../utils/extensionBridge';

interface SmartScreenQaViewProps {
  project: ProjectWorkspace;
  lang: AppLanguage;
  screenshotConsentGranted: boolean;
  onUpdateProject: (updated: ProjectWorkspace) => void;
  onOpenSection: (section: string) => void;
  onNotify?: (message: string) => void;
}

const PRIORITY_BADGE: Record<'P0' | 'P1' | 'P2', string> = {
  P0: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900',
  P1: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900',
  P2: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-900',
};

function buildConsoleAutofillScript(fields: ScannedFormField[], values: Record<string, string>): string {
  const payload = fields.map((f) => ({
    selector: f.selector,
    name: f.name,
    value: values[f.id] ?? f.generatedValue,
  }));
  return `(()=>{const items=${JSON.stringify(payload)};let filled=0;for(const it of items){const el=document.querySelector(it.selector)||(it.name?document.querySelector('[name="'+it.name.replace(/"/g,'\\\\"')+'"]'):null);if(!el||el.disabled||el.readOnly)continue;const t=(el.type||'').toLowerCase();if(t==='checkbox'||t==='radio'){const on=['true','1','yes','on'].includes(String(it.value).toLowerCase());if(el.checked!==on)el.click();}else{const p=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;const s=Object.getOwnPropertyDescriptor(p,'value')?.set;if(s)s.call(el,it.value);else el.value=it.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}el.style.boxShadow='0 0 0 2px #0d9488';filled++;}console.log('VeriPulse Auto-Filled:',filled);})();`;
}

export const SmartScreenQaView: React.FC<SmartScreenQaViewProps> = ({
  project,
  lang,
  screenshotConsentGranted,
  onUpdateProject,
  onOpenSection,
  onNotify,
}) => {
  const savedResult = project.smartScanResult || null;

  const [activeTab, setActiveTab] = useState<'fields' | 'tests'>('fields');
  const [targetUrl, setTargetUrl] = useState<string>(() =>
    savedResult?.pageUrl
      ? savedResult.pageUrl
      : project.domain && project.domain !== 'app.example.com'
        ? `https://${project.domain.replace(/^https?:\/\//i, '')}`
        : ''
  );
  const [locale, setLocale] = useState<'bd' | 'global'>('bd');
  const [dataTone, setDataTone] = useState<'valid' | 'edge'>('valid');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string>('');
  const [domSnapshot, setDomSnapshot] = useState<{
    fields: DomScannedFieldInput[];
    pageTextSample: string;
    pageTitle: string;
    pageUrl: string;
  } | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [setOnPreviewIds, setSetOnPreviewIds] = useState<Record<string, boolean>>({});
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'P0' | 'P1' | 'P2'>('ALL');
  const [copiedKey, setCopiedKey] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const extContext = isChromeExtensionContext();

  // Sync editable map whenever a new analysis loads
  useEffect(() => {
    if (!savedResult?.detectedFields) return;
    const nextMap: Record<string, string> = {};
    for (const f of savedResult.detectedFields) {
      nextMap[f.id] =
        dataTone === 'edge' && f.edgeCaseValue ? f.edgeCaseValue : f.generatedValue;
    }
    setEditedValues(nextMap);
    setSetOnPreviewIds({});
  }, [savedResult?.analyzedAt]);

  // Global Ctrl+V screenshot paste handler
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              setScreenshotDataUrl(reader.result);
              setErrorBanner('');
              onNotify?.(
                pickLang(
                  lang,
                  'Screenshot pasted! Running field & website analysis...',
                  'স্ক্রিনশট পেস্ট হয়েছে! ফিল্ড ও সাইট স্ক্যান করা হচ্ছে...'
                )
              );
              void runAnalysis({ imageBase64: reader.result });
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [locale, dataTone, lang, targetUrl]);

  const runAnalysis = async (overrides?: {
    imageBase64?: string;
    url?: string;
    domFields?: DomScannedFieldInput[];
    pageTextSample?: string;
    pageTitle?: string;
    toneOverride?: 'valid' | 'edge';
    localeOverride?: 'bd' | 'global';
  }) => {
    const useImg = overrides?.imageBase64 ?? screenshotDataUrl;
    const rawUrl = (overrides?.url ?? targetUrl).trim();
    const normalizedUrl =
      rawUrl && !/^https?:\/\//i.test(rawUrl) ? `https://${rawUrl}` : rawUrl;
    const useDom = overrides?.domFields ?? domSnapshot?.fields;
    const useText = overrides?.pageTextSample ?? domSnapshot?.pageTextSample;
    const useTitle = overrides?.pageTitle ?? domSnapshot?.pageTitle;
    const useTone = overrides?.toneOverride ?? dataTone;
    const useLocale = overrides?.localeOverride ?? locale;

    if (!useImg && !normalizedUrl && (!useDom || useDom.length === 0) && !useText) {
      setErrorBanner(
        pickLang(
          lang,
          'Capture a window screen, upload/paste a screenshot, scan an open Chrome tab, or enter a website URL first.',
          'প্রথমে কোনো উইন্ডো স্ক্রিন ক্যাপচার করুন, স্ক্রিনশট দিন, ক্রোম ট্যাব স্ক্যান করুন অথবা ওয়েবসাইট URL লিখুন।'
        )
      );
      return;
    }

    setAnalyzing(true);
    setErrorBanner('');
    try {
      const res = await analyzeScreenOrWebsiteWithAi({
        mode: 'fields_and_tests',
        url: normalizedUrl || undefined,
        pageTitle: useTitle || undefined,
        locale: useLocale,
        dataTone: useTone,
        lang,
        imageBase64: useImg || undefined,
        domFields: useDom,
        pageTextSample: useText,
      });

      if (!res.ok || !res.analysis) {
        setErrorBanner(
          res.error ||
            pickLang(lang, 'Screen/Website scan failed.', 'স্ক্রিন/ওয়েবসাইট স্ক্যান ব্যর্থ হয়েছে।')
        );
        return;
      }

      onUpdateProject({
        ...project,
        smartScanResult: res.analysis,
      });

      const nextVals: Record<string, string> = {};
      for (const f of res.analysis.detectedFields) {
        nextVals[f.id] = f.generatedValue;
      }
      setEditedValues(nextVals);
      setSetOnPreviewIds({});

      if (res.analysis.detectedFields.length === 0 && res.analysis.majorTests.length > 0) {
        setActiveTab('tests');
      }

      onNotify?.(
        pickLang(
          lang,
          `Detected ${res.analysis.detectedFields.length} fields and ${res.analysis.majorTests.length} major QA checks!`,
          `${res.analysis.detectedFields.length}টি ডাটা ফিল্ড ও ${res.analysis.majorTests.length}টি মেজর টেস্ট সাজেস্ট করা হয়েছে!`
        )
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCaptureWindowScreen = async () => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      setErrorBanner(
        pickLang(
          lang,
          'Screen capture API is not available in this browser context. Try Upload/Paste Screenshot or Chrome Tab Scan.',
          'এই ব্রাউজারে স্ক্রিন ক্যাপচার API সাপোর্ট নেই। অনুগ্রহ করে স্ক্রিনশট আপলোড/পেস্ট বা Chrome Tab স্ক্যান ব্যবহার করুন।'
        )
      );
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 180));

      const maxW = 1440;
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const scale = vw > maxW ? maxW / vw : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        setScreenshotDataUrl(dataUrl);
        setDomSnapshot(null);
        await runAnalysis({ imageBase64: dataUrl, domFields: undefined, pageTextSample: undefined });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!/cancel|abort|denied/i.test(msg)) {
        setErrorBanner(msg || 'Screen capture cancelled.');
      }
    } finally {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    }
  };

  const handleUploadScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setScreenshotDataUrl(reader.result);
        setDomSnapshot(null);
        void runAnalysis({ imageBase64: reader.result, domFields: undefined, pageTextSample: undefined });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleScanActiveChromeTab = async () => {
    setErrorBanner('');
    const scanRes = await scanActiveTabFormFields();
    if (!scanRes.ok) {
      setErrorBanner(scanRes.error || 'Could not scan active browser tab.');
      return;
    }

    let tabShot = '';
    if (screenshotConsentGranted) {
      const cap = await requestVisibleTabScreenshot(true);
      if (cap.ok && cap.dataUrl) {
        tabShot = cap.dataUrl;
        setScreenshotDataUrl(cap.dataUrl);
      }
    }

    if (scanRes.pageUrl) {
      setTargetUrl(scanRes.pageUrl);
    }
    setDomSnapshot({
      fields: scanRes.fields,
      pageTextSample: scanRes.pageTextSample || '',
      pageTitle: scanRes.pageTitle || '',
      pageUrl: scanRes.pageUrl || '',
    });

    await runAnalysis({
      url: scanRes.pageUrl,
      pageTitle: scanRes.pageTitle,
      domFields: scanRes.fields,
      pageTextSample: scanRes.pageTextSample,
      imageBase64: tabShot || undefined,
    });
  };

  const handleSetAndFillFields = async () => {
    if (!savedResult || savedResult.detectedFields.length === 0) return;

    const nextSetFlags: Record<string, boolean> = {};
    const payload = savedResult.detectedFields.map((f) => {
      nextSetFlags[f.id] = true;
      return {
        selector: f.selector,
        name: f.name,
        value: editedValues[f.id] ?? f.generatedValue,
      };
    });
    setSetOnPreviewIds(nextSetFlags);

    if (extContext) {
      const res = await autofillActiveTabFields(payload);
      if (res.ok) {
        onNotify?.(
          pickLang(
            lang,
            `Auto-filled ${res.filledCount} field(s) directly on the active window!`,
            `সক্রিয় উইন্ডোর ${res.filledCount}টি ফিল্ডে ডাটা সেট করা হয়েছে!`
          )
        );
        return;
      }
      onNotify?.(res.error || 'Applied to Studio preview.');
      return;
    }

    onNotify?.(
      pickLang(
        lang,
        `Generated data set into ${payload.length} scanned field(s)! Copy JS snippet or use Extension Side Panel to inject into external tabs.`,
        `${payload.length}টি স্ক্যানকৃত ফিল্ডে ডাটা সেট করা হয়েছে! বাইরের ব্রাউজার ট্যাবে বসাতে Copy JS বা Extension ব্যবহার করুন।`
      )
    );
  };

  const handleSwitchAllDataTone = (nextTone: 'valid' | 'edge') => {
    setDataTone(nextTone);
    if (!savedResult?.detectedFields) return;
    const nextVals: Record<string, string> = {};
    for (const f of savedResult.detectedFields) {
      nextVals[f.id] =
        nextTone === 'edge' && f.edgeCaseValue ? f.edgeCaseValue : f.generatedValue;
    }
    setEditedValues(nextVals);
  };

  const handleToggleTestChecked = (testId: string) => {
    if (!savedResult) return;
    const nextTests = savedResult.majorTests.map((t) =>
      t.id === testId ? { ...t, checked: !t.checked } : t
    );
    onUpdateProject({
      ...project,
      smartScanResult: { ...savedResult, majorTests: nextTests },
    });
  };

  const handleSaveTestsToStudio = (items: WebsiteTestRecommendation[]) => {
    if (items.length === 0) return;
    const existing = project.testCases || [];
    let counter = existing.length + 1;
    const created: QaTestCase[] = items.map((item) => {
      const tcKey = `TC-${String(counter++).padStart(3, '0')}`;
      return {
        id: `tc_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tcKey,
        title: item.title,
        module: item.targetArea || item.category,
        priority: item.priority,
        precondition: `Target: ${savedResult?.pageUrl || savedResult?.pageTitle || project.domain}`,
        steps: item.howToTest,
        testData: item.whyImportant,
        expectedResult: item.expectedResult,
        actualResult: '',
        status: item.checked ? 'passed' : 'untested',
        updatedAt: new Date().toISOString(),
      };
    });
    onUpdateProject({
      ...project,
      testCases: [...created, ...existing],
    });
    onNotify?.(
      pickLang(
        lang,
        `Saved ${created.length} test case(s) to Bug & Test Studio!`,
        `${created.length}টি টেস্ট কেস বাগ ও টেস্ট স্টুডিওতে যোগ করা হয়েছে!`
      )
    );
  };

  const handleSendFieldsToFlow = () => {
    if (!savedResult || savedResult.detectedFields.length === 0) return;
    const steps: FlowStep[] = savedResult.detectedFields.map((f, idx) => ({
      id: `step_scan_${Date.now()}_${idx}`,
      title: `Fill ${f.label}`,
      action: f.fieldType === 'select' ? 'select' : f.fieldType === 'checkbox' ? 'check' : 'type',
      targetElement: f.selector,
      testData: f.isSensitive ? '••••••••' : editedValues[f.id] ?? f.generatedValue,
      isSensitiveData: Boolean(f.isSensitive),
      expectedRule: f.rationale || `Validates ${f.fieldType} input`,
      observedResult: 'Generated from AI Screen Scanner',
      status: 'pending',
    }));

    const newFlow: WorkflowFlow = {
      id: `flow_scan_${Date.now()}`,
      name: `${savedResult.pageTitle || 'Screen'} Auto-Fill Flow`,
      module: savedResult.appType || 'Screen Scan',
      targetUrl: savedResult.pageUrl || `https://${project.domain}/`,
      lastRunAt: null,
      steps,
    };

    onUpdateProject({
      ...project,
      flows: [newFlow, ...project.flows],
    });
    onNotify?.(
      pickLang(
        lang,
        `Created Workflow Flow "${newFlow.name}" with ${steps.length} auto-fill steps!`,
        `${steps.length}টি অটো-ফিল স্টেপসহ নতুন ফ্লো তৈরি হয়েছে!`
      )
    );
    onOpenSection('flows');
  };

  const handleCopy = async (text: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1800);
      onNotify?.(`${label} ${pickLang(lang, 'copied!', 'কপি হয়েছে!')}`);
    } catch {
      onNotify?.('Clipboard unavailable.');
    }
  };

  const handleExportChecklistMarkdown = () => {
    if (!savedResult) return;
    const lines = [
      `# QA Test Plan — ${savedResult.pageTitle}`,
      savedResult.pageUrl ? `URL: ${savedResult.pageUrl}` : '',
      `App Type: ${savedResult.appType}`,
      '',
      `## Summary`,
      savedResult.summary,
      '',
      `## Major Things to Test (${savedResult.majorTests.length})`,
      ...savedResult.majorTests.map(
        (t, idx) =>
          `${idx + 1}. [${t.checked ? 'x' : ' '}] **[${t.priority}] ${t.title}** (${t.category})\n   - Why: ${t.whyImportant}\n   - Steps: ${t.howToTest}\n   - Expected: ${t.expectedResult}`
      ),
    ]
      .filter((l) => l !== undefined)
      .join('\n');

    const blob = new Blob([lines], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veripulse-site-qa-plan-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onNotify?.(pickLang(lang, 'Exported QA Checklist (.md).', 'QA চেকলিস্ট (.md) ডাউনলোড হয়েছে।'));
  };

  const filteredTests = useMemo(() => {
    const list = savedResult?.majorTests || [];
    if (priorityFilter === 'ALL') return list;
    return list.filter((t) => t.priority === priorityFilter);
  }, [savedResult?.majorTests, priorityFilter]);

  const testStats = useMemo(() => {
    const list = savedResult?.majorTests || [];
    const checked = list.filter((t) => t.checked).length;
    const p0 = list.filter((t) => t.priority === 'P0').length;
    const p1 = list.filter((t) => t.priority === 'P1').length;
    const p2 = list.filter((t) => t.priority === 'P2').length;
    const pct = list.length > 0 ? Math.round((checked / list.length) * 100) : 0;
    return { total: list.length, checked, p0, p1, p2, pct };
  }, [savedResult?.majorTests]);

  return (
    <div className="space-y-5">
      {/* Hero & Multi-Source Scanner Bar */}
      <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  'AI Window Screen Scanner, Auto-Fill & Site Test Planner',
                  'স্মার্ট উইন্ডো স্ক্রিন স্ক্যানার, ডাটা অটো-ফিল ও সাইট টেস্ট প্ল্যানার'
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
                {pickLang(
                  lang,
                  'Scan any window screen, screenshot, active browser tab, or website URL — automatically generate & set realistic QA data for all form fields, and get a prioritized checklist of major things to test.',
                  'যেকোনো উইন্ডো স্ক্রিন, স্ক্রিনশট, ক্রোম ট্যাব বা ওয়েবসাইট URL স্ক্যান করুন — সব ডাটা ফিল্ড চিনে অটো-ডাটা জেনারেট ও সেট করবে এবং সাইটের মেজর কী কী টেস্ট করা উচিত তার পূর্ণাঙ্গ লিস্ট তৈরি করবে।'
                )}
              </p>
            </div>
          </div>

          {/* Locale + Data Tone Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setLocale('bd')}
                className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                  locale === 'bd'
                    ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                BD Data
              </button>
              <button
                type="button"
                onClick={() => setLocale('global')}
                className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                  locale === 'global'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Global
              </button>
            </div>

            <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => handleSwitchAllDataTone('valid')}
                className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                  dataTone === 'valid'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {pickLang(lang, 'Valid QA', 'সঠিক ডাটা')}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchAllDataTone('edge')}
                className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                  dataTone === 'edge'
                    ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {pickLang(lang, 'Edge / Negative', 'নেগেটিভ/বাউন্ডারি')}
              </button>
            </div>
          </div>
        </div>

        {/* 4 Capture / Scan Triggers + URL Input */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
          <div className="lg:col-span-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={analyzing}
              onClick={handleCaptureWindowScreen}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Monitor className="w-3.5 h-3.5" />
              {pickLang(lang, 'Capture Window / Screen', 'উইন্ডো স্ক্রিন ক্যাপচার')}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleUploadScreenshot}
              className="hidden"
            />
            <button
              type="button"
              disabled={analyzing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <ImagePlus className="w-3.5 h-3.5 text-indigo-500" />
              {pickLang(lang, 'Upload / Paste (Ctrl+V)', 'স্ক্রিনশট আপলোড / পেস্ট')}
            </button>

            <button
              type="button"
              disabled={analyzing}
              onClick={handleScanActiveChromeTab}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-300 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/30 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/50 cursor-pointer whitespace-nowrap"
            >
              <ScanSearch className="w-3.5 h-3.5" />
              {pickLang(lang, 'Scan Active Chrome Tab', 'অ্যাক্টিভ ক্রোম ট্যাব স্ক্যান')}
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setScreenshotDataUrl('');
              setDomSnapshot(null);
              void runAnalysis({
                url: targetUrl,
                imageBase64: '',
                domFields: undefined,
                pageTextSample: undefined,
              });
            }}
            className="lg:col-span-6 flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder={pickLang(
                  lang,
                  'Enter any website URL (e.g. https://example.com/checkout)',
                  'ওয়েবসাইট URL দিন (যেমন: https://example.com/checkout)'
                )}
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {analyzing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {analyzing
                ? pickLang(lang, 'Scanning...', 'স্ক্যান হচ্ছে...')
                : pickLang(lang, 'Scan Website', 'সাইট স্ক্যান')}
            </button>
          </form>
        </div>

        {errorBanner && (
          <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorBanner}</span>
          </div>
        )}
      </div>

      {/* Analysis Loading Skeleton */}
      {analyzing && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 p-6 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
          <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
          <span>
            {pickLang(
              lang,
              'Scanning screen data fields, generating realistic QA payloads, and analyzing major website test scenarios...',
              'স্ক্রিনের ডাটা ফিল্ড স্ক্যান, অটো-ডাটা তৈরি এবং ওয়েবসাইটের মেজর টেস্ট লিস্ট বিশ্লেষণ করা হচ্ছে...'
            )}
          </span>
        </div>
      )}

      {/* Results View */}
      {savedResult ? (
        <>
          {/* Summary Strip + Sub-Tabs */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold">
                    {savedResult.appType}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {savedResult.pageTitle}
                  </h3>
                  {savedResult.pageUrl && (
                    <span className="text-[11px] font-mono text-slate-400 truncate max-w-xs">
                      {savedResult.pageUrl}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {savedResult.summary}
                </p>
              </div>

              <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('fields')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    activeTab === 'fields'
                      ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Auto-Fill Fields', 'ফিল্ড অটো-ফিল')} (
                  {savedResult.detectedFields.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('tests')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    activeTab === 'tests'
                      ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Major Tests Checklist', 'মেজর টেস্ট লিস্ট')} (
                  {savedResult.majorTests.length})
                </button>
              </div>
            </div>
          </div>

          {/* Tab 1: Auto-Generate & Set Window Data Fields */}
          {activeTab === 'fields' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Fields Table & Controls */}
              <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {pickLang(
                      lang,
                      'Scanned Window Data Fields & Generated QA Payloads',
                      'স্ক্যানকৃত ডাটা ফিল্ড ও অটো-জেনারেটেড ডাটা'
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={savedResult.detectedFields.length === 0}
                      onClick={handleSetAndFillFields}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      {extContext
                        ? pickLang(lang, 'Set & Auto-Fill Active Tab', 'অ্যাক্টিভ ট্যাবে ডাটা সেট করুন')
                        : pickLang(lang, 'Set Data to Fields', 'ফিল্ডে ডাটা সেট করুন')}
                    </button>
                    <button
                      type="button"
                      disabled={savedResult.detectedFields.length === 0}
                      onClick={() =>
                        handleCopy(
                          buildConsoleAutofillScript(savedResult.detectedFields, editedValues),
                          'js',
                          'Auto-Fill JS'
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {copiedKey === 'js' ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Code2 className="w-3 h-3" />
                      )}
                      {pickLang(lang, 'Copy Auto-Fill JS', 'অটো-ফিল JS কপি')}
                    </button>
                    <button
                      type="button"
                      disabled={savedResult.detectedFields.length === 0}
                      onClick={handleSendFieldsToFlow}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer"
                    >
                      <Layers className="w-3 h-3" />
                      {pickLang(lang, 'Save to Flows', 'ফ্লো-তে নিন')}
                    </button>
                  </div>
                </div>

                {savedResult.detectedFields.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    {pickLang(
                      lang,
                      'No form input fields were found on this page/screen. Check the Major Tests Checklist tab for full website QA checks!',
                      'এই পেজ বা স্ক্রিনে কোনো ফর্ম ইনপুট ফিল্ড পাওয়া যায়নি। ওয়েবসাইটের মেজর টেস্ট লিস্ট দেখতে পাশের ট্যাবে ক্লিক করুন।'
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60">
                          <th className="py-2.5 px-3">{pickLang(lang, 'Field', 'ফিল্ড নাম')}</th>
                          <th className="py-2.5 px-3">{pickLang(lang, 'Selector', 'সিলেক্টর')}</th>
                          <th className="py-2.5 px-3">{pickLang(lang, 'Generated Value', 'জেনারেটেড ডাটা')}</th>
                          <th className="py-2.5 px-3 text-right">{pickLang(lang, 'Quick Swap', 'বদলান')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {savedResult.detectedFields.map((field) => {
                          const currentVal = editedValues[field.id] ?? field.generatedValue;
                          const isSet = Boolean(setOnPreviewIds[field.id]);
                          return (
                            <tr key={field.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                              <td className="py-2.5 px-3 align-top">
                                <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                  <span>{field.label}</span>
                                  {field.required && (
                                    <span className="text-rose-500 font-bold">*</span>
                                  )}
                                  {isSet && (
                                    <span className="px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 text-[9px] font-mono font-bold">
                                      SET
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                  {field.fieldType}
                                  {field.rationale ? ` · ${field.rationale}` : ''}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 align-top font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-[160px] truncate">
                                {field.selector}
                              </td>
                              <td className="py-2.5 px-3 align-top min-w-[200px]">
                                {field.options && field.options.length > 0 ? (
                                  <select
                                    value={currentVal}
                                    onChange={(e) =>
                                      setEditedValues((prev) => ({
                                        ...prev,
                                        [field.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                  >
                                    {field.options.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={currentVal}
                                    onChange={(e) =>
                                      setEditedValues((prev) => ({
                                        ...prev,
                                        [field.id]: e.target.value,
                                      }))
                                    }
                                    className={`w-full px-2.5 py-1.5 rounded-md border text-xs font-mono ${
                                      isSet
                                        ? 'border-teal-400 dark:border-teal-700 bg-teal-50/40 dark:bg-teal-950/20'
                                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                                    } text-slate-900 dark:text-slate-100`}
                                  />
                                )}
                              </td>
                              <td className="py-2.5 px-3 align-top text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  {field.edgeCaseValue && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditedValues((prev) => ({
                                          ...prev,
                                          [field.id]:
                                            currentVal === field.edgeCaseValue
                                              ? field.generatedValue
                                              : field.edgeCaseValue || field.generatedValue,
                                        }))
                                      }
                                      className="px-2 py-1 rounded border border-amber-200 dark:border-amber-800 text-[10px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                                    >
                                      {currentVal === field.edgeCaseValue
                                        ? pickLang(lang, 'Valid', 'সঠিক')
                                        : pickLang(lang, 'Edge', 'এজ-কেস')}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopy(currentVal, field.id, field.label)
                                    }
                                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                                    title="Copy value"
                                  >
                                    {copiedKey === field.id ? (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                      <ClipboardCopy className="w-3 h-3" />
                                    )}
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
              </div>

              {/* Right Column: Live Window Mirror & Screenshot */}
              <div className="lg:col-span-4 space-y-4">
                {screenshotDataUrl && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="inline-flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-indigo-500" />
                        {pickLang(lang, 'Captured Window Screen', 'ক্যাপচারকৃত উইন্ডো স্ক্রিন')}
                      </span>
                    </div>
                    <img
                      src={screenshotDataUrl}
                      alt="Captured window screen"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 object-contain max-h-56 bg-slate-950"
                    />
                  </div>
                )}

                <div className="rounded-xl border border-teal-200/80 dark:border-teal-900/60 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {pickLang(
                        lang,
                        'Window Field Set Preview (Live Mirror)',
                        'ফিল্ড সেট প্রিভিউ (লাইভ মিরর)'
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const obj: Record<string, string> = {};
                        for (const f of savedResult.detectedFields) {
                          obj[f.name || f.label] = editedValues[f.id] ?? f.generatedValue;
                        }
                        void handleCopy(JSON.stringify(obj, null, 2), 'json', 'JSON Payload');
                      }}
                      className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                    >
                      {copiedKey === 'json'
                        ? pickLang(lang, 'Copied JSON!', 'JSON কপি হয়েছে!')
                        : pickLang(lang, 'Copy JSON', 'JSON কপি')}
                    </button>
                  </div>

                  {savedResult.detectedFields.length === 0 ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {pickLang(
                        lang,
                        'Scan a form window to preview auto-populated fields here.',
                        'যেকোনো ফর্ম উইন্ডো স্ক্যান করলে অটো-সেট ডাটা এখানে প্রিভিউ দেখাবে।'
                      )}
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {savedResult.detectedFields.map((f) => {
                        const val = editedValues[f.id] ?? f.generatedValue;
                        const isSet = Boolean(setOnPreviewIds[f.id]);
                        return (
                          <div
                            key={f.id}
                            className={`rounded-lg border p-2.5 text-xs transition-colors ${
                              isSet
                                ? 'border-teal-400 dark:border-teal-700 bg-teal-50/50 dark:bg-teal-950/30'
                                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {f.label}
                              </span>
                              <span className="font-mono text-[10px]">
                                {isSet ? '✓ SET' : f.fieldType}
                              </span>
                            </div>
                            <div className="font-mono text-xs text-slate-900 dark:text-slate-100 break-all">
                              {val || '—'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Major Website QA Checklist */}
          {activeTab === 'tests' && (
            <div className="space-y-4">
              {/* Progress & Action Toolbar */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                      <FileCheck2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>
                        {pickLang(
                          lang,
                          'Major Things That Should Be Tested on This Website',
                          'এই ওয়েবসাইটে মেজর যা যা টেস্ট করা উচিত'
                        )}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {testStats.checked}/{testStats.total} ({testStats.pct}%)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {(['ALL', 'P0', 'P1', 'P2'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriorityFilter(p)}
                          className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                            priorityFilter === p
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {p === 'ALL'
                            ? `All (${testStats.total})`
                            : p === 'P0'
                              ? `P0 Critical (${testStats.p0})`
                              : p === 'P1'
                                ? `P1 High (${testStats.p1})`
                                : `P2 Medium (${testStats.p2})`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveTestsToStudio(savedResult.majorTests)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {pickLang(
                        lang,
                        'Save All to Bug & Test Studio',
                        'সব টেস্ট কেস স্টুডিওতে সেভ করুন'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportChecklistMarkdown}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {pickLang(lang, 'Export .md', 'এক্সপোর্ট .md')}
                    </button>
                  </div>
                </div>

                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${testStats.pct}%` }}
                  />
                </div>
              </div>

              {/* Checklist Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredTests.map((tc) => (
                  <div
                    key={tc.id}
                    className={`rounded-xl border p-4 shadow-xs space-y-2.5 transition-colors ${
                      tc.checked
                        ? 'border-emerald-300 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-2.5 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={Boolean(tc.checked)}
                          onChange={() => handleToggleTestChecked(tc.id)}
                          className="mt-0.5 rounded border-slate-300 text-indigo-600 cursor-pointer"
                        />
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold ${PRIORITY_BADGE[tc.priority]}`}
                            >
                              {tc.priority}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold">
                              {tc.category}
                            </span>
                            {tc.targetArea && (
                              <span className="text-[10px] font-mono text-slate-400">
                                · {tc.targetArea}
                              </span>
                            )}
                          </div>
                          <h4
                            className={`text-xs font-bold ${
                              tc.checked
                                ? 'line-through text-slate-500 dark:text-slate-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {tc.title}
                          </h4>
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleSaveTestsToStudio([tc])}
                        className="px-2 py-1 rounded border border-indigo-200 dark:border-indigo-800 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer whitespace-nowrap"
                      >
                        + Test Case
                      </button>
                    </div>

                    <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300 pl-6">
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {pickLang(lang, 'Why Test:', 'কেন জরুরি:')}{' '}
                        </span>
                        {tc.whyImportant}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {pickLang(lang, 'How to Test:', 'কীভাবে টেস্ট করবেন:')}{' '}
                        </span>
                        {tc.howToTest}
                      </div>
                      <div>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {pickLang(lang, 'Expected:', 'প্রত্যাশিত ফলাফল:')}{' '}
                        </span>
                        {tc.expectedResult}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        !analyzing && (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-8 text-center space-y-2">
            <Sparkles className="w-7 h-7 text-indigo-500 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {pickLang(
                lang,
                'Ready to Scan Any Window Screen or Website',
                'যেকোনো উইন্ডো স্ক্রিন বা ওয়েবসাইট স্ক্যান করতে প্রস্তুত'
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              {pickLang(
                lang,
                'Click "Capture Window / Screen", paste a screenshot with Ctrl+V, enter a live website URL, or click "Scan Active Chrome Tab" inside the Extension to auto-generate field values and get a major QA checklist.',
                'উপরের "উইন্ডো স্ক্রিন ক্যাপচার" বাটনে ক্লিক করুন, Ctrl+V দিয়ে স্ক্রিনশট পেস্ট করুন, ওয়েবসাইট URL দিন অথবা এক্সটেনশন দিয়ে অ্যাক্টিভ ট্যাব স্ক্যান করুন — সাথে সাথে সব ফিল্ডের ডাটা তৈরি ও সেট হবে এবং মেজর টেস্ট লিস্ট দেখতে পাবেন।'
              )}
            </p>
          </div>
        )
      )}
    </div>
  );
};
