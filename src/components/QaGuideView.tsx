import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  Blocks,
  BookOpen,
  CheckCircle2,
  FolderArchive,
  GitBranch,
  Layers,
  Megaphone,
  PenTool,
  Radar,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { AppLanguage } from '../types/flowguard';
import { pickLang } from '../i18n/translations';

interface QaGuideViewProps {
  lang: AppLanguage;
  onChangeLang: (lang: AppLanguage) => void;
  onOpenSection: (
    section:
      | 'flows'
      | 'rbac'
      | 'logic'
      | 'coverage'
      | 'diagram'
      | 'alerts'
      | 'extension'
      | 'settings'
  ) => void;
}

type GuideCategory = 'all' | 'quickstart' | 'testing' | 'diagrams' | 'extension';

interface GuideCardItem {
  id: string;
  category: Exclude<GuideCategory, 'all'>;
  targetSection:
    | 'flows'
    | 'rbac'
    | 'logic'
    | 'coverage'
    | 'diagram'
    | 'alerts'
    | 'extension';
  icon: React.ComponentType<{ className?: string }>;
  colorBorder: string;
  colorBadge: string;
  colorIconBg: string;
  colorBtn: string;
  titleEn: string;
  titleBn: string;
  summaryEn: string;
  summaryBn: string;
  stepsEn: string[];
  stepsBn: string[];
  tipEn: string;
  tipBn: string;
}

