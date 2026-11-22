import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Binary,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Code2,
  Copy,
  CreditCard,
  Download,
  Eraser,
  Eye,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileWarning,
  Globe,
  HardDrive,
  Laptop,
  LockOpen,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Ruler,
  ScanSearch,
  Shuffle,
  Smartphone,
  Sparkles,
  Tablet,
  Terminal,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import { AppLanguage } from '../types/flowguard';
import {
  isChromeExtensionContext,
  ManualPageAction,
  runActiveTabManualAction,
} from '../utils/extensionBridge';

interface ManualHelperViewProps {
  lang: AppLanguage;
  defaultDomain?: string;
  onNotify?: (message: string) => void;
}

type HelperTab =
  | 'instant_data'
  | 'file_gen'
  | 'page_hands'
  | 'viewport'
  | 'quick_tools';

interface PersonaProfile {
  fullNameEn: string;
  fullNameBn: string;
  username: string;
  email: string;
  phoneLocal: string;
  phoneIntl: string;
  nid10: string;
  nid17: string;
  dobAdult: string;
  dobMinor: string;
  address: string;
  city: string;
  postcode: string;
  company: string;
  tin: string;
  strongPassword: string;
  weakPassword: string;
}

const BD_FIRST_NAMES = [
  { en: 'Rafiqul', bn: 'রফিকুল' },
  { en: 'Nusrat', bn: 'নুসরাত' },
  { en: 'Tanvir', bn: 'তানভীর' },
  { en: 'Farhana', bn: 'ফারহানা' },
  { en: 'Mehedi', bn: 'মেহেদী' },
  { en: 'Tasnim', bn: 'তাসনিম' },
  { en: 'Sajid', bn: 'সাজিদ' },
  { en: 'Maliha', bn: 'মালিহা' },
];

const BD_LAST_NAMES = [
  { en: 'Islam', bn: 'ইসলাম' },
  { en: 'Jahan', bn: 'জাহান' },
  { en: 'Rahman', bn: 'রহমান' },
  { en: 'Ahmed', bn: 'আহমেদ' },
  { en: 'Chowdhury', bn: 'চৌধুরী' },
  { en: 'Karim', bn: 'করিম' },
  { en: 'Hossain', bn: 'হোসেন' },
  { en: 'Sultana', bn: 'সুলতানা' },
];

const BD_ADDRESSES = [
  {
    address: 'House 24, Road 11, Block F, Banani',
    city: 'Dhaka',
    postcode: '1213',
  },
  {
    address: 'Flat 4B, House 18, Sector 7, Uttara',
    city: 'Dhaka',
    postcode: '1230',
  },
  {
    address: 'Holding 72, Road 4, Nasirabad Housing Society',
    city: 'Chattogram',
    postcode: '4000',
  },
  {
    address: 'House 9, Lane 2, Zindabazar West',
    city: 'Sylhet',
    postcode: '3100',
  },
  {
    address: 'Plot 33, Mirpur Road, Dhanmondi 27',
    city: 'Dhaka',
    postcode: '1209',
  },
  {
    address: 'House 12, Uposhohor Sector 2',
    city: 'Rajshahi',
    postcode: '6000',
  },
];

const GLOBAL_PERSONAS = [
  {
    fullNameEn: 'Jordan Alvarez',
    fullNameBn: 'জর্ডান আলভারেজ',
    address: '742 Evergreen Terrace, Apt 4C',
    city: 'Austin, TX',
    postcode: '78701',
    phoneLocal: '5125550194',
    phoneIntl: '+15125550194',
    company: 'Northstar Logistics LLC',
  },
  {
    fullNameEn: 'Amelia Clarke',
    fullNameBn: 'অ্যামেলিয়া ক্লার্ক',
    address: '14 Baker Street, Flat 2',
    city: 'London',
    postcode: 'NW1 6XE',
    phoneLocal: '07700900412',
    phoneIntl: '+447700900412',
    company: 'Thames Digital Ltd',
  },
  {
    fullNameEn: 'Liam Mercer',
    fullNameBn: 'লিয়াম মার্সার',
    address: '288 Queen St West, Suite 504',
    city: 'Toronto, ON',
    postcode: 'M5V 2A1',
    phoneLocal: '4165550188',
    phoneIntl: '+14165550188',
    company: 'Maple Cloud Systems',
  },
];

const BD_OPERATORS = ['017', '018', '019', '013', '016', '014'];

function buildPersona(region: 'bd' | 'global', seed: number): PersonaProfile {
  const stamp = String(Date.now()).slice(-4);
  if (region === 'global') {
    const g = GLOBAL_PERSONAS[seed % GLOBAL_PERSONAS.length];
    const slug = g.fullNameEn.toLowerCase().replace(/[^a-z0-9]+/g, '.');
    return {
      fullNameEn: g.fullNameEn,
      fullNameBn: g.fullNameBn,
      username: `${slug}.${stamp}`,
      email: `qa.${slug}+${stamp}@example.com`,
      phoneLocal: g.phoneLocal,
      phoneIntl: g.phoneIntl,
      nid10: `${1000000000 + ((seed * 7919) % 899999999)}`,
      nid17: `1994${String(1000000000000 + ((seed * 65537) % 899999999999)).slice(0, 13)}`,
      dobAdult: '1995-08-19',
      dobMinor: `${new Date().getFullYear() - 15}-04-10`,
      address: g.address,
      city: g.city,
      postcode: g.postcode,
      company: g.company,
      tin: `${440000000000 + ((seed * 1237) % 49999999999)}`,
      strongPassword: `Qa#Pulse${stamp}!`,
      weakPassword: 'password123',
    };
  }

  const first = BD_FIRST_NAMES[seed % BD_FIRST_NAMES.length];
  const last = BD_LAST_NAMES[(seed * 3 + 1) % BD_LAST_NAMES.length];
  const loc = BD_ADDRESSES[(seed * 5 + 2) % BD_ADDRESSES.length];
  const op = BD_OPERATORS[seed % BD_OPERATORS.length];
  const tail8 = String(10000000 + ((seed * 97813 + Number(stamp)) % 89999999)).padStart(8, '0');
  const fullEn = `${first.en} ${last.en}`;
  const slug = fullEn.toLowerCase().replace(/\s+/g, '.');

  return {
    fullNameEn: fullEn,
    fullNameBn: `${first.bn} ${last.bn}`,
    username: `${slug}_${stamp}`,
    email: `qa.${slug}+${stamp}@example.com`,
    phoneLocal: `${op}${tail8}`,
    phoneIntl: `+88${op}${tail8}`,
    nid10: `${5100000000 + ((seed * 48271) % 3999999999)}`,
    nid17: `1996269${String(1000000000 + ((seed * 31337) % 8999999999)).slice(0, 10)}`,
    dobAdult: '1996-11-14',
    dobMinor: `${new Date().getFullYear() - 16}-02-20`,
    address: loc.address,
    city: loc.city,
    postcode: loc.postcode,
    company: 'Dhaka Commerce & Tech Ltd',
    tin: `${610000000000 + ((seed * 7331) % 299999999999)}`,
    strongPassword: `Bd@Qa${stamp}#9X`,
    weakPassword: '123456',
  };
}

interface DevicePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  kind: 'mobile' | 'tablet' | 'desktop';
}

const DEVICE_PRESETS: DevicePreset[] = [
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, kind: 'mobile' },
  { id: 'iphone-14', label: 'iPhone 14 Pro', width: 393, height: 852, kind: 'mobile' },
  { id: 'android-360', label: 'Android Compact', width: 360, height: 800, kind: 'mobile' },
  { id: 'ipad-mini', label: 'iPad / Tablet', width: 768, height: 1024, kind: 'tablet' },
  { id: 'laptop', label: 'Laptop 1280', width: 1280, height: 800, kind: 'desktop' },
  { id: 'desktop', label: 'Desktop 1440', width: 1440, height: 900, kind: 'desktop' },
];

