import React, { useEffect, useState } from 'react';
import {
  Blocks,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  FolderArchive,
  Puzzle,
  Terminal,
} from 'lucide-react';
import { AppLanguage, ProjectWorkspace } from '../types/flowguard';
import { pickLang } from '../i18n/translations';
import { isChromeExtensionContext } from '../utils/extensionBridge';
import { buildZipBlob, ZipEntryInput } from '../utils/zipBuilder';

interface ExtensionSandboxViewProps {
  project: ProjectWorkspace;
  lang: AppLanguage;
  onOpenSection: (section: string) => void;
  onNotify?: (message: string) => void;
}

const EXTENSION_FILES = [
  {
    name: 'manifest.json',
    path: '/manifest.json',
    desc: 'MV3 permissions, side panel, popup, alarms, notifications & content scripts',
  },
  {
    name: 'background.js',
    path: '/background.js',
    desc: 'Local-first service worker, alarm scheduler & state message router',
  },
  {
    name: 'content.js',
    path: '/content.js',
    desc: 'Live DOM recorder (with password masking), element picker, coverage scanner & role probe',
  },
  {
    name: 'popup.html',
    path: '/popup.html',
    desc: 'Chrome action popup interface',
  },
  {
    name: 'popup.js',
    path: '/popup.js',
    desc: 'Popup state sync, quick self-alert timer, element picker & scanner bridge',
  },
];

