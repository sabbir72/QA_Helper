import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';

dotenv.config();

const ROOT_DIR = import.meta.dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const INDEX_FILE = path.join(DATA_DIR, 'users-index.json');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
const SECRET_FILE = path.join(DATA_DIR, '.auth-secret');
const SESSION_COOKIE_NAME = 'vp_session';

function ensureDirs(): void {
  fs.mkdirSync(USERS_DIR, { recursive: true });
}

function getAuthSecret(): string {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16) {
    return process.env.AUTH_SECRET;
  }
  ensureDirs();
  if (fs.existsSync(SECRET_FILE)) {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing.length >= 16) return existing;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { encoding: 'utf8', mode: 0o600 });
  return generated;
}

const AUTH_SECRET = getAuthSecret();

interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

interface TokenRecord {
  tokenHash: string;
  userId: string;
  label: string;
  createdAt: string;
  lastUsedAt: string;
}

interface UserWorkspaceBundle {
  workspace: Record<string, unknown>;
  fakeGps: Record<string, unknown>;
  alerts: unknown[];
  lastScan: Record<string, unknown>;
  recording: { isRecording: boolean; recordedSteps: unknown[] };
  inspected: Record<string, unknown> | null;
  updatedAt: string;
}

function createZeroDataBundle(): UserWorkspaceBundle {
  return {
    workspace: {
      version: 1,
      activeProjectId: 'proj_default',
      settings: {
        theme: 'light',
        screenshotConsentGranted: false,
        maskSensitivePatterns:
          'password|passwd|secret|token|auth|bearer|api_key|ssn|pin|cvv',
      },
      projects: [
        {
          id: 'proj_default',
          name: 'My QA Workspace',
          domain: 'app.example.com',
          activeEnvironment: 'staging',
          flows: [],
          rbacRules: [],
          customRoles: [],
          customTestRules: [],
          contentAssertions: [],
          formulaChecks: [],
          visualChecks: [],
          stateTransitions: [],
          dateTimeRules: [],
          dataDependencies: [],
          businessDocs: [],
          businessNotes: [],
          discussionPoints: [],
          businessPolicies: [],
          bugReports: [],
          testCases: [],
          notices: [],
          approvalChain: [],
          approvalSketches: [],
          savedGpsLocations: [],
        },
      ],
      recycleBin: [],
    },
    fakeGps: {
      enabled: false,
      latitude: 23.8103,
      longitude: 90.4125,
      accuracy: 15,
      altitude: 12,
      heading: 0,
      speed: 0,
      locationLabel: 'Dhaka, Bangladesh',
      simulateMovement: false,
      routeEndLat: 23.8759,
      routeEndLng: 90.3795,
      routeIntervalSec: 3,
      showFloatingBadge: true,
      updatedAt: new Date(0).toISOString(),
    },
    alerts: [],
    lastScan: {
      ok: true,
      pageUrl: '',
      pageTitle: 'No page scanned yet',
      elements: [],
    },
    recording: {
      isRecording: false,
      recordedSteps: [],
    },
    inspected: null,
    updatedAt: new Date().toISOString(),
  };
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  ensureDirs();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function getUsersIndex(): Record<string, UserRecord> {
  return readJsonFile<Record<string, UserRecord>>(INDEX_FILE, {});
}

function saveUsersIndex(index: Record<string, UserRecord>): void {
  writeJsonAtomic(INDEX_FILE, index);
}

function getTokensMap(): Record<string, TokenRecord> {
  return readJsonFile<Record<string, TokenRecord>>(TOKENS_FILE, {});
}

function saveTokensMap(tokens: Record<string, TokenRecord>): void {
  writeJsonAtomic(TOKENS_FILE, tokens);
}

function isSafeUserId(id: string): boolean {
  return /^u_[a-f0-9]{16,32}$/.test(id);
}

function getUserDataPath(userId: string): string {
  if (!isSafeUserId(userId)) {
    throw new Error('Invalid user identifier');
  }
  return path.join(USERS_DIR, `${userId}.json`);
}

function readUserBundle(userId: string): UserWorkspaceBundle {
  const filePath = getUserDataPath(userId);
  if (!fs.existsSync(filePath)) {
    const clean = createZeroDataBundle();
    writeJsonAtomic(filePath, clean);
    return clean;
  }
  return readJsonFile<UserWorkspaceBundle>(filePath, createZeroDataBundle());
}

function writeUserBundle(userId: string, bundle: UserWorkspaceBundle): void {
  const filePath = getUserDataPath(userId);
  writeJsonAtomic(filePath, bundle);
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function signSessionToken(userId: string): string {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString(
    'base64url'
  );
  const sig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payload)
    .digest('base64url');
  return `vps.${payload}.${sig}`;
}

function verifySessionToken(token: string): string | null {
  if (!token.startsWith('vps.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payload, sig] = parts;
  if (!payload || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as { uid?: string; exp?: number };
    if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return isSafeUserId(parsed.uid) ? parsed.uid : null;
  } catch {
    return null;
  }
}

function hashOpaqueToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function mintExtensionBearerToken(userId: string, label: string): string {
  const raw = `vp_ext_${crypto.randomBytes(28).toString('hex')}`;
  const tokenHash = hashOpaqueToken(raw);
  const tokens = getTokensMap();
  const now = new Date().toISOString();
  tokens[tokenHash] = {
    tokenHash,
    userId,
    label: label.slice(0, 80) || 'Chrome Extension',
    createdAt: now,
    lastUsedAt: now,
  };
  saveTokensMap(tokens);
  return raw;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function resolveUserById(userId: string): Omit<UserRecord, 'passwordHash'> | null {
  const index = getUsersIndex();
  for (const rec of Object.values(index)) {
    if (rec.id === userId) {
      return {
        id: rec.id,
        name: rec.name,
        email: rec.email,
        createdAt: rec.createdAt,
      };
    }
  }
  return null;
}

interface AuthedRequest extends Request {
  authUser?: Omit<UserRecord, 'passwordHash'>;
}

function authenticateRequest(req: AuthedRequest): Omit<UserRecord, 'passwordHash'> | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith('vps.')) {
      const uid = verifySessionToken(token);
      if (uid) return resolveUserById(uid);
    }
    if (token.startsWith('vp_ext_')) {
      const tokens = getTokensMap();
      const record = tokens[hashOpaqueToken(token)];
      if (record && isSafeUserId(record.userId)) {
        return resolveUserById(record.userId);
      }
    }
  }

  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies[SESSION_COOKIE_NAME];
  if (sessionCookie) {
    const uid = verifySessionToken(sessionCookie);
    if (uid) return resolveUserById(uid);
  }
  return null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const user = authenticateRequest(req);
  if (!user) {
    res.status(401).json({
      ok: false,
      error: 'Authentication required. Please sign in to access your isolated workspace.',
    });
    return;
  }
  req.authUser = user;
  next();
}

function setSessionCookie(req: Request, res: Response, sessionToken: string): void {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '');
  const isHttps = req.secure || forwardedProto.includes('https');
  const maxAge = 30 * 24 * 60 * 60;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAge}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '');
  const isHttps = req.secure || forwardedProto.includes('https');
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (origin.startsWith('chrome-extension://')) return true;
  if (origin.startsWith('moz-extension://')) return true;
  if (/^https?:\/\/localhost(:\d+)?$/i.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return true;
  if (process.env.APP_URL && origin === process.env.APP_URL) return true;
  if (/^https:\/\/[a-z0-9-]+\.run\.app$/i.test(origin)) return true;
  return false;
}

