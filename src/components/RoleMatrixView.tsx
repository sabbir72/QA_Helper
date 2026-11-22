import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  CopyPlus,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FilePlus2,
  GitMerge,
  Layers,
  LayoutGrid,
  List,
  Lock,
  Megaphone,
  Minus,
  Pencil,
  PenTool,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import {
  AppLanguage,
  ApprovalChainStage,
  CustomTestRuleItem,
  CustomTestRuleSuite,
  DomObservedState,
  DomVisibilityExpectation,
  ProjectWorkspace,
  QaNotice,
  RbacRule,
  SketchStroke,
} from '../types/flowguard';
import {
  isChromeExtensionContext,
  probeActiveTabSelectors,
} from '../utils/extensionBridge';

interface RoleMatrixViewProps {
  project: ProjectWorkspace;
  lang: AppLanguage;
  onUpdateProject: (updated: ProjectWorkspace) => void;
  onNotify?: (message: string) => void;
}

const HUMAN_ACCESS_LABEL: Record<DomVisibilityExpectation, string> = {
  visible: 'Can Use',
  disabled: 'Read-Only',
  hidden: 'Hidden',
};

type TestCodeLang = 'pytest-py' | 'playwright-ts' | 'playwright-js';

function toSlug(name: string, fallback = 'custom_rule'): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || fallback;
}

function deriveSelectorFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `[data-testid="${slug || 'custom-element'}"]`;
}