export const ExtensionSandboxView: React.FC<ExtensionSandboxViewProps> = ({
  project,
  lang,
  onOpenSection,
  onNotify,
}) => {
  const [selectedFile, setSelectedFile] = useState<string>('manifest.json');
  const [fileContent, setFileContent] = useState<string>('');
  const [copiedFile, setCopiedFile] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const loadFilePreview = async (file: { name: string; path: string }) => {
    setSelectedFile(file.name);
    try {
      const res = await fetch(file.path);
      if (res.ok) {
        setFileContent(await res.text());
      } else {
        setFileContent(`// Unable to load ${file.path}`);
      }
    } catch {
      setFileContent(`// Error loading ${file.path}`);
    }
  };

  useEffect(() => {
    loadFilePreview(EXTENSION_FILES[0]);
  }, []);

  const handleCopyFile = async () => {
    try {
      await navigator.clipboard.writeText(fileContent);
      setCopiedFile(true);
      onNotify?.(`Copied ${selectedFile} to clipboard.`);
      setTimeout(() => setCopiedFile(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadExtensionZip = async () => {
    setDownloadingZip(true);
    try {
      const entries: ZipEntryInput[] = [];
      const textPaths = [
        'manifest.json',
        'background.js',
        'content.js',
        'popup.html',
        'popup.js',
      ];
      for (const p of textPaths) {
        const res = await fetch(`/${p}`);
        if (res.ok) {
          entries.push({ path: p, data: await res.text() });
        }
      }
      for (const size of [16, 48, 128]) {
        const res = await fetch(`/icons/icon${size}.png`);
        if (res.ok) {
          entries.push({
            path: `icons/icon${size}.png`,
            data: new Uint8Array(await res.arrayBuffer()),
          });
        }
      }

      const indexRes = await fetch('/index.html');
      let includedCompiledDashboard = false;
      if (indexRes.ok) {
        const html = await indexRes.text();
        if (html.includes('/assets/') && !html.includes('/src/main.tsx')) {
          entries.push({ path: 'index.html', data: html });
          const assetMatches = Array.from(
            html.matchAll(/["'](\/assets\/[^"']+)["']/g)
          ).map((m) => m[1]);
          for (const assetPath of new Set(assetMatches)) {
            const aRes = await fetch(assetPath);
            if (aRes.ok) {
              entries.push({
                path: assetPath.replace(/^\//, ''),
                data: new Uint8Array(await aRes.arrayBuffer()),
              });
            }
          }
          includedCompiledDashboard = true;
        }
      }

      if (!includedCompiledDashboard) {
        entries.push({
          path: 'index.html',
          data: `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><title>VeriPulse QA Studio</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;max-width:640px;margin:auto;">
  <h1>VeriPulse — Build Instructions</h1>
  <p>This archive includes all Manifest V3 extension core files (<code>manifest.json</code>, <code>background.js</code>, <code>content.js</code>, <code>popup.html</code>, <code>popup.js</code>, and <code>icons/*</code>).</p>
  <p>To compile the full React Studio into <code>dist/</code> for Chrome:</p>
  <pre style="background:#0f172a;color:#f8fafc;padding:12px;border-radius:8px;">npm install && npm run build</pre>
  <p>Then open <code>chrome://extensions</code>, enable <strong>Developer mode</strong>, and click <strong>Load unpacked</strong> selecting the generated <code>dist/</code> folder.</p>
</body>
</html>`,
        });
      }

      entries.push({
        path: 'README.txt',
        data: `VeriPulse — Chrome Extension (Manifest V3)
============================================
Precision SQA Studio & Chrome Extension.

1. Run "npm run build" in the project root to compile the full Workspace into dist/.
2. Open Google Chrome and navigate to chrome://extensions
3. Turn ON "Developer mode" in the top-right corner.
4. Click "Load unpacked" and select the dist/ folder.
5. Pin "VeriPulse" from the extensions puzzle icon.
`,
      });

      const blob = buildZipBlob(entries);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'veripulse-extension-mv3.zip';
      a.click();
      URL.revokeObjectURL(url);
      onNotify?.(
        includedCompiledDashboard
          ? 'Downloaded complete VeriPulse MV3 extension bundle (.zip).'
          : 'Downloaded VeriPulse MV3 extension package (.zip).'
      );
    } catch {
      onNotify?.('Failed to build extension archive.');
    } finally {
      setDownloadingZip(false);
    }
  };

  const extActive = isChromeExtensionContext();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-rose-200/80 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Blocks className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  'VeriPulse Chrome Extension (Manifest V3)',
                  'VeriPulse ক্রোম এক্সটেনশন (Manifest V3)'
                )}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                  extActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {extActive
                  ? pickLang(lang, 'Extension Runtime Active', 'এক্সটেনশন সক্রিয় আছে')
                  : pickLang(lang, 'Ready for Chrome Load Unpacked', 'ক্রোমে লোড করার জন্য প্রস্তুত')}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              {pickLang(
                lang,
                `Install VeriPulse in Google Chrome to record user journeys, probe live DOM permissions, scan UI coverage, and trigger scheduled self alerts on "${project.domain}".`,
                `যেকোনো লাইভ ওয়েবসাইটে (${project.domain}) অ্যাকশন রেকর্ড, Python/Playwright কোডজেন, লাইভ DOM পারমিশন প্রোব, UI স্ক্যান এবং সেলফ অ্যালার্ট চালাতে ক্রোমে এক্সটেনশনটি লোড করুন।`
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownloadExtensionZip}
          disabled={downloadingZip}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
        >
          <Download className="w-4 h-4" />
          {downloadingZip
            ? pickLang(lang, 'Packaging ZIP...', 'ZIP তৈরি হচ্ছে...')
            : pickLang(lang, 'Download Extension (.zip)', 'এক্সটেনশন ডাউনলোড (.zip)')}
        </button>
      </div>

      {/* 4-Step Chrome Installation Guide */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
          <Puzzle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          <span>
            {pickLang(
              lang,
              'Load Unpacked in Google Chrome (4 Quick Steps)',
              'Google Chrome-এ এক্সটেনশন লোড করার ৪টি সহজ ধাপ'
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1.5">
            <div className="font-mono text-[11px] font-bold text-rose-600 dark:text-rose-400">
              STEP 01
            </div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {pickLang(lang, 'Download or Build dist/', 'ZIP ডাউনলোড বা dist/ বিল্ড')}
            </div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              {pickLang(
                lang,
                'Click "Download Extension (.zip)" above and unzip it, or use the compiled dist/ folder.',
                'উপরের বাটন থেকে ZIP ডাউনলোড করে আনজিপ করুন অথবা বিল্ড হওয়া dist/ ফোল্ডার ব্যবহার করুন।'
              )}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1.5">
            <div className="font-mono text-[11px] font-bold text-rose-600 dark:text-rose-400">
              STEP 02
            </div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {pickLang(lang, 'Open chrome://extensions', 'chrome://extensions খুলুন')}
            </div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              {pickLang(
                lang,
                'Open a new tab, go to chrome://extensions, and enable Developer mode at top-right.',
                'Chrome-এ chrome://extensions খুলে ডান পাশের উপরে Developer mode অন করুন।'
              )}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1.5">
            <div className="font-mono text-[11px] font-bold text-rose-600 dark:text-rose-400">
              STEP 03
            </div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {pickLang(lang, 'Click Load unpacked', 'Load unpacked সিলেক্ট করুন')}
            </div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              {pickLang(
                lang,
                'Click "Load unpacked" and select the folder containing manifest.json.',
                '"Load unpacked"-এ ক্লিক করে manifest.json থাকা ফোল্ডারটি সিলেক্ট করুন।'
              )}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1.5">
            <div className="font-mono text-[11px] font-bold text-rose-600 dark:text-rose-400">
              STEP 04
            </div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {pickLang(lang, 'Pin & Run on Live Sites', 'পিন করে লাইভ সাইটে চালান')}
            </div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              {pickLang(
                lang,
                'Pin VeriPulse to your toolbar to open the popup, Side Panel, or full studio on any webpage.',
                'টুলবারে VeriPulse পিন করে যেকোনো সাইটে পপআপ বা সাইড প্যানেল থেকে টেস্ট শুরু করুন।'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            {pickLang(lang, 'Live DOM Action Recorder & Codegen', 'লাইভ DOM রেকর্ডার ও কোডজেন')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            {pickLang(lang, 'Chrome Alarms Self Alert Popups', 'Chrome Alarms সেলফ অ্যালার্ট')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            {pickLang(lang, 'Element Picker & UI Coverage Probe', 'এলিমেন্ট পিকার ও কভারেজ স্ক্যান')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-blue-500" />
            {pickLang(lang, '100% Local Private Storage', 'শতভাগ লোকাল ও নিরাপদ স্টোরেজ')}
          </span>
        </div>
      </div>

      {/* Extension Bundle & Source Files Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <FolderArchive className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span>Manifest V3 Chrome Extension Source Files</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Compiled into <code className="font-mono">dist/</code> with <code className="font-mono">manifest.json</code>, <code className="font-mono">background.js</code>, <code className="font-mono">content.js</code>, <code className="font-mono">popup.html</code>, <code className="font-mono">popup.js</code>, and PNG icons.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenSection('guide')}
            className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer whitespace-nowrap"
          >
            {pickLang(lang, 'View Full Guidelines →', 'সম্পূর্ণ গাইডলাইন দেখুন →')}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="lg:col-span-4 space-y-1">
            {EXTENSION_FILES.map((file) => (
              <button
                key={file.name}
                type="button"
                onClick={() => loadFilePreview(file)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  selectedFile === file.name
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-mono">
                  <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{file.name}</span>
                </div>
                <div className="mt-0.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                  {file.desc}
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-8 flex flex-col rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 text-xs text-slate-300">
              <span className="font-mono">{selectedFile}</span>
              <button
                type="button"
                onClick={handleCopyFile}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-700 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                {copiedFile ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedFile ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="p-3.5 text-[11px] font-mono text-slate-200 overflow-auto max-h-72 leading-relaxed">
              {fileContent}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
