import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FileSearch,
  FileText,
  Globe,
  Play,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import {
  AppLanguage,
  ContentAssertionRule,
  ContentMatchOperator,
  FormulaCheckRule,
  FormulaVariable,
  ProjectWorkspace,
} from '../types/flowguard';
import {
  isChromeExtensionContext,
  readActiveTabContent,
} from '../utils/extensionBridge';
import {
  evaluateContentRule,
  evaluateFormulaExpression,
  extractFormulaVariables,
  extractNumericValue,
  scanTextForContentBugs,
} from '../utils/formulaEvaluator';

interface ContentFormulaViewProps {
  project: ProjectWorkspace;
  lang: AppLanguage;
  onUpdateProject: (updated: ProjectWorkspace) => void;
  onNotify?: (message: string) => void;
}

const OPERATOR_LABELS: Record<ContentMatchOperator, { en: string; bn: string }> = {
  contains: { en: 'Contains Text', bn: 'টেক্সট আছে কিনা' },
  equals: { en: 'Exact Match', bn: 'হুবহু মিল' },
  not_contains: { en: 'Must NOT Contain', bn: 'থাকা যাবে না' },
  regex: { en: 'Regex Pattern', bn: 'রেজেক্স (Regex)' },
  max_length: { en: 'Max Characters', bn: 'সর্বোচ্চ অক্ষর সীমা' },
};

function flattenJsonLeaves(
  value: unknown,
  prefix = ''
): Array<{ path: string; rawValue: string; numericValue: number | null }> {
  const out: Array<{ path: string; rawValue: string; numericValue: number | null }> = [];
  if (value === null || value === undefined) {
    if (prefix) out.push({ path: prefix, rawValue: String(value), numericValue: null });
    return out;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const rawStr = String(value);
    const parsedNum =
      typeof value === 'number'
        ? value
        : /^-?[\d,]+(\.\d+)?$/.test(rawStr.trim())
          ? Number(rawStr.replace(/,/g, ''))
          : null;
    out.push({
      path: prefix || 'value',
      rawValue: rawStr,
      numericValue: parsedNum !== null && Number.isFinite(parsedNum) ? parsedNum : null,
    });
    return out;
  }
  if (Array.isArray(value)) {
    value.slice(0, 25).forEach((item, idx) => {
      out.push(...flattenJsonLeaves(item, `${prefix}[${idx}]`));
    });
    return out;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .forEach(([k, v]) => {
        const nextKey = prefix ? `${prefix}.${k}` : k;
        out.push(...flattenJsonLeaves(v, nextKey));
      });
  }
  return out;
}

