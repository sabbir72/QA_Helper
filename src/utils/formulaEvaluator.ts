import { ContentAssertionRule } from '../types/flowguard';

export interface FormulaEvalResult {
  ok: boolean;
  isComparison: boolean;
  value?: number;
  booleanResult?: boolean;
  leftVal?: number;
  rightVal?: number;
  operator?: string;
  error?: string;
}

const RESERVED_FUNCS = new Set(['round', 'floor', 'ceil', 'abs', 'min', 'max']);

export function extractNumericValue(raw: string): number | null {
  if (!raw || typeof raw !== 'string') return null;
  // Remove common currency labels, commas, and percent signs
  const cleaned = raw
    .replace(/[,৳$€£¥]/g, '')
    .replace(/\b(BDT|USD|EUR|GBP|TK)\b/gi, '')
    .trim();
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

export function extractFormulaVariables(expr: string): string[] {
  const matches = expr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
  const unique = new Set<string>();
  for (const token of matches) {
    if (!RESERVED_FUNCS.has(token.toLowerCase())) {
      unique.add(token);
    }
  }
  return Array.from(unique);
}

type Token =
  | { type: 'num'; val: number }
  | { type: 'id'; val: string }
  | { type: 'op'; val: string }
  | { type: 'paren'; val: '(' | ')' }
  | { type: 'comma' };

function tokenizeArithmetic(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < input.length && /[0-9.]/.test(input[i])) {
        numStr += input[i];
        i += 1;
      }
      const val = Number(numStr);
      if (!Number.isFinite(val)) {
        throw new Error(`Invalid number "${numStr}"`);
      }
      tokens.push({ type: 'num', val });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        id += input[i];
        i += 1;
      }
      tokens.push({ type: 'id', val: id });
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', val: ch });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }
    if ('+-*/%'.includes(ch)) {
      tokens.push({ type: 'op', val: ch });
      i += 1;
      continue;
    }
    throw new Error(`Unsupported symbol "${ch}"`);
  }
  return tokens;
}

function evaluateArithmeticExpression(
  expr: string,
  vars: Record<string, number>
): number {
  const tokens = tokenizeArithmetic(expr);
  if (tokens.length === 0) {
    throw new Error('Formula is empty');
  }
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseExpression(): number {
    let left = parseTerm();
    while (peek()?.type === 'op' && (peek() as { val: string }).val.match(/^[+-]$/)) {
      const op = (consume() as { val: string }).val;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseUnary();
    while (peek()?.type === 'op' && (peek() as { val: string }).val.match(/^[*\/%]$/)) {
      const op = (consume() as { val: string }).val;
      const right = parseUnary();
      if (op === '*') left *= right;
      else if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        left /= right;
      } else {
        if (right === 0) throw new Error('Modulo by zero');
        left %= right;
      }
    }
    return left;
  }

  function parseUnary(): number {
    const t = peek();
    if (t?.type === 'op' && (t.val === '+' || t.val === '-')) {
      consume();
      const val = parseUnary();
      return t.val === '-' ? -val : val;
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = peek();
    if (!t) throw new Error('Unexpected end of formula');
    if (t.type === 'num') {
      consume();
      return t.val;
    }
    if (t.type === 'paren' && t.val === '(') {
      consume();
      const val = parseExpression();
      const close = consume();
      if (!close || close.type !== 'paren' || close.val !== ')') {
        throw new Error('Missing closing parenthesis ")"');
      }
      return val;
    }
    if (t.type === 'id') {
      consume();
      const next = peek();
      if (next?.type === 'paren' && next.val === '(') {
        consume();
        const args: number[] = [];
        if (!(peek()?.type === 'paren' && (peek() as { val: string }).val === ')')) {
          args.push(parseExpression());
          while (peek()?.type === 'comma') {
            consume();
            args.push(parseExpression());
          }
        }
        const close = consume();
        if (!close || close.type !== 'paren' || close.val !== ')') {
          throw new Error(`Missing ")" after ${t.val}(...)`);
        }
        const fn = t.val.toLowerCase();
        if (fn === 'round') {
          const decimals = args[1] ?? 2;
          const factor = Math.pow(10, decimals);
          return Math.round((args[0] ?? 0) * factor) / factor;
        }
        if (fn === 'floor') return Math.floor(args[0] ?? 0);
        if (fn === 'ceil') return Math.ceil(args[0] ?? 0);
        if (fn === 'abs') return Math.abs(args[0] ?? 0);
        if (fn === 'min') return Math.min(...args);
        if (fn === 'max') return Math.max(...args);
        throw new Error(`Unknown function "${t.val}"`);
      }

      if (!(t.val in vars)) {
        throw new Error(`Missing variable "${t.val}"`);
      }
      return vars[t.val];
    }
    throw new Error('Unexpected token in formula');
  }

  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error('Unexpected extra text in formula');
  }
  return Math.round(result * 1000000) / 1000000;
}

