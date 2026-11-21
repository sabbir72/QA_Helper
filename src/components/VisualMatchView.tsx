import React, { useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardPaste,
  Code2,
  Columns2,
  Copy,
  Download,
  Eye,
  Images,
  Layers,
  Monitor,
  Play,
  ScanEye,
  SlidersHorizontal,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import {
  AppLanguage,
  ProjectWorkspace,
  VisualCheckRecord,
} from '../types/flowguard';
import {
  isChromeExtensionContext,
  requestVisibleTabScreenshot,
} from '../utils/extensionBridge';
import {
  compareImagesPixelByPixel,
  VisualDiffResult,
} from '../utils/visualDiff';

interface VisualMatchViewProps {
  project: ProjectWorkspace;
  lang: AppLanguage;
  screenshotConsentGranted: boolean;
  onGrantScreenshotConsent: () => void;
  onUpdateProject: (updated: ProjectWorkspace) => void;
  onNotify?: (message: string) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const VisualMatchView: React.FC<VisualMatchViewProps> = ({
  project,
  lang,
  screenshotConsentGranted,
  onGrantScreenshotConsent,
  onUpdateProject,
  onNotify,
}) => {
  const [checkName, setCheckName] = useState('Screen vs Design Baseline');
  const [refImageUrl, setRefImageUrl] = useState<string>('');
  const [actualImageUrl, setActualImageUrl] = useState<string>('');
  const [sensitivity, setSensitivity] = useState<number>(22);
  const [passThresholdPct, setPassThresholdPct] = useState<number>(95);
  const [scaleToMatch, setScaleToMatch] = useState<boolean>(true);
  const [comparing, setComparing] = useState<boolean>(false);

  const [diffResult, setDiffResult] = useState<VisualDiffResult | null>(null);
  const [inspectMode, setInspectMode] = useState<
    'heatmap' | 'split' | 'onion' | 'sidebyside'
  >('heatmap');
  const [splitPos, setSplitPos] = useState<number>(50);
  const [onionOpacity, setOnionOpacity] = useState<number>(50);
  const [showCodeModal, setShowCodeModal] = useState<boolean>(false);

  const visualChecks: VisualCheckRecord[] = useMemo(
    () => project.visualChecks || [],
    [project.visualChecks]
  );

  const handleUploadImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'ref' | 'actual'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (target === 'ref') {
        setRefImageUrl(dataUrl);
      } else {
        setActualImageUrl(dataUrl);
      }
      setDiffResult(null);
      onNotify?.(
        target === 'ref'
          ? pickLang(lang, 'Loaded Reference Design image.', 'রেফারেন্স ইমেজ লোড হয়েছে।')
          : pickLang(lang, 'Loaded Current Screen image.', 'বর্তমান স্ক্রিন ইমেজ লোড হয়েছে।')
      );
    } catch {
      onNotify?.('Could not read that image file.');
    }
  };

  const handlePasteFromClipboard = async (target: 'ref' | 'actual') => {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      onNotify?.(
        pickLang(
          lang,
          'Clipboard image read is blocked by browser — please upload an image file or drag & drop.',
          'এই ব্রাউজারে ক্লিপবোর্ড ইমেজ পারমিশন নেই — ফাইল আপলোড বা ড্র্যাগ-ড্রপ করুন।'
        )
      );
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          const url = await readFileAsDataUrl(
            new File([blob], 'pasted.png', { type: imgType })
          );
          if (target === 'ref') setRefImageUrl(url);
          else setActualImageUrl(url);
          setDiffResult(null);
          onNotify?.(
            pickLang(lang, 'Pasted image from clipboard!', 'ক্লিপবোর্ড থেকে ইমেজ নেওয়া হয়েছে!')
          );
          return;
        }
      }
      onNotify?.(
        pickLang(lang, 'No image found on clipboard.', 'ক্লিপবোর্ডে কোনো ইমেজ পাওয়া যায়নি।')
      );
    } catch {
      onNotify?.(
        pickLang(
          lang,
          'Clipboard access denied — use Upload Image instead.',
          'ক্লিপবোর্ড অ্যাক্সেস পাওয়া যায়নি — Upload Image ব্যবহার করুন।'
        )
      );
    }
  };

  const handleCaptureChromeTab = async () => {
    if (!isChromeExtensionContext()) {
      onNotify?.(
        pickLang(
          lang,
          'Active Tab Capture works inside the installed Chrome Extension. Try "Capture Screen / Window" or "Upload" here!',
          'একটিভ ট্যাব ক্যাপচার Chrome Extension-এ কাজ করে। এখানে "স্ক্রিন / উইন্ডো ক্যাপচার" বা "আপলোড" ব্যবহার করুন!'
        )
      );
      return;
    }

    if (!screenshotConsentGranted) {
      onGrantScreenshotConsent();
    }

    const res = await requestVisibleTabScreenshot(true);
    if (!res.ok || !res.dataUrl) {
      onNotify?.(res.error || 'Could not capture active browser tab.');
      return;
    }
    setActualImageUrl(res.dataUrl);
    setDiffResult(null);
    onNotify?.(
      pickLang(
        lang,
        'Captured live Chrome tab screenshot!',
        'বর্তমান ক্রোম ট্যাবের স্ক্রিনশট নেওয়া হয়েছে!'
      )
    );
  };

  const handleCaptureDisplayScreen = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      onNotify?.(
        pickLang(
          lang,
          'Screen capture is blocked in this preview frame — please upload a screenshot or use the Chrome Extension.',
          'এই প্রিভিউ ফ্রেমে স্ক্রিন ক্যাপচার ব্লক করা — অনুগ্রহ করে স্ক্রিনশট আপলোড করুন অথবা Chrome Extension ব্যবহার করুন।'
        )
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      await new Promise((r) => setTimeout(r, 180));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameUrl = canvas.toDataURL('image/png');
        setActualImageUrl(frameUrl);
        setDiffResult(null);
      }
      stream.getTracks().forEach((t) => t.stop());
      onNotify?.(
        pickLang(
          lang,
          'Captured current screen frame!',
          'আপনার বর্তমান স্ক্রিন ক্যাপচার করা হয়েছে!'
        )
      );
    } catch {
      onNotify?.(
        pickLang(
          lang,
          'Screen capture cancelled or blocked. You can upload a screenshot directly.',
          'স্ক্রিন ক্যাপচার বাতিল হয়েছে। আপনি সরাসরি স্ক্রিনশট আপলোড করেও ম্যাচ করতে পারবেন।'
        )
      );
    }
  };

  const handleRunComparison = async (
    customRef?: string,
    customActual?: string,
    customName?: string
  ) => {
    const rSrc = customRef || refImageUrl;
    const aSrc = customActual || actualImageUrl;
    if (!rSrc || !aSrc) {
      onNotify?.(
        pickLang(
          lang,
          'Please provide both your Reference Image and Current Screen image first.',
          'ম্যাচ চেক করতে আপনার দেয়া ইমেজ এবং বর্তমান স্ক্রিন — দুটিই দিন।'
        )
      );
      return;
    }

    setComparing(true);
    try {
      const result = await compareImagesPixelByPixel(
        rSrc,
        aSrc,
        sensitivity,
        scaleToMatch
      );
      setDiffResult(result);

      const passed = result.matchPct >= passThresholdPct;
      const record: VisualCheckRecord = {
        id: `vis_${Date.now()}`,
        name: (customName || checkName).trim() || 'Screen vs Image Check',
        matchPct: result.matchPct,
        passThresholdPct,
        sensitivity,
        passed,
        refSize: `${result.refWidth}×${result.refHeight}`,
        actualSize: `${result.actualWidth}×${result.actualHeight}`,
        hotspots: result.hotspots,
        checkedAt: new Date().toISOString(),
      };
      onUpdateProject({
        ...project,
        visualChecks: [record, ...visualChecks],
      });
      onNotify?.(
        passed
          ? pickLang(
              lang,
              `Visual Match Passed: ${result.matchPct}% match!`,
              `স্ক্রিন ম্যাচ পাস: ${result.matchPct}% মিলেছে!`
            )
          : pickLang(
              lang,
              `Visual Drift Caught: ${result.matchPct}% match (threshold ${passThresholdPct}%).`,
              `স্ক্রিনে অমিল পাওয়া গেছে: ${result.matchPct}% মিলেছে (লক্ষ্য ${passThresholdPct}%)।`
            )
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Could not compare those images.'
      );
    } finally {
      setComparing(false);
    }
  };

  const visualPlaywrightSnippet = useMemo(() => {
    const maxDiffRatio = Math.max(0, (100 - passThresholdPct) / 100).toFixed(3);
    const safeName = checkName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'screen-baseline';
    return `import { test, expect } from '@playwright/test';

// Visual Regression Check: ${checkName}
test('${checkName.replace(/'/g, "\\'")}', async ({ page }) => {
  await page.goto('https://${project.domain}/');
  await expect(page).toHaveScreenshot('${safeName}.png', {
    maxDiffPixelRatio: ${maxDiffRatio},
  });
});`;
  }, [checkName, passThresholdPct, project.domain]);

  const didPass = diffResult ? diffResult.matchPct >= passThresholdPct : false;

  return (
    <div className="space-y-5">
      {/* Pink-Themed Header */}
      <div className="rounded-xl border border-pink-200/80 dark:border-pink-900/60 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-100 dark:bg-pink-950/70 text-pink-700 dark:text-pink-400 flex items-center justify-center shrink-0">
              <ScanEye className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  'Screen vs Reference Image Visual Matcher',
                  'বর্তমান স্ক্রিন ও ইমেজ ম্যাচ ভেরিফায়ার (Visual QA)'
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'Upload your Figma/design reference image, capture your current browser screen, and spot pixel differences instantly.',
                  'আপনার দেয়া ডিজাইন বা রেফারেন্স ইমেজের সাথে বর্তমান স্ক্রিন পিক্সেল-বাই-পিক্সেল মিলছে কিনা তা হিটম্যাপ ও স্লাইডার দিয়ে যাচাই করুন।'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCodeModal(!showCodeModal)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5" />
              Playwright Snapshot
            </button>
          </div>
        </div>

        {/* Comparison Settings Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {pickLang(lang, 'Check Name', 'চেকের নাম')}
            </label>
            <input
              type="text"
              value={checkName}
              onChange={(e) => setCheckName(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {pickLang(
                lang,
                `Pass Threshold (${passThresholdPct}% match)`,
                `পাস সীমা (${passThresholdPct}% মিল)`
              )}
            </label>
            <input
              type="range"
              min={70}
              max={100}
              step={1}
              value={passThresholdPct}
              onChange={(e) => setPassThresholdPct(Number(e.target.value))}
              className="w-full accent-pink-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {pickLang(
                lang,
                `Color Tolerance (${sensitivity} px delta)`,
                `রঙের ছাড় (${sensitivity} পিক্সেল)`
              )}
            </label>
            <input
              type="range"
              min={4}
              max={60}
              step={2}
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              className="w-full accent-pink-600"
            />
          </div>

          <div className="flex items-end pb-1">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={scaleToMatch}
                onChange={(e) => setScaleToMatch(e.target.checked)}
              />
              <span>
                {pickLang(
                  lang,
                  'Auto-align image dimensions',
                  'সাইজ অটো-অ্যালাইন করুন'
                )}
              </span>
            </label>
          </div>
        </div>
      </div>

      {showCodeModal && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-pink-400">
              Playwright Visual Snapshot Assertion
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(visualPlaywrightSnippet);
                  onNotify?.('Copied Playwright visual test snippet!');
                } catch {
                  // Ignore
                }
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 bg-slate-900 text-slate-200 cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
          </div>
          <pre className="p-3 rounded-lg bg-slate-900 text-[11px] font-mono text-pink-200 overflow-x-auto">
            {visualPlaywrightSnippet}
          </pre>
        </div>
      )}

      {/* Dual Input Cards: Reference Design Image vs Current Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Reference / Given Image */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  '1. Your Reference / Design Image',
                  '১. আপনার দেয়া রেফারেন্স ইমেজ'
                )}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'Upload a Figma design, mockup, or expected baseline screenshot.',
                  'ডিজাইন (Figma PNG/JPG) বা সঠিক স্ক্রিনশট দিন।'
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handlePasteFromClipboard('ref')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Paste
              </button>
              <label className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {pickLang(lang, 'Upload Image', 'ইমেজ দিন')}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUploadImage(e, 'ref')}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith('image/')) {
                const url = await readFileAsDataUrl(file);
                setRefImageUrl(url);
                setDiffResult(null);
              }
            }}
            className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 min-h-[210px] flex items-center justify-center overflow-hidden p-2"
          >
            {refImageUrl ? (
              <img
                src={refImageUrl}
                alt="Reference baseline"
                className="max-h-60 w-auto object-contain rounded"
              />
            ) : (
              <div className="text-center space-y-1.5 p-4 text-xs text-slate-400">
                <Images className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                <div>
                  {pickLang(
                    lang,
                    'Drag & drop reference image here, or click Upload / Paste.',
                    'এখানে আপনার ইমেজ ড্র্যাগ করে ছাড়ুন বা ওপরে "ইমেজ দিন" চাপুন।'
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Current Screen Capture / Screenshot */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  '2. Current Browser Screen',
                  '২. বর্তমান স্ক্রিন ক্যাপচার'
                )}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'Capture your active Chrome tab, window screen, or upload a screenshot.',
                  'বর্তমান ট্যাব বা উইন্ডো সরাসরি ক্যাপচার করুন অথবা স্ক্রিনশট আপলোড করুন।'
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleCaptureChromeTab}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                {pickLang(lang, 'Capture Active Tab', 'ট্যাব ক্যাপচার')}
              </button>
              <button
                type="button"
                onClick={handleCaptureDisplayScreen}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Monitor className="w-3.5 h-3.5" />
                {pickLang(lang, 'Screen / Window', 'স্ক্রিন ক্যাপচার')}
              </button>
              <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUploadImage(e, 'actual')}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith('image/')) {
                const url = await readFileAsDataUrl(file);
                setActualImageUrl(url);
                setDiffResult(null);
              }
            }}
            className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 min-h-[210px] flex items-center justify-center overflow-hidden p-2"
          >
            {actualImageUrl ? (
              <img
                src={actualImageUrl}
                alt="Current screen"
                className="max-h-60 w-auto object-contain rounded"
              />
            ) : (
              <div className="text-center space-y-1.5 p-4 text-xs text-slate-400">
                <Monitor className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                <div>
                  {pickLang(
                    lang,
                    'Click "Capture Active Tab", "Screen / Window", or drop a screenshot here.',
                    '"ট্যাব ক্যাপচার" বা "স্ক্রিন ক্যাপচার" চাপুন, অথবা স্ক্রিনশট এখানে ছাড়ুন।'
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Primary Compare Action Button */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={!refImageUrl || !actualImageUrl || comparing}
          onClick={() => handleRunComparison()}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 disabled:opacity-45 text-white text-sm font-bold shadow-sm cursor-pointer transition-colors"
        >
          <Play className="w-4 h-4" />
          {comparing
            ? pickLang(lang, 'Comparing Pixels...', 'পিক্সেল ম্যাচ চেক হচ্ছে...')
            : pickLang(lang, 'Compare Screen vs Image Now', 'বর্তমান স্ক্রিন ও ইমেজ ম্যাচ চেক করুন')}
        </button>
      </div>

      {/* Visual Diff Result & 4 Interactive Viewers */}
      {diffResult && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          {/* Score Banner */}
          <div
            className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4 ${
              didPass
                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30'
                : 'border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30'
            }`}
          >
            <div className="flex items-start gap-3">
              {didPass ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {diffResult.matchPct}%{' '}
                    {pickLang(lang, 'Visual Match', 'ম্যাচ করেছে')}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                      didPass
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {didPass ? 'PASS' : 'MISMATCH'}
                  </span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                  Diff: {diffResult.diffPct}% ({diffResult.mismatchedPixels.toLocaleString()}{' '}
                  / {diffResult.totalPixels.toLocaleString()} px) · Ref:{' '}
                  {diffResult.refWidth}×{diffResult.refHeight} · Screen:{' '}
                  {diffResult.actualWidth}×{diffResult.actualHeight}
                </div>
                {diffResult.hotspots.length > 0 && (
                  <div className="text-[11px] text-rose-700 dark:text-rose-300 font-medium">
                    {pickLang(lang, 'Changed Zones:', 'যে জায়গাগুলোতে অমিল পাওয়া গেছে:')}{' '}
                    {diffResult.hotspots.join(' · ')}
                  </div>
                )}
              </div>
            </div>

            <a
              href={diffResult.diffImageUrl}
              download={`visual-diff-${Date.now()}.png`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              {pickLang(lang, 'Download Diff PNG', 'ডিফ ইমেজ সেভ')}
            </a>
          </div>

          {/* 4-Mode Viewer Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 gap-1">
              {(
                [
                  { id: 'heatmap', labelEn: 'Diff Heatmap', labelBn: 'ডিফ হিটম্যাপ', icon: Eye },
                  { id: 'split', labelEn: 'Split Slider', labelBn: 'স্লাইডার ভিউ', icon: SlidersHorizontal },
                  { id: 'onion', labelEn: 'Onion Skin', labelBn: 'স্বচ্ছ ওভারলে', icon: Layers },
                  { id: 'sidebyside', labelEn: 'Side by Side', labelBn: 'পাশাপাশি ৩টি', icon: Columns2 },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setInspectMode(m.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                      inspectMode === m.id
                        ? 'bg-white dark:bg-slate-900 text-pink-700 dark:text-pink-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {pickLang(lang, m.labelEn, m.labelBn)}
                  </button>
                );
              })}
            </div>

            {inspectMode === 'split' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Slider: {splitPos}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={splitPos}
                  onChange={(e) => setSplitPos(Number(e.target.value))}
                  className="w-40 accent-pink-600"
                />
              </div>
            )}

            {inspectMode === 'onion' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Overlay Opacity: {onionOpacity}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={onionOpacity}
                  onChange={(e) => setOnionOpacity(Number(e.target.value))}
                  className="w-40 accent-pink-600"
                />
              </div>
            )}
          </div>

          {/* Active Inspection Canvas */}
          {inspectMode === 'heatmap' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-3 flex flex-col items-center gap-2">
              <div className="text-[11px] text-slate-500">
                {pickLang(
                  lang,
                  'Bright pink pixels show exact differences between your Current Screen and Reference Image.',
                  'গোলাপি রঙের অংশগুলো আপনার ইমেজ এবং বর্তমান স্ক্রিনের মধ্যকার পার্থক্য দেখাচ্ছে।'
                )}
              </div>
              <img
                src={diffResult.diffImageUrl}
                alt="Visual Diff Heatmap"
                className="max-h-[460px] w-auto rounded border border-slate-300 dark:border-slate-700"
              />
            </div>
          )}

          {inspectMode === 'split' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-3 flex justify-center">
              <div className="relative inline-block overflow-hidden rounded border border-slate-300 dark:border-slate-700 max-w-full">
                <img
                  src={actualImageUrl}
                  alt="Current screen"
                  className="max-h-[460px] w-auto block"
                />
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
                >
                  <img
                    src={refImageUrl}
                    alt="Reference design"
                    className="h-full w-full object-contain block"
                  />
                </div>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-pink-600 shadow"
                  style={{ left: `${splitPos}%` }}
                />
              </div>
            </div>
          )}

          {inspectMode === 'onion' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-3 flex justify-center">
              <div className="relative inline-block rounded border border-slate-300 dark:border-slate-700 overflow-hidden">
                <img
                  src={actualImageUrl}
                  alt="Current screen base"
                  className="max-h-[460px] w-auto block"
                />
                <img
                  src={refImageUrl}
                  alt="Reference overlay"
                  style={{ opacity: onionOpacity / 100 }}
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>
            </div>
          )}

          {inspectMode === 'sidebyside' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 bg-slate-50 dark:bg-slate-950 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 text-center">
                  Reference Image
                </div>
                <img src={refImageUrl} alt="Ref" className="w-full h-56 object-contain" />
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 bg-slate-50 dark:bg-slate-950 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 text-center">
                  Current Screen
                </div>
                <img src={actualImageUrl} alt="Current" className="w-full h-56 object-contain" />
              </div>
              <div className="rounded-lg border border-pink-200 dark:border-pink-900 p-2 bg-slate-50 dark:bg-slate-950 space-y-1.5">
                <div className="text-[11px] font-bold text-pink-600 dark:text-pink-400 text-center">
                  Diff Heatmap ({diffResult.diffPct}% diff)
                </div>
                <img
                  src={diffResult.diffImageUrl}
                  alt="Diff"
                  className="w-full h-56 object-contain"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Visual Check History Log */}
      {visualChecks.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              {pickLang(
                lang,
                `Recent Visual Match Checks (${visualChecks.length})`,
                `সাম্প্রতিক ভিজ্যুয়াল ম্যাচ রেকর্ড (${visualChecks.length})`
              )}
            </h3>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {visualChecks.map((vc) => (
              <div
                key={vc.id}
                className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>{vc.name}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        vc.passed
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {vc.matchPct}% Match
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Ref {vc.refSize} vs Screen {vc.actualSize}
                    {vc.hotspots.length > 0 ? ` · ${vc.hotspots.join(', ')}` : ''}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject({
                      ...project,
                      visualChecks: visualChecks.filter((item) => item.id !== vc.id),
                    })
                  }
                  className="p-1.5 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                  aria-label="Delete visual record"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
