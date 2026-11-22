// Safe, zero-eval MS Word / Google Docs / Spreadsheet formula evaluator & formatter

export interface FormulaEvalResult {
  ok: boolean;
  value?: string;
  numericValue?: number;
  error?: string;
}

type Token =
  | { type: 'num'; val: number }
  | { type: 'ident'; val: string }
  | { type: 'op'; val: string }
  | { type: 'paren'; val: '(' | ')' }
  | { type: 'comma' };

function tokenizeFormula(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(input[i + 1] || ''))) {
      let numStr = '';
      while (i < input.length && /[\d.]/.test(input[i])) {
        numStr += input[i];
        i += 1;
      }
      const n = Number(numStr);
      if (!Number.isFinite(n)) throw new Error(`Invalid number "${numStr}"`);
      tokens.push({ type: 'num', val: n });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        id += input[i];
        i += 1;
      }
      tokens.push({ type: 'ident', val: id.toUpperCase() });
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
    const two = input.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '==' || two === '!=') {
      tokens.push({ type: 'op', val: two });
      i += 2;
      continue;
    }
    if ('+-*/%^<>='.includes(ch)) {
      tokens.push({ type: 'op', val: ch === '=' ? '==' : ch });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected character "${ch}"`);
  }
  return tokens;
}

export function evaluateDocFormula(rawExpression: string): FormulaEvalResult {
  const cleaned = rawExpression.trim().replace(/^=+/, '').trim();
  if (!cleaned) {
    return { ok: false, error: 'Empty formula' };
  }

  try {
    const tokens = tokenizeFormula(cleaned);
    let pos = 0;

    const peek = (): Token | undefined => tokens[pos];
    const consume = (): Token | undefined => {
      const t = tokens[pos];
      pos += 1;
      return t;
    };

    const parseComparison = (): number => {
      let left = parseAddSub();
      while (true) {
        const t = peek();
        if (
          t?.type === 'op' &&
          ['<', '>', '<=', '>=', '==', '!='].includes(t.val)
        ) {
          consume();
          const right = parseAddSub();
          if (t.val === '<') left = left < right ? 1 : 0;
          else if (t.val === '>') left = left > right ? 1 : 0;
          else if (t.val === '<=') left = left <= right ? 1 : 0;
          else if (t.val === '>=') left = left >= right ? 1 : 0;
          else if (t.val === '==') left = Math.abs(left - right) < 1e-9 ? 1 : 0;
          else if (t.val === '!=') left = Math.abs(left - right) >= 1e-9 ? 1 : 0;
        } else {
          break;
        }
      }
      return left;
    };

    const parseAddSub = (): number => {
      let left = parseMulDiv();
      while (true) {
        const t = peek();
        if (t?.type === 'op' && (t.val === '+' || t.val === '-')) {
          consume();
          const right = parseMulDiv();
          left = t.val === '+' ? left + right : left - right;
        } else {
          break;
        }
      }
      return left;
    };

    const parseMulDiv = (): number => {
      let left = parsePower();
      while (true) {
        const t = peek();
        if (t?.type === 'op' && (t.val === '*' || t.val === '/' || t.val === '%')) {
          consume();
          const right = parsePower();
          if (t.val === '*') left *= right;
          else if (t.val === '/') {
            if (right === 0) throw new Error('Division by zero');
            left /= right;
          } else {
            if (right === 0) throw new Error('Modulo by zero');
            left %= right;
          }
        } else {
          break;
        }
      }
      return left;
    };

    const parsePower = (): number => {
      const base = parseUnary();
      const t = peek();
      if (t?.type === 'op' && t.val === '^') {
        consume();
        return base ** parsePower();
      }
      return base;
    };

    const parseUnary = (): number => {
      const t = peek();
      if (t?.type === 'op' && (t.val === '+' || t.val === '-')) {
        consume();
        const v = parseUnary();
        return t.val === '-' ? -v : v;
      }
      return parsePrimary();
    };

    const parsePrimary = (): number => {
      const t = peek();
      if (!t) throw new Error('Unexpected end of formula');
      if (t.type === 'num') {
        consume();
        return t.val;
      }
      if (t.type === 'paren' && t.val === '(') {
        consume();
        const v = parseComparison();
        const close = consume();
        if (!close || close.type !== 'paren' || close.val !== ')') {
          throw new Error('Missing closing parenthesis');
        }
        return v;
      }
      if (t.type === 'ident') {
        consume();
        if (t.val === 'PI') return Math.PI;
        const open = peek();
        if (open?.type === 'paren' && open.val === '(') {
          consume();
          const args: number[] = [];
          if (!(peek()?.type === 'paren' && (peek() as { val: string }).val === ')')) {
            args.push(parseComparison());
            while (peek()?.type === 'comma') {
              consume();
              args.push(parseComparison());
            }
          }
          const close = consume();
          if (!close || close.type !== 'paren' || close.val !== ')') {
            throw new Error(`Missing closing ")" for ${t.val}()`);
          }
          return evalFunction(t.val, args);
        }
        throw new Error(`Unknown identifier "${t.val}". Use numbers or functions like SUM(), AVG(), IF().`);
      }
      throw new Error('Invalid formula syntax');
    };

    const evalFunction = (fn: string, args: number[]): number => {
      if (args.length === 0) throw new Error(`${fn}() needs at least 1 argument`);
      switch (fn) {
        case 'SUM':
          return args.reduce((a, b) => a + b, 0);
        case 'AVG':
        case 'AVERAGE':
          return args.reduce((a, b) => a + b, 0) / args.length;
        case 'MIN':
          return Math.min(...args);
        case 'MAX':
          return Math.max(...args);
        case 'ABS':
          return Math.abs(args[0]);
        case 'SQRT':
          if (args[0] < 0) throw new Error('SQRT of negative number');
          return Math.sqrt(args[0]);
        case 'ROUND': {
          const dec = Math.max(0, Math.min(8, Math.round(args[1] ?? 0)));
          const factor = 10 ** dec;
          return Math.round(args[0] * factor) / factor;
        }
        case 'FLOOR':
          return Math.floor(args[0]);
        case 'CEIL':
          return Math.ceil(args[0]);
        case 'IF': {
          const cond = args[0];
          const trueVal = args[1] ?? 1;
          const falseVal = args[2] ?? 0;
          return cond !== 0 ? trueVal : falseVal;
        }
        case 'PCT':
        case 'PERCENT': {
          const part = args[0];
          const whole = args[1] ?? 100;
          if (whole === 0) throw new Error('Division by zero in PCT');
          return (part / whole) * 100;
        }
        default:
          throw new Error(`Unsupported function "${fn}"`);
      }
    };

    const result = parseComparison();
    if (pos < tokens.length) {
      throw new Error('Unexpected trailing tokens in formula');
    }
    if (!Number.isFinite(result)) {
      throw new Error('Result is not a finite number');
    }
    const rounded = Number(result.toFixed(4));
    return {
      ok: true,
      numericValue: rounded,
      value: String(rounded),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid formula',
    };
  }
}

export function escapeHtmlText(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdownToSafeHtml(raw: string): string {
  let out = escapeHtmlText(raw);
  // Formula tokens {{= expr }}
  out = out.replace(/\{\{=\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
    const res = evaluateDocFormula(expr);
    const display = res.ok ? `=${expr.trim()} => ${res.value}` : `=${expr.trim()} (${res.error})`;
    return `<span style="background:#fef3c7;border:1px solid #f59e0b;padding:2px 6px;border-radius:4px;font-family:Consolas,monospace;font-size:10pt;"><strong>fx</strong> ${display}</span>`;
  });
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__(.+?)__/g, '<u>$1</u>');
  out = out.replace(/~~(.+?)~~/g, '<s>$1</s>');
  out = out.replace(/==(.+?)==/g, '<mark style="background:#fde68a;">$1</mark>');
  out = out.replace(/`([^`]+?)`/g, '<code style="background:#f1f5f9;padding:1px 4px;font-family:Consolas,monospace;">$1</code>');
  out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  return out;
}

export function buildWordCompatibleDocHtml(params: {
  title: string;
  sectionRef: string;
  markStatus: string;
  updatedAt: string;
  content: string;
}): string {
  const lines = params.content.split(/\r?\n/);
  const htmlChunks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      htmlChunks.push('<hr style="border:none;border-top:1px solid #cbd5e1;margin:12px 0;" />');
      i += 1;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      htmlChunks.push(`<h3 style="font-size:13pt;margin:10px 0 4px;">${inlineMarkdownToSafeHtml(trimmed.slice(4))}</h3>`);
      i += 1;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      htmlChunks.push(`<h2 style="font-size:15pt;margin:12px 0 6px;">${inlineMarkdownToSafeHtml(trimmed.slice(3))}</h2>`);
      i += 1;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      htmlChunks.push(`<h1 style="font-size:18pt;margin:14px 0 8px;">${inlineMarkdownToSafeHtml(trimmed.slice(2))}</h1>`);
      i += 1;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      htmlChunks.push(
        `<blockquote style="border-left:4px solid #f59e0b;background:#fffbeb;padding:8px 12px;margin:8px 0;">${inlineMarkdownToSafeHtml(trimmed.slice(2))}</blockquote>`
      );
      i += 1;
      continue;
    }

    // Markdown Table block
    if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      const rows = tableLines
        .filter((r) => !/^\|[\s:|-]+\|$/.test(r))
        .map((r) =>
          r
            .slice(1, r.endsWith('|') ? -1 : undefined)
            .split('|')
            .map((cell) => cell.trim())
        );
      if (rows.length > 0) {
        const [head, ...body] = rows;
        const ths = head
          .map((c) => `<th style="border:1px solid #cbd5e1;background:#f8fafc;padding:6px 10px;text-align:left;">${inlineMarkdownToSafeHtml(c)}</th>`)
          .join('');
        const trs = body
          .map(
            (r) =>
              `<tr>${r
                .map((c) => `<td style="border:1px solid #cbd5e1;padding:6px 10px;">${inlineMarkdownToSafeHtml(c)}</td>`)
                .join('')}</tr>`
          )
          .join('');
        htmlChunks.push(
          `<table style="border-collapse:collapse;width:100%;margin:10px 0;font-size:10.5pt;"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
        );
      }
      continue;
    }

    // Checklist / Bullet list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const rawItem = lines[i].trim().replace(/^[-*]\s+/, '');
        if (rawItem.startsWith('[ ] ')) {
          items.push(`<li>☐ ${inlineMarkdownToSafeHtml(rawItem.slice(4))}</li>`);
        } else if (rawItem.startsWith('[x] ') || rawItem.startsWith('[X] ')) {
          items.push(`<li>☑ <s>${inlineMarkdownToSafeHtml(rawItem.slice(4))}</s></li>`);
        } else {
          items.push(`<li>${inlineMarkdownToSafeHtml(rawItem)}</li>`);
        }
        i += 1;
      }
      htmlChunks.push(`<ul style="margin:6px 0 6px 20px;">${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const rawItem = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push(`<li>${inlineMarkdownToSafeHtml(rawItem)}</li>`);
        i += 1;
      }
      htmlChunks.push(`<ol style="margin:6px 0 6px 20px;">${items.join('')}</ol>`);
      continue;
    }

    htmlChunks.push(`<p style="margin:6px 0;line-height:1.6;">${inlineMarkdownToSafeHtml(line)}</p>`);
    i += 1;
  }

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtmlText(params.title)}</title></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#0f172a;max-width:780px;margin:24px auto;">
  <h1 style="font-size:20pt;margin-bottom:4px;">${escapeHtmlText(params.title)}</h1>
  <p style="font-size:9.5pt;color:#475569;border-bottom:1px solid #cbd5e1;padding-bottom:8px;margin-bottom:14px;">
    <strong>Ref:</strong> ${escapeHtmlText(params.sectionRef)} &nbsp;|&nbsp;
    <strong>Status:</strong> ${escapeHtmlText(params.markStatus)} &nbsp;|&nbsp;
    <strong>Updated:</strong> ${escapeHtmlText(new Date(params.updatedAt).toLocaleDateString())}
  </p>
  ${htmlChunks.join('\n')}
</body>
</html>`;
}