export function evaluateFormulaExpression(
  expr: string,
  vars: Record<string, number>,
  tolerance = 0.01
): FormulaEvalResult {
  const trimmed = expr.trim();
  if (!trimmed) {
    return { ok: false, isComparison: false, error: 'Enter a formula expression' };
  }

  const cmpMatch = trimmed.match(/^(.*?)\s*(===|==|!=|<=|>=|<|>)\s*(.*)$/);
  try {
    if (cmpMatch) {
      const leftExpr = cmpMatch[1];
      const op = cmpMatch[2];
      const rightExpr = cmpMatch[3];
      const leftVal = evaluateArithmeticExpression(leftExpr, vars);
      const rightVal = evaluateArithmeticExpression(rightExpr, vars);
      let booleanResult = false;
      if (op === '===' || op === '==') {
        booleanResult = Math.abs(leftVal - rightVal) <= tolerance;
      } else if (op === '!=') {
        booleanResult = Math.abs(leftVal - rightVal) > tolerance;
      } else if (op === '<=') {
        booleanResult = leftVal <= rightVal + tolerance;
      } else if (op === '>=') {
        booleanResult = leftVal >= rightVal - tolerance;
      } else if (op === '<') {
        booleanResult = leftVal < rightVal;
      } else if (op === '>') {
        booleanResult = leftVal > rightVal;
      }
      return {
        ok: true,
        isComparison: true,
        leftVal,
        rightVal,
        operator: op,
        value: leftVal,
        booleanResult,
      };
    }

    const value = evaluateArithmeticExpression(trimmed, vars);
    return { ok: true, isComparison: false, value };
  } catch (err) {
    return {
      ok: false,
      isComparison: Boolean(cmpMatch),
      error: err instanceof Error ? err.message : 'Invalid formula',
    };
  }
}

export function evaluateContentRule(
  rule: ContentAssertionRule,
  actualText: string
): { passed: boolean; reason: string } {
  const actual = rule.caseSensitive ? actualText : actualText.toLowerCase();
  const expected = rule.caseSensitive
    ? rule.expectedText
    : rule.expectedText.toLowerCase();

  if (rule.operator === 'contains') {
    const ok = Boolean(expected) && actual.includes(expected);
    return {
      passed: ok,
      reason: ok
        ? `Matched substring "${rule.expectedText}"`
        : `Expected text to contain "${rule.expectedText}"`,
    };
  }

  if (rule.operator === 'equals') {
    const ok = actual.trim() === expected.trim();
    return {
      passed: ok,
      reason: ok
        ? 'Exact text match passed'
        : `Expected "${rule.expectedText}", got "${actualText.slice(0, 80)}"`,
    };
  }

  if (rule.operator === 'not_contains') {
    const ok = !expected || !actual.includes(expected);
    return {
      passed: ok,
      reason: ok
        ? `Confirmed forbidden text "${rule.expectedText}" is absent`
        : `Forbidden text "${rule.expectedText}" found on page!`,
    };
  }

  if (rule.operator === 'regex') {
    try {
      const re = new RegExp(rule.expectedText, rule.caseSensitive ? '' : 'i');
      const ok = re.test(actualText);
      return {
        passed: ok,
        reason: ok
          ? `Regex /${rule.expectedText}/ matched`
          : `Regex /${rule.expectedText}/ did not match`,
      };
    } catch {
      return { passed: false, reason: 'Invalid Regular Expression' };
    }
  }

  // max_length
  const maxLen = Number(rule.expectedText);
  if (!Number.isFinite(maxLen) || maxLen <= 0) {
    return { passed: false, reason: 'Enter a positive number for max length' };
  }
  const ok = actualText.trim().length <= maxLen;
  return {
    passed: ok,
    reason: ok
      ? `Length ${actualText.trim().length} <= ${maxLen} chars`
      : `Overflow: ${actualText.trim().length} chars exceeds limit ${maxLen}`,
  };
}

export interface ContentHealthReport {
  wordCount: number;
  charCount: number;
  lineCount: number;
  extractedNumbers: number[];
  issues: Array<{
    severity: 'critical' | 'warning';
    label: string;
    detail: string;
  }>;
}

export function scanTextForContentBugs(text: string): ContentHealthReport {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
  const lines = trimmed ? trimmed.split(/\r?\n/).filter((l) => l.trim()) : [];
  const numMatches = trimmed.match(/-?\d[\d,]*(?:\.\d+)?/g) || [];
  const extractedNumbers = numMatches
    .map((n) => Number(n.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n))
    .slice(0, 30);

  const issues: ContentHealthReport['issues'] = [];

  if (/\b(NaN|undefined|\[object Object\])\b/.test(text)) {
    issues.push({
      severity: 'critical',
      label: 'Raw JS Error Token Detected (NaN / undefined / [object Object])',
      detail: 'Broken runtime value is visible to end users in page content.',
    });
  }

  if (/\{\{[^}]+\}\}|\$\{[^}]+\}/.test(text)) {
    issues.push({
      severity: 'critical',
      label: 'Unrendered Template Placeholder ({{...}} or ${...})',
      detail: 'Template string was rendered literally instead of substituted.',
    });
  }

  if (/\b(null|Lorem ipsum|TODO|TBD)\b/i.test(text)) {
    issues.push({
      severity: 'warning',
      label: 'Placeholder / Draft Copy Found (null / Lorem ipsum / TODO / TBD)',
      detail: 'Temporary developer placeholder text should be replaced before release.',
    });
  }

  if (/ {3,}/.test(text)) {
    issues.push({
      severity: 'warning',
      label: 'Formatting Warning: Extra consecutive spaces detected',
      detail: 'Check text spacing or broken inline elements.',
    });
  }

  return {
    wordCount: words.length,
    charCount: text.length,
    lineCount: lines.length,
    extractedNumbers,
    issues,
  };
}
