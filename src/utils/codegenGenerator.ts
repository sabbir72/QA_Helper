import { FlowStep, InspectedElement, RecordedStep, WorkflowFlow } from '../types/flowguard';

export type CodegenTarget = 'pytest-py' | 'playwright-ts' | 'playwright-js';

function escapeSingle(val: string): string {
  return String(val || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeDouble(val: string): string {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Builds Playwright Codegen-style locator expressions (get_by_test_id / get_by_label / get_by_role / locator)
 * matching official Playwright Python & TypeScript/JS Codegen conventions.
 */
function buildPythonLocator(selector: string, inspected?: InspectedElement): string {
  const testIdMatch = selector.match(/^\[data-testid="([^"]+)"\]$/);
  if (testIdMatch) {
    return `page.get_by_test_id("${escapeDouble(testIdMatch[1])}")`;
  }
  if (inspected) {
    if (inspected.role && inspected.accessibleName && inspected.role === 'button') {
      return `page.get_by_role("button", name="${escapeDouble(inspected.accessibleName)}")`;
    }
    if (inspected.label) {
      return `page.get_by_label("${escapeDouble(inspected.label)}")`;
    }
    if (inspected.placeholder) {
      return `page.get_by_placeholder("${escapeDouble(inspected.placeholder)}")`;
    }
  }
  return `page.locator("${escapeDouble(selector)}")`;
}

function buildJsLocator(selector: string, inspected?: InspectedElement): string {
  const testIdMatch = selector.match(/^\[data-testid="([^"]+)"\]$/);
  if (testIdMatch) {
    return `page.getByTestId('${escapeSingle(testIdMatch[1])}')`;
  }
  if (inspected) {
    if (inspected.role && inspected.accessibleName && inspected.role === 'button') {
      return `page.getByRole('button', { name: '${escapeSingle(inspected.accessibleName)}' })`;
    }
    if (inspected.label) {
      return `page.getByLabel('${escapeSingle(inspected.label)}')`;
    }
    if (inspected.placeholder) {
      return `page.getByPlaceholder('${escapeSingle(inspected.placeholder)}')`;
    }
  }
  return `page.locator('${escapeSingle(selector)}')`;
}

export function generateCodeFromRecordedSteps(
  steps: RecordedStep[],
  target: CodegenTarget,
  flowTitle = 'recorded_qa_journey',
  defaultUrl = 'https://example.test/'
): string {
  const startUrl = steps[0]?.pageUrl || defaultUrl;
  const fnName =
    flowTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'recorded_qa_journey';

  if (target === 'pytest-py') {
    const lines = [
      `import os`,
      `import re`,
      `from playwright.sync_api import Page, expect`,
      ``,
      ``,
      `# Auto-generated live by VeriPulse Codegen (Python pytest)`,
      `# Run locally: pytest -v --headed ${fnName}_test.py`,
      `def test_${fnName}(page: Page) -> None:`,
      `    page.goto("${escapeDouble(startUrl)}")`,
    ];

    if (steps.length === 0) {
      lines.push(`    # Waiting for your clicks, inputs, or selections on screen...`);
      lines.push(`    expect(page).to_have_url(re.compile(r".*"))`);
      return lines.join('\n');
    }

    steps.forEach((step, idx) => {
      const loc = buildPythonLocator(step.targetElement, step.inspected);
      lines.push(`    # Step ${idx + 1}: ${step.title}`);
      if (step.action === 'click') {
        lines.push(`    ${loc}.click()`);
      } else if (step.action === 'type') {
        const val = step.isSensitiveData
          ? `os.environ.get("QA_SECRET_INPUT", "")`
          : `"${escapeDouble(step.testData)}"`;
        lines.push(`    ${loc}.fill(${val})`);
      } else if (step.action === 'select') {
        lines.push(`    ${loc}.select_option("${escapeDouble(step.testData)}")`);
      } else if (step.action === 'check') {
        lines.push(`    ${loc}.check()`);
      } else if (step.action === 'uncheck') {
        lines.push(`    ${loc}.uncheck()`);
      } else {
        lines.push(`    expect(${loc}).to_be_visible()`);
      }
    });

    return lines.join('\n');
  }

  const header =
    target === 'playwright-ts'
      ? `import { test, expect } from '@playwright/test';`
      : `const { test, expect } = require('@playwright/test');`;

  const lines = [
    header,
    ``,
    `// Auto-generated live by VeriPulse Codegen`,
    `test('${escapeSingle(flowTitle)}', async ({ page }) => {`,
    `  await page.goto('${escapeSingle(startUrl)}');`,
  ];

  if (steps.length === 0) {
    lines.push(`  // Waiting for your clicks, inputs, or selections on screen...`);
  } else {
    steps.forEach((step, idx) => {
      const loc = buildJsLocator(step.targetElement, step.inspected);
      lines.push(`  // Step ${idx + 1}: ${step.title}`);
      if (step.action === 'click') {
        lines.push(`  await ${loc}.click();`);
      } else if (step.action === 'type') {
        const val = step.isSensitiveData
          ? `process.env.QA_SECRET_INPUT || ''`
          : `'${escapeSingle(step.testData)}'`;
        lines.push(`  await ${loc}.fill(${val});`);
      } else if (step.action === 'select') {
        lines.push(`  await ${loc}.selectOption('${escapeSingle(step.testData)}');`);
      } else if (step.action === 'check') {
        lines.push(`  await ${loc}.check();`);
      } else if (step.action === 'uncheck') {
        lines.push(`  await ${loc}.uncheck();`);
      } else {
        lines.push(`  await expect(${loc}).toBeVisible();`);
      }
    });
  }

  lines.push(`});`);
  return lines.join('\n');
}

export function generateCodeFromFlow(
  flow: WorkflowFlow,
  target: CodegenTarget
): string {
  const fnName =
    flow.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'workflow_flow';

  if (target === 'pytest-py') {
    const lines = [
      `import os`,
      `from playwright.sync_api import Page, expect`,
      ``,
      ``,
      `# Run locally: pytest -v --headed ${fnName}_test.py`,
      `def test_${fnName}(page: Page) -> None:`,
      `    page.goto("${escapeDouble(flow.targetUrl)}")`,
    ];

    if (flow.steps.length === 0) {
      lines.push(`    # Add or record steps to populate Playwright actions`);
      lines.push(`    assert page.url != ""`);
      return lines.join('\n');
    }

    for (const step of flow.steps) {
      const loc = buildPythonLocator(step.targetElement);
      lines.push(`    # ${step.title} — ${step.expectedRule}`);
      if (step.action === 'click') {
        lines.push(`    ${loc}.click()`);
      } else if (step.action === 'type') {
        const val = step.isSensitiveData
          ? `os.environ.get("QA_SECRET_INPUT", "")`
          : `"${escapeDouble(step.testData)}"`;
        lines.push(`    ${loc}.fill(${val})`);
      } else if (step.action === 'select') {
        lines.push(`    ${loc}.select_option("${escapeDouble(step.testData)}")`);
      } else if (step.action === 'check') {
        lines.push(`    ${loc}.check()`);
      } else if (step.action === 'uncheck') {
        lines.push(`    ${loc}.uncheck()`);
      } else {
        lines.push(`    expect(${loc}).to_be_visible()`);
      }
    }
    return lines.join('\n');
  }

  const header =
    target === 'playwright-ts'
      ? `import { test, expect } from '@playwright/test';`
      : `const { test, expect } = require('@playwright/test');`;

  const lines = [
    header,
    ``,
    `test('${escapeSingle(flow.name)}', async ({ page }) => {`,
    `  await page.goto('${escapeSingle(flow.targetUrl)}');`,
  ];

  for (const step of flow.steps) {
    const loc = buildJsLocator(step.targetElement);
    lines.push(`  // ${step.title} — ${step.expectedRule}`);
    if (step.action === 'click') {
      lines.push(`  await ${loc}.click();`);
    } else if (step.action === 'type') {
      const val = step.isSensitiveData
        ? `process.env.QA_SECRET_INPUT || ''`
        : `'${escapeSingle(step.testData)}'`;
      lines.push(`  await ${loc}.fill(${val});`);
    } else if (step.action === 'select') {
      lines.push(`  await ${loc}.selectOption('${escapeSingle(step.testData)}');`);
    } else if (step.action === 'check') {
      lines.push(`  await ${loc}.check();`);
    } else if (step.action === 'uncheck') {
      lines.push(`  await ${loc}.uncheck();`);
    } else {
      lines.push(`  await expect(${loc}).toBeVisible();`);
    }
  }

  lines.push(`});`);
  return lines.join('\n');
}

export interface FlowRealismReport {
  score: number;
  totalSteps: number;
  stableLocators: number;
  liveDomVerified: number;
  specCheckedOnly: number;
  assertionsOrRules: number;
  tier: 'high' | 'medium' | 'low';
}

export function computeFlowRealismReport(steps: FlowStep[]): FlowRealismReport {
  const totalSteps = steps.length;
  if (totalSteps === 0) {
    return {
      score: 0,
      totalSteps: 0,
      stableLocators: 0,
      liveDomVerified: 0,
      specCheckedOnly: 0,
      assertionsOrRules: 0,
      tier: 'low',
    };
  }

  const stableLocators = steps.filter((s) =>
    /data-testid|aria-label|name=|#[\w-]+/.test(s.targetElement)
  ).length;
  const liveDomVerified = steps.filter((s) => s.verificationMode === 'live_dom').length;
  const specCheckedOnly = steps.filter(
    (s) => s.verificationMode === 'spec_check' || (!s.verificationMode && s.status !== 'pending')
  ).length;
  const assertionsOrRules = steps.filter(
    (s) => s.action === 'assert' || Boolean(s.expectedRule.trim())
  ).length;

  const locatorPts = Math.round((stableLocators / totalSteps) * 40);
  const domPts = Math.round((liveDomVerified / totalSteps) * 40);
  const rulePts = Math.round((assertionsOrRules / totalSteps) * 20);
  const score = Math.min(100, locatorPts + domPts + rulePts);

  const tier: FlowRealismReport['tier'] =
    score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low';

  return {
    score,
    totalSteps,
    stableLocators,
    liveDomVerified,
    specCheckedOnly,
    assertionsOrRules,
    tier,
  };
}

export interface ParsedCodegenResult {
  detectedUrl: string | null;
  steps: FlowStep[];
  detectedFormat: 'pytest-py' | 'playwright-js-ts' | 'unknown';
}

function unquote(raw: string): string {
  const s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('`') && s.endsWith('`'))
  ) {
    return s.slice(1, -1).replace(/\\(['"\\])/g, '$1');
  }
  return s;
}

function resolvePlaywrightLocator(chainPrefix: string): {
  selector: string;
  labelHint: string;
} {
  // get_by_test_id("...") / getByTestId('...')
  let m = chainPrefix.match(/get_?by_?test_?id\s*\(\s*(['"`])(.*?)\1\s*\)/i);
  if (m) {
    return { selector: `[data-testid="${m[2]}"]`, labelHint: m[2] };
  }

  // get_by_role("button", name="Submit") or getByRole('button', { name: 'Submit' })
  m = chainPrefix.match(
    /get_?by_?role\s*\(\s*(['"`])([^'"`]+)\1(?:\s*,\s*(?:\{[^}]*name\s*:\s*|name\s*=\s*)(['"`])([^'"`]+)\3[^)]*)?\)/i
  );
  if (m) {
    const role = m[2];
    const name = m[4];
    if (name) {
      return {
        selector:
          role === 'button'
            ? `button[aria-label="${name}"], button:has-text("${name}")`
            : `[role="${role}"][aria-label="${name}"]`,
        labelHint: name,
      };
    }
    return { selector: `[role="${role}"]`, labelHint: role };
  }

  // get_by_label("...") / getByLabel('...')
  m = chainPrefix.match(/get_?by_?label\s*\(\s*(['"`])(.*?)\1/i);
  if (m) {
    return { selector: `[aria-label="${m[2]}"]`, labelHint: m[2] };
  }

  // get_by_placeholder("...") / getByPlaceholder('...')
  m = chainPrefix.match(/get_?by_?placeholder\s*\(\s*(['"`])(.*?)\1/i);
  if (m) {
    return { selector: `[placeholder="${m[2]}"]`, labelHint: m[2] };
  }

  // get_by_text("...") / getByText('...')
  m = chainPrefix.match(/get_?by_?text\s*\(\s*(['"`])(.*?)\1/i);
  if (m) {
    return { selector: `text=${m[2]}`, labelHint: m[2] };
  }

  // locator("...")
  m = chainPrefix.match(/locator\s*\(\s*(['"`])(.*?)\1\s*\)/i);
  if (m) {
    return { selector: m[2], labelHint: m[2] };
  }

  return { selector: chainPrefix.trim(), labelHint: chainPrefix.trim() };
}

/**
 * Parses Playwright Codegen output (Python pytest sync/async or JS/TS) into VeriPulse FlowSteps.
 */
export function parseCodegenToSteps(code: string): ParsedCodegenResult {
  const lines = code.split(/\r?\n/);
  const steps: FlowStep[] = [];
  let detectedUrl: string | null = null;
  let pySignals = 0;
  let jsSignals = 0;
  let pendingComment = '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    if (rawLine.startsWith('#')) {
      pendingComment = rawLine.replace(/^#+\s*/, '').trim();
      pySignals += 1;
      continue;
    }
    if (rawLine.startsWith('//')) {
      pendingComment = rawLine.replace(/^\/\/+\s*/, '').trim();
      jsSignals += 1;
      continue;
    }
    if (/^def test_|^from playwright|^import /.test(rawLine)) {
      pySignals += 1;
      continue;
    }
    if (/^import\s+\{|^const\s+\{|^test\(|^await\s+/.test(rawLine)) {
      jsSignals += 1;
    }

    // page.goto("...")
    const gotoMatch = rawLine.match(/page\.goto\(\s*(['"`][^'"`]+['"`])/);
    if (gotoMatch) {
      detectedUrl = unquote(gotoMatch[1]);
      pendingComment = '';
      continue;
    }

    // expect(locator).to_be_visible() / toBeVisible()
    const expectVisMatch = rawLine.match(
      /expect\(\s*(page\..+?)\s*\)\.(?:to_be_visible|toBeVisible)\s*\(/
    );
    if (expectVisMatch) {
      const { selector, labelHint } = resolvePlaywrightLocator(expectVisMatch[1]);
      steps.push({
        id: `step_cg_${Date.now()}_${steps.length}`,
        title: pendingComment || `Verify ${labelHint} is visible`,
        action: 'assert',
        targetElement: selector,
        testData: '',
        isSensitiveData: false,
        expectedRule: pendingComment || `Element ${selector} is visible`,
        observedResult: 'Imported from Playwright Codegen',
        status: 'pending',
        verificationMode: 'manual',
      });
      pendingComment = '';
      continue;
    }

    // Standard action: page.<locator>.<method>(<args>)
    const actionMatch = rawLine.match(
      /(page\..+)\.(click|fill|type|select_option|selectOption|check|uncheck)\s*\((.*)\)\s*;?$/
    );
    if (actionMatch) {
      const locatorExpr = actionMatch[1];
      const method = actionMatch[2];
      const argsRaw = actionMatch[3].trim();
      const { selector, labelHint } = resolvePlaywrightLocator(locatorExpr);

      let action: FlowStep['action'] = 'click';
      let testData = '';
      let isSensitive = /password|passwd|secret|token|pin|cvv|salary|QA_SECRET/i.test(
        `${locatorExpr} ${argsRaw} ${pendingComment}`
      );

      if (method === 'fill' || method === 'type') {
        action = 'type';
        if (/os\.environ|process\.env/i.test(argsRaw)) {
          isSensitive = true;
          testData = '••••••••';
        } else {
          const val = unquote(argsRaw);
          testData = isSensitive ? '••••••••' : val;
        }
      } else if (method === 'select_option' || method === 'selectOption') {
        action = 'select';
        testData = unquote(argsRaw);
      } else if (method === 'check') {
        action = 'check';
      } else if (method === 'uncheck') {
        action = 'uncheck';
      } else {
        action = 'click';
      }

      const defaultTitle =
        action === 'click'
          ? `Click ${labelHint}`
          : action === 'type'
            ? `Enter ${labelHint}`
            : action === 'select'
              ? `Select ${labelHint}`
              : action === 'check'
                ? `Check ${labelHint}`
                : `Uncheck ${labelHint}`;

      steps.push({
        id: `step_cg_${Date.now()}_${steps.length}`,
        title: pendingComment || defaultTitle,
        action,
        targetElement: selector,
        testData,
        isSensitiveData: isSensitive,
        expectedRule: pendingComment || `Confirm ${action} works on ${selector}`,
        observedResult: 'Imported from Playwright Codegen',
        status: 'pending',
        verificationMode: 'manual',
      });
      pendingComment = '';
    }
  }

  const detectedFormat: ParsedCodegenResult['detectedFormat'] =
    pySignals > jsSignals ? 'pytest-py' : jsSignals > 0 ? 'playwright-js-ts' : 'unknown';

  return { detectedUrl, steps, detectedFormat };
}