function validateExternalHttpUrl(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, error: 'URL is empty.' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Invalid URL format. Include https:// or http://' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// URLs are supported.' };
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return { ok: false, error: 'Private or loopback hostnames cannot be scanned remotely. Use Screenshot or Active Tab Scan instead.' };
  }
  return { ok: true, url: parsed.toString() };
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

async function startServer() {
  ensureDirs();
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '12mb' }));

  // CORS middleware for Chrome Extension & Web preview API calls
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && isAllowedCorsOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
      );
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'VeriPulse SQA Studio', version: '1.1.0' });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
    };
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!name || name.length < 2) {
      res.status(400).json({ ok: false, error: 'Please enter your name (min 2 chars).' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 6) {
      res
        .status(400)
        .json({ ok: false, error: 'Password must be at least 6 characters.' });
      return;
    }

    const index = getUsersIndex();
    if (index[email]) {
      res.status(409).json({
        ok: false,
        error: 'An account with this email already exists. Please sign in.',
      });
      return;
    }

    const userId = `u_${crypto.randomBytes(10).toString('hex')}`;
    const createdAt = new Date().toISOString();
    const record: UserRecord = {
      id: userId,
      name,
      email,
      passwordHash: hashPassword(password),
      createdAt,
    };

    index[email] = record;
    saveUsersIndex(index);

    // Every new user strictly starts with ZERO data
    const zeroBundle = createZeroDataBundle();
    writeUserBundle(userId, zeroBundle);

    const sessionToken = signSessionToken(userId);
    const extensionToken = mintExtensionBearerToken(userId, 'Primary Client');
    setSessionCookie(req, res, sessionToken);

    res.status(201).json({
      ok: true,
      user: { id: userId, name, email, createdAt },
      bearerToken: extensionToken,
      bundle: zeroBundle,
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const body = (req.body || {}) as { email?: unknown; password?: unknown };
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const index = getUsersIndex();
    const record = index[email];
    if (!record || !verifyPassword(password, record.passwordHash)) {
      res.status(401).json({ ok: false, error: 'Invalid email or password.' });
      return;
    }

    const sessionToken = signSessionToken(record.id);
    const extensionToken = mintExtensionBearerToken(record.id, 'Session Sync');
    setSessionCookie(req, res, sessionToken);
    const bundle = readUserBundle(record.id);

    res.json({
      ok: true,
      user: {
        id: record.id,
        name: record.name,
        email: record.email,
        createdAt: record.createdAt,
      },
      bearerToken: extensionToken,
      bundle,
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token.startsWith('vp_ext_')) {
        const tokens = getTokensMap();
        const key = hashOpaqueToken(token);
        if (tokens[key]) {
          delete tokens[key];
          saveTokensMap(tokens);
        }
      }
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req: AuthedRequest, res: Response) => {
    const user = authenticateRequest(req);
    if (!user) {
      res.json({ ok: true, user: null });
      return;
    }
    res.json({ ok: true, user });
  });

  app.post('/api/auth/extension-token', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const body = (req.body || {}) as { label?: unknown };
    const label = typeof body.label === 'string' ? body.label : 'Chrome Extension';
    const token = mintExtensionBearerToken(user.id, label);
    res.json({ ok: true, token, user });
  });

  app.get('/api/workspace', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const bundle = readUserBundle(user.id);
    res.json({ ok: true, user, bundle });
  });

  app.put('/api/workspace', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const incoming = (req.body || {}) as Partial<UserWorkspaceBundle>;
    const existing = readUserBundle(user.id);
    const now = new Date().toISOString();

    const nextBundle: UserWorkspaceBundle = {
      workspace:
        incoming.workspace && typeof incoming.workspace === 'object'
          ? incoming.workspace
          : existing.workspace,
      fakeGps:
        incoming.fakeGps && typeof incoming.fakeGps === 'object'
          ? incoming.fakeGps
          : existing.fakeGps,
      alerts: Array.isArray(incoming.alerts) ? incoming.alerts : existing.alerts,
      lastScan:
        incoming.lastScan && typeof incoming.lastScan === 'object'
          ? incoming.lastScan
          : existing.lastScan,
      recording:
        incoming.recording && typeof incoming.recording === 'object'
          ? incoming.recording
          : existing.recording,
      inspected:
        incoming.inspected !== undefined ? incoming.inspected : existing.inspected,
      updatedAt: now,
    };

    writeUserBundle(user.id, nextBundle);
    res.json({ ok: true, updatedAt: now });
  });

  app.post('/api/workspace/reset', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const zeroBundle = createZeroDataBundle();
    writeUserBundle(user.id, zeroBundle);
    res.json({ ok: true, bundle: zeroBundle });
  });

  app.post('/api/ai/scan-analyze', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        ok: false,
        error:
          'GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY in Settings > Secrets to run AI screen and website analysis.',
      });
      return;
    }

    const body = (req.body || {}) as {
      mode?: unknown;
      url?: unknown;
      pageTitle?: unknown;
      locale?: unknown;
      dataTone?: unknown;
      lang?: unknown;
      imageBase64?: unknown;
      imageMimeType?: unknown;
      domFields?: unknown;
      pageTextSample?: unknown;
    };

    const mode =
      body.mode === 'autofill_only' || body.mode === 'website_tests_only'
        ? body.mode
        : 'fields_and_tests';
    const locale = body.locale === 'global' ? 'global' : 'bd';
    const dataTone = body.dataTone === 'edge' ? 'edge' : 'valid';
    const lang = body.lang === 'bn' ? 'bn' : 'en';
    const pageTitle = typeof body.pageTitle === 'string' ? body.pageTitle.trim().slice(0, 160) : '';
    const rawUrl = typeof body.url === 'string' ? body.url.trim().slice(0, 600) : '';
    const pageTextSample =
      typeof body.pageTextSample === 'string' ? body.pageTextSample.trim().slice(0, 6000) : '';

    let validatedUrl = '';
    if (rawUrl) {
      const check = validateExternalHttpUrl(rawUrl);
      if (!check.ok) {
        res.status(400).json({ ok: false, error: check.error });
        return;
      }
      validatedUrl = check.url;
    }

    let cleanImageBase64 = '';
    let cleanMimeType = 'image/png';
    if (typeof body.imageBase64 === 'string' && body.imageBase64.trim()) {
      const rawImg = body.imageBase64.trim();
      const dataUrlMatch = rawImg.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i);
      if (dataUrlMatch) {
        cleanMimeType = dataUrlMatch[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataUrlMatch[1].toLowerCase();
        cleanImageBase64 = dataUrlMatch[2];
      } else {
        const reqMime =
          typeof body.imageMimeType === 'string' ? body.imageMimeType.toLowerCase().trim() : 'image/png';
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(reqMime)) {
          res.status(400).json({ ok: false, error: 'Unsupported screenshot format. Use PNG, JPEG, or WebP.' });
          return;
        }
        cleanMimeType = reqMime;
        cleanImageBase64 = rawImg.replace(/\s+/g, '');
      }
      if (cleanImageBase64.length > 8_000_000) {
        res.status(400).json({ ok: false, error: 'Screenshot image is too large (max ~6MB).' });
        return;
      }
    }

    const domFields = Array.isArray(body.domFields)
      ? body.domFields.slice(0, 45).map((f, idx) => {
          const item = (f || {}) as Record<string, unknown>;
          return {
            id: typeof item.id === 'string' ? item.id.slice(0, 60) : `dom_${idx}`,
            label: typeof item.label === 'string' ? item.label.slice(0, 100) : '',
            name: typeof item.name === 'string' ? item.name.slice(0, 80) : '',
            selector: typeof item.selector === 'string' ? item.selector.slice(0, 160) : '',
            tagName: typeof item.tagName === 'string' ? item.tagName.slice(0, 30) : 'input',
            type: typeof item.type === 'string' ? item.type.slice(0, 30) : 'text',
            placeholder: typeof item.placeholder === 'string' ? item.placeholder.slice(0, 100) : '',
            required: Boolean(item.required),
            options: Array.isArray(item.options)
              ? item.options.slice(0, 20).map((o) => String(o).slice(0, 60))
              : [],
          };
        })
      : [];

    if (!validatedUrl && !cleanImageBase64 && domFields.length === 0 && !pageTextSample) {
      res.status(400).json({
        ok: false,
        error: 'Provide a window screenshot, active tab scan, DOM fields, or a website URL.',
      });
      return;
    }

    const localeHint =
      locale === 'bd'
        ? 'Bangladesh realistic QA test data (e.g., Bangladeshi names like Tanvir Ahmed / Nadia Rahman, phones +8801712345678 or 01712345678, Dhaka addresses like House 14, Road 6, Dhanmondi, Dhaka 1205, realistic emails, BDT numeric values).'
        : 'International English realistic QA test data (e.g., Alex Morgan, +1-415-555-0192, San Francisco address, realistic email).';

    const langInstruction =
      lang === 'bn'
        ? 'Write summary, majorTests title, whyImportant, howToTest, expectedResult, and field rationale in clear, natural Bengali (keeping standard English QA terms like Login, OTP, Checkout, API, Validation, URL where helpful). Keep CSS selectors and generated form values realistic for the field.'
        : 'Write all descriptions, titles, and rationale in concise, professional English.';

    const toneInstruction =
      dataTone === 'edge'
        ? 'For generatedValue, generate safe boundary/negative QA test inputs (e.g., max-length strings, zero/negative numbers, invalid format, whitespace) AND still provide a valid alternative in edgeCaseValue or vice versa—make generatedValue directly reflect the requested "edge" boundary testing mode.'
        : 'For generatedValue, generate clean, valid, submission-ready QA test data matching all apparent validation rules, and put a boundary/negative test input in edgeCaseValue.';

    const promptLines = [
      'You are a Principal SQA Automation & Exploratory QA Engineer.',
      `Task mode: ${mode}.`,
      langInstruction,
      `Data locale: ${localeHint}`,
      toneInstruction,
      validatedUrl ? `Target Website URL: ${validatedUrl}` : '',
      pageTitle ? `Page Title: ${pageTitle}` : '',
      domFields.length > 0
        ? `Extracted Live DOM Form Fields (preserve exact selector & options when generating values):\n${JSON.stringify(domFields, null, 2)}`
        : '',
      pageTextSample ? `Visible Page Content Snippet:\n${pageTextSample.slice(0, 3500)}` : '',
      cleanImageBase64
        ? 'A window/screen screenshot is attached. Visually inspect EVERY visible data input field, dropdown, date picker, search bar, checkbox, button, and overall page purpose.'
        : '',
      'Requirements:',
      '1. detectedFields: List every data input field visible on the screen/DOM. For each field provide id, label, name, selector (use exact selector from domFields or infer a clean CSS selector like input[name="..."] or [placeholder="..."]), fieldType (one of: text, email, phone, password, number, date, select, textarea, checkbox, radio, url, search), required (boolean), placeholder, options (array of strings if select/radio), generatedValue (string, never empty unless checkbox false), edgeCaseValue (string), rationale (short note why this value fits), and isSensitive (boolean true for password/pin/otp/cvv). If options are provided for a select field, generatedValue MUST match one of those options.',
      '2. majorTests: Based on the website/screen functionality, list 6 to 10 MAJOR things that must be tested (major QA test checklist). Each item must have id, title, category (one of: "Functional Flow", "Form & Validation", "Auth & Security", "UI & Responsive", "Business Logic", "API & Performance"), priority ("P0", "P1", or "P2"), whyImportant, howToTest, expectedResult, targetArea.',
    ]
      .filter(Boolean)
      .join('\n\n');

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        pageTitle: { type: Type.STRING },
        appType: { type: Type.STRING },
        summary: { type: Type.STRING },
        detectedFields: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              label: { type: Type.STRING },
              name: { type: Type.STRING },
              selector: { type: Type.STRING },
              fieldType: { type: Type.STRING },
              required: { type: Type.BOOLEAN },
              placeholder: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              generatedValue: { type: Type.STRING },
              edgeCaseValue: { type: Type.STRING },
              rationale: { type: Type.STRING },
              isSensitive: { type: Type.BOOLEAN },
            },
            required: ['id', 'label', 'selector', 'fieldType', 'generatedValue'],
          },
        },
        majorTests: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              category: { type: Type.STRING },
              priority: { type: Type.STRING },
              whyImportant: { type: Type.STRING },
              howToTest: { type: Type.STRING },
              expectedResult: { type: Type.STRING },
              targetArea: { type: Type.STRING },
            },
            required: ['id', 'title', 'category', 'priority', 'whyImportant', 'howToTest', 'expectedResult'],
          },
        },
      },
      required: ['pageTitle', 'appType', 'summary', 'detectedFields', 'majorTests'],
    };

    const useUrlContextOnly = Boolean(validatedUrl && !cleanImageBase64 && domFields.length === 0 && !pageTextSample);

    try {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (cleanImageBase64) {
        parts.push({
          inlineData: {
            mimeType: cleanMimeType,
            data: cleanImageBase64,
          },
        });
      }
      parts.push({
        text: useUrlContextOnly
          ? `${promptLines}\n\nReturn ONLY a single valid JSON object with keys: pageTitle, appType, summary, detectedFields (array), majorTests (array). Do not wrap in markdown or prose.`
          : promptLines,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: useUrlContextOnly
          ? {
              tools: [{ urlContext: {} }],
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            }
          : {
              responseMimeType: 'application/json',
              responseSchema,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
      });

      const rawText = response.text || '';
      const parsed = extractJsonObject(rawText);
      if (!parsed) {
        res.status(502).json({
          ok: false,
          error: 'AI returned an unexpected non-JSON response. Please retry.',
        });
        return;
      }

      const validFieldTypes = new Set([
        'text',
        'email',
        'phone',
        'password',
        'number',
        'date',
        'select',
        'textarea',
        'checkbox',
        'radio',
        'url',
        'search',
      ]);
      const validCategories = new Set([
        'Functional Flow',
        'Form & Validation',
        'Auth & Security',
        'UI & Responsive',
        'Business Logic',
        'API & Performance',
      ]);

      const detectedFields = Array.isArray(parsed.detectedFields)
        ? parsed.detectedFields.map((rawF, idx) => {
            const f = (rawF || {}) as Record<string, unknown>;
            const rawType = String(f.fieldType || 'text').toLowerCase();
            return {
              id: String(f.id || `field_${idx + 1}`),
              label: String(f.label || f.name || `Field ${idx + 1}`),
              name: String(f.name || ''),
              selector: String(f.selector || `input:nth-of-type(${idx + 1})`),
              fieldType: validFieldTypes.has(rawType) ? rawType : 'text',
              required: Boolean(f.required),
              placeholder: typeof f.placeholder === 'string' ? f.placeholder : '',
              options: Array.isArray(f.options) ? f.options.map(String) : [],
              generatedValue: String(f.generatedValue ?? ''),
              edgeCaseValue: typeof f.edgeCaseValue === 'string' ? f.edgeCaseValue : '',
              rationale: typeof f.rationale === 'string' ? f.rationale : '',
              isSensitive: Boolean(f.isSensitive),
            };
          })
        : [];

      const majorTests = Array.isArray(parsed.majorTests)
        ? parsed.majorTests.map((rawT, idx) => {
            const t = (rawT || {}) as Record<string, unknown>;
            const cat = String(t.category || 'Functional Flow');
            const prio = String(t.priority || 'P1').toUpperCase();
            return {
              id: String(t.id || `mt_${Date.now()}_${idx}`),
              title: String(t.title || `Major QA Check ${idx + 1}`),
              category: validCategories.has(cat) ? cat : 'Functional Flow',
              priority: prio === 'P0' || prio === 'P1' || prio === 'P2' ? prio : 'P1',
              whyImportant: String(t.whyImportant || ''),
              howToTest: String(t.howToTest || ''),
              expectedResult: String(t.expectedResult || ''),
              targetArea: typeof t.targetArea === 'string' ? t.targetArea : '',
              checked: false,
            };
          })
        : [];

      res.json({
        ok: true,
        analysis: {
          pageTitle: String(parsed.pageTitle || pageTitle || validatedUrl || 'Scanned Screen'),
          pageUrl: validatedUrl || '',
          appType: String(parsed.appType || 'Web Application'),
          summary: String(parsed.summary || ''),
          detectedFields,
          majorTests,
          analyzedAt: new Date().toISOString(),
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status =
        /403|PERMISSION_DENIED|API_KEY_INVALID/i.test(msg)
          ? 403
          : /429|RESOURCE_EXHAUSTED/i.test(msg)
            ? 429
            : /404|NOT_FOUND/i.test(msg)
              ? 404
              : 500;
      res.status(status).json({
        ok: false,
        error:
          status === 403
            ? 'Gemini API key permission error. Please check GEMINI_API_KEY in Settings > Secrets.'
            : msg || 'AI scan failed.',
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production' || !process.argv[1]?.includes('tsx');
  const distDir = path.join(ROOT_DIR, 'dist');

  // Always expose compiled extension dist files at /ext-dist (works even in dev mode)
  if (fs.existsSync(distDir)) {
    app.use('/ext-dist', express.static(distDir, { index: false }));
  }

  if (!isProd || !fs.existsSync(distDir)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`VeriPulse Studio running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start VeriPulse server:', err);
  process.exit(1);
});