export const ContentFormulaView: React.FC<ContentFormulaViewProps> = ({
  project,
  lang,
  onUpdateProject,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<'formulas' | 'content' | 'scanner' | 'parity'>('formulas');
  const [fetchingLive, setFetchingLive] = useState(false);

  const contentAssertions: ContentAssertionRule[] = useMemo(
    () => project.contentAssertions || [],
    [project.contentAssertions]
  );

  const formulaChecks: FormulaCheckRule[] = useMemo(
    () => project.formulaChecks || [],
    [project.formulaChecks]
  );

  // Quick Interactive Formula Scratchpad
  const [quickExpr, setQuickExpr] = useState('(price * qty) - ((price * qty) * discountPct / 100) + vat');
  const [quickVars, setQuickVars] = useState<Record<string, number>>({
    price: 500,
    qty: 3,
    discountPct: 10,
    vat: 75,
  });
  const [quickActual, setQuickActual] = useState<number>(1425);
  const [quickTolerance, setQuickTolerance] = useState<number>(0.01);

  const quickDetectedVarNames = useMemo(
    () => extractFormulaVariables(quickExpr),
    [quickExpr]
  );

  const quickVarMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of quickDetectedVarNames) {
      map[v] = Number.isFinite(quickVars[v]) ? quickVars[v] : 0;
    }
    return map;
  }, [quickDetectedVarNames, quickVars]);

  const quickEval = useMemo(
    () => evaluateFormulaExpression(quickExpr, quickVarMap, quickTolerance),
    [quickExpr, quickVarMap, quickTolerance]
  );

  const quickMatchesWebsite = useMemo(() => {
    if (!quickEval.ok) return false;
    if (quickEval.isComparison) return Boolean(quickEval.booleanResult);
    return Math.abs((quickEval.value ?? 0) - quickActual) <= quickTolerance;
  }, [quickEval, quickActual, quickTolerance]);

  // Add Saved Formula Form
  const [showAddFormula, setShowAddFormula] = useState(false);
  const [newFormulaName, setNewFormulaName] = useState('');
  const [newFormulaExpr, setNewFormulaExpr] = useState('subtotal - discount + tax');
  const [newFormulaActualVal, setNewFormulaActualVal] = useState<number>(0);
  const [newFormulaActualSelector, setNewFormulaActualSelector] = useState('');
  const [newFormulaVarSelectors, setNewFormulaVarSelectors] = useState<
    Record<string, { val: number; selector: string }>
  >({});

  // Add Content Assertion Form
  const [showAddContent, setShowAddContent] = useState(false);
  const [newContentName, setNewContentName] = useState('');
  const [newContentSelector, setNewContentSelector] = useState('h1');
  const [newContentOperator, setNewContentOperator] =
    useState<ContentMatchOperator>('contains');
  const [newContentExpected, setNewContentExpected] = useState('');
  const [newContentSample, setNewContentSample] = useState('');
  const [newContentCaseSensitive, setNewContentCaseSensitive] = useState(false);

  // Content Health Scanner & Codegen State
  const [scannerText, setScannerText] = useState(
    'Order Summary\nSubtotal: ৳ 1,500.00\nDiscount (10%): -৳ 150.00\nVAT: ৳ 75.00\nNet Payable: ৳ 1,425.00\nStatus: Pending Review'
  );
  const [exportLang, setExportLang] = useState<'pytest-py' | 'playwright-ts'>('pytest-py');

  // API JSON <-> UI Parity Checker State
  const [parityJsonText, setParityJsonText] = useState(
    '{\n  "orderRef": "INV-9042",\n  "subtotal": 1500,\n  "discount": 150,\n  "vat": 75,\n  "netPayable": 1425,\n  "status": "Pending Review"\n}'
  );
  const [parityUiText, setParityUiText] = useState(
    'Invoice INV-9042\nSubtotal: ৳ 1,500.00\nDiscount: -৳ 150.00\nVAT: ৳ 75.00\nNet Payable: ৳ 1,425.00\nStatus: Pending Review'
  );

  const parityReport = useMemo(() => {
    try {
      const parsed = JSON.parse(parityJsonText);
      const leaves = flattenJsonLeaves(parsed);
      const uiNormalized = parityUiText.toLowerCase();
      const uiNumbers = parityUiText
        .replace(/,/g, '')
        .match(/-?\d+(?:\.\d+)?/g)
        ?.map((n) => Number(n))
        .filter((n) => Number.isFinite(n)) || [];

      const rows = leaves.map((leaf) => {
        const needle = leaf.rawValue.trim().toLowerCase();
        const exactTextMatch = needle.length > 0 && uiNormalized.includes(needle);
        const numericMatch =
          leaf.numericValue !== null &&
          uiNumbers.some((u) => Math.abs(u - (leaf.numericValue as number)) <= 0.01);
        const matched = exactTextMatch || numericMatch;
        return {
          ...leaf,
          matched,
          matchKind: exactTextMatch ? 'text' : numericMatch ? 'numeric' : 'missing',
        };
      });

      return {
        validJson: true,
        error: '',
        rows,
        matchedCount: rows.filter((r) => r.matched).length,
      };
    } catch (err) {
      return {
        validJson: false,
        error: err instanceof Error ? err.message : 'Invalid JSON',
        rows: [] as Array<{
          path: string;
          rawValue: string;
          numericValue: number | null;
          matched: boolean;
          matchKind: string;
        }>,
        matchedCount: 0,
      };
    }
  }, [parityJsonText, parityUiText]);

  const handleFetchUiForParity = async () => {
    if (!isChromeExtensionContext()) {
      onNotify?.(
        pickLang(
          lang,
          'In Web Preview mode, paste visible UI/invoice text on the right to compare against JSON.',
          'ওয়েব প্রিভিউ মোডে ডান পাশের বক্সে পেজের লেখা পেস্ট করে JSON-এর সাথে মিলান।'
        )
      );
      return;
    }
    setFetchingLive(true);
    const res = await readActiveTabContent(['PAGE_BODY']);
    setFetchingLive(false);
    if (res.ok && res.pageBodySample !== undefined) {
      setParityUiText(res.pageBodySample);
      onNotify?.(`Loaded visible UI text from ${res.pageTitle || 'active tab'}.`);
    } else {
      onNotify?.(res.error || 'Could not read active tab text.');
    }
  };

  const handleSaveParityAsContentRule = (path: string, rawValue: string) => {
    const created: ContentAssertionRule = {
      id: `cnt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: `API Parity: ${path}`,
      selector: 'PAGE_BODY',
      operator: 'contains',
      expectedText: rawValue,
      sampleInputText: parityUiText.slice(0, 600),
      caseSensitive: false,
      status: 'untested',
    };
    onUpdateProject({
      ...project,
      contentAssertions: [...contentAssertions, created],
    });
    onNotify?.(
      pickLang(
        lang,
        `Saved "${path}" as a Content Assertion rule.`,
        `"${path}" কন্টেন্ট চেক রুল হিসেবে সেভ হয়েছে।`
      )
    );
  };

  const scanReport = useMemo(
    () => scanTextForContentBugs(scannerText),
    [scannerText]
  );

  const handleSaveQuickAsRule = () => {
    const vars: FormulaVariable[] = quickDetectedVarNames.map((name) => ({
      name,
      value: quickVarMap[name] ?? 0,
    }));
    const evalRes = evaluateFormulaExpression(quickExpr, quickVarMap, quickTolerance);
    const created: FormulaCheckRule = {
      id: `fml_${Date.now()}`,
      name: pickLang(
        lang,
        `Formula Check #${formulaChecks.length + 1}`,
        `ফর্মুলা টেস্ট #${formulaChecks.length + 1}`
      ),
      expression: quickExpr,
      variables: vars,
      actualDisplayedValue: quickActual,
      tolerance: quickTolerance,
      computedValue: evalRes.value,
      status: quickMatchesWebsite ? 'passed' : 'failed',
      lastMessage: evalRes.ok
        ? evalRes.isComparison
          ? `Condition ${evalRes.leftVal} ${evalRes.operator} ${evalRes.rightVal}`
          : `Expected ${evalRes.value}, Website showed ${quickActual}`
        : evalRes.error,
    };
    onUpdateProject({
      ...project,
      formulaChecks: [...formulaChecks, created],
    });
    onNotify?.(
      pickLang(
        lang,
        'Saved formula check to your workspace list!',
        'ফর্মুলা টেস্টটি সেভ করা হয়েছে!'
      )
    );
  };

  const handleAddFormulaRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFormulaName.trim() || !newFormulaExpr.trim()) return;
    const varNames = extractFormulaVariables(newFormulaExpr);
    const variables: FormulaVariable[] = varNames.map((n) => ({
      name: n,
      value: newFormulaVarSelectors[n]?.val ?? 0,
      selector: newFormulaVarSelectors[n]?.selector?.trim() || undefined,
    }));

    const created: FormulaCheckRule = {
      id: `fml_${Date.now()}`,
      name: newFormulaName.trim(),
      expression: newFormulaExpr.trim(),
      variables,
      actualDisplayedValue: newFormulaActualVal,
      actualSelector: newFormulaActualSelector.trim() || undefined,
      tolerance: 0.01,
      status: 'untested',
    };

    onUpdateProject({
      ...project,
      formulaChecks: [...formulaChecks, created],
    });
    setNewFormulaName('');
    setNewFormulaActualSelector('');
    setShowAddFormula(false);
    onNotify?.(`Added formula rule "${created.name}".`);
  };

  const handleEvaluateAllFormulas = async (fetchLive: boolean) => {
    let liveMap: Record<string, { found: boolean; text: string }> = {};
    if (fetchLive) {
      if (!isChromeExtensionContext()) {
        onNotify?.(
          pickLang(
            lang,
            'Live Tab Fetch runs inside the Chrome Extension. Evaluating locally with your current input numbers.',
            'লাইভ ট্যাব থেকে ডেটা আনতে Chrome Extension প্রয়োজন। এখন আপনার দেওয়া সংখ্যা দিয়েই হিসাব যাচাই করা হলো।'
          )
        );
      } else {
        const selectors = new Set<string>();
        formulaChecks.forEach((f) => {
          if (f.actualSelector) selectors.add(f.actualSelector);
          f.variables.forEach((v) => {
            if (v.selector) selectors.add(v.selector);
          });
        });
        if (selectors.size > 0) {
          setFetchingLive(true);
          const res = await readActiveTabContent(Array.from(selectors));
          setFetchingLive(false);
          if (res.ok) {
            liveMap = res.values;
          }
        }
      }
    }

    const updated: FormulaCheckRule[] = formulaChecks.map((rule) => {
      const nextVars = rule.variables.map((v) => {
        if (fetchLive && v.selector && liveMap[v.selector]?.found) {
          const num = extractNumericValue(liveMap[v.selector].text);
          if (num !== null) return { ...v, value: num };
        }
        return v;
      });

      let nextActual = rule.actualDisplayedValue;
      if (fetchLive && rule.actualSelector && liveMap[rule.actualSelector]?.found) {
        const num = extractNumericValue(liveMap[rule.actualSelector].text);
        if (num !== null) nextActual = num;
      }

      const varDict: Record<string, number> = {};
      nextVars.forEach((v) => {
        varDict[v.name] = v.value;
      });

      const res = evaluateFormulaExpression(rule.expression, varDict, rule.tolerance);
      if (!res.ok) {
        return {
          ...rule,
          variables: nextVars,
          actualDisplayedValue: nextActual,
          status: 'failed',
          lastMessage: res.error || 'Formula error',
        };
      }

      const passed = res.isComparison
        ? Boolean(res.booleanResult)
        : Math.abs((res.value ?? 0) - nextActual) <= rule.tolerance;

      const msg = res.isComparison
        ? `${res.leftVal} ${res.operator} ${res.rightVal} → ${passed ? 'True' : 'False'}`
        : `Expected ${res.value} vs Website ${nextActual} (diff ${Math.abs((res.value ?? 0) - nextActual).toFixed(2)})`;

      return {
        ...rule,
        variables: nextVars,
        actualDisplayedValue: nextActual,
        computedValue: res.value,
        status: passed ? 'passed' : 'failed',
        lastMessage: msg,
      };
    });

    onUpdateProject({ ...project, formulaChecks: updated });
    const passCount = updated.filter((u) => u.status === 'passed').length;
    onNotify?.(
      pickLang(
        lang,
        `Evaluated ${updated.length} formula(s): ${passCount} passed.`,
        `${updated.length}টি ফর্মুলা যাচাই সম্পন্ন: ${passCount}টি সঠিক।`
      )
    );
  };

  const handleUpdateFormulaVar = (ruleId: string, varName: string, nextVal: number) => {
    const next = formulaChecks.map((f) =>
      f.id === ruleId
        ? {
            ...f,
            status: 'untested' as const,
            variables: f.variables.map((v) =>
              v.name === varName ? { ...v, value: nextVal } : v
            ),
          }
        : f
    );
    onUpdateProject({ ...project, formulaChecks: next });
  };

  const handleUpdateFormulaActual = (ruleId: string, nextVal: number) => {
    const next = formulaChecks.map((f) =>
      f.id === ruleId
        ? { ...f, actualDisplayedValue: nextVal, status: 'untested' as const }
        : f
    );
    onUpdateProject({ ...project, formulaChecks: next });
  };

  const handleDeleteFormula = (id: string) => {
    onUpdateProject({
      ...project,
      formulaChecks: formulaChecks.filter((f) => f.id !== id),
    });
  };

  // Content Assertions CRUD & Evaluation
  const handleAddContentRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContentName.trim() || !newContentExpected.trim()) return;
    const created: ContentAssertionRule = {
      id: `cnt_${Date.now()}`,
      name: newContentName.trim(),
      selector: newContentSelector.trim() || 'PAGE_BODY',
      operator: newContentOperator,
      expectedText: newContentExpected.trim(),
      caseSensitive: newContentCaseSensitive,
      sampleInputText: newContentSample,
      status: 'untested',
      lastCheckedAt: null,
    };
    onUpdateProject({
      ...project,
      contentAssertions: [...contentAssertions, created],
    });
    setNewContentName('');
    setNewContentExpected('');
    setNewContentSample('');
    setShowAddContent(false);
    onNotify?.(`Added content check "${created.name}".`);
  };

  const handleRunContentChecks = async (useLiveTab: boolean) => {
    let liveValues: Record<string, { found: boolean; text: string }> = {};
    if (useLiveTab) {
      if (!isChromeExtensionContext()) {
        onNotify?.(
          pickLang(
            lang,
            'Live Tab Text Probe requires Chrome Extension. Running checks against your sample/pasted text instead.',
            'লাইভ ট্যাব চেক করতে Chrome Extension প্রয়োজন। এখন আপনার দেওয়া স্যাম্পল টেক্সট যাচাই করা হচ্ছে।'
          )
        );
      } else {
        setFetchingLive(true);
        const selectors = Array.from(
          new Set(contentAssertions.map((c) => c.selector || 'PAGE_BODY'))
        );
        const res = await readActiveTabContent(selectors);
        setFetchingLive(false);
        if (res.ok) {
          liveValues = res.values;
        }
      }
    }

    const now = new Date().toISOString();
    const nextAssertions: ContentAssertionRule[] = contentAssertions.map((rule) => {
      const liveEntry = useLiveTab ? liveValues[rule.selector] : undefined;
      const actualText = liveEntry?.found
        ? liveEntry.text
        : rule.sampleInputText ?? rule.lastActualText ?? '';

      if (useLiveTab && isChromeExtensionContext() && liveEntry && !liveEntry.found) {
        return {
          ...rule,
          lastActualText: `Element not found (${rule.selector})`,
          status: 'failed',
          lastCheckedAt: now,
        };
      }

      const evalRes = evaluateContentRule(rule, actualText);
      return {
        ...rule,
        lastActualText: actualText || '(empty)',
        status: evalRes.passed ? 'passed' : 'failed',
        lastCheckedAt: now,
      };
    });

    onUpdateProject({ ...project, contentAssertions: nextAssertions });
    const passed = nextAssertions.filter((r) => r.status === 'passed').length;
    onNotify?.(
      pickLang(
        lang,
        `Checked ${nextAssertions.length} content rule(s): ${passed} passed.`,
        `${nextAssertions.length}টি কন্টেন্ট রুল চেক সম্পন্ন: ${passed}টি পাস।`
      )
    );
  };

  const handleFetchPageTextToScanner = async () => {
    if (!isChromeExtensionContext()) {
      onNotify?.(
        pickLang(
          lang,
          'In Web Preview mode, paste any website text directly into the box below to scan it.',
          'ওয়েব প্রিভিউ মোডে যেকোনো ওয়েবসাইটের লেখা কপি করে নিচের বক্সে পেস্ট করুন — সাথে সাথেই স্ক্যান হবে।'
        )
      );
      return;
    }
    setFetchingLive(true);
    const res = await readActiveTabContent(['PAGE_BODY']);
    setFetchingLive(false);
    if (res.ok && res.pageBodySample !== undefined) {
      setScannerText(res.pageBodySample);
      onNotify?.(`Fetched live text from ${res.pageTitle || 'active tab'}!`);
    } else {
      onNotify?.(res.error || 'Could not read active tab text.');
    }
  };

  // Generate automated Playwright / pytest Code for Content & Formula checks
  const generatedCode = useMemo(() => {
    if (exportLang === 'pytest-py') {
      const lines = [
        `import re`,
        `import pytest`,
        `from playwright.sync_api import Page, expect`,
        ``,
        `# VeriPulse Content, Text & Formula Calculation Verification`,
        `def test_website_content_and_formulas(page: Page) -> None:`,
        `    page.goto("https://${project.domain}/")`,
      ];

      contentAssertions.forEach((c) => {
        const sel = c.selector === 'PAGE_BODY' ? 'body' : c.selector.replace(/"/g, '\\"');
        const exp = c.expectedText.replace(/"/g, '\\"');
        lines.push(`    # Content Check: ${c.name}`);
        if (c.operator === 'contains') {
          lines.push(`    expect(page.locator("${sel}")).to_contain_text("${exp}")`);
        } else if (c.operator === 'equals') {
          lines.push(`    expect(page.locator("${sel}")).to_have_text("${exp}")`);
        } else if (c.operator === 'not_contains') {
          lines.push(`    assert "${exp}" not in page.locator("${sel}").inner_text()`);
        } else if (c.operator === 'regex') {
          lines.push(`    expect(page.locator("${sel}")).to_have_text(re.compile(r"${exp}"))`);
        } else {
          lines.push(`    assert len(page.locator("${sel}").inner_text().strip()) <= ${Number(c.expectedText) || 100}`);
        }
      });

      formulaChecks.forEach((f) => {
        lines.push(``);
        lines.push(`    # Formula Check: ${f.name} -> ${f.expression}`);
        f.variables.forEach((v) => {
          if (v.selector) {
            lines.push(`    ${v.name} = float(re.sub(r"[^\\d.-]", "", page.locator("${v.selector.replace(/"/g, '\\"')}").inner_text()))`);
          } else {
            lines.push(`    ${v.name} = ${v.value}`);
          }
        });
        if (f.actualSelector) {
          lines.push(`    displayed_val = float(re.sub(r"[^\\d.-]", "", page.locator("${f.actualSelector.replace(/"/g, '\\"')}").inner_text()))`);
        } else {
          lines.push(`    displayed_val = ${f.actualDisplayedValue}`);
        }
        lines.push(`    expected_val = ${f.expression}`);
        lines.push(`    assert abs(expected_val - displayed_val) <= ${f.tolerance}`);
      });

      return lines.join('\n');
    }

    const lines = [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `test('Website Content, Text & Formula Verification', async ({ page }) => {`,
      `  await page.goto('https://${project.domain}/');`,
    ];

    contentAssertions.forEach((c) => {
      const sel = c.selector === 'PAGE_BODY' ? 'body' : c.selector.replace(/'/g, "\\'");
      const exp = c.expectedText.replace(/'/g, "\\'");
      lines.push(`  // Content Check: ${c.name}`);
      if (c.operator === 'contains') {
        lines.push(`  await expect(page.locator('${sel}')).toContainText('${exp}');`);
      } else if (c.operator === 'equals') {
        lines.push(`  await expect(page.locator('${sel}')).toHaveText('${exp}');`);
      } else if (c.operator === 'not_contains') {
        lines.push(`  expect(await page.locator('${sel}').innerText()).not.toContain('${exp}');`);
      } else if (c.operator === 'regex') {
        lines.push(`  await expect(page.locator('${sel}')).toHaveText(new RegExp('${exp}'));`);
      } else {
        lines.push(`  expect((await page.locator('${sel}').innerText()).trim().length).toBeLessThanOrEqual(${Number(c.expectedText) || 100});`);
      }
    });

    formulaChecks.forEach((f) => {
      lines.push(``);
      lines.push(`  // Formula Check: ${f.name}`);
      f.variables.forEach((v) => {
        if (v.selector) {
          lines.push(`  const ${v.name} = parseFloat((await page.locator('${v.selector.replace(/'/g, "\\'")}').innerText()).replace(/[^\\d.-]/g, ''));`);
        } else {
          lines.push(`  const ${v.name} = ${v.value};`);
        }
      });
      if (f.actualSelector) {
        lines.push(`  const displayedVal = parseFloat((await page.locator('${f.actualSelector.replace(/'/g, "\\'")}').innerText()).replace(/[^\\d.-]/g, ''));`);
      } else {
        lines.push(`  const displayedVal = ${f.actualDisplayedValue};`);
      }
      lines.push(`  const expectedVal = ${f.expression};`);
      lines.push(`  expect(Math.abs(expectedVal - displayedVal)).toBeLessThanOrEqual(${f.tolerance});`);
    });

    lines.push(`});`);
    return lines.join('\n');
  }, [contentAssertions, formulaChecks, exportLang, project.domain]);

  const formulaVarsForNewRule = useMemo(
    () => extractFormulaVariables(newFormulaExpr),
    [newFormulaExpr]
  );

  return (
    <div className="space-y-5">
      {/* Fuchsia-Themed Header & Sub-Navigation */}
      <div className="rounded-xl border border-fuchsia-200/80 dark:border-fuchsia-900/60 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-fuchsia-100 dark:bg-fuchsia-950/70 text-fuchsia-700 dark:text-fuchsia-400 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  'Website Content, Text & Formula Calculation Tester',
                  'ওয়েবসাইট কন্টেন্ট, টেক্সট ও ফর্মুলা ক্যালকুলেশন টেস্টার'
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'Verify live webpage formulas (discounts, VAT, totals), test text assertions, and scan for NaN / undefined / broken copy.',
                  'ওয়েবসাইটের হিসাব-নিকাশ (ভ্যাট, ডিসকাউন্ট, টোটাল), টেক্সট কনটেন্ট ঠিক আছে কিনা এবং কোনো NaN বা ভাঙা টেক্সট আছে কিনা তা টেস্ট করুন।'
                )}
              </p>
            </div>
          </div>

          <div className="inline-flex flex-wrap items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 gap-1">
            <button
              type="button"
              onClick={() => setSubTab('formulas')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                subTab === 'formulas'
                  ? 'bg-white dark:bg-slate-900 text-fuchsia-700 dark:text-fuchsia-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              {pickLang(
                lang,
                `Formulas & Math (${formulaChecks.length})`,
                `ফর্মুলা ক্যালকুলেশন (${formulaChecks.length})`
              )}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('content')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                subTab === 'content'
                  ? 'bg-white dark:bg-slate-900 text-fuchsia-700 dark:text-fuchsia-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              {pickLang(
                lang,
                `Text & Content (${contentAssertions.length})`,
                `কন্টেন্ট ও টেক্সট (${contentAssertions.length})`
              )}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('scanner')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                subTab === 'scanner'
                  ? 'bg-white dark:bg-slate-900 text-fuchsia-700 dark:text-fuchsia-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <FileSearch className="w-3.5 h-3.5" />
              {pickLang(lang, 'Scan & Test Code', 'স্ক্যান ও টেস্ট কোড')}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('parity')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                subTab === 'parity'
                  ? 'bg-white dark:bg-slate-900 text-fuchsia-700 dark:text-fuchsia-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {pickLang(lang, 'API JSON ↔ UI Parity', 'API JSON বনাম UI মিল')}
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: FORMULA & CALCULATION TESTER */}
      {subTab === 'formulas' && (
        <div className="space-y-5">
          {/* Quick Interactive Formula Calculator */}
          <div className="rounded-xl border border-fuchsia-200 dark:border-fuchsia-900/60 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-fuchsia-600" />
                  {pickLang(
                    lang,
                    'Quick Formula Calculator & Comparison',
                    'তাৎক্ষণিক ফর্মুলা ক্যালকুলেটর (যে কোনো হিসাব টেস্ট করুন)'
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pickLang(
                    lang,
                    'Type any math formula with variables (supports +, -, *, /, %, round(), min(), max(), ===) and compare with website output.',
                    'যেকোনো ফর্মুলা লিখুন (যেমন: price * qty - discount + vat) এবং ওয়েবসাইটের দেখানো রেজাল্টের সাথে মিলিয়ে দেখুন।'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveQuickAsRule}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-fuchsia-300 dark:border-fuchsia-800 bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-300 text-xs font-semibold hover:bg-fuchsia-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {pickLang(lang, 'Save to Formula List', 'লিস্টে সেভ করুন')}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-7 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {pickLang(lang, 'Formula Expression', 'ফর্মুলা এক্সপ্রেশন')}
                  </label>
                  <input
                    type="text"
                    value={quickExpr}
                    onChange={(e) => setQuickExpr(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                    placeholder="(price * qty) * (1 - discount / 100)"
                  />
                </div>

                {/* Dynamic Variable Inputs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {quickDetectedVarNames.map((varName) => (
                    <div
                      key={varName}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-2"
                    >
                      <label className="block text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 truncate">
                        {varName}
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={quickVars[varName] ?? 0}
                        onChange={(e) =>
                          setQuickVars({
                            ...quickVars,
                            [varName]: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {pickLang(lang, 'Website Shown Value', 'ওয়েবসাইটের দেখানো মান')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={quickActual}
                      onChange={(e) => setQuickActual(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {pickLang(lang, 'Tolerance (±)', 'দশমিক ছাড় (±)')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={quickTolerance}
                      onChange={(e) => setQuickTolerance(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                {quickEval.ok ? (
                  <div
                    className={`rounded-lg border p-3 space-y-1 ${
                      quickMatchesWebsite
                        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30'
                        : 'border-rose-300 dark:border-rose-800 bg-rose-50/80 dark:bg-rose-950/30'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        {quickMatchesWebsite ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-600" />
                        )}
                        {quickMatchesWebsite
                          ? pickLang(lang, 'CALCULATION PASSED', 'হিসাব একদম সঠিক (PASS)')
                          : pickLang(lang, 'CALCULATION MISMATCH', 'হিসাবে ভুল আছে (FAIL)')}
                      </span>
                      <span className="font-mono text-sm">
                        {quickEval.isComparison
                          ? quickEval.booleanResult
                            ? 'TRUE'
                            : 'FALSE'
                          : quickEval.value}
                      </span>
                    </div>
                    {!quickEval.isComparison && (
                      <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                        Expected: {quickEval.value} · Website: {quickActual} · Diff:{' '}
                        {Math.abs((quickEval.value ?? 0) - quickActual).toFixed(4)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                    {quickEval.error}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Saved Formula Rules Toolbar & List */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    `Saved Website Formula Checks (${formulaChecks.length})`,
                    `সেভ করা ফর্মুলা টেস্টসমূহ (${formulaChecks.length})`
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pickLang(
                    lang,
                    'Map optional CSS selectors to pull live numbers directly from any webpage using Chrome Extension.',
                    'চাইলে প্রতিটি ভেরিয়েবলের সাথে ওয়েবপেজের CSS সিলেক্টর যুক্ত করে সরাসরি লাইভ পেজ থেকে হিসাব যাচাই করতে পারেন।'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddFormula(!showAddFormula)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Add Formula Rule', 'নতুন ফর্মুলা যোগ')}
                </button>
                <button
                  type="button"
                  onClick={() => handleEvaluateAllFormulas(true)}
                  disabled={fetchingLive}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Fetch Live Tab & Verify', 'লাইভ পেজ থেকে যাচাই')}
                </button>
                <button
                  type="button"
                  onClick={() => handleEvaluateAllFormulas(false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Run All Formulas', 'সব ফর্মুলা চালান')}
                </button>
              </div>
            </div>

            {showAddFormula && (
              <form
                onSubmit={handleAddFormulaRule}
                className="p-4 border-b border-slate-200 dark:border-slate-800 bg-fuchsia-50/40 dark:bg-fuchsia-950/20 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input
                    type="text"
                    required
                    value={newFormulaName}
                    onChange={(e) => setNewFormulaName(e.target.value)}
                    placeholder={pickLang(lang, 'Rule Name (e.g. Invoice Net Total)', 'রুলের নাম (যেমন: ইনভয়েস নেট টোটাল)')}
                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    required
                    value={newFormulaExpr}
                    onChange={(e) => setNewFormulaExpr(e.target.value)}
                    placeholder="subtotal - discount + tax"
                    className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="number"
                    step="any"
                    value={newFormulaActualVal}
                    onChange={(e) => setNewFormulaActualVal(Number(e.target.value))}
                    placeholder="Website actual value"
                    className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={newFormulaActualSelector}
                    onChange={(e) => setNewFormulaActualSelector(e.target.value)}
                    placeholder='Actual CSS selector (optional)'
                    className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                {formulaVarsForNewRule.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {formulaVarsForNewRule.map((vn) => (
                      <div
                        key={vn}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs"
                      >
                        <span className="font-mono font-bold text-fuchsia-700 dark:text-fuchsia-400">
                          {vn}:
                        </span>
                        <input
                          type="number"
                          step="any"
                          value={newFormulaVarSelectors[vn]?.val ?? 0}
                          onChange={(e) =>
                            setNewFormulaVarSelectors({
                              ...newFormulaVarSelectors,
                              [vn]: {
                                val: Number(e.target.value),
                                selector: newFormulaVarSelectors[vn]?.selector || '',
                              },
                            })
                          }
                          placeholder="Val"
                          className="w-20 px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs"
                        />
                        <input
                          type="text"
                          value={newFormulaVarSelectors[vn]?.selector || ''}
                          onChange={(e) =>
                            setNewFormulaVarSelectors({
                              ...newFormulaVarSelectors,
                              [vn]: {
                                val: newFormulaVarSelectors[vn]?.val ?? 0,
                                selector: e.target.value,
                              },
                            })
                          }
                          placeholder="CSS selector (opt)"
                          className="flex-1 min-w-0 px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-[11px]"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddFormula(false)}
                    className="px-3 py-1.5 text-xs text-slate-500 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-fuchsia-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Save Formula Rule
                  </button>
                </div>
              </form>
            )}

            {formulaChecks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {pickLang(
                  lang,
                  'No saved formula checks yet. Click "Add Formula Rule" or save from the calculator above.',
                  'এখনো কোনো ফর্মুলা রুল সেভ করা হয়নি। ওপরের ক্যালকুলেটর থেকে সেভ করুন অথবা "নতুন ফর্মুলা যোগ" চাপুন।'
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {formulaChecks.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-4 flex flex-wrap items-start justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {rule.name}
                        </span>
                        <code className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-fuchsia-700 dark:text-fuchsia-300">
                          {rule.expression}
                        </code>
                        {rule.status === 'passed' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Passed
                          </span>
                        ) : rule.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-400">
                            <XCircle className="w-3.5 h-3.5" />
                            Mismatch
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Untested</span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {rule.variables.map((v) => (
                          <label
                            key={v.name}
                            className="inline-flex items-center gap-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-[11px]"
                          >
                            <span className="font-mono text-slate-500">{v.name}=</span>
                            <input
                              type="number"
                              step="any"
                              value={v.value}
                              onChange={(e) =>
                                handleUpdateFormulaVar(
                                  rule.id,
                                  v.name,
                                  Number(e.target.value)
                                )
                              }
                              className="w-16 bg-transparent font-mono font-semibold text-slate-900 dark:text-slate-100 outline-none"
                            />
                          </label>
                        ))}
                        <label className="inline-flex items-center gap-1.5 rounded border border-fuchsia-200 dark:border-fuchsia-900 bg-fuchsia-50/50 dark:bg-fuchsia-950/30 px-2 py-1 text-[11px]">
                          <span className="text-fuchsia-700 dark:text-fuchsia-300 font-semibold">
                            Website=
                          </span>
                          <input
                            type="number"
                            step="any"
                            value={rule.actualDisplayedValue}
                            onChange={(e) =>
                              handleUpdateFormulaActual(rule.id, Number(e.target.value))
                            }
                            className="w-20 bg-transparent font-mono font-bold text-slate-900 dark:text-slate-100 outline-none"
                          />
                        </label>
                      </div>

                      {rule.lastMessage && (
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {rule.lastMessage}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteFormula(rule.id)}
                      className="p-1.5 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                      aria-label={`Delete ${rule.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: WEBSITE CONTENT & TEXT ASSERTIONS */}
      {subTab === 'content' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {pickLang(
                lang,
                'Test headings, labels, currency strings, error messages, or ensure forbidden tokens (NaN / undefined) never appear.',
                'ওয়েবসাইটের হেডিং, বাটন টেক্সট, প্রাইস ফরম্যাট বা ভুলবশত NaN / undefined দেখাচ্ছে কিনা তা পরীক্ষা করুন।'
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddContent(!showAddContent)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {pickLang(lang, 'Add Text Rule', 'নতুন টেক্সট রুল')}
              </button>
              <button
                type="button"
                onClick={() => handleRunContentChecks(true)}
                disabled={fetchingLive}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                {pickLang(lang, 'Verify on Live Tab', 'লাইভ পেজে চেক করুন')}
              </button>
              <button
                type="button"
                onClick={() => handleRunContentChecks(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                {pickLang(lang, 'Test Sample Text', 'স্যাম্পল টেক্সট চেক')}
              </button>
            </div>
          </div>

          {showAddContent && (
            <form
              onSubmit={handleAddContentRule}
              className="rounded-xl border border-fuchsia-200 dark:border-fuchsia-900 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={newContentName}
                  onChange={(e) => setNewContentName(e.target.value)}
                  placeholder={pickLang(lang, 'Check Name (e.g. No NaN on Summary)', 'টেস্টের নাম (যেমন: পেজে NaN থাকা যাবে না)')}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  value={newContentSelector}
                  onChange={(e) => setNewContentSelector(e.target.value)}
                  placeholder='CSS selector or PAGE_BODY'
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                <select
                  value={newContentOperator}
                  onChange={(e) =>
                    setNewContentOperator(e.target.value as ContentMatchOperator)
                  }
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  {(Object.keys(OPERATOR_LABELS) as ContentMatchOperator[]).map((op) => (
                    <option key={op} value={op}>
                      {pickLang(lang, OPERATOR_LABELS[op].en, OPERATOR_LABELS[op].bn)}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={newContentExpected}
                  onChange={(e) => setNewContentExpected(e.target.value)}
                  placeholder={
                    newContentOperator === 'max_length'
                      ? 'Max characters (e.g. 60)'
                      : 'Expected text / regex / forbidden word'
                  }
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  type="text"
                  value={newContentSample}
                  onChange={(e) => setNewContentSample(e.target.value)}
                  placeholder={pickLang(
                    lang,
                    'Sample / Pasted website text to test offline (optional)',
                    'অফলাইনে টেস্ট করার জন্য ওয়েবসাইটের স্যাম্পল টেক্সট (ঐচ্ছিক)'
                  )}
                  className="flex-1 min-w-[240px] px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newContentCaseSensitive}
                    onChange={(e) => setNewContentCaseSensitive(e.target.checked)}
                  />
                  <span>Case sensitive</span>
                </label>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-fuchsia-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Save Text Rule
                </button>
              </div>
            </form>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            {contentAssertions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No content assertions yet. Click &quot;Add Text Rule&quot; to test page text, headings, or error-free copy.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-fuchsia-50/50 dark:bg-fuchsia-950/20">
                      <th className="py-3 px-4">Rule &amp; Selector</th>
                      <th className="py-3 px-4">Condition</th>
                      <th className="py-3 px-4">Sample / Observed Text</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {contentAssertions.map((rule) => (
                      <tr
                        key={rule.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {rule.name}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {rule.selector}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-fuchsia-700 dark:text-fuchsia-300">
                            {pickLang(
                              lang,
                              OPERATOR_LABELS[rule.operator].en,
                              OPERATOR_LABELS[rule.operator].bn
                            )}
                          </span>
                          <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            &quot;{rule.expectedText}&quot;
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <input
                            type="text"
                            value={rule.sampleInputText ?? ''}
                            onChange={(e) => {
                              const next = contentAssertions.map((c) =>
                                c.id === rule.id
                                  ? {
                                      ...c,
                                      sampleInputText: e.target.value,
                                      status: 'untested' as const,
                                    }
                                  : c
                              );
                              onUpdateProject({ ...project, contentAssertions: next });
                            }}
                            placeholder="Sample text..."
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                          />
                          {rule.lastActualText && (
                            <div className="mt-1 text-[10px] font-mono text-slate-400 truncate">
                              Last observed: {rule.lastActualText}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {rule.status === 'passed' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Passed
                            </span>
                          ) : rule.status === 'failed' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-400">
                              <XCircle className="w-3.5 h-3.5" />
                              Failed
                            </span>
                          ) : (
                            <span className="text-slate-400">Untested</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateProject({
                                ...project,
                                contentAssertions: contentAssertions.filter(
                                  (c) => c.id !== rule.id
                                ),
                              })
                            }
                            className="p-1.5 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PAGE CONTENT HEALTH SCANNER & TEST CODE EXPORT */}
      {subTab === 'scanner' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Content Bug Scanner */}
          <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(
                    lang,
                    'Page Text Health & Number Extractor',
                    'ওয়েবসাইট টেক্সট হেলথ স্ক্যানার'
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pickLang(
                    lang,
                    'Catches NaN, undefined, {{templates}}, Lorem ipsum, and extracts all numbers automatically.',
                    'যেকোনো পেজের লেখা পেস্ট করলে NaN, undefined, {{টেমপ্লেট}}, TODO বা সব সংখ্যা আলাদা করে দেখায়।'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleFetchPageTextToScanner}
                disabled={fetchingLive}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                {pickLang(lang, 'Fetch Live Tab Text', 'লাইভ পেজ টেক্সট আনুন')}
              </button>
            </div>

            <textarea
              rows={6}
              value={scannerText}
              onChange={(e) => setScannerText(e.target.value)}
              placeholder="Paste website copy here..."
              className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
            />

            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                Words: {scanReport.wordCount}
              </span>
              <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                Chars: {scanReport.charCount}
              </span>
              <span className="px-2 py-1 rounded bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-300">
                Numbers found: {scanReport.extractedNumbers.length}
              </span>
            </div>

            {scanReport.extractedNumbers.length > 0 && (
              <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Extracted Numbers:{' '}
                </span>
                {scanReport.extractedNumbers.join(', ')}
              </div>
            )}

            <div className="space-y-2">
              {scanReport.issues.length === 0 ? (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {pickLang(
                    lang,
                    'Clean copy! No NaN, undefined, or broken template placeholders detected.',
                    'কনটেন্ট একদম পরিষ্কার! কোনো NaN, undefined বা ভাঙা কোড পাওয়া যায়নি।'
                  )}
                </div>
              ) : (
                scanReport.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg border p-3 text-xs space-y-0.5 ${
                      issue.severity === 'critical'
                        ? 'border-rose-300 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
                        : 'border-amber-300 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {issue.label}
                    </div>
                    <div className="text-[11px] opacity-85">{issue.detail}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Playwright / pytest Code Exporter */}
          <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-fuchsia-400" />
                <span className="text-sm font-bold text-white">
                  {pickLang(
                    lang,
                    'Content & Formula Automated Test Code',
                    'কন্টেন্ট ও ফর্মুলা অটোমেটেড টেস্ট কোড'
                  )}
                </span>
              </div>
              <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setExportLang('pytest-py')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    exportLang === 'pytest-py'
                      ? 'bg-fuchsia-600 text-white'
                      : 'text-slate-400'
                  }`}
                >
                  Python pytest
                </button>
                <button
                  type="button"
                  onClick={() => setExportLang('playwright-ts')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    exportLang === 'playwright-ts'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400'
                  }`}
                >
                  Playwright TS
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(generatedCode);
                    onNotify?.('Copied Content & Formula test script!');
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
                onClick={() => {
                  const ext =
                    exportLang === 'pytest-py'
                      ? '_content_formula_test.py'
                      : '.content-formula.spec.ts';
                  const blob = new Blob([generatedCode], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${project.id}${ext}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-semibold cursor-pointer"
              >
                <Download className="w-3 h-3" />
                Download
              </button>
            </div>

            <pre className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-fuchsia-200 overflow-x-auto max-h-[390px] leading-relaxed">
              {generatedCode}
            </pre>
          </div>
        </div>
      )}

      {/* TAB 4: API JSON <-> UI PARITY CHECKER */}
      {subTab === 'parity' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(lang, '1. Paste Backend API JSON Response', '১. API JSON রেসপন্স পেস্ট করুন')}
                </h3>
                <span className="text-[11px] font-mono text-slate-400">
                  {parityReport.validJson
                    ? `${parityReport.rows.length} fields`
                    : 'Invalid JSON'}
                </span>
              </div>
              <textarea
                rows={9}
                value={parityJsonText}
                onChange={(e) => setParityJsonText(e.target.value)}
                placeholder='{"total": 1425, "status": "Paid"}'
                className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
              {!parityReport.validJson && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-mono">
                  {parityReport.error}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {pickLang(lang, '2. Rendered UI / Invoice Text', '২. স্ক্রিনে দেখানো UI টেক্সট')}
                </h3>
                <button
                  type="button"
                  onClick={handleFetchUiForParity}
                  disabled={fetchingLive}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Globe className="w-3 h-3" />
                  {pickLang(lang, 'Fetch Live Tab', 'লাইভ ট্যাব আনুন')}
                </button>
              </div>
              <textarea
                rows={9}
                value={parityUiText}
                onChange={(e) => setParityUiText(e.target.value)}
                placeholder="Paste visible invoice, table, or checkout UI text here..."
                className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {pickLang(
                  lang,
                  `Parity Results: ${parityReport.matchedCount}/${parityReport.rows.length} API fields found on UI`,
                  `ফলাফল: ${parityReport.rows.length}টির মধ্যে ${parityReport.matchedCount}টি API মান স্ক্রিনে মিলেছে`
                )}
              </div>
              <span className="text-[11px] text-slate-500">
                {pickLang(
                  lang,
                  'Supports comma-formatted currency matching (e.g. 1500 == 1,500.00)',
                  'কমা বা দশমিক ফরম্যাট (যেমন 1500 == 1,500.00) স্বয়ংক্রিয়ভাবে ম্যাচ করে'
                )}
              </span>
            </div>

            {parityReport.rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 font-medium">
                      <th className="py-2.5 px-4">JSON Field Path</th>
                      <th className="py-2.5 px-4">API Value</th>
                      <th className="py-2.5 px-4">UI Parity</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {parityReport.rows.map((row) => (
                      <tr key={row.path} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                          {row.path}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {row.rawValue}
                        </td>
                        <td className="py-2.5 px-4">
                          {row.matched ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {row.matchKind === 'numeric' ? 'Matched (Numeric)' : 'Matched'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 font-semibold">
                              <XCircle className="w-3.5 h-3.5" />
                              Missing in UI
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleSaveParityAsContentRule(row.path, row.rawValue)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-fuchsia-200 dark:border-fuchsia-900 text-fuchsia-700 dark:text-fuchsia-300 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950/40 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <Plus className="w-3 h-3" />
                            {pickLang(lang, 'Save Rule', 'রুল সেভ')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