const GUIDE_CARDS: GuideCardItem[] = [
  {
    id: 'guide_record',
    category: 'quickstart',
    targetSection: 'extension',
    icon: Blocks,
    colorBorder: 'border-rose-200/90 dark:border-rose-900/60',
    colorBadge: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
    colorIconBg: 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400',
    colorBtn: 'bg-rose-600 hover:bg-rose-700 text-white',
    titleEn: '1. Record Actions & Live Python Codegen',
    titleBn: '১. স্ক্রিন অ্যাকশন থেকে লাইভ Codegen (পাইথন/TS)',
    summaryEn:
      'Turn on Codegen recording, interact with any webpage (or screen video), and watch VeriPulse write Python pytest, Playwright TS, or JS code automatically in real time.',
    summaryBn:
      'কোডজেন রেকর্ডিং চালু করে যেকোনো ওয়েব ফর্মে ক্লিক ও টাইপ করুন—VeriPulse সাথে সাথেই আপনার অ্যাকশনগুলো থেকে Python pytest বা Playwright কোডবেস স্বয়ংক্রিয়ভাবে লিখে দেবে।',
    stepsEn: [
      'Click "Start Codegen Record" in Workflow Flows (or use the Chrome extension popup).',
      'Interact with buttons and inputs — watch the Live Codegen panel stream pytest code.',
      'Copy or download _test.py directly, or click "Add to Flow" to save steps.',
    ],
    stepsBn: [
      '"টেস্ট ফ্লো" থেকে "কোডজেন রেকর্ড শুরু" চাপুন (অথবা ক্রোম এক্সটেনশন পপআপ ব্যবহার করুন)।',
      'পেজের বাটন ও ইনপুটে কাজ করুন — নিচের লাইভ কোডজেন প্যানেলে সাথে সাথে pytest কোড লেখা হবে।',
      'সরাসরি _test.py ডাউনলোড/কপি করুন অথবা "ফ্লো-তে যোগ করুন" দিয়ে সেভ করুন।',
    ],
    tipEn: 'Passwords, PINs, and tokens automatically convert to os.environ.get() secrets.',
    tipBn: 'পাসওয়ার্ড বা পিন কোডের মধ্যে নিরাপদভাবে os.environ.get() হিসেবে থাকে।',
  },
  {
    id: 'guide_flows',
    category: 'quickstart',
    targetSection: 'flows',
    icon: Layers,
    colorBorder: 'border-blue-200/90 dark:border-blue-900/60',
    colorBadge: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300',
    colorIconBg: 'bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400',
    colorBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
    titleEn: '2. Live DOM Verify, Realism Score & pytest Export',
    titleBn: '২. টেস্ট রিয়েলিজম, লাইভ DOM যাচাই ও pytest রান',
    summaryEn:
      'Check the Realism Confidence meter: "Run Spec Check" validates step syntax locally, "Probe Live Tab" checks real elements in Chrome, and exported pytest runs full E2E tests.',
    summaryBn:
      'রিয়েলিজম স্কোর দেখুন: "স্পেক চেক" শুধু ডেটা ও সিলেক্টর যাচাই করে; আসল ওয়েবপেজ টেস্ট করতে ক্রোম এক্সটেনশন দিয়ে "লাইভ পেজ যাচাই" দিন বা pytest কোড টার্মিনালে চালান।',
    stepsEn: [
      'Review the Realism Confidence % above your steps to see Live DOM vs Spec coverage.',
      'In Chrome Extension, click "Probe Live Tab" to verify elements on the open webpage.',
      'Export _test.py and run "pytest -v --headed" for full real-browser E2E execution.',
    ],
    stepsBn: [
      'স্টেপ তালিকার ওপরে "টেস্ট রিয়েলিজম স্কোর" দেখে নিন কতগুলো স্টেপ লাইভ DOM যাচাই হয়েছে।',
      'ক্রোম এক্সটেনশনে খোলা ওয়েবসাইটে "লাইভ পেজ যাচাই" বাটনে ক্লিক করে আসল DOM চেক করুন।',
      'সম্পূর্ণ রিয়েল ব্রাউজার টেস্ট চালাতে _test.py ডাউনলোড করে "pytest -v --headed" রান করুন।',
    ],
    tipEn: 'Realism transparency tells you exactly what was probed live vs checked statically.',
    tipBn: 'প্রতিটি স্টেপের নিচে "Live DOM" নাকি "Spec Check" তা স্পষ্ট লেখা থাকে।',
  },
  {
    id: 'guide_rbac',
    category: 'testing',
    targetSection: 'rbac',
    icon: ShieldCheck,
    colorBorder: 'border-emerald-200/90 dark:border-emerald-900/60',
    colorBadge: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
    colorIconBg: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400',
    colorBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    titleEn: '3. Role Permissions, Approval Chain & Security Audit',
    titleBn: '৩. রোল পারমিশন, অ্যাপ্রুভাল চেইন ডায়াগ্রাম ও সিকিউরিটি অডিট',
    summaryEn:
      'Draw who approves after whom with QA notes, probe live browser permissions per logged-in role, catch privilege leaks, and auto-generate pytest RBAC tests.',
    summaryBn:
      'কার পরে কে অ্যাপ্রুভ করবে তা ডায়াগ্রাম ও নোট আকারে সাজান (বা ড্র করুন), প্রতিটি রোলের লাইভ পেজ পারমিশন যাচাই করুন এবং অটোমেটেড সিকিউরিটি টেস্ট তৈরি করুন।',
    stepsEn: [
      'Use "Approval Chain Diagram" to map approval order, conditions, notes, and sketch annotations.',
      'Select your logged-in role in the top bar and click "Probe Role on Tab" to detect Security Drift.',
      'Open "QA Security & Test Gen" to review privilege leaks and download _rbac_test.py.',
    ],
    stepsBn: [
      '"অ্যাপ্রুভাল চেইন ডায়াগ্রাম" ট্যাবে ধাপে ধাপে কার পরে কে অ্যাপ্রুভ করবে তা নোট বা ড্র করুন।',
      'ওপরের ড্রপডাউন থেকে আপনার লগইন করা রোল বেছে "এই রোল পেজে যাচাই করুন" চাপুন।',
      '"QA অডিট ও টেস্ট কোড" ট্যাবে গিয়ে সিকিউরিটি লিক দেখুন এবং _rbac_test.py ডাউনলোড করুন।',
    ],
    tipEn: 'Prevents privilege leaks, missing negative role checks, and self-approval bugs.',
    tipBn: 'রিলিজের আগে পারমিশন লিক, নেগেটিভ টেস্টের ঘাটতি ও সেলফ-অ্যাপ্রুভাল বাগ ধরে দেয়।',
  },
  {
    id: 'guide_logic',
    category: 'testing',
    targetSection: 'logic',
    icon: GitBranch,
    colorBorder: 'border-amber-200/90 dark:border-amber-900/60',
    colorBadge: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
    colorIconBg: 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400',
    colorBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
    titleEn: '4. Test Status Jumps, Dates & Formulas',
    titleBn: '৪. স্ট্যাটাস জাম্প, তারিখ এবং হিসাবের নিয়ম পরীক্ষা',
    summaryEn:
      'Use the interactive State Graph to test whether an item can skip required review stages, and validate date cutoffs or calculation formulas.',
    summaryBn:
      'ভিজ্যুয়াল স্টেট গ্রাফে ক্লিক করে দেখুন কোনো আইটেম নিয়ম ভেঙে "Draft" থেকে সরাসরি "Approved" হতে পারে কিনা, আর তারিখ ও হিসাব ঠিক আছে কিনা।',
    stepsEn: [
      'Click any arrow in the State Lifecycle Graph to test it immediately.',
      'Use "Try Forbidden Skip" to confirm illegal jumps are blocked.',
      'Check Date Cutoff and Formula tabs for calculation edge cases.',
    ],
    stepsBn: [
      'স্টেট গ্রাফের যেকোনো তীরচিহ্নে ক্লিক করে সরাসরি নিয়মটি পরীক্ষা করুন।',
      '"Try Forbidden Skip" দিয়ে দেখুন নিষিদ্ধ ধাপ ঠিকমতো ব্লক হচ্ছে কিনা।',
      'তারিখ কাটঅফ ও ফর্মুলা ট্যাবে গিয়ে হিসাবের সঠিকতা যাচাই করুন।',
    ],
    tipEn: 'Green solid arrows mean allowed paths; red dashed arrows mark forbidden skips.',
    tipBn: 'সবুজ তীর মানে অনুমোদিত পথ, আর লাল ড্যাশড তীর মানে নিষিদ্ধ জাম্প।',
  },
  {
    id: 'guide_diagram',
    category: 'diagrams',
    targetSection: 'diagram',
    icon: PenTool,
    colorBorder: 'border-indigo-200/90 dark:border-indigo-900/60',
    colorBadge: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300',
    colorIconBg: 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400',
    colorBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    titleEn: '5. Draw Flowcharts, Annotate & Export Out',
    titleBn: '৫. ফ্লোচার্ট আঁকুন, ড্র করুন এবং ডায়াগ্রাম আউট করুন',
    summaryEn:
      'Generate a flowchart directly from any test flow or rule, drag nodes, sketch freehand highlights/arrows, and export SVG, PNG, or Mermaid code.',
    summaryBn:
      'আপনার টেস্ট ফ্লো থেকে ১ ক্লিকে ফ্লোচার্ট বানান, বক্স ড্র্যাগ করুন, পেন বা অ্যারো দিয়ে মার্ক করুন এবং SVG, PNG ছবি বা Mermaid কোড আকারে এক্সপোর্ট করুন।',
    stepsEn: [
      'Click "Flow → Flowchart" or "Rules → Flowchart" to auto-generate a diagram.',
      'Drag boxes in Move mode, link them with Connect, or sketch with Pen/Box/Arrow.',
      'Click "Export PNG", "SVG", or "Mermaid Code" to share in Jira, GitHub, or docs.',
    ],
    stepsBn: [
      '"ফ্লো থেকে ফ্লোচার্ট" বা "রুলস থেকে ফ্লোচার্ট" দিয়ে অটো ডায়াগ্রাম বানান।',
      'Move মোডে বক্স ড্র্যাগ করুন, Connect দিয়ে তীর যোগ করুন, বা পেন/বক্স দিয়ে ড্র করুন।',
      '"PNG আউট করুন", "SVG" বা "Mermaid কোড" দিয়ে টিমের সাথে শেয়ার করুন।',
    ],
    tipEn: 'Click any box on the canvas to rename it or change its shape style.',
    tipBn: 'ক্যানভাসের যেকোনো বক্সে ক্লিক করে লেখা ও রঙ পরিবর্তন করা যায়।',
  },
  {
    id: 'guide_notice',
    category: 'diagrams',
    targetSection: 'diagram',
    icon: Megaphone,
    colorBorder: 'border-teal-200/90 dark:border-teal-900/60',
    colorBadge: 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300',
    colorIconBg: 'bg-teal-100 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400',
    colorBtn: 'bg-teal-600 hover:bg-teal-700 text-white',
    titleEn: '6. Issue Allowed & Blocked QA Notices',
    titleBn: '৬. এলাউড ও ব্লকড QA নোটিশ প্রকাশ করুন',
    summaryEn:
      'Publish clear Allowed, Restricted, Blocked, or Advisory notices so teammates know what is verified, what is forbidden, and what to watch out for.',
    summaryBn:
      'কোন ফিচারটি টেস্টে পাস করে "Allowed", কোনটি "Blocked" এবং কোনটিতে সতর্কতা প্রয়োজন—তা লাইভ ব্যানার হিসেবে পিন করুন ও কপি করে শেয়ার করুন।',
    stepsEn: [
      'Open "Flowchart & Notices" and switch to the "Allowed Notices" tab.',
      'Choose a decision type (Allowed, Restricted, Blocked, or Advisory).',
      'Toggle "Pin Live Banner" to display it across the workspace or drop it onto your Flowchart.',
    ],
    stepsBn: [
      '"ফ্লোচার্ট ও নোটিশ" ট্যাবের ভেতর "এলাউড নোটিশ" অংশে যান।',
      'ধরন বেছে নিন (Allowed / Restricted / Blocked / Advisory) এবং বিবরণ লিখুন।',
      '"পিন করুন" চালু করলে পুরো ওয়ার্কস্পেসের ওপরে দেখাবে, অথবা ফ্লোচার্টে যোগ করুন।',
    ],
    tipEn: 'Use the Copy button to paste formatted QA notices directly into chat or tickets.',
    tipBn: 'কপি বাটন দিয়ে ফরম্যাটেড নোটিশ সরাসরি টিম চ্যাট বা বাগ টিকেটে পেস্ট করতে পারবেন।',
  },
  {
    id: 'guide_coverage',
    category: 'testing',
    targetSection: 'coverage',
    icon: Radar,
    colorBorder: 'border-violet-200/90 dark:border-violet-900/60',
    colorBadge: 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300',
    colorIconBg: 'bg-violet-100 dark:bg-violet-950/80 text-violet-600 dark:text-violet-400',
    colorBtn: 'bg-violet-600 hover:bg-violet-700 text-white',
    titleEn: '7. Pick Elements & Measure UI Coverage',
    titleBn: '৭. এলিমেন্ট লোকেটর ধরুন ও UI কভারেজ দেখুন',
    summaryEn:
      'Scan any webpage to list all buttons, inputs, checkboxes, and dropdowns—see what percentage is tested and grab clean CSS/XPath selectors.',
    summaryBn:
      'যেকোনো ওয়েবপেজ স্ক্যান করে সব বাটন, ইনপুট ও সিলেক্ট বক্সের তালিকা দেখুন, কত শতাংশ টেস্ট হয়েছে তা মাপুন এবং সহজ লোকেটর কপি করুন।',
    stepsEn: [
      'Click "Pick Element" in the VeriPulse Chrome popup.',
      'Click any control on the page to inspect its CSS selector and XPath.',
      'Click "Scan Controls" to track Tested vs. Untested controls on the page.',
    ],
    stepsBn: [
      'VeriPulse ক্রোম এক্সটেনশন পপআপ থেকে "Pick Element" বাটনে ক্লিক করুন।',
      'পেজের যেকোনো বাটন বা ফিল্ডে ক্লিক করে তার CSS সিলেক্টর ও XPath নিন।',
      '"Scan Controls" দিয়ে পেজের সব কন্ট্রোলের টেস্টিং কভারেজ দেখুন।',
    ],
    tipEn: 'You can send any picked element directly into your active Test Flow in one click.',
    tipBn: 'ধরা এলিমেন্টটি এক ক্লিকেই আপনার অ্যাক্টিভ টেস্ট ফ্লো-তে যোগ করা যায়।',
  },
  {
    id: 'guide_extension_install',
    category: 'extension',
    targetSection: 'extension',
    icon: FolderArchive,
    colorBorder: 'border-sky-200/90 dark:border-sky-900/60',
    colorBadge: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
    colorIconBg: 'bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400',
    colorBtn: 'bg-sky-600 hover:bg-sky-700 text-white',
    titleEn: '8. How to Install VeriPulse in Google Chrome',
    titleBn: '৮. গুগল ক্রোমে VeriPulse এক্সটেনশন ইনস্টল গাইডলাইন',
    summaryEn:
      'Install VeriPulse locally in under 1 minute as an unpacked Manifest V3 Chrome Extension so you can record and scan any live website.',
    summaryBn:
      'যেকোনো লাইভ ওয়েবসাইটে ব্যবহার করতে ১ মিনিটের মধ্যেই VeriPulse Manifest V3 ক্রোম এক্সটেনশন হিসেবে ইনস্টল করে নিন।',
    stepsEn: [
      'Step 1 — Build or Download: Run "npm run build" to generate dist/, or download the ZIP bundle from Chrome Extension and unzip it.',
      'Step 2 — Enable Developer Mode: Open chrome://extensions in Chrome and turn ON Developer mode in the top-right corner.',
      'Step 3 — Load Unpacked: Click "Load unpacked", select the dist/ folder, and pin VeriPulse to your browser toolbar.',
    ],
    stepsBn: [
      'ধাপ ১ — বিল্ড বা ডাউনলোড: "npm run build" চালিয়ে dist/ ফোল্ডার তৈরি করুন অথবা "ক্রোম এক্সটেনশন" থেকে ZIP ডাউনলোড করে আনজিপ করুন।',
      'ধাপ ২ — ডেভেলপার মোড: Chrome-এ chrome://extensions খুলে ডান পাশের ওপরে "Developer mode" চালু করুন।',
      'ধাপ ৩ — লোড আনপ্যাকড: "Load unpacked" বাটনে ক্লিক করে dist/ ফোল্ডারটি সিলেক্ট করুন এবং টুলবারে VeriPulse পিন করুন।',
    ],
    tipEn: 'All recordings, rules, and backups stay 100% private on your computer.',
    tipBn: 'আপনার সব ডেটা, রেকর্ডিং ও ব্যাকআপ শতভাগ আপনার নিজের কম্পিউটারেই নিরাপদ থাকে।',
  },
  {
    id: 'guide_self_alerts',
    category: 'quickstart',
    targetSection: 'alerts',
    icon: BellRing,
    colorBorder: 'border-orange-200/90 dark:border-orange-900/60',
    colorBadge: 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300',
    colorIconBg: 'bg-orange-100 dark:bg-orange-950/80 text-orange-600 dark:text-orange-400',
    colorBtn: 'bg-orange-600 hover:bg-orange-700 text-white',
    titleEn: '9. Self Alert Timers & Scheduled Popups',
    titleBn: '৯. সেলফ অ্যালার্ট টাইমার ও রিমাইন্ডার পপআপ',
    summaryEn:
      'Set a countdown timer or pick a specific clock time with your reminder message—when due, VeriPulse sends a desktop notification and pops up the text.',
    summaryBn:
      'যেকোনো সময় বা টাইমার এবং রিমাইন্ডার টেক্সট সেট করে রাখুন। সময় হলেই ডেস্কটপ নোটিফিকেশন ও পপআপের মাধ্যমে আপনাকে জানিয়ে দেবে।',
    stepsEn: [
      'Open "Self Alerts" (or set a quick minute timer inside the Chrome popup).',
      'Choose Countdown Timer or Specific Clock Time and enter your reminder text.',
      'When time expires, view the alert popup on any tab or Snooze +5m.',
    ],
    stepsBn: [
      '"সেলফ অ্যালার্ট" ট্যাব খুলুন অথবা ক্রোম এক্সটেনশন পপআপ থেকে দ্রুত টাইমার দিন।',
      'কাউন্টডাউন টাইমার বা নির্দিষ্ট সময় বেছে নিয়ে আপনার মেসেজটি লিখুন।',
      'সময় শেষ হলেই নোটিফিকেশন ও পপআপ দেখাবে; চাইলে ৫ মিনিট স্নুজও করতে পারবেন।',
    ],
    tipEn: 'Try the "10 sec (Quick)" preset to test the alert popup right away.',
    tipBn: 'তাৎক্ষণিক পরীক্ষা করতে "১০ সেকেন্ড (কুইক)" বাটনে ক্লিক করে দেখতে পারেন।',
  },
];

