import React, { useEffect, useState } from 'react';
import {
  Activity,
  Blocks,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  FileCode2,
  FolderArchive,
  Link2,
  Puzzle,
  Radar,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import {
  AppLanguage,
  CloudSyncSession,
  ProjectWorkspace,
} from '../types/flowguard';
import {
  detectInstalledExtensionInWeb,
  isChromeExtensionContext,
  pairInstalledBrowserExtension,
} from '../utils/extensionBridge';
import { buildZipBlob, ZipEntryInput } from '../utils/zipBuilder';

interface ExtensionSandboxViewProps {
  project: ProjectWorkspace;
  lang: AppLanguage;
  session: CloudSyncSession;
  onOpenSection: (section: string) => void;
  onOpenAccountModal: () => void;
  onSyncNow: () => void;
  onNotify?: (message: string) => void;
}

const EXTENSION_FILES = [
  {
    name: 'manifest.json',
    path: '/manifest.json',
    desc: 'MV3 permissions, host permissions, side panel, popup, alarms & content scripts',
  },
  {
    name: 'background.js',
    path: '/background.js',
    desc: 'Service worker with cloud sync bridge, per-user isolation, alarms & Fake GPS broadcast',
  },
  {
    name: 'content.js',
    path: '/content.js',
    desc: 'Live DOM recorder, element picker, coverage scanner, pairing bridge & Fake GPS sync',
  },
  {
    name: 'geo-spoof.js',
    path: '/geo-spoof.js',
    desc: 'MAIN-world document_start navigator.geolocation & permissions spoofer with route simulator',
  },
  {
    name: 'popup.html',
    path: '/popup.html',
    desc: 'Chrome action popup interface with Account Sync & Fake GPS controls',
  },
  {
    name: 'popup.js',
    path: '/popup.js',
    desc: 'Popup state sync, cloud sync button, quick self-alert timer & scanner bridge',
  },
];

export const ExtensionSandboxView: React.FC<ExtensionSandboxViewProps> = ({
  project,
  lang,
  session,
  onOpenSection,
  onOpenAccountModal,
  onSyncNow,
  onNotify,
}) => {
  const [selectedFile, setSelectedFile] = useState<string>('manifest.json');
  const [fileContent, setFileContent] = useState<string>('');
  const [copiedFile, setCopiedFile] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [pairingToken, setPairingToken] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pingResult, setPingResult] = useState<{
    checked: boolean;
    detected: boolean;
    latencyMs: number;
  } | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

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
    detectInstalledExtensionInWeb().then((found) => setExtensionDetected(found));
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

  const handlePairExtension = async () => {
    if (!session.user) {
      onOpenAccountModal();
      return;
    }
    setPairingBusy(true);
    try {
      const res = await pairInstalledBrowserExtension();
      if (!res.ok || !res.token) {
        onNotify?.(res.error || 'Could not pair Chrome Extension.');
        return;
      }
      setPairingToken(res.token);
      if (res.pairedInBrowser) {
        onNotify?.(
          pickLang(
            lang,
            'Chrome Extension paired with your Web account!',
            'ক্রোম এক্সটেনশন সরাসরি আপনার অ্যাকাউন্টের সাথে যুক্ত হয়েছে!'
          )
        );
      } else {
        onNotify?.(
          pickLang(
            lang,
            'Pairing token created — paste it into the installed Extension.',
            'পেয়ারিং টোকেন তৈরি হয়েছে — এক্সটেনশনে পেস্ট করে সিঙ্ক করুন।'
          )
        );
      }
    } finally {
      setPairingBusy(false);
    }
  };

  const handlePingExtension = async () => {
    const t0 = performance.now();
    const found = await detectInstalledExtensionInWeb();
    const latencyMs = Math.max(1, Math.round(performance.now() - t0));
    setExtensionDetected(found);
    setPingResult({ checked: true, detected: found, latencyMs });
    onNotify?.(
      found
        ? pickLang(
            lang,
            `Extension responded in ${latencyMs}ms!`,
            `এক্সটেনশন ${latencyMs}ms-এ সাড়া দিয়েছে!`
          )
        : pickLang(
            lang,
            'Extension ping timed out — install ZIP or reload target tab.',
            'এক্সটেনশন পাওয়া যায়নি — ZIP লোড করে ট্যাব রিলোড দিন।'
          )
    );
  };

  const qaOverlaySnippet = `document.querySelectorAll('[data-testid],button,input,select,a').forEach(el=>{el.style.outline='1px dashed #e11d48';if(el.dataset.testid){el.title='testid: '+el.dataset.testid;}});`;

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(qaOverlaySnippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 1800);
      onNotify?.(
        pickLang(
          lang,
          'Copied DevTools QA Locator Overlay script!',
          'DevTools QA লোকেটর ওভারলে স্ক্রিপ্ট কপি হয়েছে!'
        )
      );
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadExtensionZip = async () => {
    setDownloadingZip(true);
    try {
      const entries: ZipEntryInput[] = [];
      let includedCompiledDashboard = false;

      // Prefer exact build manifest written by Vite closeBundle so split chunks are never missed
      for (const basePrefix of ['/ext-dist', '']) {
        try {
          const manifestRes = await fetch(`${basePrefix}/bundle-files.json`);
          const contentType = manifestRes.headers.get('content-type') || '';
          if (manifestRes.ok && contentType.includes('application/json')) {
            const manifestData = (await manifestRes.json()) as { files?: string[] };
            if (Array.isArray(manifestData.files) && manifestData.files.length > 0) {
              const binaryExtRe = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|wasm)$/i;
              for (const relPath of manifestData.files) {
                const fRes = await fetch(`${basePrefix}/${relPath}`);
                if (!fRes.ok) continue;
                if (binaryExtRe.test(relPath)) {
                  entries.push({
                    path: relPath,
                    data: new Uint8Array(await fRes.arrayBuffer()),
                  });
                } else {
                  entries.push({
                    path: relPath,
                    data: await fRes.text(),
                  });
                }
              }
              includedCompiledDashboard = manifestData.files.some((f) =>
                f.startsWith('assets/')
              );
              break;
            }
          }
        } catch {
          // Try next basePrefix or fallback below
        }
      }

      if (entries.length === 0) {
        const textPaths = [
          'manifest.json',
          'background.js',
          'content.js',
          'geo-spoof.js',
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
      }

      if (!includedCompiledDashboard) {
        entries.push({
          path: 'index.html',
          data: `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><title>VeriPulse QA Studio</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;max-width:640px;margin:auto;">
  <h1>VeriPulse — Build Instructions</h1>
  <p>This archive includes all Manifest V3 extension core files (<code>manifest.json</code>, <code>background.js</code>, <code>content.js</code>, <code>geo-spoof.js</code>, <code>popup.html</code>, <code>popup.js</code>, and <code>icons/*</code>).</p>
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
Precision SQA Studio & Chrome Extension with Per-User Cloud Sync.

1. Unzip this package (or run "npm run build" to generate dist/).
2. Open Google Chrome and navigate to chrome://extensions
3. Turn ON "Developer mode" in the top-right corner.
4. Click "Load unpacked" and select the unzipped folder (containing manifest.json).
5. Pin "VeriPulse" and Sign In with your VeriPulse Web Account to sync data privately.
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
          ? pickLang(
              lang,
              'Downloaded complete VeriPulse MV3 extension (.zip) — ready for Load unpacked!',
              'সম্পূর্ণ VeriPulse MV3 এক্সটেনশন (.zip) ডাউনলোড হয়েছে — সরাসরি Chrome-এ লোড করুন!'
            )
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
                `Install VeriPulse in Google Chrome to record user journeys, spoof GPS, probe live DOM permissions, scan UI coverage, and sync privately with your Web account on "${project.domain}".`,
                `যেকোনো লাইভ ওয়েবসাইটে (${project.domain}) অ্যাকশন রেকর্ড, ফেইক জিপিএস, Python/Playwright কোডজেন, লাইভ DOM প্রোব এবং ওয়েব অ্যাকাউন্টের সাথে নিরাপদ সিঙ্ক চালাতে ক্রোমে এক্সটেনশনটি লোড করুন।`
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

      {/* Web Account <-> Chrome Extension Live Sync Bridge */}
      <div className="rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Cloud className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    'Web App ↔ Chrome Extension Cloud Bridge',
                    'ওয়েব অ্যাপ ↔ ক্রোম এক্সটেনশন ক্লাউড সিঙ্ক'
                  )}
                </h3>
                {!extActive && extensionDetected && (
                  <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                    {pickLang(lang, 'Extension Detected', 'এক্সটেনশন পাওয়া গেছে')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {session.user
                  ? pickLang(
                      lang,
                      `Signed in as ${session.user.email}. All saved flows, bugs, Fake GPS pins, and alerts belong strictly to your account.`,
                      `${session.user.email} অ্যাকাউন্টে লগইন আছেন। আপনার ডাটা সম্পূর্ণ আলাদা ও প্রাইভেট থাকবে।`
                    )
                  : pickLang(
                      lang,
                      'Sign in or create an account (starts with 0 data) to sync privately between this Web App and your Chrome Extension.',
                      'নতুন অ্যাকাউন্ট তৈরি করলে ০ ডাটা থেকে শুরু হবে এবং ওয়েব ও এক্সটেনশনের মধ্যে আপনার ডাটা নিরাপদে সিঙ্ক থাকবে।'
                    )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {session.user ? (
              <>
                <button
                  type="button"
                  onClick={onSyncNow}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Sync Now', 'সিঙ্ক করুন')}
                </button>
                <button
                  type="button"
                  onClick={handlePairExtension}
                  disabled={pairingBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {pairingBusy
                    ? pickLang(lang, 'Pairing...', 'যুক্ত হচ্ছে...')
                    : pickLang(lang, 'Connect Installed Extension', 'এক্সটেনশনে যুক্ত করুন')}
                </button>
                <button
                  type="button"
                  onClick={onOpenAccountModal}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {pickLang(lang, 'Manage Account', 'অ্যাকাউন্ট')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onOpenAccountModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Cloud className="w-3.5 h-3.5" />
                {pickLang(lang, 'Sign In / Create Account', 'সাইন ইন / নতুন অ্যাকাউন্ট')}
              </button>
            )}
          </div>
        </div>

        {pairingToken && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/30 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-mono text-[11px] text-blue-900 dark:text-blue-200 break-all">
              Token: {pairingToken}
            </span>
            <span className="text-[11px] text-blue-700 dark:text-blue-300">
              {pickLang(
                lang,
                'Paste into Extension → Account → Pair Token if on another Chrome profile.',
                'অন্য ব্রাউজার প্রোফাইল হলে এক্সটেনশনের Pair Token অপশনে পেস্ট করুন।'
              )}
            </span>
          </div>
        )}
      </div>

      {/* Live Extension Bridge Diagnostics & QA DevTools Locator Helper */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
              <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                {pickLang(
                  lang,
                  'Live Bridge Diagnostics & Synced Project Scope',
                  'লাইভ এক্সটেনশন ডায়াগনস্টিকস ও সিঙ্কড ডাটা স্কোপ'
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={handlePingExtension}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 cursor-pointer"
            >
              <Radar className="w-3.5 h-3.5" />
              {pickLang(lang, 'Ping Extension', 'পিন টেস্ট করুন')}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Flows</div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                {project.flows.length}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5">
              <div className="text-[10px] text-slate-500 uppercase font-mono">RBAC Rules</div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                {project.rbacRules.length + (project.customTestRules?.length || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Docs & Notes</div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                {(project.businessDocs?.length || 0) + (project.businessNotes?.length || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Bugs & Tests</div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                {(project.bugReports?.length || 0) + (project.testCases?.length || 0)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1 text-slate-500 dark:text-slate-400">
            <span>
              {pickLang(lang, 'Account Scope:', 'ডাটা আইসোলেশন:')}{' '}
              <strong className="font-mono text-slate-700 dark:text-slate-200">
                {session.user ? session.user.email : pickLang(lang, 'Local Sandbox', 'লোকাল স্যান্ডবক্স')}
              </strong>
            </span>
            {pingResult && (
              <span
                className={`font-mono font-semibold ${
                  pingResult.detected
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {pingResult.detected
                  ? `CONNECTED · ${pingResult.latencyMs}ms`
                  : `NO BRIDGE · ${pingResult.latencyMs}ms`}
              </span>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-rose-500" />
              {pickLang(lang, 'Quick QA Element Highlighter', 'কুইক পেজ এলিমেন্ট হাইলাইটার')}
            </span>
            <button
              type="button"
              onClick={handleCopySnippet}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {copiedSnippet ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              {copiedSnippet ? pickLang(lang, 'Copied', 'কপি হয়েছে') : pickLang(lang, 'Copy JS', 'কপি JS')}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {pickLang(
              lang,
              'Paste in Chrome DevTools Console on any staging page to outline all interactive controls & [data-testid] hooks.',
              'যেকোনো স্টেজিং পেজের Console-এ পেস্ট করলে সব বাটন ও [data-testid] বর্ডার দিয়ে চিহ্নিত দেখাবে।'
            )}
          </p>
          <pre className="p-2.5 rounded-lg bg-slate-950 text-emerald-300 font-mono text-[10px] overflow-x-auto leading-relaxed">
            {qaOverlaySnippet}
          </pre>
        </div>
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
              {pickLang(lang, 'Download ZIP & Extract', 'ZIP ডাউনলোড ও আনজিপ')}
            </div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              {pickLang(
                lang,
                'Click "Download Extension (.zip)" above and unzip it to a folder on your computer.',
                'উপরের বাটন থেকে ZIP ডাউনলোড করে আপনার কম্পিউটারে আনজিপ করুন।'
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
                'Click "Load unpacked" and select the unzipped folder containing manifest.json.',
                '"Load unpacked"-এ ক্লিক করে manifest.json থাকা আনজিপ ফোল্ডারটি সিলেক্ট করুন।'
              )}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1.5">
            <div className="font-mono text-[11px] font-bold text-rose-600 dark:text-rose-400">
              STEP 04
            </div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {pickLang(lang, 'Sign In & Sync', 'সাইন ইন করে সিঙ্ক করুন')}
            </div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              {pickLang(
                lang,
                'Pin VeriPulse and sign in with your account (or click Connect Installed Extension above).',
                'টুলবারে VeriPulse পিন করে আপনার অ্যাকাউন্ট দিয়ে সাইন ইন করুন।'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            {pickLang(lang, 'Per-User Zero-Data Isolation', 'ইউজার-ভিত্তিক জিরো-ডাটা সুরক্ষা')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            {pickLang(lang, 'Live DOM Action Recorder & Codegen', 'লাইভ DOM রেকর্ডার ও কোডজেন')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            {pickLang(lang, 'Fake GPS & Route Spoofer', 'ফেইক জিপিএস ও রুট স্পুফার')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-blue-500" />
            {pickLang(lang, 'Web ↔ Extension Synced', 'ওয়েব ও এক্সটেনশন সিঙ্কড')}
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
              Compiled into <code className="font-mono">dist/</code> with{' '}
              <code className="font-mono">manifest.json</code>,{' '}
              <code className="font-mono">background.js</code>,{' '}
              <code className="font-mono">content.js</code>,{' '}
              <code className="font-mono">geo-spoof.js</code>,{' '}
              <code className="font-mono">popup.html</code>,{' '}
              <code className="font-mono">popup.js</code>, and{' '}
              <code className="font-mono">bundle-files.json</code>.
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
