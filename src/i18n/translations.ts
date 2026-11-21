import { AppLanguage } from '../types/flowguard';

export interface BilingualText {
  en: string;
  bn: string;
}

export function pickLang(lang: AppLanguage, en: string, bn: string): string {
  return lang === 'bn' ? bn : en;
}

export const UI_COPY = {
  brandSub: {
    en: 'Precision SQA Studio',
    bn: 'স্মার্ট SQA স্টুডিও',
  },
  workspaceLabel: {
    en: 'QA Workspace',
    bn: 'QA প্রজেক্ট',
  },
  newBtn: {
    en: 'New',
    bn: 'নতুন',
  },
  suiteGroup: {
    en: 'QA Testing Modules',
    bn: 'QA টেস্টিং মডিউল',
  },
  studioGroup: {
    en: 'Diagrams, Guidelines & Tools',
    bn: 'ডায়াগ্রাম, গাইডলাইন ও টুলস',
  },
  nav: {
    overview: { en: 'Overview & Diagram', bn: 'ওভারভিউ ও ডায়াগ্রাম' },
    flows: { en: 'Workflow Flows', bn: 'টেস্ট ফ্লো (Flows)' },
    rbac: { en: 'Role Permissions', bn: 'রোল পারমিশন' },
    logic: { en: 'Business Rules', bn: 'বিজনেস রুলস' },
    content: { en: 'Content & Formulas', bn: 'কন্টেন্ট ও ফর্মুলা' },
    visual: { en: 'Screen vs Image', bn: 'স্ক্রিন ও ইমেজ ম্যাচ' },
    bugStudio: { en: 'Bug & Test Studio', bn: 'বাগ ও টেস্ট স্টুডিও' },
    coverage: { en: 'UI Coverage', bn: 'UI কভারেজ' },
    diagram: { en: 'Flowchart & Notices', bn: 'ফ্লোচার্ট ও নোটিশ' },
    alerts: { en: 'Self Alerts', bn: 'সেলফ অ্যালার্ট' },
    recycleBin: { en: 'Recycle Bin', bn: 'রিসাইকেল বিন' },
    guide: { en: 'All Guidelines', bn: 'সকল গাইডলাইন' },
    extension: { en: 'Chrome Extension', bn: 'ক্রোম এক্সটেনশন' },
    settings: { en: 'Settings', bn: 'সেটিংস' },
  },
  topBar: {
    showDiagram: { en: 'Overview', bn: 'ওভারভিউ' },
    hideDiagram: { en: 'Overview', bn: 'ওভারভিউ' },
    openGuide: { en: 'Guidelines', bn: 'গাইডলাইন' },
    getExtension: { en: 'Get Extension', bn: 'এক্সটেনশন নিন' },
  },
  summary: {
    stepsTitle: { en: 'Workflow Steps', bn: 'টেস্ট স্টেপস' },
    activeFlows: { en: 'active flows', bn: 'টি সক্রিয় ফ্লো' },
    rbacTitle: { en: 'Role Permissions', bn: 'রোল পারমিশন' },
    rbacSub: { en: 'Access checks verified', bn: 'অ্যাক্সেস যাচাই সম্পন্ন' },
    logicTitle: { en: 'Business Rules', bn: 'বিজনেস রুলস' },
    logicSub: { en: 'Status, date & formulas', bn: 'স্ট্যাটাস, তারিখ ও ফর্মুলা' },
    covTitle: { en: 'UI Coverage', bn: 'UI কভারেজ' },
    covSub: { en: 'buttons & inputs', bn: 'টি বাটন ও ইনপুট' },
  },
  pipeline: {
    title: {
      en: 'VeriPulse SQA Workflow Diagram',
      bn: 'VeriPulse SQA কাজের সম্পূর্ণ ডায়াগ্রাম',
    },
    subtitle: {
      en: 'Your end-to-end QA pipeline from recording actions to verifying rules, drawing flowcharts, and logging bugs. Click any stage.',
      bn: 'অ্যাকশন রেকর্ড করা থেকে শুরু করে পারমিশন চেক, বিজনেস রুলস, বাগ রিপোর্ট, ফ্লোচার্ট তৈরি ও কভারেজ দেখা — যেকোনো ধাপে ক্লিক করুন।',
    },
    badge: {
      en: 'End-to-End SQA Pipeline',
      bn: 'সম্পূর্ণ SQA পাইপলাইন',
    },
  },
} as const;