export const QaGuideView: React.FC<QaGuideViewProps> = ({
  lang,
  onChangeLang,
  onOpenSection,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<GuideCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return GUIDE_CARDS.filter((card) => {
      if (categoryFilter !== 'all' && card.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        card.titleEn,
        card.titleBn,
        card.summaryEn,
        card.summaryBn,
        ...card.stepsEn,
        ...card.stepsBn,
        card.tipEn,
        card.tipBn,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [categoryFilter, searchQuery]);

  const categoryLabels: Record<GuideCategory, { en: string; bn: string }> = {
    all: { en: 'All Guidelines', bn: 'সকল গাইডলাইন' },
    quickstart: { en: 'Quick Start', bn: 'সহজ শুরু' },
    testing: { en: 'QA Testing Rules', bn: 'টেস্টিং ও নিয়ম' },
    diagrams: { en: 'Flowcharts & Notices', bn: 'ফ্লোচার্ট ও নোটিশ' },
    extension: { en: 'Chrome Extension Setup', bn: 'এক্সটেনশন ইনস্টল' },
  };

  return (
    <div className="space-y-5">
      {/* Unified Guidelines Hub Header */}
      <div className="rounded-xl border border-teal-200/80 dark:border-teal-900/60 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  'VeriPulse Guidelines Center — Everything in One Place',
                  'VeriPulse গাইডলাইন সেন্টার — সব নির্দেশিকা এক জায়গায়'
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                {pickLang(
                  lang,
                  'All onboarding steps, extension installation instructions, flowchart tips, and QA checklists are organized cleanly here so anyone can learn anytime without cluttering the workspace.',
                  'ওয়ার্কস্পেস পরিচ্ছন্ন রাখতে সব গাইডলাইন, এক্সটেনশন ইনস্টল ধাপ, ফ্লোচার্ট ও নোটিশ ব্যবহারের নিয়ম একসাথে এখানে রাখা হয়েছে—প্রয়োজন হলেই এখান থেকে দেখে নিতে পারবেন।'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => onChangeLang('bn')}
                className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                  lang === 'bn'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                বাংলা
              </button>
              <button
                type="button"
                onClick={() => onChangeLang('en')}
                className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                  lang === 'en'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Tabs + Guideline Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              ['all', 'quickstart', 'testing', 'diagrams', 'extension'] as GuideCategory[]
            ).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  categoryFilter === cat
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                }`}
              >
                {pickLang(lang, categoryLabels[cat].en, categoryLabels[cat].bn)}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={pickLang(
                lang,
                'Search guidelines...',
                'গাইডলাইন খুঁজুন...'
              )}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Guideline Cards Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500">
          {pickLang(
            lang,
            'No matching guidelines found. Try clearing your search filter.',
            'কোনো গাইডলাইন পাওয়া যায়নি। সার্চ ফিল্টার মুছে আবার চেষ্টা করুন।'
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((card) => {
            const Icon = card.icon;
            const steps = lang === 'bn' ? card.stepsBn : card.stepsEn;
            const catLabel = categoryLabels[card.category];
            return (
              <div
                key={card.id}
                className={`rounded-xl border ${card.colorBorder} bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col justify-between gap-4`}
              >
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${card.colorIconBg}`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {pickLang(lang, card.titleEn, card.titleBn)}
                        </h3>
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${card.colorBadge}`}
                        >
                          {pickLang(lang, catLabel.en, catLabel.bn)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {pickLang(lang, card.summaryEn, card.summaryBn)}
                  </p>

                  <div className="rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 p-3 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      {pickLang(lang, 'Step-by-step instructions:', 'ধাপে ধাপে নির্দেশিকা:')}
                    </div>
                    <ol className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                      {steps.map((st, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="font-mono text-[11px] font-bold text-slate-400 shrink-0 mt-0.5">
                            0{idx + 1}.
                          </span>
                          <span>{st}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>{pickLang(lang, card.tipEn, card.tipBn)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenSection(card.targetSection)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${card.colorBtn}`}
                  >
                    <span>{pickLang(lang, 'Open Tool', 'টুলটি খুলুন')}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick QA Sign-Off Checklist */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          <Radar className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <span>
            {pickLang(
              lang,
              'Quick QA Sign-Off Checklist',
              'রিলিজের আগে দ্রুত QA চেকলিস্ট'
            )}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/50">
            <div className="font-semibold text-blue-800 dark:text-blue-300">
              {pickLang(lang, '1. Happy & Edge Flows', '১. মূল ও এজ-কেস ফ্লো')}
            </div>
            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
              {pickLang(
                lang,
                'Every form step passed and Playwright script exported.',
                'ফর্মের প্রতিটি ধাপ পাস করেছে এবং টেস্ট স্ক্রিপ্ট সেভ আছে।'
              )}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50">
            <div className="font-semibold text-emerald-800 dark:text-emerald-300">
              {pickLang(lang, '2. Role Boundaries', '২. রোল ও পারমিশন')}
            </div>
            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
              {pickLang(
                lang,
                'Restricted actions stay hidden or disabled for basic users.',
                'সাধারণ ইউজারের কাছে অ্যাডমিন বাটন লুকানো বা লক করা আছে।'
              )}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50">
            <div className="font-semibold text-amber-800 dark:text-amber-300">
              {pickLang(lang, '3. Logic & Flowchart', '৩. লজিক ও ফ্লোচার্ট')}
            </div>
            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
              {pickLang(
                lang,
                'Illegal status jumps blocked and flowchart exported for team.',
                'অবৈধ স্টেট জাম্প বন্ধ আছে এবং ফ্লোচার্ট টিমের সাথে শেয়ার করা হয়েছে।'
              )}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50">
            <div className="font-semibold text-rose-800 dark:text-rose-300">
              {pickLang(lang, '4. Allowed Notice Issued', '৪. এলাউড নোটিশ প্রকাশ')}
            </div>
            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
              {pickLang(
                lang,
                'Clear Allowed / Blocked notice pinned for developers.',
                'কোন অংশ অনুমোদিত বা ব্লকড তা স্পষ্ট নোটিশ দিয়ে জানানো হয়েছে।'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
