import React, { useMemo, useState } from 'react';
import {
  Clock,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { AppLanguage, RecycleBinCategory, RecycleBinItem } from '../types/flowguard';
import { pickLang } from '../i18n/translations';
import {
  formatTimeRemaining,
  getCategoryLabel,
  RETENTION_DAYS,
} from '../utils/recycleBin';

interface RecycleBinViewProps {
  lang: AppLanguage;
  items: RecycleBinItem[];
  onRestoreItem: (item: RecycleBinItem) => void;
  onRestoreAll: () => void;
  onPermanentDeleteItem: (item: RecycleBinItem) => void;
  onEmptyRecycleBin: () => void;
}

type BinFilterGroup =
  | 'all'
  | 'bugs_cases'
  | 'business'
  | 'flows'
  | 'rbac'
  | 'content_visual'
  | 'other';

function getFilterGroup(cat: RecycleBinCategory): BinFilterGroup {
  if (cat === 'bug_report' || cat === 'test_case') return 'bugs_cases';
  if (
    cat === 'business_doc' ||
    cat === 'business_note' ||
    cat === 'discussion_point' ||
    cat === 'business_policy' ||
    cat === 'doc_highlight' ||
    cat === 'state_transition' ||
    cat === 'date_time_rule' ||
    cat === 'data_dependency'
  ) {
    return 'business';
  }
  if (cat === 'flow' || cat === 'flow_step' || cat === 'recorded_steps') {
    return 'flows';
  }
  if (
    cat === 'rbac_rule' ||
    cat === 'custom_role' ||
    cat === 'custom_test_rule' ||
    cat === 'approval_stage'
  ) {
    return 'rbac';
  }
  if (
    cat === 'content_assertion' ||
    cat === 'formula_check' ||
    cat === 'visual_check'
  ) {
    return 'content_visual';
  }
  return 'other';
}

export const RecycleBinView: React.FC<RecycleBinViewProps> = ({
  lang,
  items,
  onRestoreItem,
  onRestoreAll,
  onPermanentDeleteItem,
  onEmptyRecycleBin,
}) => {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<BinFilterGroup>('all');

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (groupFilter !== 'all' && getFilterGroup(item.category) !== groupFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.subtitle || '').toLowerCase().includes(q) ||
        item.projectName.toLowerCase().includes(q) ||
        getCategoryLabel(item.category, lang).toLowerCase().includes(q)
      );
    });
  }, [items, search, groupFilter, lang]);

  const filterTabs: Array<{ id: BinFilterGroup; en: string; bn: string }> = [
    { id: 'all', en: 'All Deleted', bn: 'সবগুলো' },
    { id: 'flows', en: 'Flows & Steps', bn: 'ফ্লো ও স্টেপ' },
    { id: 'rbac', en: 'Roles & Rules', bn: 'রোল ও রুল' },
    { id: 'business', en: 'Business Rules', bn: 'বিজনেস রুলস' },
    { id: 'content_visual', en: 'Content & Visual', bn: 'কন্টেন্ট ও ম্যাচ' },
    { id: 'bugs_cases', en: 'Bugs & Cases', bn: 'বাগ ও কেস' },
    { id: 'other', en: 'Alerts & Backups', bn: 'অ্যালার্ট ও ব্যাকআপ' },
  ];

  return (
    <div className="space-y-5">
      {/* Header Card */}
      <div className="rounded-xl border border-rose-200/80 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  'Recycle Bin (3-Day Safety Vault)',
                  'রিসাইকেল বিন (৩ দিনের সুরক্ষিত সংরক্ষণ)'
                )}
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                {pickLang(
                  lang,
                  `${RETENTION_DAYS}-Day Auto Retention`,
                  `${RETENTION_DAYS} দিন পর্যন্ত সংরক্ষিত`
                )}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              {pickLang(
                lang,
                'Nothing is erased immediately on first click. Confirmed deletions stay here safely for 3 days (72 hours) so you can restore them back to their exact module anytime.',
                'প্রথম ক্লিকেই কোনো ডাটা হুট করে মুছে যায় না। ডিলিট নিশ্চিত করার পর আইটেমগুলো এখানে ৩ দিন (৭২ ঘণ্টা) পর্যন্ত সুরক্ষিত থাকে — যেকোনো সময় আগের জায়গায় রিস্টোর করতে পারবেন।'
              )}
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRestoreAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {pickLang(lang, `Restore All (${items.length})`, `সব রিস্টোর করুন (${items.length})`)}
            </button>
            <button
              type="button"
              onClick={onEmptyRecycleBin}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {pickLang(lang, 'Empty Bin', 'বিন খালি করুন')}
            </button>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={pickLang(
                lang,
                'Search deleted flows, bugs, rules, notes, policies...',
                'ডিলিট হওয়া ফ্লো, বাগ, রুল, নোট বা পলিসি খুঁজুন...'
              )}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {filteredItems.length} / {items.length}{' '}
            {pickLang(lang, 'item(s) in bin', 'টি আইটেম')}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {filterTabs.map((tab) => {
            const active = groupFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setGroupFilter(tab.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {pickLang(lang, tab.en, tab.bn)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Deleted Items List */}
      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center space-y-2.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {items.length === 0
              ? pickLang(lang, 'Recycle Bin is empty', 'রিসাইকেল বিন একদম খালি')
              : pickLang(lang, 'No matching deleted items', 'এই ফিল্টারে কোনো আইটেম নেই')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {pickLang(
              lang,
              'Whenever you delete any saved rule, flow, note, bug ticket, or test case, it will ask for permission first and stay safely here for 3 days.',
              'যেকোনো সেভ করা রুল, ফ্লো, নোট, বাগ বা টেস্ট কেস ডিলিট করলে প্রথমে আপনার অনুমতি চাইবে এবং ৩ দিনের জন্য এখানে সুরক্ষিত থাকবে।'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                    {getCategoryLabel(item.category, lang)}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {item.projectName}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                    <Clock className="w-3 h-3" />
                    {formatTimeRemaining(item.expiresAt, lang)}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {item.title}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                  {item.subtitle && <span className="truncate">{item.subtitle}</span>}
                  <span>
                    {pickLang(lang, 'Deleted:', 'ডিলিট হয়েছে:')}{' '}
                    {new Date(item.deletedAt).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onRestoreItem(item)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Restore', 'রিস্টোর')}
                </button>
                <button
                  type="button"
                  onClick={() => onPermanentDeleteItem(item)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Delete Forever', 'স্থায়ীভাবে মুছুন')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