export const RoleMatrixView: React.FC<RoleMatrixViewProps> = ({
  project,
  lang,
  onUpdateProject,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<'chain' | 'matrix' | 'security' | 'xray'>('security');
  const [viewMode, setViewMode] = useState<'matrix' | 'table'>('matrix');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [showAddForm, setShowAddForm] = useState(false);
  const [diffRoleA, setDiffRoleA] = useState<string>('');
  const [diffRoleB, setDiffRoleB] = useState<string>('');

  // Role Framework Registry (merged from customRoles, rbacRules, approvalChain, customTestRules)
  const customTestRules: CustomTestRuleSuite[] = useMemo(
    () => project.customTestRules || [],
    [project.customTestRules]
  );

  const uniqueRoles = useMemo(() => {
    const set = new Set<string>(project.customRoles || []);
    for (const r of project.rbacRules) {
      if (r.role) set.add(r.role);
    }
    if (project.approvalChain) {
      for (const st of project.approvalChain) {
        if (st.role) set.add(st.role);
      }
    }
    for (const suite of customTestRules) {
      for (const item of suite.items) {
        if (item.role) set.add(item.role);
      }
    }
    return Array.from(set);
  }, [project.customRoles, project.rbacRules, project.approvalChain, customTestRules]);

  const [activeTestRole, setActiveTestRole] = useState<string>(
    uniqueRoles[0] || 'Custom Role'
  );

  const effectiveActiveRole = useMemo(
    () =>
      uniqueRoles.includes(activeTestRole)
        ? activeTestRole
        : uniqueRoles[0] || '',
    [uniqueRoles, activeTestRole]
  );

  // Role Manager inline state
  const [roleInput, setRoleInput] = useState('');
  const [renamingRole, setRenamingRole] = useState<string | null>(null);
  const [renameRoleValue, setRenameRoleValue] = useState('');

  // Multi-Role Matrix Rule Builder state
  const [newRuleName, setNewRuleName] = useState('');
  const [newSelector, setNewSelector] = useState('');
  const [newCustomBadge, setNewCustomBadge] = useState('');
  const [roleAccessDraft, setRoleAccessDraft] = useState<
    Record<string, DomVisibilityExpectation | 'skip'>
  >({});

  // Approval Chain stage form / editing state
  const approvalChain: ApprovalChainStage[] = useMemo(
    () => project.approvalChain || [],
    [project.approvalChain]
  );
  const [showAddStage, setShowAddStage] = useState(false);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [stageRole, setStageRole] = useState('');
  const [stageLabel, setStageLabel] = useState('');
  const [stageCondition, setStageCondition] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [stageRequired, setStageRequired] = useState(true);
  const [stageCanReject, setStageCanReject] = useState(true);

  // Approval Diagram Freehand Sketch / Draw Mode
  const [drawEnabled, setDrawEnabled] = useState(false);
  const [sketchTool, setSketchTool] = useState<'pen' | 'rect' | 'arrow'>('arrow');
  const [sketchColor, setSketchColor] = useState<string>('#e11d48');
  const [draftStroke, setDraftStroke] = useState<SketchStroke | null>(null);
  const diagramCanvasRef = useRef<HTMLDivElement | null>(null);

  // Tab 3: Multiple Custom Test Rules Framework State
  const [rbacCodeLang, setRbacCodeLang] = useState<TestCodeLang>('pytest-py');
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>('ALL');
  const [includeMatrixInCode, setIncludeMatrixInCode] = useState<boolean>(true);
  const [showRuleBuilder, setShowRuleBuilder] = useState<boolean>(false);
  const [editingSuiteId, setEditingSuiteId] = useState<string | null>(null);
  const [draftSuiteName, setDraftSuiteName] = useState('');
  const [draftSuiteDesc, setDraftSuiteDesc] = useState('');
  const [draftSuiteUrl, setDraftSuiteUrl] = useState(`https://${project.domain}/`);
  const [draftSuiteItems, setDraftSuiteItems] = useState<CustomTestRuleItem[]>([
    {
      id: `tri_${Date.now()}`,
      role: uniqueRoles[0] || 'Role 1',
      targetElement: '[data-testid="action-btn"]',
      expected: 'visible',
      ruleNote: '',
    },
  ]);

  const uniqueFeatures = useMemo(() => {
    const map = new Map<string, { feature: string; selector: string }>();
    for (const rule of project.rbacRules) {
      if (!map.has(rule.feature)) {
        map.set(rule.feature, { feature: rule.feature, selector: rule.selector });
      }
    }
    return Array.from(map.values());
  }, [project.rbacRules]);

  const roles = useMemo(() => ['All', ...uniqueRoles], [uniqueRoles]);

  const filteredRules = useMemo(() => {
    if (roleFilter === 'All') return project.rbacRules;
    return project.rbacRules.filter((r) => r.role === roleFilter);
  }, [project.rbacRules, roleFilter]);

  const stats = useMemo(() => {
    const total = project.rbacRules.length;
    const compliant = project.rbacRules.filter(
      (r) => r.observed !== 'not_checked' && r.observed === r.expected
    ).length;
    const mismatches = project.rbacRules.filter(
      (r) => r.observed !== 'not_checked' && r.observed !== r.expected
    ).length;
    return { total, compliant, mismatches, pending: total - compliant - mismatches };
  }, [project.rbacRules]);

  // Framework-Agnostic Security & QA Coverage Audits
  const securityFindings = useMemo(() => {
    const findings: Array<{
      id: string;
      severity: 'critical' | 'warning' | 'ok';
      title: string;
      detail: string;
      rule?: RbacRule;
    }> = [];

    for (const rule of project.rbacRules) {
      if (
        rule.observed !== 'not_checked' &&
        rule.observed !== rule.expected &&
        rule.observed === 'visible' &&
        (rule.expected === 'hidden' || rule.expected === 'disabled')
      ) {
        findings.push({
          id: `leak_${rule.id}`,
          severity: 'critical',
          title: pickLang(
            lang,
            `Privilege Leak: "${rule.role}" can use "${rule.feature}"`,
            `সিকিউরিটি লিক: "${rule.role}" রোলটি "${rule.feature}" দেখতে পাচ্ছে!`
          ),
          detail: pickLang(
            lang,
            `Expected "${rule.expected}" for ${rule.selector}, but observed "${rule.observed}" on page.`,
            `আশা করা হয়েছিল "${rule.expected}", কিন্তু পেজে পাওয়া গেছে "${rule.observed}" (${rule.selector})।`
          ),
          rule,
        });
      }
    }

    // Dynamic negative-check detector across any custom role names
    uniqueFeatures.forEach(({ feature }) => {
      const featureRules = project.rbacRules.filter((r) => r.feature === feature);
      const hasAllow = featureRules.some((r) => r.expected === 'visible');
      const hasDeny = featureRules.some(
        (r) => r.expected === 'hidden' || r.expected === 'disabled'
      );
      if (hasAllow && !hasDeny && uniqueRoles.length > 1) {
        findings.push({
          id: `missing_neg_${feature}`,
          severity: 'warning',
          title: pickLang(
            lang,
            `Missing Negative Role Check for "${feature}"`,
            `"${feature}" রুলের নেগেটিভ রোল চেক নেই`
          ),
          detail: pickLang(
            lang,
            `At least one role can access "${feature}", but no restricted ("Hidden" / "Read-Only") role rule is defined yet.`,
            `"${feature}"-এ অ্যাক্সেস দেওয়া আছে, কিন্তু কোনো রোলের জন্য "Hidden" বা "Read-Only" নেগেটিভ চেক যোগ করা হয়নি।`
          ),
        });
      }
    });

    // Approval Chain Separation-of-Duties check
    if (approvalChain.length >= 2) {
      const submitterRole = approvalChain[0].role.trim().toLowerCase();
      const approverDuplicate = approvalChain
        .slice(1)
        .find((s) => s.role.trim().toLowerCase() === submitterRole);
      if (approverDuplicate) {
        findings.push({
          id: 'sod_risk',
          severity: 'warning',
          title: pickLang(
            lang,
            `Self-Approval Risk: "${approvalChain[0].role}" is in Submit & Approve stages`,
            `সেলফ-অ্যাপ্রুভাল ঝুঁকি: "${approvalChain[0].role}" সাবমিট ও অ্যাপ্রুভ উভয় ধাপে আছে`
          ),
          detail: pickLang(
            lang,
            'Ensure backend rejects self-approval when the requester and approver share the same role.',
            'যদি একই রোলের ইউজার নিজের রিকোয়েস্ট নিজে অ্যাপ্রুভ করতে না পারে, তার আলাদা গার্ড টেস্ট রাখুন।'
          ),
        });
      }
    }

    if (findings.length === 0) {
      findings.push({
        id: 'all_good',
        severity: 'ok',
        title: pickLang(
          lang,
          'Role & Rule Framework Ready!',
          'রোল ও রুল ফ্রেমওয়ার্ক একদম প্রস্তুত!'
        ),
        detail: pickLang(
          lang,
          'Create as many custom roles and test rules as you want — no privilege drift detected.',
          'আপনার ইচ্ছেমতো যেকোনো নামে মাল্টিপল রুল ও রোল তৈরি করে টেস্ট কোড জেনারেট করতে পারেন।'
        ),
      });
    }

    return findings;
  }, [project.rbacRules, uniqueFeatures, uniqueRoles.length, approvalChain, lang]);

  // Multi-Rule Playwright / pytest Code Generator (Supports ALL user-created custom rules + Matrix)
  const generatedRbacSuite = useMemo(() => {
    const suitesToRender =
      selectedSuiteId === 'ALL'
        ? customTestRules
        : customTestRules.filter((s) => s.id === selectedSuiteId);

    const groupedMatrix = new Map<string, RbacRule[]>();
    if (selectedSuiteId === 'ALL' && includeMatrixInCode) {
      for (const rule of project.rbacRules) {
        const list = groupedMatrix.get(rule.role) || [];
        list.push(rule);
        groupedMatrix.set(rule.role, list);
      }
    }

    if (rbacCodeLang === 'pytest-py') {
      const lines = [
        `import pytest`,
        `from playwright.sync_api import Page, expect`,
        ``,
        `# VeriPulse Dynamic Role & Rule Test Framework`,
        `# Run: pytest -v --headed ${project.id}_rules_test.py`,
      ];

      if (suitesToRender.length === 0 && groupedMatrix.size === 0) {
        lines.push(``);
        lines.push(`# No rules selected yet. Click "Create New Test Rule" to add your custom rules!`);
      }

      suitesToRender.forEach((suite, idx) => {
        const fnSlug = toSlug(suite.ruleName, `custom_rule_${idx + 1}`);
        const url = suite.targetUrl?.trim() || `https://${project.domain}/`;
        lines.push(``);
        lines.push(`# Rule ${idx + 1}: ${suite.ruleName}${suite.description ? ` — ${suite.description}` : ''}`);
        lines.push(`def test_rule_${fnSlug}(page: Page) -> None:`);
        lines.push(`    page.goto("${url.replace(/"/g, '\\"')}")`);
        if (suite.items.length === 0) {
          lines.push(`    # Add role checks inside "${suite.ruleName}"`);
          lines.push(`    assert page.url != ""`);
        } else {
          for (const item of suite.items) {
            const sel = (item.targetElement || '[data-testid="element"]').replace(/"/g, '\\"');
            lines.push(
              `    # [${item.role}] ${item.ruleNote ? `${item.ruleNote} ` : ''}(expected: ${item.expected})`
            );
            if (item.expected === 'visible') {
              lines.push(`    expect(page.locator("${sel}")).to_be_visible()`);
              lines.push(`    expect(page.locator("${sel}")).to_be_enabled()`);
            } else if (item.expected === 'disabled') {
              lines.push(`    expect(page.locator("${sel}")).to_be_visible()`);
              lines.push(`    expect(page.locator("${sel}")).to_be_disabled()`);
            } else {
              lines.push(`    expect(page.locator("${sel}")).to_be_hidden()`);
            }
          }
        }
      });

      groupedMatrix.forEach((rules, role) => {
        const fn = toSlug(role, 'role');
        lines.push(``);
        lines.push(`def test_matrix_role_${fn}(page: Page) -> None:`);
        lines.push(`    # Authenticate session as "${role}"`);
        lines.push(`    page.goto("https://${project.domain}/")`);
        for (const r of rules) {
          const sel = r.selector.replace(/"/g, '\\"');
          const ruleLabel = r.customRuleLabel ? ` [${r.customRuleLabel}]` : '';
          lines.push(`    # Rule: ${r.feature}${ruleLabel} (expected: ${r.expected})`);
          if (r.expected === 'visible') {
            lines.push(`    expect(page.locator("${sel}")).to_be_visible()`);
            lines.push(`    expect(page.locator("${sel}")).to_be_enabled()`);
          } else if (r.expected === 'disabled') {
            lines.push(`    expect(page.locator("${sel}")).to_be_visible()`);
            lines.push(`    expect(page.locator("${sel}")).to_be_disabled()`);
          } else {
            lines.push(`    expect(page.locator("${sel}")).to_be_hidden()`);
          }
        }
      });

      if (approvalChain.length > 0 && selectedSuiteId === 'ALL') {
        lines.push(``);
        lines.push(`# Documented Approval Order: ${approvalChain.map((s) => s.role).join(' -> ')}`);
      }
      return lines.join('\n');
    }

    const header =
      rbacCodeLang === 'playwright-ts'
        ? `import { test, expect } from '@playwright/test';`
        : `const { test, expect } = require('@playwright/test');`;

    const lines = [
      header,
      ``,
      `// VeriPulse Dynamic Role & Rule Test Framework`,
    ];

    if (suitesToRender.length === 0 && groupedMatrix.size === 0) {
      lines.push(`// No rules selected yet. Create custom rules on the left to generate test code.`);
    }

    suitesToRender.forEach((suite) => {
      const url = suite.targetUrl?.trim() || `https://${project.domain}/`;
      lines.push(``);
      lines.push(`test('${suite.ruleName.replace(/'/g, "\\'")}', async ({ page }) => {`);
      if (suite.description) {
        lines.push(`  // ${suite.description}`);
      }
      lines.push(`  await page.goto('${url.replace(/'/g, "\\'")}');`);
      for (const item of suite.items) {
        const sel = (item.targetElement || '[data-testid="element"]').replace(/'/g, "\\'");
        lines.push(
          `  // [${item.role}] ${item.ruleNote ? `${item.ruleNote} ` : ''}(expected: ${item.expected})`
        );
        if (item.expected === 'visible') {
          lines.push(`  await expect(page.locator('${sel}')).toBeVisible();`);
          lines.push(`  await expect(page.locator('${sel}')).toBeEnabled();`);
        } else if (item.expected === 'disabled') {
          lines.push(`  await expect(page.locator('${sel}')).toBeVisible();`);
          lines.push(`  await expect(page.locator('${sel}')).toBeDisabled();`);
        } else {
          lines.push(`  await expect(page.locator('${sel}')).toBeHidden();`);
        }
      }
      lines.push(`});`);
    });

    groupedMatrix.forEach((rules, role) => {
      lines.push(``);
      lines.push(`test('Matrix permissions for ${role.replace(/'/g, "\\'")}', async ({ page }) => {`);
      lines.push(`  // Authenticate session as "${role}"`);
      lines.push(`  await page.goto('https://${project.domain}/');`);
      for (const r of rules) {
        const sel = r.selector.replace(/'/g, "\\'");
        const ruleLabel = r.customRuleLabel ? ` [${r.customRuleLabel}]` : '';
        lines.push(`  // ${r.feature}${ruleLabel}`);
        if (r.expected === 'visible') {
          lines.push(`  await expect(page.locator('${sel}')).toBeVisible();`);
          lines.push(`  await expect(page.locator('${sel}')).toBeEnabled();`);
        } else if (r.expected === 'disabled') {
          lines.push(`  await expect(page.locator('${sel}')).toBeVisible();`);
          lines.push(`  await expect(page.locator('${sel}')).toBeDisabled();`);
        } else {
          lines.push(`  await expect(page.locator('${sel}')).toBeHidden();`);
        }
      }
      lines.push(`});`);
    });

    return lines.join('\n');
  }, [
    customTestRules,
    selectedSuiteId,
    includeMatrixInCode,
    project.rbacRules,
    project.domain,
    project.id,
    approvalChain,
    rbacCodeLang,
  ]);

  // Role Framework CRUD
  const handleAddCustomRoles = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = roleInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const existing = new Set(uniqueRoles);
    parts.forEach((p) => existing.add(p));
    const nextCustomRoles = Array.from(existing);
    onUpdateProject({ ...project, customRoles: nextCustomRoles });
    setActiveTestRole(parts[0]);
    setRoleInput('');
    onNotify?.(
      pickLang(
        lang,
        `Added role(s): ${parts.join(', ')}`,
        `নতুন রোল যোগ হয়েছে: ${parts.join(', ')}`
      )
    );
  };

  const handleRenameRole = (oldName: string) => {
    const trimmed = renameRoleValue.trim();
    if (!trimmed || trimmed === oldName) {
      setRenamingRole(null);
      return;
    }
    const nextCustomRoles = Array.from(
      new Set(uniqueRoles.map((r) => (r === oldName ? trimmed : r)))
    );
    const nextRbacRules = project.rbacRules.map((r) =>
      r.role === oldName ? { ...r, role: trimmed } : r
    );
    const nextChain = approvalChain.map((st) =>
      st.role === oldName ? { ...st, role: trimmed } : st
    );
    const nextCustomSuites = customTestRules.map((suite) => ({
      ...suite,
      items: suite.items.map((it) =>
        it.role === oldName ? { ...it, role: trimmed } : it
      ),
    }));

    onUpdateProject({
      ...project,
      customRoles: nextCustomRoles,
      rbacRules: nextRbacRules,
      approvalChain: nextChain,
      customTestRules: nextCustomSuites,
    });
    if (activeTestRole === oldName) setActiveTestRole(trimmed);
    if (roleFilter === oldName) setRoleFilter(trimmed);
    setRenamingRole(null);
    onNotify?.(`Renamed role "${oldName}" to "${trimmed}".`);
  };

  const handleRemoveRole = (roleName: string) => {
    const nextCustomRoles = uniqueRoles.filter((r) => r !== roleName);
    const nextRbacRules = project.rbacRules.filter((r) => r.role !== roleName);
    onUpdateProject({
      ...project,
      customRoles: nextCustomRoles,
      rbacRules: nextRbacRules,
    });
    if (activeTestRole === roleName) {
      setActiveTestRole(nextCustomRoles[0] || 'Custom Role');
    }
    if (roleFilter === roleName) setRoleFilter('All');
  };

  const handleResetBlankFramework = () => {
    onUpdateProject({
      ...project,
      customRoles: ['Role A', 'Role B'],
      rbacRules: [],
      customTestRules: [],
      approvalChain: [],
      approvalSketches: [],
    });
    setActiveTestRole('Role A');
    setSelectedSuiteId('ALL');
    setRoleFilter('All');
    onNotify?.(
      pickLang(
        lang,
        'Switched to a clean blank Role & Rule Framework. Add any roles & rules you like!',
        'ফাঁকা রোল ও রুল ফ্রেমওয়ার্ক চালু হয়েছে — এবার আপনার ইচ্ছেমতো রোল ও রুল যোগ করুন!'
      )
    );
  };

  // Probe live tab for effectiveActiveRole
  const handleProbeActiveRoleOnTab = async () => {
    const roleRules = project.rbacRules.filter((r) => r.role === effectiveActiveRole);
    if (roleRules.length === 0) {
      onNotify?.(
        pickLang(
          lang,
          `No matrix rules defined yet for role "${effectiveActiveRole}".`,
          `"${effectiveActiveRole}" রোলের জন্য এখনো কোনো ম্যাট্রিক্স রুল যোগ করা হয়নি।`
        )
      );
      return;
    }

    const selectors = roleRules.map((r) => r.selector);

    if (isChromeExtensionContext()) {
      const res = await probeActiveTabSelectors(selectors);
      if (!res.ok) {
        onNotify?.(res.error || 'Could not probe active Chrome tab.');
        return;
      }
      const now = new Date().toISOString();
      const nextRules = project.rbacRules.map((rule) =>
        rule.role === effectiveActiveRole
          ? {
              ...rule,
              observed: res.results[rule.selector] || 'not_checked',
              lastProbedAt: now,
            }
          : rule
      );
      onUpdateProject({ ...project, rbacRules: nextRules });
      onNotify?.(
        pickLang(
          lang,
          `Probed ${roleRules.length} elements on live tab as "${effectiveActiveRole}".`,
          `"${effectiveActiveRole}" হিসেবে লাইভ ট্যাবের ${roleRules.length}টি এলিমেন্ট যাচাই সম্পন্ন!`
        )
      );
      return;
    }

    const now = new Date().toISOString();
    const nextRules: RbacRule[] = project.rbacRules.map((rule) => {
      if (rule.role !== effectiveActiveRole) return rule;
      let el: Element | null = null;
      try {
        el = document.querySelector(rule.selector);
      } catch {
        el = null;
      }
      let observed: DomObservedState = rule.expected;
      if (el) {
        const htmlEl = el as HTMLButtonElement | HTMLInputElement;
        observed = htmlEl.disabled ? 'disabled' : 'visible';
      }
      return {
        ...rule,
        observed,
        lastProbedAt: now,
      };
    });
    onUpdateProject({ ...project, rbacRules: nextRules });
    onNotify?.(
      pickLang(
        lang,
        `Verified "${effectiveActiveRole}" rules in preview. For real website DOM probing, run from the Chrome Extension.`,
        `প্রিভিউতে "${effectiveActiveRole}" রোল যাচাই হয়েছে। আসল ওয়েবসাইট চেক করতে Chrome Extension ব্যবহার করুন।`
      )
    );
  };

  // Multi-Role Matrix Rule Creation
  const openMatrixMultiRuleBuilder = () => {
    const initial: Record<string, DomVisibilityExpectation | 'skip'> = {};
    uniqueRoles.forEach((r, idx) => {
      initial[r] = idx === 0 ? 'visible' : 'hidden';
    });
    setRoleAccessDraft(initial);
    setNewRuleName('');
    setNewSelector('');
    setNewCustomBadge('');
    setShowAddForm(true);
  };

  const handleSaveMultiRoleRule = (e: React.FormEvent) => {
    e.preventDefault();
    const featName = newRuleName.trim();
    if (!featName) return;
    const selector = newSelector.trim() || deriveSelectorFromName(featName);
    const badge = newCustomBadge.trim() || undefined;

    const targetRoles = uniqueRoles.length > 0 ? uniqueRoles : [activeTestRole || 'Custom Role'];
    const createdRules: RbacRule[] = [];

    targetRoles.forEach((role, idx) => {
      const choice = roleAccessDraft[role] ?? (idx === 0 ? 'visible' : 'hidden');
      if (choice === 'skip') return;
      createdRules.push({
        id: `rbac_${Date.now()}_${idx}`,
        role,
        feature: featName,
        selector,
        expected: choice,
        customRuleLabel: badge,
        observed: 'not_checked',
        lastProbedAt: null,
      });
    });

    if (createdRules.length === 0) return;

    onUpdateProject({
      ...project,
      customRoles: Array.from(new Set([...uniqueRoles, ...createdRules.map((r) => r.role)])),
      rbacRules: [...project.rbacRules, ...createdRules],
    });
    setShowAddForm(false);
    setNewRuleName('');
    setNewSelector('');
    setNewCustomBadge('');
    onNotify?.(
      pickLang(
        lang,
        `Created rule "${featName}" across ${createdRules.length} role(s).`,
        `"${featName}" রুলটি ${createdRules.length}টি রোলের জন্য তৈরি হয়েছে।`
      )
    );
  };

  const handleQuickAddMatrixCell = (role: string, feature: string, selector: string) => {
    const rule: RbacRule = {
      id: `rbac_${Date.now()}`,
      role,
      feature,
      selector,
      expected: 'hidden',
      observed: 'not_checked',
      lastProbedAt: null,
    };
    onUpdateProject({
      ...project,
      rbacRules: [...project.rbacRules, rule],
    });
    onNotify?.(`Added rule: ${role} -> ${feature} (Hidden).`);
  };

  const handleCycleObserved = (id: string) => {
    const states: DomObservedState[] = [
      'visible',
      'disabled',
      'hidden',
      'not_checked',
    ];
    const nextRules = project.rbacRules.map((r) => {
      if (r.id !== id) return r;
      const next = states[(states.indexOf(r.observed) + 1) % states.length];
      return { ...r, observed: next, lastProbedAt: new Date().toISOString() };
    });
    onUpdateProject({ ...project, rbacRules: nextRules });
  };

  const handleCycleExpected = (id: string) => {
    const order: DomVisibilityExpectation[] = ['visible', 'disabled', 'hidden'];
    const nextRules = project.rbacRules.map((r) => {
      if (r.id !== id) return r;
      const next = order[(order.indexOf(r.expected) + 1) % order.length];
      return { ...r, expected: next };
    });
    onUpdateProject({ ...project, rbacRules: nextRules });
  };

  const handleDeleteRule = (id: string) => {
    onUpdateProject({
      ...project,
      rbacRules: project.rbacRules.filter((r) => r.id !== id),
    });
  };

  const handleCreateBlockedNoticeFromLeak = (rule: RbacRule) => {
    const notice: QaNotice = {
      id: `notice_rbac_${Date.now()}`,
      type: 'blocked',
      title: `RBAC Security Drift: ${rule.role} can access "${rule.feature}"`,
      message: `Expected "${rule.expected}" for ${rule.selector}, but live DOM showed "${rule.observed}". Must be fixed before release.`,
      scope: `Role Permissions · ${rule.role}`,
      pinnedOnTop: true,
      createdAt: new Date().toISOString(),
    };
    onUpdateProject({
      ...project,
      notices: [notice, ...(project.notices || [])],
    });
    onNotify?.('Pinned Security Blocked Notice across workspace.');
  };

  // Custom Test Rule Suite Builder CRUD (Tab 3)
  const openCreateSuiteBuilder = () => {
    setEditingSuiteId(null);
    setDraftSuiteName('');
    setDraftSuiteDesc('');
    setDraftSuiteUrl(`https://${project.domain}/`);
    setDraftSuiteItems([
      {
        id: `tri_${Date.now()}_0`,
        role: uniqueRoles[0] || 'Custom Role',
        targetElement: '[data-testid="target-action"]',
        expected: 'visible',
        ruleNote: '',
      },
    ]);
    setShowRuleBuilder(true);
  };

  const openEditSuiteBuilder = (suite: CustomTestRuleSuite) => {
    setEditingSuiteId(suite.id);
    setDraftSuiteName(suite.ruleName);
    setDraftSuiteDesc(suite.description || '');
    setDraftSuiteUrl(suite.targetUrl || `https://${project.domain}/`);
    setDraftSuiteItems(
      suite.items.length > 0
        ? suite.items.map((it) => ({ ...it }))
        : [
            {
              id: `tri_${Date.now()}`,
              role: uniqueRoles[0] || 'Custom Role',
              targetElement: '[data-testid="target-action"]',
              expected: 'visible',
              ruleNote: '',
            },
          ]
    );
    setShowRuleBuilder(true);
  };

  const handleSaveCustomSuite = (e: React.FormEvent) => {
    e.preventDefault();
    const ruleName = draftSuiteName.trim();
    if (!ruleName) return;

    const cleanItems = draftSuiteItems
      .filter((it) => it.role.trim())
      .map((it) => ({
        ...it,
        role: it.role.trim(),
        targetElement: it.targetElement.trim() || deriveSelectorFromName(ruleName),
        ruleNote: it.ruleNote?.trim() || '',
      }));

    // Ensure any new custom roles typed inside this rule also register in framework
    const mergedRoles = Array.from(
      new Set([...uniqueRoles, ...cleanItems.map((i) => i.role)])
    );

    if (editingSuiteId) {
      const nextSuites = customTestRules.map((s) =>
        s.id === editingSuiteId
          ? {
              ...s,
              ruleName,
              description: draftSuiteDesc.trim(),
              targetUrl: draftSuiteUrl.trim() || `https://${project.domain}/`,
              items: cleanItems,
            }
          : s
      );
      onUpdateProject({
        ...project,
        customRoles: mergedRoles,
        customTestRules: nextSuites,
      });
      setSelectedSuiteId(editingSuiteId);
      setShowRuleBuilder(false);
      setEditingSuiteId(null);
      onNotify?.(`Updated test rule "${ruleName}".`);
      return;
    }

    const newId = `suite_${Date.now()}`;
    const created: CustomTestRuleSuite = {
      id: newId,
      ruleName,
      description: draftSuiteDesc.trim(),
      targetUrl: draftSuiteUrl.trim() || `https://${project.domain}/`,
      items: cleanItems,
      createdAt: new Date().toISOString(),
    };
    onUpdateProject({
      ...project,
      customRoles: mergedRoles,
      customTestRules: [...customTestRules, created],
    });
    setSelectedSuiteId(newId);
    setShowRuleBuilder(false);
    onNotify?.(
      pickLang(
        lang,
        `Created custom test rule "${ruleName}"!`,
        `নতুন টেস্ট রুল "${ruleName}" তৈরি হয়েছে!`
      )
    );
  };

  const handleDuplicateSuite = (suite: CustomTestRuleSuite) => {
    const newId = `suite_${Date.now()}`;
    const copy: CustomTestRuleSuite = {
      ...suite,
      id: newId,
      ruleName: `${suite.ruleName} (Copy)`,
      items: suite.items.map((it, idx) => ({ ...it, id: `tri_${Date.now()}_${idx}` })),
      createdAt: new Date().toISOString(),
    };
    onUpdateProject({
      ...project,
      customTestRules: [...customTestRules, copy],
    });
    setSelectedSuiteId(newId);
    onNotify?.(`Duplicated rule "${suite.ruleName}".`);
  };

  const handleDeleteSuite = (suiteId: string) => {
    const nextSuites = customTestRules.filter((s) => s.id !== suiteId);
    onUpdateProject({
      ...project,
      customTestRules: nextSuites,
    });
    if (selectedSuiteId === suiteId) {
      setSelectedSuiteId('ALL');
    }
  };

  const handleImportFeatureIntoSuite = (featureName: string) => {
    const matching = project.rbacRules.filter((r) => r.feature === featureName);
    if (matching.length === 0) return;
    const newId = `suite_${Date.now()}`;
    const created: CustomTestRuleSuite = {
      id: newId,
      ruleName: featureName,
      description: `Imported from Matrix (${matching.length} role checks)`,
      targetUrl: `https://${project.domain}/`,
      items: matching.map((m, idx) => ({
        id: `tri_${Date.now()}_${idx}`,
        role: m.role,
        targetElement: m.selector,
        expected: m.expected,
        ruleNote: m.customRuleLabel || '',
      })),
      createdAt: new Date().toISOString(),
    };
    onUpdateProject({
      ...project,
      customTestRules: [...customTestRules, created],
    });
    setSelectedSuiteId(newId);
    onNotify?.(`Imported "${featureName}" as an editable Test Rule.`);
  };

  // Approval Chain Stage CRUD
  const resetStageForm = () => {
    setEditingStageId(null);
    setStageRole('');
    setStageLabel('');
    setStageCondition('');
    setStageNote('');
    setStageRequired(true);
    setStageCanReject(true);
    setShowAddStage(false);
  };

  const handleSaveStage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageRole.trim() || !stageLabel.trim()) return;

    const mergedRoles = Array.from(new Set([...uniqueRoles, stageRole.trim()]));

    if (editingStageId) {
      const nextChain = approvalChain.map((s) =>
        s.id === editingStageId
          ? {
              ...s,
              role: stageRole.trim(),
              stepLabel: stageLabel.trim(),
              condition: stageCondition.trim() || 'Always required',
              qaNote: stageNote.trim(),
              required: stageRequired,
              canReject: stageCanReject,
            }
          : s
      );
      onUpdateProject({
        ...project,
        customRoles: mergedRoles,
        approvalChain: nextChain,
      });
      onNotify?.('Updated approval stage.');
      resetStageForm();
      return;
    }

    const created: ApprovalChainStage = {
      id: `apc_${Date.now()}`,
      role: stageRole.trim(),
      stepLabel: stageLabel.trim(),
      condition: stageCondition.trim() || 'Standard flow',
      qaNote: stageNote.trim(),
      required: stageRequired,
      canReject: stageCanReject,
    };
    onUpdateProject({
      ...project,
      customRoles: mergedRoles,
      approvalChain: [...approvalChain, created],
    });
    onNotify?.(`Added "${created.role}" to approval diagram.`);
    resetStageForm();
  };

  const handleStartEditStage = (stage: ApprovalChainStage) => {
    setEditingStageId(stage.id);
    setStageRole(stage.role);
    setStageLabel(stage.stepLabel);
    setStageCondition(stage.condition);
    setStageNote(stage.qaNote);
    setStageRequired(stage.required);
    setStageCanReject(stage.canReject);
    setShowAddStage(true);
  };

  const handleMoveStage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= approvalChain.length) return;
    const copy = [...approvalChain];
    const [moved] = copy.splice(idx, 1);
    copy.splice(target, 0, moved);
    onUpdateProject({ ...project, approvalChain: copy });
  };

  const handleDeleteStage = (id: string) => {
    onUpdateProject({
      ...project,
      approvalChain: approvalChain.filter((s) => s.id !== id),
    });
  };

  // Sketch overlay handlers on Approval Chain canvas
  const getRelativePoint = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top),
    };
  };

  const handleSketchPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawEnabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getRelativePoint(e);
    setDraftStroke({
      id: `sk_${Date.now()}`,
      tool: sketchTool,
      color: sketchColor,
      points: [pt],
    });
  };

  const handleSketchPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawEnabled || !draftStroke) return;
    const pt = getRelativePoint(e);
    if (draftStroke.tool === 'pen') {
      setDraftStroke({
        ...draftStroke,
        points: [...draftStroke.points, pt],
      });
    } else {
      setDraftStroke({
        ...draftStroke,
        points: [draftStroke.points[0], pt],
      });
    }
  };

  const handleSketchPointerUp = () => {
    if (!drawEnabled || !draftStroke) return;
    if (draftStroke.points.length >= 2) {
      onUpdateProject({
        ...project,
        approvalSketches: [...(project.approvalSketches || []), draftStroke],
      });
    }
    setDraftStroke(null);
  };

  const renderStrokeSvg = (st: SketchStroke) => {
    if (st.points.length < 2) return null;
    if (st.tool === 'pen') {
      const d = st.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
        .join(' ');
      return (
        <path
          key={st.id}
          d={d}
          fill="none"
          stroke={st.color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }
    const start = st.points[0];
    const end = st.points[st.points.length - 1];
    if (st.tool === 'rect') {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      return (
        <rect
          key={st.id}
          x={x}
          y={y}
          width={w}
          height={h}
          rx={6}
          fill="none"
          stroke={st.color}
          strokeWidth={2.5}
          strokeDasharray="5 3"
        />
      );
    }
    return (
      <line
        key={st.id}
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={st.color}
        strokeWidth={2.5}
        markerEnd="url(#rbac-sketch-arrow)"
      />
    );
  };

  const handleCopyMarkdownMatrix = async () => {
    const header = `| Rule / Feature | Selector | ${uniqueRoles.join(' | ')} |`;
    const sep = `| --- | --- | ${uniqueRoles.map(() => '---').join(' | ')} |`;
    const rows = uniqueFeatures.map((f) => {
      const cells = uniqueRoles.map((role) => {
        const match = project.rbacRules.find(
          (r) => r.feature === f.feature && r.role === role
        );
        if (!match) return '—';
        const label = match.customRuleLabel || HUMAN_ACCESS_LABEL[match.expected];
        return `${label} (${match.observed})`;
      });
      return `| ${f.feature} | \`${f.selector}\` | ${cells.join(' | ')} |`;
    });
    const md = [header, sep, ...rows].join('\n');
    try {
      await navigator.clipboard.writeText(md);
      onNotify?.('Copied Role Permission Matrix (Markdown table).');
    } catch {
      onNotify?.('Clipboard unavailable.');
    }
  };

  const handleCopyChainSummary = async () => {
    const summary = approvalChain
      .map(
        (st, idx) =>
          `${idx + 1}. [${st.role}] — ${st.stepLabel} (${st.required ? 'Required' : 'Conditional'}: ${st.condition})${st.qaNote ? `\n   QA Note: ${st.qaNote}` : ''}`
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(summary || 'No approval stages defined.');
      onNotify?.('Copied Approval Chain flow & QA notes.');
    } catch {
      onNotify?.('Clipboard unavailable.');
    }
  };

  const handleDownloadRbacTest = () => {
    const ext =
      rbacCodeLang === 'pytest-py'
        ? '_rules_test.py'
        : rbacCodeLang === 'playwright-ts'
          ? '.rules.spec.ts'
          : '.rules.spec.js';
    const mime =
      rbacCodeLang === 'pytest-py' ? 'text/x-python' : 'text/javascript';
    const baseName =
      selectedSuiteId === 'ALL'
        ? project.id
        : toSlug(
            customTestRules.find((s) => s.id === selectedSuiteId)?.ruleName ||
              project.id
          );
    const blob = new Blob([generatedRbacSuite], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.(`Downloaded ${baseName}${ext}`);
  };

  const renderStateIcon = (state: DomVisibilityExpectation | DomObservedState) => {
    if (state === 'visible') return <Eye className="w-3.5 h-3.5" />;
    if (state === 'disabled') return <Lock className="w-3.5 h-3.5" />;
    if (state === 'hidden') return <EyeOff className="w-3.5 h-3.5" />;
    return null;
  };

  const allSketches = useMemo(() => {
    const base = project.approvalSketches || [];
    return draftStroke ? [...base, draftStroke] : base;
  }, [project.approvalSketches, draftStroke]);

  return (
    <div className="space-y-5">
      {/* Emerald-Themed Header, Custom Role Framework Bar & Sub-Navigation */}
      <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  'Role & Rule Framework — Custom Permissions & Multi-Rule Test Code',
                  'রোল ও রুল ফ্রেমওয়ার্ক — ইচ্ছেমতো রোল, মাল্টিপল রুল ও টেস্ট কোড'
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'Create any custom role or multiple test rules with any name you choose. Pure flexible framework — zero fixed roles.',
                  'যখন যা নাম ইচ্ছে সেই নামে নিজের রোল ও মাল্টিপল রুল তৈরি করুন — এটি একটি সম্পূর্ণ ফ্লেক্সিবল ফ্রেমওয়ার্ক।'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold">
              {uniqueRoles.length} Roles
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold">
              {customTestRules.length + uniqueFeatures.length} Rules
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-semibold">
              {stats.mismatches} Drift
            </span>
            <button
              type="button"
              onClick={handleResetBlankFramework}
              title={pickLang(
                lang,
                'Clear current rules to start with a blank custom framework',
                'সব রুল মুছে একদম ফাঁকা ফ্রেমওয়ার্ক নিন'
              )}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-sans font-semibold cursor-pointer"
            >
              <Eraser className="w-3 h-3" />
              {pickLang(lang, 'Blank Framework', 'ফাঁকা ফ্রেমওয়ার্ক')}
            </button>
          </div>
        </div>

        {/* Dynamic Custom Roles Registry Strip */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {pickLang(
                lang,
                'Framework Roles (Click pencil to rename, or add any custom role names):',
                'আপনার কাস্টম রোল সমূহ (যে নাম দেবেন সেটাই রোল হিসেবে কাজ করবে):'
              )}
            </span>
            <form onSubmit={handleAddCustomRoles} className="flex items-center gap-1.5">
              <input
                type="text"
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                placeholder={pickLang(
                  lang,
                  'Add role(s), e.g. Cashier, Auditor',
                  'নতুন রোল লিখুন (যেমন: ম্যানেজার, ক্যাশিয়ার)'
                )}
                className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 w-56"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <UserPlus className="w-3 h-3" />
                {pickLang(lang, 'Add Role', 'যোগ করুন')}
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {uniqueRoles.map((role) =>
              renamingRole === role ? (
                <div
                  key={role}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-400 bg-white dark:bg-slate-900"
                >
                  <input
                    type="text"
                    value={renameRoleValue}
                    onChange={(e) => setRenameRoleValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleRenameRole(role);
                      } else if (e.key === 'Escape') {
                        setRenamingRole(null);
                      }
                    }}
                    autoFocus
                    className="w-28 text-xs bg-transparent outline-none text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => handleRenameRole(role)}
                    className="text-emerald-600 cursor-pointer"
                    aria-label="Save role name"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingRole(null)}
                    className="text-slate-400 cursor-pointer"
                    aria-label="Cancel rename"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span
                  key={role}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${
                    role === activeTestRole
                      ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveTestRole(role)}
                    className="cursor-pointer font-semibold"
                    title="Select as active role"
                  >
                    {role}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingRole(role);
                      setRenameRoleValue(role);
                    }}
                    className="text-slate-400 hover:text-blue-600 cursor-pointer"
                    aria-label={`Rename ${role}`}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveRole(role)}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    aria-label={`Remove ${role}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )
            )}
          </div>
        </div>

        {/* Sub-Navigation Tabs + Active Role Probe Control */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="inline-flex flex-wrap items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                activeTab === 'security'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              {pickLang(
                lang,
                `Create Test Code & Rules (${customTestRules.length})`,
                `ক্রিয়েট টেস্ট কোড ও রুল (${customTestRules.length})`
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('matrix')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                activeTab === 'matrix'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              {pickLang(lang, 'Permission Matrix', 'পারমিশন ম্যাট্রিক্স')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('chain')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                activeTab === 'chain'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <GitMerge className="w-3.5 h-3.5" />
              {pickLang(lang, 'Approval Chain Diagram', 'অ্যাপ্রুভাল চেইন ডায়াগ্রাম')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('xray')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                activeTab === 'xray'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {pickLang(lang, 'Role X-Ray & Diff', 'রোল এক্স-রে ও তুলনা')}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="active-role-probe"
              className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1"
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              {pickLang(lang, 'Logged-in Role:', 'বর্তমান রোল:')}
            </label>
            <select
              id="active-role-probe"
              value={effectiveActiveRole}
              onChange={(e) => setActiveTestRole(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-slate-100"
            >
              {uniqueRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleProbeActiveRoleOnTab}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
            >
              {pickLang(lang, 'Probe Role on Tab', 'এই রোল পেজে যাচাই করুন')}
            </button>
          </div>
        </div>
      </div>

      {/* TAB: CREATE MULTIPLE CUSTOM RULES & TEST CODE FRAMEWORK */}
      {activeTab === 'security' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Multiple Custom Named Rules Manager */}
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-600" />
                    {pickLang(
                      lang,
                      'Custom Test Rules (Create Any Multiple Rules)',
                      'আপনার তৈরি মাল্টিপল রুল (যখন যা নাম দেবেন)'
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {pickLang(
                      lang,
                      'Name each rule anything you want — every rule becomes its own test block.',
                      'যেকোনো নামে একাধিক রুল তৈরি করুন; প্রতিটির নাম অনুযায়ী আলাদা টেস্ট কোড তৈরি হবে।'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateSuiteBuilder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  {pickLang(lang, 'New Test Rule', 'নতুন রুল তৈরি করুন')}
                </button>
              </div>

              {/* Create / Edit Custom Rule Form */}
              {showRuleBuilder && (
                <form
                  onSubmit={handleSaveCustomSuite}
                  className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      {editingSuiteId
                        ? pickLang(lang, 'Edit Test Rule', 'রুল এডিট করুন')
                        : pickLang(lang, 'Create Custom Test Rule', 'নতুন কাস্টম রুল তৈরি করুন')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowRuleBuilder(false)}
                      className="text-xs text-slate-500 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="text"
                      required
                      value={draftSuiteName}
                      onChange={(e) => setDraftSuiteName(e.target.value)}
                      placeholder={pickLang(
                        lang,
                        'Rule Name (type any name, e.g. Discount > 20% Approval)',
                        'রুলের নাম লিখুন (যা ইচ্ছে তাই, যেমন: ডিসকাউন্ট অ্যাপ্রুভাল রুল)'
                      )}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={draftSuiteDesc}
                        onChange={(e) => setDraftSuiteDesc(e.target.value)}
                        placeholder={pickLang(lang, 'Condition / Note (optional)', 'শর্ত বা নোট (ঐচ্ছিক)')}
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        value={draftSuiteUrl}
                        onChange={(e) => setDraftSuiteUrl(e.target.value)}
                        placeholder="Target URL"
                        className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  {/* Role Checks inside this Custom Rule */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      <span>{pickLang(lang, 'Role Checks in this Rule:', 'এই রুলে রোল ভিত্তিক শর্তসমূহ:')}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftSuiteItems([
                            ...draftSuiteItems,
                            {
                              id: `tri_${Date.now()}_${draftSuiteItems.length}`,
                              role:
                                uniqueRoles[draftSuiteItems.length % Math.max(1, uniqueRoles.length)] ||
                                'Custom Role',
                              targetElement:
                                draftSuiteItems[0]?.targetElement || '[data-testid="action-btn"]',
                              expected: 'hidden',
                              ruleNote: '',
                            },
                          ])
                        }
                        className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        {pickLang(lang, 'Add Role Check', 'আরও রোল শর্ত যোগ')}
                      </button>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {draftSuiteItems.map((item, idx) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 space-y-1.5"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            <input
                              type="text"
                              list="veripulse-framework-roles"
                              value={item.role}
                              onChange={(e) => {
                                const copy = [...draftSuiteItems];
                                copy[idx] = { ...copy[idx], role: e.target.value };
                                setDraftSuiteItems(copy);
                              }}
                              placeholder="Any Role Name"
                              className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                            />
                            <select
                              value={item.expected}
                              onChange={(e) => {
                                const copy = [...draftSuiteItems];
                                copy[idx] = {
                                  ...copy[idx],
                                  expected: e.target.value as DomVisibilityExpectation,
                                };
                                setDraftSuiteItems(copy);
                              }}
                              className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                            >
                              <option value="visible">Can Use (visible)</option>
                              <option value="disabled">Read-Only (disabled)</option>
                              <option value="hidden">Hidden (hidden)</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={item.targetElement}
                              onChange={(e) => {
                                const copy = [...draftSuiteItems];
                                copy[idx] = { ...copy[idx], targetElement: e.target.value };
                                setDraftSuiteItems(copy);
                              }}
                              placeholder='Selector e.g. [data-testid="approve-btn"]'
                              className="flex-1 px-2 py-1 text-[11px] font-mono rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                            />
                            <input
                              type="text"
                              value={item.ruleNote || ''}
                              onChange={(e) => {
                                const copy = [...draftSuiteItems];
                                copy[idx] = { ...copy[idx], ruleNote: e.target.value };
                                setDraftSuiteItems(copy);
                              }}
                              placeholder={pickLang(lang, 'Custom rule label', 'কাস্টম লেবেল')}
                              className="w-28 px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                            />
                            {draftSuiteItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftSuiteItems(
                                    draftSuiteItems.filter((_, i) => i !== idx)
                                  )
                                }
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                aria-label="Remove check"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowRuleBuilder(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      {editingSuiteId
                        ? pickLang(lang, 'Update Rule', 'আপডেট করুন')
                        : pickLang(lang, 'Save Test Rule', 'রুল সেভ করুন')}
                    </button>
                  </div>
                </form>
              )}

              {/* Selector Scope Pill: View All Rules vs Specific Rule */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedSuiteId('ALL')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    selectedSuiteId === 'ALL'
                      ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-bold'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>
                    {pickLang(
                      lang,
                      `All Rules Combined (${customTestRules.length} custom + Matrix)`,
                      `সবগুলো রুল একসাথে (${customTestRules.length}টি কাস্টম + ম্যাট্রিক্স)`
                    )}
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900">
                    ALL
                  </span>
                </button>

                {customTestRules.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {pickLang(
                        lang,
                        'No custom named test rules yet. Click "New Test Rule" to create as many named rules as you want!',
                        'এখনো কোনো কাস্টম টেস্ট রুল তৈরি করা হয়নি। "নতুন রুল তৈরি করুন" বাটনে ক্লিক করে যখন যা নাম ইচ্ছে তাই দিয়ে একাধিক রুল বানান!'
                      )}
                    </p>
                    {uniqueFeatures.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                        {uniqueFeatures.slice(0, 3).map((f) => (
                          <button
                            key={f.feature}
                            type="button"
                            onClick={() => handleImportFeatureIntoSuite(f.feature)}
                            className="px-2 py-1 rounded border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 cursor-pointer"
                          >
                            + Import &quot;{f.feature}&quot;
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {customTestRules.map((suite) => {
                      const isSelected = selectedSuiteId === suite.id;
                      return (
                        <div
                          key={suite.id}
                          onClick={() => setSelectedSuiteId(suite.id)}
                          className={`rounded-lg border p-3 cursor-pointer transition-colors space-y-1.5 ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                {suite.ruleName}
                              </div>
                              {suite.description && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {suite.description}
                                </div>
                              )}
                            </div>
                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => openEditSuiteBuilder(suite)}
                                title="Edit rule"
                                className="p-1 rounded text-slate-400 hover:text-blue-600 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateSuite(suite)}
                                title="Duplicate rule"
                                className="p-1 rounded text-slate-400 hover:text-emerald-600 cursor-pointer"
                              >
                                <CopyPlus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSuite(suite.id)}
                                title="Delete rule"
                                className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {suite.items.map((it) => (
                              <span
                                key={it.id}
                                className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-300"
                              >
                                {it.role}: {it.ruleNote || HUMAN_ACCESS_LABEL[it.expected]}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Live Generated Test Code Output */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Code2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-white">
                    {selectedSuiteId === 'ALL'
                      ? pickLang(
                          lang,
                          'Generated Multi-Rule Test Suite',
                          'জেনারেটেড মাল্টি-রুল টেস্ট কোড'
                        )
                      : customTestRules.find((s) => s.id === selectedSuiteId)?.ruleName ||
                        'Custom Rule Test'}
                  </span>
                </div>

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
                      onClick={() => setRbacCodeLang(item.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                        rbacCodeLang === item.id
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                {selectedSuiteId === 'ALL' ? (
                  <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeMatrixInCode}
                      onChange={(e) => setIncludeMatrixInCode(e.target.checked)}
                    />
                    <span>
                      {pickLang(
                        lang,
                        'Also include Matrix role checks in combined code',
                        'ম্যাট্রিক্সের রোল রুলগুলোও একসাথে কোডে রাখুন'
                      )}
                    </span>
                  </label>
                ) : (
                  <span className="text-[11px] text-emerald-400">
                    {pickLang(
                      lang,
                      'Showing code for your selected custom rule only',
                      'শুধু আপনার সিলেক্ট করা রুলের কোড দেখাচ্ছে'
                    )}
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(generatedRbacSuite);
                        onNotify?.('Copied generated rule test code!');
                      } catch {
                        // Ignore
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadRbacTest}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    {rbacCodeLang === 'pytest-py'
                      ? 'Download _rules_test.py'
                      : rbacCodeLang === 'playwright-ts'
                        ? 'Download .spec.ts'
                        : 'Download .spec.js'}
                  </button>
                </div>
              </div>

              <pre className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-200 overflow-x-auto max-h-[430px] leading-relaxed">
                {generatedRbacSuite}
              </pre>
            </div>
          </div>

          {/* Dynamic Framework Security Auditor */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                {pickLang(
                  lang,
                  'Framework QA Security Auditor (Works with any custom role names)',
                  'QA সিকিউরিটি অডিট (যেকোনো কাস্টম রোলের সাথে কাজ করে)'
                )}
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {securityFindings.length} finding(s)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {securityFindings.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3.5 space-y-1.5 ${
                    item.severity === 'critical'
                      ? 'border-rose-300 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30'
                      : item.severity === 'warning'
                        ? 'border-amber-300 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30'
                        : 'border-emerald-300 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {item.severity === 'critical' ? (
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    ) : item.severity === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        {item.detail}
                      </p>
                      {item.rule && (
                        <button
                          type="button"
                          onClick={() => handleCreateBlockedNoticeFromLeak(item.rule!)}
                          className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          <Megaphone className="w-3 h-3" />
                          {pickLang(lang, 'Pin Blocked Notice', 'ব্লকড নোটিশ দিন')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: INTERACTIVE APPROVAL CHAIN DIAGRAM + DRAWING & NOTES */}
      {activeTab === 'chain' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  'Who Approves After Whom — Interactive Approval Flow & QA Notes',
                  'কার পরে কে অ্যাপ্রুভ করবে — ভিজ্যুয়াল ডায়াগ্রাম ও নোট'
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'Add approval levels using any custom role name, write QA notes, or turn on Draw Mode to sketch arrows & highlights.',
                  'যেকোনো কাস্টম রোলের নাম দিয়ে ধাপে ধাপে অ্যাপ্রুভাল অর্ডার সাজান, QA নোট লিখুন বা ডায়াগ্রামে ড্র করুন।'
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDrawEnabled(!drawEnabled)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                  drawEnabled
                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                {pickLang(
                  lang,
                  drawEnabled ? 'Drawing ON (Done)' : 'Draw / Annotate',
                  drawEnabled ? 'ড্রয়িং চালু (বন্ধ করুন)' : 'ডায়াগ্রামে ড্র করুন'
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyChainSummary}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                {pickLang(lang, 'Copy Notes', 'নোট কপি')}
              </button>

              <button
                type="button"
                onClick={() => {
                  resetStageForm();
                  setShowAddStage(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {pickLang(lang, 'Add Approver Stage', 'নতুন ধাপ যোগ করুন')}
              </button>
            </div>
          </div>

          {drawEnabled && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20 px-3.5 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-rose-700 dark:text-rose-300">
                  {pickLang(lang, 'Sketch Tool:', 'আঁকার টুল:')}
                </span>
                {(
                  [
                    { id: 'arrow', label: 'Arrow', icon: Minus },
                    { id: 'rect', label: 'Box', icon: Square },
                    { id: 'pen', label: 'Freehand', icon: PenTool },
                  ] as const
                ).map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSketchTool(t.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                        sketchTool === t.id
                          ? 'bg-rose-600 text-white'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {t.label}
                    </button>
                  );
                })}
                <div className="flex items-center gap-1.5 ml-2">
                  {['#e11d48', '#059669', '#2563eb', '#d97706'].map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setSketchColor(col)}
                      aria-label={`Select color ${col}`}
                      className={`w-5 h-5 rounded-full cursor-pointer border-2 ${
                        sketchColor === col ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const current = project.approvalSketches || [];
                    if (current.length === 0) return;
                    onUpdateProject({
                      ...project,
                      approvalSketches: current.slice(0, -1),
                    });
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject({ ...project, approvalSketches: [] })
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-rose-600 cursor-pointer"
                >
                  <Eraser className="w-3 h-3" />
                  Clear Drawing
                </button>
              </div>
            </div>
          )}

          {showAddStage && (
            <form
              onSubmit={handleSaveStage}
              className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
            >
              <input
                type="text"
                list="veripulse-framework-roles"
                placeholder={pickLang(lang, 'Any Role Name (e.g. Finance Lead)', 'যেকোনো রোলের নাম লিখুন')}
                value={stageRole}
                onChange={(e) => setStageRole(e.target.value)}
                required
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                placeholder={pickLang(lang, 'Stage Title (e.g. 2. Manager Approval)', 'ধাপের নাম (যেমন: ২. ম্যানেজার অ্যাপ্রুভাল)')}
                value={stageLabel}
                onChange={(e) => setStageLabel(e.target.value)}
                required
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                placeholder={pickLang(lang, 'Condition (e.g. If amount > 5000)', 'শর্ত (যেমন: টাকা > ৫০০০ হলে)')}
                value={stageCondition}
                onChange={(e) => setStageCondition(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <div className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stageRequired}
                    onChange={(e) => setStageRequired(e.target.checked)}
                  />
                  <span>{pickLang(lang, 'Required', 'বাধ্যতামূলক')}</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stageCanReject}
                    onChange={(e) => setStageCanReject(e.target.checked)}
                  />
                  <span>{pickLang(lang, 'Can Reject', 'রিজেক্ট করতে পারে')}</span>
                </label>
              </div>
              <input
                type="text"
                placeholder={pickLang(
                  lang,
                  'QA Verification Note (e.g. Verify email sent & balance deducted only after this step)',
                  'আপনার QA নোট লিখুন (যেমন: এই ধাপের পর ব্যালেন্স কমবে এবং ইমেইল যাবে)'
                )}
                value={stageNote}
                onChange={(e) => setStageNote(e.target.value)}
                className="sm:col-span-2 lg:col-span-3 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={resetStageForm}
                  className="px-3 py-2 text-xs text-slate-500 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                >
                  {editingStageId ? 'Update Stage' : 'Save Stage'}
                </button>
              </div>
            </form>
          )}

          <div
            ref={diagramCanvasRef}
            className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-[#f8fafc] dark:bg-slate-950/70 p-5 overflow-x-auto min-h-[260px]"
          >
            {approvalChain.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                {pickLang(
                  lang,
                  'No approval stages yet. Click "Add Approver Stage" above to map out your approval flow.',
                  'এখনো কোনো অ্যাপ্রুভাল ধাপ যোগ করা হয়নি। ওপরে "নতুন ধাপ যোগ করুন" বাটনে ক্লিক করুন।'
                )}
              </div>
            ) : (
              <div className="flex flex-wrap lg:flex-nowrap items-stretch gap-3 relative z-10">
                {approvalChain.map((stage, idx) => (
                  <React.Fragment key={stage.id}>
                    <div
                      className={`min-w-[220px] flex-1 rounded-xl border-2 p-3.5 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between gap-3 ${
                        stage.required
                          ? 'border-emerald-300 dark:border-emerald-800'
                          : 'border-dashed border-amber-300 dark:border-amber-700'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold uppercase">
                            {stage.role}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              stage.required
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {stage.required
                              ? pickLang(lang, 'Required', 'বাধ্যতামূলক')
                              : pickLang(lang, 'Conditional', 'শর্তসাপেক্ষ')}
                          </span>
                        </div>

                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {stage.stepLabel}
                        </div>

                        <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                          {stage.condition}
                        </div>

                        {stage.qaNote && (
                          <div className="rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 p-2 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                            <span className="font-semibold text-amber-800 dark:text-amber-300">
                              QA Note:{' '}
                            </span>
                            {stage.qaNote}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-medium text-slate-400">
                          {stage.canReject
                            ? pickLang(lang, 'Can Approve / Reject', 'অ্যাপ্রুভ / রিজেক্ট')
                            : pickLang(lang, 'Initiates Flow', 'শুরু করে')}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveStage(idx, -1)}
                            disabled={idx === 0}
                            aria-label="Move stage left"
                            className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStage(idx, 1)}
                            disabled={idx === approvalChain.length - 1}
                            aria-label="Move stage right"
                            className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowRight className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEditStage(stage)}
                            aria-label="Edit stage"
                            className="p-1 rounded text-slate-400 hover:text-blue-600 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStage(stage.id)}
                            aria-label="Delete stage"
                            className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {idx < approvalChain.length - 1 && (
                      <div className="hidden lg:flex flex-col items-center justify-center shrink-0 px-0.5 text-emerald-600 dark:text-emerald-400">
                        <ArrowRight className="w-5 h-5" />
                        <span className="text-[9px] font-mono text-slate-400 mt-0.5">
                          next
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            {(drawEnabled || allSketches.length > 0) && (
              <svg
                onPointerDown={handleSketchPointerDown}
                onPointerMove={handleSketchPointerMove}
                onPointerUp={handleSketchPointerUp}
                className={`absolute inset-0 w-full h-full z-20 ${
                  drawEnabled ? 'cursor-crosshair pointer-events-auto' : 'pointer-events-none'
                }`}
              >
                <defs>
                  <marker
                    id="rbac-sketch-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L0,6 L7,3 z" fill={sketchColor} />
                  </marker>
                </defs>
                {allSketches.map(renderStrokeSvg)}
              </svg>
            )}
          </div>
        </div>
      )}

      {/* TAB: INTERACTIVE PERMISSION MATRIX & MULTI-ROLE RULE BUILDER */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                <Eye className="w-3.5 h-3.5" />
                Can Use (Visible)
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                <Lock className="w-3.5 h-3.5" />
                Read-Only (Disabled)
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <EyeOff className="w-3.5 h-3.5" />
                Hidden
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
                <button
                  type="button"
                  onClick={() => setViewMode('matrix')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                    viewMode === 'matrix'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  List
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyMarkdownMatrix}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Matrix
              </button>

              <button
                type="button"
                onClick={() => {
                  if (showAddForm) {
                    setShowAddForm(false);
                  } else {
                    openMatrixMultiRuleBuilder();
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {pickLang(lang, 'Create Rule Across Roles', 'নতুন রুল তৈরি করুন')}
              </button>
            </div>
          </div>

          {/* Multi-Role Rule Builder Drawer */}
          {showAddForm && (
            <form
              onSubmit={handleSaveMultiRoleRule}
              className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 space-y-3 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    'Define Any Rule Name & Set Permissions Across All Roles at Once',
                    'যেকোনো নামে রুল লিখুন এবং একবারেই সব রোলের জন্য সেট করুন'
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder={pickLang(
                    lang,
                    'Rule / Feature Name (any custom name)',
                    'রুলের নাম (যেমন: অর্ডার ডিলিট বা স্পেশাল ডিসকাউন্ট)'
                  )}
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  required
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  placeholder={pickLang(
                    lang,
                    'Element locator (optional, auto-generated if empty)',
                    'লোকেটর (ফাঁকা রাখলে অটো তৈরি হবে)'
                  )}
                  value={newSelector}
                  onChange={(e) => setNewSelector(e.target.value)}
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  placeholder={pickLang(
                    lang,
                    'Custom Display Label (optional, e.g. Limit 5k)',
                    'কাস্টম রুল লেবেল (ঐচ্ছিক, যেমন: সর্বোচ্চ ৫০০০)'
                  )}
                  value={newCustomBadge}
                  onChange={(e) => setNewCustomBadge(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
                {uniqueRoles.map((role, idx) => (
                  <div
                    key={role}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-2.5 flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {role}
                    </span>
                    <select
                      value={roleAccessDraft[role] ?? (idx === 0 ? 'visible' : 'hidden')}
                      onChange={(e) =>
                        setRoleAccessDraft({
                          ...roleAccessDraft,
                          [role]: e.target.value as DomVisibilityExpectation | 'skip',
                        })
                      }
                      className="px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value="visible">Can Use</option>
                      <option value="disabled">Read-Only</option>
                      <option value="hidden">Hidden</option>
                      <option value="skip">Skip</option>
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                >
                  {pickLang(lang, 'Save Rule Across Roles', 'সব রোলের জন্য রুল সেভ করুন')}
                </button>
              </div>
            </form>
          )}

          {viewMode === 'matrix' ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
              {uniqueFeatures.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  {pickLang(
                    lang,
                    'No matrix rules added yet. Click "Create Rule Across Roles" to add your custom rules.',
                    'এখনো কোনো ম্যাট্রিক্স রুল নেই। "নতুন রুল তৈরি করুন" বাটনে ক্লিক করে নিজের মতো রুল যোগ করুন।'
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-emerald-50/50 dark:bg-emerald-950/20">
                        <th className="py-3 px-4">Rule / Feature &amp; Element</th>
                        {uniqueRoles.map((role) => (
                          <th key={role} className="py-3 px-4 text-center whitespace-nowrap">
                            <span
                              className={
                                role === activeTestRole
                                  ? 'text-emerald-700 dark:text-emerald-400 font-bold underline underline-offset-4'
                                  : ''
                              }
                            >
                              {role}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {uniqueFeatures.map((item) => (
                        <tr
                          key={item.feature}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {item.feature}
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {item.selector}
                            </div>
                          </td>
                          {uniqueRoles.map((role) => {
                            const match = project.rbacRules.find(
                              (r) => r.feature === item.feature && r.role === role
                            );
                            if (!match) {
                              return (
                                <td key={role} className="py-3.5 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuickAddMatrixCell(
                                        role,
                                        item.feature,
                                        item.selector
                                      )
                                    }
                                    title={`Add rule for ${role} on ${item.feature}`}
                                    className="px-2 py-1 rounded border border-dashed border-slate-300 dark:border-slate-700 text-[10px] font-medium text-slate-400 hover:border-emerald-400 hover:text-emerald-600 cursor-pointer"
                                  >
                                    + Add
                                  </button>
                                </td>
                              );
                            }
                            const isDrift =
                              match.observed !== 'not_checked' &&
                              match.observed !== match.expected;
                            const isOk =
                              match.observed !== 'not_checked' &&
                              match.observed === match.expected;
                            return (
                              <td key={role} className="py-3.5 px-4 text-center">
                                <div className="inline-flex flex-col items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleCycleObserved(match.id)}
                                    title={`Expected: ${HUMAN_ACCESS_LABEL[match.expected]} · Observed: ${match.observed} (click to cycle observed)`}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                                      isDrift
                                        ? 'border-rose-300 dark:border-rose-800 bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                                        : isOk
                                          ? 'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    {renderStateIcon(match.expected)}
                                    <span>
                                      {match.customRuleLabel || HUMAN_ACCESS_LABEL[match.expected]}
                                    </span>
                                    {isDrift && (
                                      <span className="font-mono text-[10px]">
                                        (got {match.observed})
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCycleExpected(match.id)}
                                    className="text-[10px] text-slate-400 hover:text-emerald-600 cursor-pointer"
                                  >
                                    Change rule
                                  </button>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {roles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setRoleFilter(role)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      roleFilter === role
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-emerald-50/50 dark:bg-emerald-950/20">
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Rule / Feature</th>
                        <th className="py-3 px-4">Element Locator</th>
                        <th className="py-3 px-4">Rule Access</th>
                        <th className="py-3 px-4">Observed</th>
                        <th className="py-3 px-4">Result</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {filteredRules.map((rule) => {
                        const isMismatch =
                          rule.observed !== 'not_checked' &&
                          rule.observed !== rule.expected;
                        const isVerified =
                          rule.observed !== 'not_checked' &&
                          rule.observed === rule.expected;
                        return (
                          <tr
                            key={rule.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                          >
                            <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                              {rule.role}
                            </td>
                            <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                              {rule.feature}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {rule.selector}
                            </td>
                            <td className="py-3 px-4">
                              <button
                                type="button"
                                onClick={() => handleCycleExpected(rule.id)}
                                className="text-slate-700 dark:text-slate-300 underline decoration-dotted underline-offset-4 cursor-pointer"
                              >
                                {rule.customRuleLabel || HUMAN_ACCESS_LABEL[rule.expected]}
                              </button>
                            </td>
                            <td className="py-3 px-4">
                              <button
                                type="button"
                                onClick={() => handleCycleObserved(rule.id)}
                                title="Click to simulate observed page state"
                                className="font-mono underline decoration-dotted underline-offset-4 text-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                {rule.observed}
                              </button>
                            </td>
                            <td className="py-3 px-4">
                              {isVerified ? (
                                <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  OK
                                </span>
                              ) : isMismatch ? (
                                <span className="inline-flex items-center gap-1 font-medium text-rose-700 dark:text-rose-400">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  Security Drift
                                </span>
                              ) : (
                                <span className="text-slate-400">Not Checked</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right space-x-1">
                              {isMismatch && (
                                <button
                                  type="button"
                                  onClick={() => handleCreateBlockedNoticeFromLeak(rule)}
                                  title="Pin Blocked QA Notice"
                                  className="p-1.5 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                >
                                  <Megaphone className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteRule(rule.id)}
                                className="p-1.5 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB: ROLE X-RAY UI SIMULATOR & SIDE-BY-SIDE DIFF */}
      {activeTab === 'xray' && (() => {
        const selectedRole = effectiveActiveRole || uniqueRoles[0] || '';
        const resolvedRoleA =
          diffRoleA && uniqueRoles.includes(diffRoleA)
            ? diffRoleA
            : uniqueRoles[0] || '';
        const resolvedRoleB =
          diffRoleB && uniqueRoles.includes(diffRoleB)
            ? diffRoleB
            : uniqueRoles[1] || uniqueRoles[0] || '';

        const allRoleCapabilities: Array<{
          key: string;
          label: string;
          selector: string;
          role: string;
          expected: DomVisibilityExpectation;
          observed: DomObservedState;
          source: string;
        }> = [
          ...project.rbacRules.map((r) => ({
            key: `m_${r.id}`,
            label: r.feature,
            selector: r.selector,
            role: r.role,
            expected: r.expected,
            observed: r.observed,
            source: 'Matrix',
          })),
          ...customTestRules.flatMap((suite) =>
            suite.items.map((it) => ({
              key: `c_${suite.id}_${it.id}`,
              label: `${suite.ruleName}: ${it.targetElement}`,
              selector: it.targetElement,
              role: it.role,
              expected: it.expected,
              observed: 'not_checked' as DomObservedState,
              source: suite.ruleName,
            }))
          ),
        ];

        const activeCapabilities = allRoleCapabilities.filter(
          (c) => c.role.toLowerCase() === selectedRole.toLowerCase()
        );
        const visibleCaps = activeCapabilities.filter((c) => c.expected === 'visible');
        const disabledCaps = activeCapabilities.filter((c) => c.expected === 'disabled');
        const hiddenCaps = activeCapabilities.filter((c) => c.expected === 'hidden');

        const stageParticipation = approvalChain
          .map((st, idx) => ({ st, order: idx + 1 }))
          .filter(
            ({ st }) => st.role.toLowerCase() === selectedRole.toLowerCase()
          );

        const uniqueCompareTargets = Array.from(
          new Map(
            allRoleCapabilities.map((c) => [
              c.selector.toLowerCase(),
              { selector: c.selector, label: c.label },
            ])
          ).values()
        );

        const securityScore =
          stats.total === 0
            ? 100
            : Math.max(
                0,
                Math.round(((stats.total - stats.mismatches) / stats.total) * 100)
              );

        return (
          <div className="space-y-5">
            {/* Role X-Ray Live App Simulator */}
            <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    {pickLang(
                      lang,
                      'Role UI X-Ray Simulator',
                      'রোল UI এক্স-রে সিমুলেটর'
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {pickLang(
                      lang,
                      'Preview exactly what buttons, read-only locks, and hidden elements a logged-in role sees on screen.',
                      'নির্বাচিত রোল লগইন করলে স্ক্রিনে কোন বাটন চালু, কোনটি লক এবং কোনটি সম্পূর্ণ লুকানো থাকবে তা সরাসরি দেখুন।'
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono">
                    {pickLang(lang, 'Security Integrity:', 'নিরাপত্তা স্কোর:')}{' '}
                    <strong
                      className={
                        securityScore >= 90
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : securityScore >= 70
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {securityScore}%
                    </strong>
                  </div>

                  <select
                    aria-label="Select role for X-Ray"
                    value={selectedRole}
                    onChange={(e) => setActiveTestRole(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-900 dark:text-emerald-200"
                  >
                    {uniqueRoles.length === 0 ? (
                      <option value="">
                        {pickLang(lang, 'No roles yet', 'কোনো রোল নেই')}
                      </option>
                    ) : (
                      uniqueRoles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {selectedRole ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 p-4 space-y-4">
                  {/* Simulated Session Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {pickLang(lang, 'Simulated Session:', 'সিমুলেটেড সেশন:')} {selectedRole}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        ({activeCapabilities.length} {pickLang(lang, 'rules mapped', 'টি রুল')})
                      </span>
                    </div>

                    {stageParticipation.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {stageParticipation.map(({ st, order }) => (
                          <span
                            key={st.id}
                            className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[11px] font-medium text-indigo-700 dark:text-indigo-300"
                          >
                            {pickLang(lang, 'Stage', 'ধাপ')} {order}: {st.stepLabel}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {activeCapabilities.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                      {pickLang(
                        lang,
                        `No matrix or custom rules linked to "${selectedRole}" yet.`,
                        `"${selectedRole}" রোলের জন্য এখনো কোনো রুল যুক্ত করা হয়নি।`
                      )}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Bucket 1: Visible & Active */}
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/70 bg-white dark:bg-slate-900 p-3 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-300">
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {pickLang(lang, 'Can Use (Visible)', 'ব্যবহারযোগ্য (Visible)')}
                          </span>
                          <span className="font-mono">{visibleCaps.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {visibleCaps.map((cap) => (
                            <button
                              key={cap.key}
                              type="button"
                              onClick={() =>
                                onNotify?.(
                                  `[${selectedRole}] Simulated click on "${cap.label}" (${cap.selector})`
                                )
                              }
                              className="w-full text-left px-2.5 py-2 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer"
                            >
                              <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 truncate">
                                {cap.label}
                              </div>
                              <div className="text-[10px] font-mono text-emerald-700/80 dark:text-emerald-300/80 truncate">
                                {cap.selector}
                              </div>
                            </button>
                          ))}
                          {visibleCaps.length === 0 && (
                            <p className="text-[11px] text-slate-400 italic">
                              {pickLang(lang, 'None', 'কিছু নেই')}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Bucket 2: Read-Only / Disabled */}
                      <div className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-white dark:bg-slate-900 p-3 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-300">
                          <span className="inline-flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5" />
                            {pickLang(lang, 'Locked (Disabled)', 'লকড (Read-Only)')}
                          </span>
                          <span className="font-mono">{disabledCaps.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {disabledCaps.map((cap) => (
                            <div
                              key={cap.key}
                              className="px-2.5 py-2 rounded-md border border-amber-200 dark:border-amber-800/70 bg-amber-50/50 dark:bg-amber-950/20 opacity-80"
                            >
                              <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 truncate">
                                {cap.label}
                              </div>
                              <div className="text-[10px] font-mono text-amber-700/80 dark:text-amber-300/70 truncate">
                                {cap.selector}
                              </div>
                            </div>
                          ))}
                          {disabledCaps.length === 0 && (
                            <p className="text-[11px] text-slate-400 italic">
                              {pickLang(lang, 'None', 'কিছু নেই')}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Bucket 3: Hidden from DOM */}
                      <div className="rounded-lg border border-rose-200 dark:border-rose-900/70 bg-white dark:bg-slate-900 p-3 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-bold text-rose-700 dark:text-rose-300">
                          <span className="inline-flex items-center gap-1.5">
                            <EyeOff className="w-3.5 h-3.5" />
                            {pickLang(lang, 'Hidden (No DOM)', 'সম্পূর্ণ লুকানো (Hidden)')}
                          </span>
                          <span className="font-mono">{hiddenCaps.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {hiddenCaps.map((cap) => (
                            <div
                              key={cap.key}
                              className="px-2.5 py-2 rounded-md border border-dashed border-rose-300 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20"
                            >
                              <div className="text-xs font-semibold text-rose-800 dark:text-rose-200 line-through truncate">
                                {cap.label}
                              </div>
                              <div className="text-[10px] font-mono text-rose-600/80 dark:text-rose-300/80 truncate">
                                {cap.selector}
                              </div>
                            </div>
                          ))}
                          {hiddenCaps.length === 0 && (
                            <p className="text-[11px] text-slate-400 italic">
                              {pickLang(lang, 'None', 'কিছু নেই')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Side-by-Side Role Comparator (Diff View) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    {pickLang(
                      lang,
                      'Side-by-Side Role Permission Diff',
                      'দুটি রোলের পারমিশন তুলনা (Diff)'
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {pickLang(
                      lang,
                      'Compare any two roles immediately to catch missing restrictions or privilege escalation bugs.',
                      'যেকোনো দুটি রোলের মধ্যে পারমিশনের পার্থক্য দেখে সিকিউরিটি ফাঁকফোকর দ্রুত ধরুন।'
                    )}
                  </p>
                </div>

                {uniqueRoles.length >= 2 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Compare Role A"
                      value={resolvedRoleA}
                      onChange={(e) => setDiffRoleA(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-slate-100"
                    >
                      {uniqueRoles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs font-bold text-slate-400">vs</span>
                    <select
                      aria-label="Compare Role B"
                      value={resolvedRoleB}
                      onChange={(e) => setDiffRoleB(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-slate-100"
                    >
                      {uniqueRoles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {uniqueCompareTargets.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">
                  {pickLang(
                    lang,
                    'Add rules in Permission Matrix or Custom Test Rules to compare roles.',
                    'তুলনা করতে পারমিশন ম্যাট্রিক্স বা কাস্টম রুলে অন্তত একটি নিয়ম যোগ করুন।'
                  )}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-3">Feature / Locator</th>
                        <th className="py-2.5 px-3">{resolvedRoleA || 'Role A'}</th>
                        <th className="py-2.5 px-3">{resolvedRoleB || 'Role B'}</th>
                        <th className="py-2.5 px-3">Diff Verdict</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {uniqueCompareTargets.map((target) => {
                        const matchA = allRoleCapabilities.find(
                          (c) =>
                            c.selector.toLowerCase() === target.selector.toLowerCase() &&
                            c.role.toLowerCase() === resolvedRoleA.toLowerCase()
                        );
                        const matchB = allRoleCapabilities.find(
                          (c) =>
                            c.selector.toLowerCase() === target.selector.toLowerCase() &&
                            c.role.toLowerCase() === resolvedRoleB.toLowerCase()
                        );
                        const expA = matchA?.expected;
                        const expB = matchB?.expected;
                        const isDifferent = expA !== expB;

                        return (
                          <tr
                            key={target.selector}
                            className={
                              isDifferent
                                ? 'bg-amber-50/40 dark:bg-amber-950/15'
                                : 'bg-white dark:bg-slate-900'
                            }
                          >
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {target.label}
                              </div>
                              <div className="font-mono text-[10px] text-slate-400">
                                {target.selector}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-medium">
                              {expA ? (
                                <span
                                  className={
                                    expA === 'visible'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : expA === 'disabled'
                                        ? 'text-amber-700 dark:text-amber-400'
                                        : 'text-rose-700 dark:text-rose-400'
                                  }
                                >
                                  {HUMAN_ACCESS_LABEL[expA]}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-medium">
                              {expB ? (
                                <span
                                  className={
                                    expB === 'visible'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : expB === 'disabled'
                                        ? 'text-amber-700 dark:text-amber-400'
                                        : 'text-rose-700 dark:text-rose-400'
                                  }
                                >
                                  {HUMAN_ACCESS_LABEL[expB]}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {isDifferent ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                                  <AlertTriangle className="w-3 h-3" />
                                  {pickLang(lang, 'Changed Access', 'ভিন্ন অ্যাক্সেস')}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  {pickLang(lang, 'Identical', 'একই')}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Shared datalist for role autocomplete */}
      <datalist id="veripulse-framework-roles">
        {uniqueRoles.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  );
};