const SANITY_CHECKS: Array<{ id: string; en: string; bn: string; group: string }> = [
  {
    id: 'double-click',
    group: 'Forms',
    en: 'Double-clicking Submit does not create duplicate records/orders',
    bn: 'সাবমিট বাটনে ডাবল-ক্লিক করলে ডুপ্লিকেট এন্ট্রি/অর্ডার হয় না',
  },
  {
    id: 'trim-space',
    group: 'Forms',
    en: 'Leading & trailing spaces are trimmed on email/phone/search inputs',
    bn: 'ইমেইল/ফোন/সার্চের শুরু ও শেষের বাড়তি স্পেস অটো-ট্রিম হয়',
  },
  {
    id: 'back-logout',
    group: 'Auth',
    en: 'Browser Back button after Logout does not show cached private page',
    bn: 'লগআউটের পর ব্রাউজার Back বাটন চাপলে আগের প্রাইভেট পেজ দেখা যায় না',
  },
  {
    id: 'refresh-persist',
    group: 'State',
    en: 'Hard refresh (F5) preserves expected filter/cart/URL query state',
    bn: 'পেজ রিলোড (F5) দিলে ফিল্টার, কার্ট বা URL স্টেট নষ্ট হয় না',
  },
  {
    id: 'empty-state',
    group: 'UI',
    en: 'Empty search / 0 rows shows a clear empty-state message (not blank)',
    bn: 'ডাটা না থাকলে বা সার্চে রেজাল্ট ০ হলে সুন্দর Empty State দেখায়',
  },
  {
    id: 'mobile-scroll',
    group: 'Layout',
    en: 'No accidental horizontal scrollbar on 360px–390px mobile screens',
    bn: '৩৬০–৩৯০px মোবাইলে ডানে-বামে অপ্রয়োজনীয় হরাইজন্টাল স্ক্রল নেই',
  },
  {
    id: 'long-text',
    group: 'Layout',
    en: 'Long names/URLs wrap or truncate cleanly without breaking cards',
    bn: 'লম্বা নাম বা URL কার্ডের ডিজাইন ভেঙে ফেলে না (truncate/wrap হয়)',
  },
  {
    id: 'upload-guard',
    group: 'Files',
    en: 'Oversized file & wrong MIME file upload show user-friendly error',
    bn: 'বড় সাইজ বা ভুয়া ফরম্যাটের ফাইল আপলোড করলে সঠিক এরর দেখায়',
  },
  {
    id: 'utf8-bn',
    group: 'Data',
    en: 'Bangla text, ৳ symbol & emoji save and reload cleanly without ???',
    bn: 'বাংলা লেখা, ৳ চিহ্ন ও ইমোজি সেভ করলে ??? হয়ে যায় না',
  },
  {
    id: 'keyboard-tab',
    group: 'A11y',
    en: 'Tab / Enter / Esc keyboard navigation works smoothly in modals',
    bn: 'Tab, Enter ও Esc কী দিয়ে ফর্ম ও মডাল সহজে চালানো যায়',
  },
  {
    id: 'console-clean',
    group: 'Network',
    en: 'DevTools Console has 0 uncaught errors & Network has 0 unexpected 500s',
    bn: 'কনসোলে কোনো Uncaught Error এবং নেটওয়ার্কে ৫০০ এরর নেই',
  },
  {
    id: 'session-401',
    group: 'Auth',
    en: 'Expired token / 401 redirects gracefully to Sign In without crash',
    bn: 'সেশন এক্সপায়ার হলে অ্যাপ ক্র্যাশ না করে লগইনে নিয়ে যায়',
  },
];

const PAGE_HELPERS: Array<{
  action: ManualPageAction;
  titleEn: string;
  titleBn: string;
  descEn: string;
  descBn: string;
  snippet: string;
  tone: 'blue' | 'teal' | 'amber' | 'rose' | 'violet' | 'slate';
}> = [
  {
    action: 'reveal_passwords',
    titleEn: 'Reveal / Mask All Passwords',
    titleBn: 'পাসওয়ার্ড ফিল্ড দেখান / লুকান',
    descEn: 'Toggles every password input on the page between masked dots and readable text.',
    descBn: 'পেজের সব পাসওয়ার্ড ফিল্ডের ডট খুলে আসল লেখা যাচাই করুন বা আবার লুকান।',
    snippet: `document.querySelectorAll('input[type="password"],input[data-vp-pw]').forEach(el=>{if(el.type==='password'){el.dataset.vpPw='1';el.type='text';}else{el.type='password';delete el.dataset.vpPw;}});`,
    tone: 'blue',
  },
  {
    action: 'unlock_paste',
    titleEn: 'Unlock Paste & Right-Click',
    titleBn: 'পেস্ট ও রাইট-ক্লিক আনলক',
    descEn: 'Removes paste/copy/contextmenu blockers on confirm-password, OTP & bank inputs.',
    descBn: 'অনেক ফর্মে Paste বা Right-click ব্লক করা থাকে — ১ ক্লিকে আনলক করুন।',
    snippet: `['paste','copy','cut','contextmenu','selectstart'].forEach(ev=>window.addEventListener(ev,e=>e.stopImmediatePropagation(),true));document.querySelectorAll('input,textarea').forEach(el=>{el.onpaste=null;el.oncopy=null;});`,
    tone: 'teal',
  },
  {
    action: 'bypass_html5',
    titleEn: 'Bypass HTML5 Limits (API Validation Test)',
    titleBn: 'HTML5 লিমিট বাইপাস (সার্ভার টেস্ট)',
    descEn: 'Strips required, maxlength, pattern & disabled/readonly so you can test backend API rejections.',
    descBn: 'required, maxlength, disabled সরিয়ে নেগেটিভ ডাটা পাঠিয়ে ব্যাকএন্ড ভ্যালিডেশন টেস্ট করুন।',
    snippet: `document.querySelectorAll('form').forEach(f=>f.noValidate=true);document.querySelectorAll('input,textarea,select,button').forEach(el=>{el.removeAttribute('required');el.removeAttribute('maxlength');el.removeAttribute('pattern');el.disabled=false;el.readOnly=false;});`,
    tone: 'amber',
  },
  {
    action: 'scan_ui_glitches',
    titleEn: 'Flag Broken Images & CSS Overflow',
    titleBn: 'ভাঙা ইমেজ ও ওভারফ্লো খুঁজুন',
    descEn: 'Highlights broken <img> (naturalWidth=0) in red & elements wider than viewport in orange.',
    descBn: 'পেজের না লোড হওয়া ইমেজ লাল ও স্ক্রিনের বাইরে চলে যাওয়া এলিমেন্ট কমলা বর্ডারে দেখায়।',
    snippet: `document.querySelectorAll('img').forEach(i=>{if(!i.complete||i.naturalWidth===0)i.style.outline='3px dashed #e11d48';});const vw=document.documentElement.clientWidth;document.querySelectorAll('*').forEach(e=>{if(e.getBoundingClientRect().right>vw+1)e.style.outline='2px solid #f59e0b';});`,
    tone: 'rose',
  },
  {
    action: 'highlight_testids',
    titleEn: 'Outline Controls & [data-testid]',
    titleBn: 'বাটন ও [data-testid] হাইলাইট',
    descEn: 'Outlines interactive inputs/buttons and attaches selector tooltips on hover.',
    descBn: 'সব বাটন, ইনপুট ও data-testid বর্ডার দিয়ে দেখায় যাতে সহজে চেক করা যায়।',
    snippet: `document.querySelectorAll('[data-testid],button,input,select,textarea,a[href]').forEach(el=>{el.style.outline='1.5px dashed #7c3aed';el.title=el.dataset.testid?('[data-testid="'+el.dataset.testid+'"]'):(el.name||el.id||el.tagName);});`,
    tone: 'violet',
  },
  {
    action: 'show_hidden_fields',
    titleEn: 'Inspect Hidden Form Inputs',
    titleBn: 'লুকানো Hidden ইনপুট দেখুন',
    descEn: 'Lists hidden <input type="hidden"> names (CSRF/mode/price flags) for tampering review.',
    descBn: 'পেজের লুকানো input[type="hidden"] ফিল্ডের নাম ও ভ্যালু খুঁজে বের করে।',
    snippet: `console.table(Array.from(document.querySelectorAll('input[type="hidden"]')).map(i=>({name:i.name||i.id,value:String(i.value).slice(0,80)})));`,
    tone: 'slate',
  },
  {
    action: 'clear_storage',
    titleEn: 'Clear Site Local & Session Storage',
    titleBn: 'সাইটের Local/Session স্টোরেজ ক্লিয়ার',
    descEn: 'Wipes active site localStorage & sessionStorage for instant fresh-user manual testing.',
    descBn: 'ব্রাউজার প্রোফাইল না মুছেই শুধু বর্তমান সাইটের স্টোরেজ রিসেট করে ফ্রেশ ইউজার টেস্ট করুন।',
    snippet: `localStorage.clear();sessionStorage.clear();console.log('Cleared localStorage & sessionStorage');`,
    tone: 'rose',
  },
  {
    action: 'reset_highlights',
    titleEn: 'Clear Page Visual Outlines',
    titleBn: 'সব হাইলাইট আউটলাইন মুছুন',
    descEn: 'Removes temporary QA outlines placed on the active page.',
    descBn: 'পেজে লাগানো সব অস্থায়ী QA বর্ডার পরিষ্কার করে।',
    snippet: `document.querySelectorAll('*').forEach(e=>{if(e.style.outline)e.style.outline='';});`,
    tone: 'slate',
  },
];

function triggerDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export const ManualHelperView: React.FC<ManualHelperViewProps> = ({
  lang,
  defaultDomain,
  onNotify,
}) => {
  const [tab, setTab] = useState<HelperTab>('instant_data');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Tab 1: Personas & Edge Data
  const [region, setRegion] = useState<'bd' | 'global'>('bd');
  const [seed, setSeed] = useState<number>(1);
  const [customLength, setCustomLength] = useState<number>(255);
  const [customChar, setCustomChar] = useState<'A' | '9' | 'অ'>('A');
  const persona = useMemo(() => buildPersona(region, seed), [region, seed]);

  // Tab 2: Dummy File & Image Generator
  const [imgWidth, setImgWidth] = useState<number>(1200);
  const [imgHeight, setImgHeight] = useState<number>(630);
  const [imgFormat, setImgFormat] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const [imgTheme, setImgTheme] = useState<'slate' | 'teal' | 'amber'>('teal');
  const [imgBadgeText, setImgBadgeText] = useState<string>('VeriPulse QA Upload Test');
  const [oversizeMb, setOversizeMb] = useState<number>(5);
  const [oversizeExt, setOversizeExt] = useState<'pdf' | 'png' | 'bin'>('pdf');

  // Tab 3: Live Page Help-Hand
  const extActive = isChromeExtensionContext();
  const [lastPageLog, setLastPageLog] = useState<{
    action: string;
    ok: boolean;
    summary: string;
    details?: string[];
  } | null>(null);

  // Tab 4: Responsive Viewport Tester
  const [previewUrl, setPreviewUrl] = useState<string>(() => {
    if (defaultDomain && defaultDomain !== 'app.example.com') {
      return defaultDomain.startsWith('http') ? defaultDomain : `https://${defaultDomain}`;
    }
    return '';
  });
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('iphone-se');
  const [rotated, setRotated] = useState<boolean>(false);
  const [zoomPct, setZoomPct] = useState<number>(75);
  const [useBuiltInSandbox, setUseBuiltInSandbox] = useState<boolean>(true);
  const [touchW, setTouchW] = useState<number>(40);
  const [touchH, setTouchH] = useState<number>(36);

  // Tab 5: Stopwatch, Rapid Counter, Sanity Checklist, Text/Regex Lab
  const [running, setRunning] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const lastTickRef = useRef<number | null>(null);
  const [counters, setCounters] = useState({ flows: 0, edges: 0, glitches: 0 });
  const [checkedSanity, setCheckedSanity] = useState<Record<string, boolean>>({});
  const [scratchText, setScratchText] = useState<string>(
    '  রহিম ✅ ৳১২,৫০০ Order #VP-2026  '
  );
  const [regexPattern, setRegexPattern] = useState<string>('^(?:\\+?88)?01[3-9]\\d{8}$');
  const [regexTestInput, setRegexTestInput] = useState<string>('01712345678');

  useEffect(() => {
    if (!running) {
      lastTickRef.current = null;
      return;
    }
    lastTickRef.current = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      if (lastTickRef.current !== null) {
        setElapsedMs((prev) => prev + (now - lastTickRef.current!));
      }
      lastTickRef.current = now;
    }, 100);
    return () => window.clearInterval(id);
  }, [running]);

  const copyValue = async (val: string, label: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedKey(label);
      setTimeout(() => setCopiedKey((cur) => (cur === label ? null : cur)), 1600);
      onNotify?.(
        pickLang(lang, `Copied ${label}`, `${label} কপি হয়েছে`)
      );
    } catch {
      onNotify?.(
        pickLang(lang, 'Clipboard access blocked by browser.', 'ক্লিপবোর্ড কপি অনুমোদিত নয়।')
      );
    }
  };

  const generateExactString = (len: number, ch: string) => {
    const safeLen = Math.max(1, Math.min(20000, len));
    if (safeLen <= 12) return ch.repeat(safeLen);
    const prefix = `[${safeLen}]`;
    if (safeLen <= prefix.length) return ch.repeat(safeLen);
    return prefix + ch.repeat(safeLen - prefix.length);
  };

  const handleDownloadGeneratedImage = () => {
    const w = Math.max(32, Math.min(4096, imgWidth));
    const h = Math.max(32, Math.min(4096, imgHeight));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, w, h);
    if (imgTheme === 'teal') {
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.55, '#0d9488');
      grad.addColorStop(1, '#2563eb');
    } else if (imgTheme === 'amber') {
      grad.addColorStop(0, '#1e1b4b');
      grad.addColorStop(0.55, '#d97706');
      grad.addColorStop(1, '#e11d48');
    } else {
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#334155');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle QA grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, Math.round(w / 400));
    const step = Math.max(40, Math.round(Math.min(w, h) / 6));
    for (let x = step; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Center border guide for crop testing
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) / 180));
    const pad = Math.round(Math.min(w, h) * 0.06);
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const mainFontSize = Math.max(16, Math.round(Math.min(w, h) * 0.12));
    ctx.font = `700 ${mainFontSize}px ui-monospace, SFMono-Regular, monospace`;
    ctx.fillText(`${w} × ${h}`, w / 2, h / 2 - mainFontSize * 0.35);

    const subFontSize = Math.max(11, Math.round(mainFontSize * 0.34));
    ctx.fillStyle = 'rgba(241,245,249,0.92)';
    ctx.font = `600 ${subFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(
      (imgBadgeText || 'VeriPulse QA Upload Test').slice(0, 48),
      w / 2,
      h / 2 + mainFontSize * 0.45
    );

    const ext = imgFormat === 'image/jpeg' ? 'jpg' : imgFormat === 'image/webp' ? 'webp' : 'png';
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        triggerDownloadBlob(blob, `qa-test-${w}x${h}.${ext}`);
        onNotify?.(
          pickLang(
            lang,
            `Downloaded qa-test-${w}x${h}.${ext} (${(blob.size / 1024).toFixed(1)} KB)`,
            `qa-test-${w}x${h}.${ext} (${(blob.size / 1024).toFixed(1)} KB) ডাউনলোড হয়েছে`
          )
        );
      },
      imgFormat,
      0.92
    );
  };

  const handleDownloadSampleFile = (kind: 'csv' | 'json' | 'pdf' | 'svg' | 'empty' | 'fake_png' | 'long_name' | 'oversized') => {
    if (kind === 'csv') {
      const csv = `\uFEFFid,name_en,name_bn,phone,city,amount_bdt,status\n1,Rafiqul Islam,রফিকুল ইসলাম,01711223344,Dhaka,1250.50,PAID\n2,Nusrat Jahan,নুসরাত জাহান,01822334455,Chattogram,890.00,COD\n3,Tanvir Ahmed,তানভীর আহমেদ,01933445566,Sylhet,0.00,PENDING\n`;
      triggerDownloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'qa-bd-sample.csv');
      onNotify?.(pickLang(lang, 'Downloaded UTF-8 CSV test file.', 'UTF-8 CSV টেস্ট ফাইল ডাউনলোড হয়েছে।'));
      return;
    }
    if (kind === 'json') {
      const json = JSON.stringify(
        {
          testSuite: 'VeriPulse Manual Upload',
          generatedAt: new Date().toISOString(),
          sampleUser: persona,
          items: [
            { sku: 'BD-101', qty: 2, price: 450 },
            { sku: 'BD-205', qty: 1, price: 1200 },
          ],
        },
        null,
        2
      );
      triggerDownloadBlob(new Blob([json], { type: 'application/json' }), 'qa-sample-payload.json');
      onNotify?.(pickLang(lang, 'Downloaded JSON sample file.', 'JSON স্যাম্পল ফাইল ডাউনলোড হয়েছে।'));
      return;
    }
    if (kind === 'pdf') {
      const minimalPdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 68 >> stream
BT /F1 16 Tf 72 720 Td (VeriPulse QA Valid Test PDF Document) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000359 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
429
%%EOF`;
      triggerDownloadBlob(new Blob([minimalPdf], { type: 'application/pdf' }), 'qa-valid-sample.pdf');
      onNotify?.(pickLang(lang, 'Downloaded valid minimal PDF.', 'ভ্যালিড মিনিমাল PDF ডাউনলোড হয়েছে।'));
      return;
    }
    if (kind === 'svg') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" rx="14" fill="#0d9488"/><text x="120" y="66" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="700">QA SVG TEST</text></svg>`;
      triggerDownloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'qa-vector-test.svg');
      onNotify?.(pickLang(lang, 'Downloaded SVG vector test file.', 'SVG ভেক্টর ফাইল ডাউনলোড হয়েছে।'));
      return;
    }
    if (kind === 'empty') {
      triggerDownloadBlob(new Blob([], { type: 'text/plain' }), 'empty-zero-byte.txt');
      onNotify?.(pickLang(lang, 'Downloaded 0-byte empty file.', '০-বাইট খালি ফাইল ডাউনলোড হয়েছে।'));
      return;
    }
    if (kind === 'fake_png') {
      triggerDownloadBlob(
        new Blob(['NOT_A_REAL_PNG_HEADER_FOR_MIME_VALIDATION_QA_TEST'], { type: 'text/plain' }),
        'fake-mime-as-image.png'
      );
      onNotify?.(
        pickLang(
          lang,
          'Downloaded fake .png (plain text content) for MIME guard testing.',
          'ভুয়া .png ফাইল ডাউনলোড হয়েছে (MIME ভ্যালিডেশন চেকের জন্য)।'
        )
      );
      return;
    }
    if (kind === 'long_name') {
      const longBase = 'qa_very_long_filename_boundary_check_' + 'x'.repeat(170);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#2563eb"/></svg>`;
      triggerDownloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${longBase}.svg`);
      onNotify?.(pickLang(lang, 'Downloaded 210+ char filename test file.', '২১০+ অক্ষরের লম্বা নামের ফাইল ডাউনলোড হয়েছে।'));
      return;
    }
    if (kind === 'oversized') {
      const targetBytes = Math.max(1, Math.min(30, oversizeMb)) * 1024 * 1024;
      const chunk = new Uint8Array(1024 * 1024);
      chunk.fill(65);
      const parts: BlobPart[] = [];
      if (oversizeExt === 'pdf') {
        parts.push('%PDF-1.4\n% QA Oversized File Test\n');
      }
      const fullMb = Math.floor(targetBytes / chunk.byteLength);
      for (let i = 0; i < fullMb; i += 1) {
        parts.push(chunk);
      }
      const blob = new Blob(parts, { type: 'application/octet-stream' });
      triggerDownloadBlob(blob, `qa-oversized-${oversizeMb}MB.${oversizeExt}`);
      onNotify?.(
        pickLang(
          lang,
          `Downloaded ${oversizeMb}MB test file (.${oversizeExt}) for max-size upload checks.`,
          `${oversizeMb}MB সাইজের টেস্ট ফাইল ডাউনলোড হয়েছে।`
        )
      );
    }
  };

  const handleRunPageHelper = async (helper: (typeof PAGE_HELPERS)[number]) => {
    if (extActive) {
      const res = await runActiveTabManualAction(helper.action);
      setLastPageLog({
        action: pickLang(lang, helper.titleEn, helper.titleBn),
        ok: res.ok,
        summary: res.summary || res.error || '',
        details: res.details,
      });
      onNotify?.(res.ok ? res.summary || 'Done!' : res.error || 'Action failed');
      return;
    }
    await copyValue(helper.snippet, pickLang(lang, `${helper.titleEn} JS`, `${helper.titleBn} JS`));
  };

  const activeDevice =
    DEVICE_PRESETS.find((d) => d.id === selectedDeviceId) || DEVICE_PRESETS[0];
  const frameWidth = rotated ? activeDevice.height : activeDevice.width;
  const frameHeight = rotated ? activeDevice.width : activeDevice.height;
  const breakpointLabel =
    frameWidth < 640
      ? 'xs (<640px · Mobile)'
      : frameWidth < 768
        ? 'sm (640–767px · Large Mobile)'
        : frameWidth < 1024
          ? 'md (768–1023px · Tablet)'
          : frameWidth < 1280
            ? 'lg (1024–1279px · Small Laptop)'
            : frameWidth < 1536
              ? 'xl (1280–1535px · Laptop)'
              : '2xl (1536px+ · Wide Desktop)';

  const formatStopwatch = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
  };

  const utf8Bytes = useMemo(() => new TextEncoder().encode(scratchText).length, [scratchText]);

  const regexEvaluation = useMemo(() => {
    try {
      const re = new RegExp(regexPattern);
      return { valid: true, matched: re.test(regexTestInput), error: '' };
    } catch (err) {
      return {
        valid: false,
        matched: false,
        error: err instanceof Error ? err.message : 'Invalid regex',
      };
    }
  }, [regexPattern, regexTestInput]);

  const sanityDoneCount = Object.values(checkedSanity).filter(Boolean).length;

  const tabs: Array<{ key: HelperTab; labelEn: string; labelBn: string; icon: React.ComponentType<{ className?: string }> }> = [
    {
      key: 'instant_data',
      labelEn: 'Personas & Edge Data',
      labelBn: 'র‍্যান্ডম ডাটা ও এজ ইনপুট',
      icon: UserCheck,
    },
    {
      key: 'file_gen',
      labelEn: 'Dummy Files & Images',
      labelBn: 'ডামি ফাইল ও ইমেজ',
      icon: FileImage,
    },
    {
      key: 'page_hands',
      labelEn: 'Live Page Help-Hands',
      labelBn: 'লাইভ পেজ হেল্প-হ্যান্ড',
      icon: LockOpen,
    },
    {
      key: 'viewport',
      labelEn: 'Responsive Viewport',
      labelBn: 'রেসপন্সিভ ভিউপোর্ট',
      icon: Smartphone,
    },
    {
      key: 'quick_tools',
      labelEn: 'Stopwatch, Sanity & Regex',
      labelBn: 'স্টপওয়াচ, চেক ও টেক্সট ল্যাব',
      icon: Clock,
    },
  ];

  const personaFields: Array<{ key: string; labelEn: string; labelBn: string; value: string }> = [
    { key: 'fullNameEn', labelEn: 'Full Name (EN)', labelBn: 'নাম (EN)', value: persona.fullNameEn },
    { key: 'fullNameBn', labelEn: 'Full Name (BN)', labelBn: 'নাম (বাংলা)', value: persona.fullNameBn },
    { key: 'email', labelEn: 'Unique Email (+stamp)', labelBn: 'ইউনিক ইমেইল', value: persona.email },
    { key: 'phoneLocal', labelEn: 'Mobile (Local)', labelBn: 'মোবাইল নম্বর', value: persona.phoneLocal },
    { key: 'phoneIntl', labelEn: 'Mobile (Intl)', labelBn: 'আন্তর্জাতিক ফোন', value: persona.phoneIntl },
    { key: 'nid10', labelEn: '10-Digit ID / NID', labelBn: '১০-ডিজিট আইডি', value: persona.nid10 },
    { key: 'nid17', labelEn: '17-Digit ID / NID', labelBn: '১৭-ডিজিট আইডি', value: persona.nid17 },
    { key: 'dobAdult', labelEn: 'DOB (Adult 18+)', labelBn: 'জন্মতারিখ (১৮+)', value: persona.dobAdult },
    { key: 'dobMinor', labelEn: 'DOB (Under-18 Edge)', labelBn: 'জন্মতারিখ (১৮-এর কম)', value: persona.dobMinor },
    { key: 'address', labelEn: 'Street Address', labelBn: 'ঠিকানা', value: persona.address },
    { key: 'city', labelEn: 'City & Postcode', labelBn: 'শহর ও পোস্টকোড', value: `${persona.city} - ${persona.postcode}` },
    { key: 'strongPassword', labelEn: 'Strong Password', labelBn: 'শক্তিশালী পাসওয়ার্ড', value: persona.strongPassword },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-teal-200/80 dark:border-teal-900/60 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950/70 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Wrench className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  'Manual QA Help-Hand Toolkit',
                  'ম্যানুয়াল টেস্টিং হেল্প-হ্যান্ড টুলকিট'
                )}
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-900 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                {pickLang(lang, 'Zero Paperwork · Live Aids', 'সরাসরি টেস্টিং সহায়ক')}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              {pickLang(
                lang,
                'Instant random BD/Global profiles, edge strings, downloadable test images & oversized files, live password/paste/HTML5 helpers, responsive device frames, and quick sanity checks.',
                'টেস্ট কেস বা নোট লেখার ঝামেলা ছাড়াই লাইভ ম্যানুয়াল টেস্টিংয়ে যেগুলো প্রতিদিন লাগে — র‍্যান্ডম ডাটা, ডামি ইমেজ/ফাইল জেনারেটর, পাসওয়ার্ড/পেস্ট আনলক, রেসপন্সিভ ফ্রেম ও কুইক স্যানিটি চেক।'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Shuffle className="w-3.5 h-3.5" />
            {pickLang(lang, 'Fresh Test Data', 'নতুন ডাটা নিন')}
          </button>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                active
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {pickLang(lang, t.labelEn, t.labelBn)}
            </button>
          );
        })}
      </div>

      {/* TAB 1: INSTANT PERSONAS & EDGE DATA */}
      {tab === 'instant_data' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Persona Card */}
            <div className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {pickLang(lang, '1-Click Test Persona Shuffler', '১-ক্লিক টেস্ট প্রোফাইল জেনারেটর')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {pickLang(
                      lang,
                      'Every shuffle updates the +stamp email so sign-up tests never hit duplicate email.',
                      'প্রতি ক্লিকে ইউনিক +stamp ইমেইল ও মোবাইল নম্বর তৈরি হয়।'
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-0.5 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setRegion('bd')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer ${
                        region === 'bd'
                          ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-300 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Bangladesh
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegion('global')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer ${
                        region === 'global'
                          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Global
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSeed((s) => s + 1)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {pickLang(lang, 'Shuffle', 'নতুন প্রোফাইল')}
                  </button>

                  <button
                    type="button"
                    onClick={() => copyValue(JSON.stringify(persona, null, 2), 'Full JSON')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    JSON
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {personaFields.map((item) => {
                  const isCopied = copiedKey === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => copyValue(item.value, item.key)}
                      className="text-left group rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 hover:border-teal-400 dark:hover:border-teal-700 px-3 py-2 transition-colors cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {pickLang(lang, item.labelEn, item.labelBn)}
                        </div>
                        <div className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {item.value}
                        </div>
                      </div>
                      <span className="shrink-0 p-1.5 rounded-md text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400">
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sandbox Payment Cards & BD MFS */}
            <div className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    'Sandbox Payment & MFS Test Inputs',
                    'স্যান্ডবক্স কার্ড ও bKash/Nagad টেস্ট ডাটা'
                  )}
                </h3>
              </div>

              <div className="space-y-2">
                {[
                  { id: 'visa', label: 'Visa Success (Stripe / SSL)', val: '4242424242424242', tag: 'PASS' },
                  { id: 'mc', label: 'Mastercard Success', val: '5555555555554444', tag: 'PASS' },
                  { id: '3ds', label: '3DS OTP Challenge Card', val: '4000002500003155', tag: '3DS' },
                  { id: 'decline', label: 'Card Declined Test', val: '4000000000000002', tag: 'FAIL' },
                  { id: 'funds', label: 'Insufficient Funds Test', val: '4000000000009995', tag: 'FAIL' },
                  { id: 'exp', label: 'Future Expiry / CVV', val: '12/29  |  CVV: 424', tag: 'META' },
                  { id: 'mfs_ok', label: 'Sandbox bKash / Nagad No.', val: '01770618575', tag: 'BD' },
                  { id: 'mfs_otp', label: 'Sandbox MFS OTP / PIN / Trx', val: 'OTP: 123456 | PIN: 12121 | TRX: TEST9X4K2M', tag: 'BD' },
                ].map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          {c.label}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                            c.tag === 'PASS'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : c.tag === 'FAIL'
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                          }`}
                        >
                          {c.tag}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-slate-900 dark:text-slate-100 truncate">
                        {c.val}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyValue(c.val, c.label)}
                      className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 cursor-pointer shrink-0"
                    >
                      {copiedKey === c.label
                        ? pickLang(lang, 'Copied', 'কপি হয়েছে')
                        : pickLang(lang, 'Copy', 'কপি')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Boundary & Negative Input Palette */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    'Boundary Length & Negative Edge-Case Palette',
                    'বাউন্ডারি লেংথ ও নেগেটিভ এজ-কেস প্যালেট'
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pickLang(
                    lang,
                    'Generate exact character counts (e.g. 255 / 500 chars) or click any tricky edge input to copy.',
                    'সঠিক অক্ষর সংখ্যা (যেমন ২৫৫/৫০০) জেনারেট করুন বা যেকোনো নেগেটিভ ইনপুট ১ ক্লিকে কপি করুন।'
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs">
                  <span className="text-slate-500">{pickLang(lang, 'Chars:', 'অক্ষর:')}</span>
                  <input
                    type="number"
                    min={1}
                    max={20000}
                    value={customLength}
                    onChange={(e) => setCustomLength(Number(e.target.value) || 1)}
                    className="w-16 bg-transparent font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
                <select
                  value={customChar}
                  onChange={(e) => setCustomChar(e.target.value as 'A' | '9' | 'অ')}
                  aria-label="Fill character"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200"
                >
                  <option value="A">Fill: A</option>
                  <option value="9">Fill: 9</option>
                  <option value="অ">Fill: অ (Bangla)</option>
                </select>
                {[50, 255, 500, 1000, 5000].map((presetLen) => (
                  <button
                    key={presetLen}
                    type="button"
                    onClick={() => {
                      setCustomLength(presetLen);
                      copyValue(generateExactString(presetLen, customChar), `${presetLen} chars`);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer"
                  >
                    {presetLen}c
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    copyValue(generateExactString(customLength, customChar), `${customLength} chars`)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <ClipboardCopy className="w-3.5 h-3.5" />
                  {pickLang(lang, `Copy ${customLength} Chars`, `${customLength} অক্ষর কপি`)}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {[
                {
                  id: 'spaces-only',
                  titleEn: 'Spaces Only (Required Trap)',
                  titleBn: 'শুধু স্পেস (খালি ফিল্ড ট্র্যাপ)',
                  val: '     ',
                  display: '"     " (5 spaces)',
                },
                {
                  id: 'trim-spaces',
                  titleEn: 'Leading & Trailing Spaces',
                  titleBn: 'শুরু ও শেষে বাড়তি স্পেস',
                  val: '   qa.test@example.com   ',
                  display: '"   qa.test@example.com   "',
                },
                {
                  id: 'bn-utf8',
                  titleEn: 'Bangla + Currency + Emoji',
                  titleBn: 'বাংলা + ৳ + ইমোজি UTF-8',
                  val: 'রহিম ✅ ৳১২,৫০০.৭৫ অর্ডার 🚀',
                  display: 'রহিম ✅ ৳১২,৫০০.৭৫ অর্ডার 🚀',
                },
                {
                  id: 'unbroken-word',
                  titleEn: 'Long Unbroken Word (CSS Overflow)',
                  titleBn: 'স্পেস ছাড়া লম্বা শব্দ (লেআউট চেক)',
                  val: 'SuperLongUnbrokenIdentifierWithoutAnySpacesOrHyphensForTestingCardOverflowWrappingAndEllipsis2026',
                  display: 'SuperLongUnbroken...Wrapping2026',
                },
                {
                  id: 'zero-width',
                  titleEn: 'Zero-Width Space Char',
                  titleBn: 'অদৃশ্য Zero-Width ক্যারেক্টার',
                  val: '\u200B\u200B',
                  display: '\\u200B\\u200B (invisible)',
                },
                {
                  id: 'neg-number',
                  titleEn: 'Negative Price / Qty',
                  titleBn: 'নেগেটিভ সংখ্যা (-1)',
                  val: '-1',
                  display: '-1',
                },
                {
                  id: 'decimal-edge',
                  titleEn: 'Tiny Decimal (0.001)',
                  titleBn: 'ক্ষুদ্র দশমিক (0.001)',
                  val: '0.001',
                  display: '0.001',
                },
                {
                  id: 'quotes-html',
                  titleEn: 'Quotes & Angle Brackets (Escaping)',
                  titleBn: 'কোটেশন ও <tag> এস্কেপ চেক',
                  val: `O'Reilly "Promo" <test> & Co.`,
                  display: `O'Reilly "Promo" <test> & Co.`,
                },
              ].map((edge) => (
                <button
                  key={edge.id}
                  type="button"
                  onClick={() => copyValue(edge.val, edge.id)}
                  className="text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-amber-400 dark:hover:border-amber-700 p-2.5 transition-colors cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {pickLang(lang, edge.titleEn, edge.titleBn)}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {edge.display}
                    </div>
                  </div>
                  {copiedKey === edge.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DUMMY FILE & IMAGE GENERATOR */}
      {tab === 'file_gen' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Valid Canvas Image Generator */}
          <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <FileImage className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    'Real Test Image Generator (Exact Dimensions)',
                    'রিয়েল টেস্ট ইমেজ জেনারেটর (সঠিক সাইজসহ)'
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pickLang(
                    lang,
                    'Downloads a real image stamped with its pixel dimensions so you can verify avatar crop, aspect ratio & compression.',
                    'ইমেজের ওপর পিক্সেল মাপ লেখা থাকে, তাই অ্যাভাটার বা ব্যানার ক্রপিং ঠিক আছে কি না সহজেই বোঝা যায়।'
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '100×100 Avatar', w: 100, h: 100 },
                { label: '512×512 Square', w: 512, h: 512 },
                { label: '1200×630 Banner', w: 1200, h: 630 },
                { label: '1920×1080 HD', w: 1920, h: 1080 },
                { label: '3000×3000 Heavy', w: 3000, h: 3000 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setImgWidth(p.w);
                    setImgHeight(p.h);
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border cursor-pointer ${
                    imgWidth === p.w && imgHeight === p.h
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  Width (px)
                </label>
                <input
                  type="number"
                  min={32}
                  max={4096}
                  value={imgWidth}
                  onChange={(e) => setImgWidth(Number(e.target.value) || 100)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  Height (px)
                </label>
                <input
                  type="number"
                  min={32}
                  max={4096}
                  value={imgHeight}
                  onChange={(e) => setImgHeight(Number(e.target.value) || 100)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  Format
                </label>
                <select
                  value={imgFormat}
                  onChange={(e) =>
                    setImgFormat(e.target.value as 'image/png' | 'image/jpeg' | 'image/webp')
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 font-mono text-slate-900 dark:text-slate-100"
                >
                  <option value="image/png">PNG</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/webp">WebP</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  Theme
                </label>
                <select
                  value={imgTheme}
                  onChange={(e) => setImgTheme(e.target.value as 'slate' | 'teal' | 'amber')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-slate-900 dark:text-slate-100"
                >
                  <option value="teal">Teal / Blue</option>
                  <option value="amber">Amber / Rose</option>
                  <option value="slate">Slate Dark</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                {pickLang(lang, 'Watermark Text Inside Image', 'ইমেজের ভেতরের লেখা')}
              </label>
              <input
                type="text"
                value={imgBadgeText}
                onChange={(e) => setImgBadgeText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              type="button"
              onClick={handleDownloadGeneratedImage}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {pickLang(
                lang,
                `Download ${imgWidth}×${imgHeight} Test Image`,
                `${imgWidth}×${imgHeight} টেস্ট ইমেজ ডাউনলোড করুন`
              )}
            </button>
          </div>

          {/* Valid Docs + Negative Upload Edge Files */}
          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    'Valid Import & Document Test Files',
                    'ভ্যালিড ডকুমেন্ট ও ইমপোর্ট ফাইল'
                  )}
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    kind: 'csv' as const,
                    title: 'qa-bd-sample.csv',
                    subEn: 'UTF-8 BOM CSV with Bangla + decimal rows',
                    subBn: 'বাংলা ও দশমিক ডাটাযুক্ত UTF-8 CSV',
                    icon: FileSpreadsheet,
                  },
                  {
                    kind: 'json' as const,
                    title: 'qa-sample-payload.json',
                    subEn: 'Nested JSON import payload',
                    subBn: 'নেস্টেড JSON ইমপোর্ট ফাইল',
                    icon: FileCode,
                  },
                  {
                    kind: 'pdf' as const,
                    title: 'qa-valid-sample.pdf',
                    subEn: 'Valid minimal readable %PDF-1.4 document',
                    subBn: 'ছোট ও বৈধ %PDF-1.4 ডকুমেন্ট',
                    icon: FileText,
                  },
                  {
                    kind: 'svg' as const,
                    title: 'qa-vector-test.svg',
                    subEn: 'Clean SVG icon (tests SVG whitelist/XSS)',
                    subBn: 'ক্লিন SVG আইকন আপলোড টেস্ট',
                    icon: Sparkles,
                  },
                ].map((f) => {
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.kind}
                      type="button"
                      onClick={() => handleDownloadSampleFile(f.kind)}
                      className="text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-blue-400 dark:hover:border-blue-700 p-3 transition-colors cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                          <Icon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="truncate">{f.title}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {pickLang(lang, f.subEn, f.subBn)}
                        </div>
                      </div>
                      <Download className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Negative / Edge Upload Files */}
            <div className="rounded-xl border border-rose-200/80 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    'Negative & Oversized Upload Stress Files',
                    'নেগেটিভ ও বড় সাইজের ফাইল আপলোড টেস্ট'
                  )}
                </h3>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <HardDrive className="w-4 h-4 text-rose-500" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {pickLang(lang, 'Oversized File:', 'বড় ফাইল সাইজ:')}
                  </span>
                  <select
                    value={oversizeMb}
                    onChange={(e) => setOversizeMb(Number(e.target.value))}
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                  >
                    <option value={1}>1 MB</option>
                    <option value={2}>2 MB</option>
                    <option value={5}>5 MB</option>
                    <option value={11}>11 MB</option>
                    <option value={25}>25 MB</option>
                  </select>
                  <select
                    value={oversizeExt}
                    onChange={(e) => setOversizeExt(e.target.value as 'pdf' | 'png' | 'bin')}
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                  >
                    <option value="pdf">.pdf</option>
                    <option value="png">.png</option>
                    <option value="bin">.bin</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadSampleFile('oversized')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {pickLang(lang, `Download ${oversizeMb}MB`, `${oversizeMb}MB নিন`)}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSampleFile('empty')}
                  className="text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-rose-400 p-2.5 cursor-pointer"
                >
                  <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                    0-byte .txt
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {pickLang(lang, 'Tests empty file rejection', 'খালি ফাইল রিজেকশন টেস্ট')}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSampleFile('fake_png')}
                  className="text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-rose-400 p-2.5 cursor-pointer"
                >
                  <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                    fake-mime.png
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {pickLang(lang, 'Text disguised as PNG', 'ভুয়া এক্সটেনশন/MIME চেক')}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSampleFile('long_name')}
                  className="text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-rose-400 p-2.5 cursor-pointer"
                >
                  <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                    210-char filename
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {pickLang(lang, 'Tests DB column limit', 'অতিরিক্ত লম্বা ফাইল নাম চেক')}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE PAGE HELP-HAND */}
      {tab === 'page_hands' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Terminal className="w-4 h-4 text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {extActive
                    ? pickLang(
                        lang,
                        'Extension Runtime Active — Buttons Run Directly on Your Active Browser Tab!',
                        'এক্সটেনশন সক্রিয় আছে — বাটনে ক্লিক করলেই সরাসরি লাইভ ব্রাউজার ট্যাবে কাজ করবে!'
                      )
                    : pickLang(
                        lang,
                        'Web Mode — Copy Any 1-Line Console Script OR Use the Chrome Extension Popup',
                        'ওয়েব মোড — যেকোনো বাটনে ক্লিক করে ১-লাইনের Console স্ক্রিপ্ট কপি করুন অথবা Chrome এক্সটেনশন পপআপ ব্যবহার করুন'
                      )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pickLang(
                    lang,
                    'Classic manual QA shortcuts: reveal typed passwords, unlock disabled paste, bypass HTML5 limits to test server validation, and spot broken images or overflow.',
                    'পাসওয়ার্ড দেখা, ব্লক করা পেস্ট খোলা, HTML5 লিমিট সরিয়ে সার্ভার ভ্যালিডেশন চেক এবং ভাঙা ইমেজ/ওভারফ্লো খোঁজার শর্টকাট।'
                  )}
                </p>
              </div>
            </div>
          </div>

          {lastPageLog && (
            <div
              className={`rounded-xl border p-3.5 text-xs space-y-1.5 ${
                lastPageLog.ok
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                  : 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {lastPageLog.action}: {lastPageLog.summary}
                </span>
              </div>
              {lastPageLog.details && lastPageLog.details.length > 0 && (
                <ul className="list-disc pl-5 font-mono text-[11px] space-y-0.5">
                  {lastPageLog.details.slice(0, 8).map((d, idx) => (
                    <li key={idx}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {PAGE_HELPERS.map((h) => (
              <div
                key={h.action}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-col justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {pickLang(lang, h.titleEn, h.titleBn)}
                    </h4>
                    <button
                      type="button"
                      onClick={() => handleRunPageHelper(h)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                        extActive
                          ? 'bg-teal-600 hover:bg-teal-700 text-white'
                          : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90'
                      }`}
                    >
                      {extActive ? <Play className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {extActive
                        ? pickLang(lang, 'Run on Tab', 'ট্যাবে চালান')
                        : pickLang(lang, 'Copy Snippet', 'স্ক্রিপ্ট কপি')}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {pickLang(lang, h.descEn, h.descBn)}
                  </p>
                </div>

                <pre className="p-2.5 rounded-lg bg-slate-950 text-emerald-300 font-mono text-[10px] overflow-x-auto leading-relaxed">
                  {h.snippet}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: RESPONSIVE VIEWPORT & TOUCH TARGET CHECKER */}
      {tab === 'viewport' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {DEVICE_PRESETS.map((d) => {
                  const Icon =
                    d.kind === 'mobile' ? Smartphone : d.kind === 'tablet' ? Tablet : Laptop;
                  const active = selectedDeviceId === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedDeviceId(d.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${
                        active
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{d.label}</span>
                      <span className="font-mono text-[10px] opacity-75">
                        {d.width}×{d.height}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRotated((r) => !r)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  {rotated
                    ? pickLang(lang, 'Landscape', 'ল্যান্ডস্কেপ')
                    : pickLang(lang, 'Portrait', 'পোর্ট্রেট')}
                </button>
                <select
                  value={zoomPct}
                  onChange={(e) => setZoomPct(Number(e.target.value))}
                  aria-label="Preview scale"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono"
                >
                  <option value={50}>50%</option>
                  <option value={75}>75%</option>
                  <option value={100}>100%</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-1 min-w-[240px] items-center gap-2">
                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="url"
                  value={previewUrl}
                  onChange={(e) => {
                    setPreviewUrl(e.target.value);
                    if (e.target.value.trim()) setUseBuiltInSandbox(false);
                  }}
                  placeholder="https://staging.example.com"
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setUseBuiltInSandbox((v) => !v)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                >
                  {useBuiltInSandbox
                    ? pickLang(lang, 'Load URL Frame', 'URL লোড করুন')
                    : pickLang(lang, 'Built-in Responsive Ruler', 'বিল্ট-ইন রুলার দেখুন')}
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                  {frameWidth} × {frameHeight}px
                </span>
                <span className="text-teal-700 dark:text-teal-300 font-semibold">
                  {breakpointLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Viewport Stage */}
            <div className="xl:col-span-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950 p-4 overflow-auto flex justify-center">
              <div
                style={{
                  width: Math.round((frameWidth * zoomPct) / 100),
                  height: Math.round((frameHeight * zoomPct) / 100),
                }}
                className="relative rounded-2xl border-2 border-slate-400 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md overflow-hidden shrink-0"
              >
                <div
                  style={{
                    width: frameWidth,
                    height: frameHeight,
                    transform: `scale(${zoomPct / 100})`,
                    transformOrigin: 'top left',
                  }}
                  className="bg-white dark:bg-slate-900"
                >
                  {!useBuiltInSandbox && previewUrl.trim() ? (
                    <iframe
                      title="Responsive staging preview"
                      src={previewUrl.trim()}
                      className="w-full h-full border-0"
                      sandbox="allow-scripts allow-forms allow-same-origin"
                    />
                  ) : (
                    <div className="p-4 space-y-3 h-full overflow-auto text-slate-800 dark:text-slate-200">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                        <span className="font-bold text-xs font-mono">
                          Viewport Simulator ({frameWidth}×{frameHeight})
                        </span>
                        <span className="text-[11px] font-mono text-teal-600 dark:text-teal-400">
                          {breakpointLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {pickLang(
                          lang,
                          'Enter a staging URL above (same-origin or iframe-enabled sites) or inspect responsive grid wrapping and 44×44px mobile touch targets here.',
                          'উপরে আপনার সাইটের URL দিন অথবা এখানে রেসপন্সিভ গ্রিড ও ৪৪×৪৪px টাচ টার্গেট প্রিভিউ দেখুন।'
                        )}
                      </p>
                      <div
                        className={`grid gap-2 ${
                          frameWidth < 640
                            ? 'grid-cols-1'
                            : frameWidth < 1024
                              ? 'grid-cols-2'
                              : 'grid-cols-3'
                        }`}
                      >
                        {['Header Nav & Hamburger', 'Checkout Summary Card', 'Sticky Action Bar'].map(
                          (card) => (
                            <div
                              key={card}
                              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs font-semibold"
                            >
                              {card}
                            </div>
                          )
                        )}
                      </div>
                      <div className="rounded-lg border border-dashed border-amber-400/70 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-[11px]">
                        {pickLang(
                          lang,
                          'Note: Some production sites send X-Frame-Options: DENY. If an external URL appears blank, test it in a normal tab with VeriPulse Extension Resize/Overflow Scanner.',
                          'নোট: অনেক লাইভ সাইট X-Frame-Options দিয়ে iframe ব্লক করে রাখে — সেক্ষেত্রে মূল ট্যাবে এক্সটেনশন দিয়ে ওভারফ্লো স্ক্যান করুন।'
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* WCAG Touch Target & Breakpoint Reference */}
            <div className="xl:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <Ruler className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(lang, 'Touch Target Check', 'বাটন টাচ সাইজ চেক')}
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'Mobile buttons/links should be at least 44×44 px (WCAG 2.5.5) for comfortable tapping.',
                  'মোবাইলে বাটন বা লিংক অন্তত ৪৪×৪৪ px হলে আঙুল দিয়ে চাপতে সমস্যা হয় না।'
                )}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Width (px)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={touchW}
                    onChange={(e) => setTouchW(Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Height (px)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={touchH}
                    onChange={(e) => setTouchH(Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div
                className={`rounded-lg border p-3 text-xs font-semibold flex items-center gap-2 ${
                  touchW >= 44 && touchH >= 44
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                    : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                }`}
              >
                {touchW >= 44 && touchH >= 44 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{pickLang(lang, 'PASS (≥ 44×44px)', 'সঠিক মাপ (≥ ৪৪×৪৪px)')}</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {pickLang(
                        lang,
                        'Too Small for Mobile (< 44px)',
                        'মোবাইলের জন্য ছোট (< ৪৪px)'
                      )}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center justify-center p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div
                  style={{
                    width: Math.min(180, Math.max(12, touchW)),
                    height: Math.min(100, Math.max(12, touchH)),
                  }}
                  className="rounded-md bg-blue-600 text-white text-[10px] font-mono flex items-center justify-center shadow-xs"
                >
                  {touchW}×{touchH}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: STOPWATCH, COUNTERS, SANITY RESET CHECKLIST & TEXT/REGEX LAB */}
      {tab === 'quick_tools' && (
        <div className="space-y-4">
          {/* Stopwatch + Rapid Exploratory Counters */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  {pickLang(lang, 'Exploratory Session Stopwatch', 'টেস্টিং সেশন স্টপওয়াচ')}
                </span>
              </div>
              <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 tracking-tight">
                {formatStopwatch(elapsedMs)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRunning((r) => !r)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                    running
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-teal-600 hover:bg-teal-700 text-white'
                  }`}
                >
                  {running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {running
                    ? pickLang(lang, 'Pause', 'বিরতি')
                    : pickLang(lang, 'Start', 'শুরু')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRunning(false);
                    setElapsedMs(0);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Reset', 'রিসেট')}
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    'Quick Exploratory Tap Counters (Zero Forms)',
                    'কুইক ট্যাপ কাউন্টার (কোনো ফর্ম ছাড়াই হিসাব রাখুন)'
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setCounters({ flows: 0, edges: 0, glitches: 0 })}
                  className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  {pickLang(lang, 'Reset Counters', 'রিসেট')}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  { key: 'flows' as const, labelEn: 'Flows Tested', labelBn: 'ফ্লো চেকড', color: 'text-blue-600 dark:text-blue-400' },
                  { key: 'edges' as const, labelEn: 'Edge Cases Tried', labelBn: 'এজ কেস টেস্ট', color: 'text-teal-600 dark:text-teal-400' },
                  { key: 'glitches' as const, labelEn: 'Issues Spotted', labelBn: 'সমস্যা পাওয়া গেছে', color: 'text-rose-600 dark:text-rose-400' },
                ].map((c) => (
                  <div
                    key={c.key}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {pickLang(lang, c.labelEn, c.labelBn)}
                      </div>
                      <div className={`text-xl font-bold font-mono tabular-nums ${c.color}`}>
                        {counters[c.key]}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setCounters((prev) => ({
                            ...prev,
                            [c.key]: Math.max(0, prev[c.key] - 1),
                          }))
                        }
                        aria-label={`Decrease ${c.labelEn}`}
                        className="p-1.5 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCounters((prev) => ({ ...prev, [c.key]: prev[c.key] + 1 }))
                        }
                        aria-label={`Increase ${c.labelEn}`}
                        className="p-1.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 12-Point Rapid Manual Sanity Ticks */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    `Fast 12-Point Manual Sanity Ticks (${sanityDoneCount}/${SANITY_CHECKS.length})`,
                    `দ্রুত ১২-পয়েন্ট ম্যানুয়াল স্যানিটি চেক (${sanityDoneCount}/${SANITY_CHECKS.length})`
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pickLang(
                    lang,
                    'Quick mental reminders while clicking through a new build — reset with 1 click for the next ticket.',
                    'নতুন বিল্ড টেস্ট করার সময় যে জিনিসগুলো মিস হয়ে যায় — এক ক্লিকে টিক দিন ও রিসেট করুন।'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCheckedSanity({})}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5" />
                {pickLang(lang, 'Reset All Ticks', 'সব টিক রিসেট')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {SANITY_CHECKS.map((item) => {
                const checked = Boolean(checkedSanity[item.id]);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setCheckedSanity((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                    }
                    className={`text-left rounded-lg border px-3 py-2 text-xs transition-colors cursor-pointer flex items-start gap-2 ${
                      checked
                        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      className="mt-0.5 accent-emerald-600 pointer-events-none"
                    />
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono uppercase text-slate-400 mr-1.5">
                        [{item.group}]
                      </span>
                      <span className={checked ? 'line-through opacity-80' : ''}>
                        {pickLang(lang, item.en, item.bn)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Text / Byte / Encode / Regex Scratchpad */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                  <Binary className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  {pickLang(
                    lang,
                    'Text, UTF-8 Byte & Encode Lab',
                    'টেক্সট, বাইট ও এনকোড/ডিকোড ল্যাব'
                  )}
                </span>
                <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500">
                  <span>{scratchText.length} chars</span>
                  <span>·</span>
                  <span>{utf8Bytes} bytes</span>
                  <span>·</span>
                  <span>{scratchText.trim().length} trimmed</span>
                </div>
              </div>

              <textarea
                rows={3}
                value={scratchText}
                onChange={(e) => setScratchText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />

              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Trim', fn: () => setScratchText((s) => s.trim()) },
                  { label: 'UPPER', fn: () => setScratchText((s) => s.toUpperCase()) },
                  { label: 'lower', fn: () => setScratchText((s) => s.toLowerCase()) },
                  { label: 'URL Encode', fn: () => setScratchText((s) => encodeURIComponent(s)) },
                  {
                    label: 'URL Decode',
                    fn: () => {
                      try {
                        setScratchText((s) => decodeURIComponent(s));
                      } catch {
                        onNotify?.('Invalid URL-encoded string.');
                      }
                    },
                  },
                  {
                    label: 'Base64 Encode',
                    fn: () => {
                      try {
                        const bytes = new TextEncoder().encode(scratchText);
                        let bin = '';
                        bytes.forEach((b) => {
                          bin += String.fromCharCode(b);
                        });
                        setScratchText(btoa(bin));
                      } catch {
                        onNotify?.('Failed to Base64 encode.');
                      }
                    },
                  },
                  {
                    label: 'Base64 Decode',
                    fn: () => {
                      try {
                        const bin = atob(scratchText.trim());
                        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
                        setScratchText(new TextDecoder().decode(bytes));
                      } catch {
                        onNotify?.('Invalid Base64 text.');
                      }
                    },
                  },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={btn.fn}
                    className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {btn.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => copyValue(scratchText, 'Scratchpad')}
                  className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-semibold cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  {pickLang(lang, 'Copy', 'কপি')}
                </button>
              </div>
            </div>

            {/* Live Regex Tester */}
            <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                  <ScanSearch className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  {pickLang(lang, 'Live Validation Regex Checker', 'ভ্যালিডেশন Regex লাইভ চেকার')}
                </span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: 'BD Phone', re: '^(?:\\+?88)?01[3-9]\\d{8}$', sample: '01712345678' },
                    { label: 'Email', re: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', sample: 'qa@example.com' },
                    { label: 'Strong PW', re: '^(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}$', sample: 'Qa#Pulse9!' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setRegexPattern(preset.re);
                        setRegexTestInput(preset.sample);
                      }}
                      className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <input
                  type="text"
                  value={regexPattern}
                  onChange={(e) => setRegexPattern(e.target.value)}
                  placeholder="Regex pattern..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 font-mono text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  value={regexTestInput}
                  onChange={(e) => setRegexTestInput(e.target.value)}
                  placeholder="Test input string..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 font-mono text-slate-900 dark:text-slate-100"
                />
              </div>

              <div
                className={`rounded-lg border px-3 py-2 text-xs font-semibold flex items-center gap-2 ${
                  !regexEvaluation.valid
                    ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                    : regexEvaluation.matched
                      ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                      : 'border-rose-300 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                }`}
              >
                {!regexEvaluation.valid
                  ? `Invalid Regex: ${regexEvaluation.error}`
                  : regexEvaluation.matched
                    ? pickLang(lang, 'MATCHES PATTERN (Valid Input)', 'প্যাটার্ন ম্যাচ করেছে (ভ্যালিড)')
                    : pickLang(lang, 'DOES NOT MATCH (Rejected Input)', 'ম্যাচ করেনি (রিজেক্ট হবে)')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
