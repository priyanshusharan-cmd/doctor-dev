import type { SourceType, SymbolImportance } from '../types';

// Signals come from symbol names and file paths. Bodies are only checked for concrete
// library calls: words like "token", "session", or "find" appear in almost every codebase
// (tokenizers, HTTP sessions, array lookups) and are not evidence of risky logic.

const AUTH_WORDS = new Set([
  'auth', 'authn', 'authz', 'authenticate', 'authentication', 'authenticated', 'authorize', 'authorization', 'authorise',
  'login', 'logout', 'signin', 'signup', 'signout', 'password', 'passwd', 'jwt',
  'permission', 'permissions', 'acl', 'rbac', 'credential', 'credentials', 'oauth', 'oauth2', 'saml', 'mfa', 'totp', 'csrf',
]);
const PAYMENT_WORDS = new Set([
  'payment', 'payments', 'pay', 'stripe', 'paypal', 'checkout', 'charge', 'charges', 'invoice', 'invoices',
  'billing', 'refund', 'refunds', 'subscription', 'subscriptions', 'payout', 'payouts', 'wallet',
]);

/** Split identifiers and paths into lowercase words: "src/authRouter.ts" → src, auth, router, ts. */
export function words(text: string): string[] {
  const parts = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  // Also join neighbours so "sign_in" / "logIn" match "signin" / "login".
  const joined = parts.slice(1).map((w, i) => parts[i] + w);
  return [...parts, ...joined];
}

/** True when a name or path is about authentication/authorization. */
export function isAuthRelated(text: string): boolean {
  return words(text).some((w) => AUTH_WORDS.has(w));
}

/** True when an HTTP route path is about authentication (adds account registration). */
export function isAuthRoute(routePath: string): boolean {
  return isAuthRelated(routePath) || /(^|\/)(register|registration|token|session|me)(\/|$)/i.test(routePath);
}

/** True when a name or path is about payments. */
export function isPaymentRelated(text: string): boolean {
  return words(text).some((w) => PAYMENT_WORDS.has(w));
}
/** Calls that really touch a database. */
const DB_CALL_RE = /\b(prisma\.\w+|mongoose\.|knex\(|sequelize\.|\.query\(\s*['"`]\s*(select|insert|update|delete)|db\.(collection|query|execute|run|insert|update|delete)|session\.(add|commit|execute)\(|cursor\.execute\()/i;
const LIFECYCLE_NAME_RE = /^(main|bootstrap|init|start|setup|configure|createApp|createServer|listen)$/i;

export interface ImportanceInput {
  name: string;
  filePath: string;
  body: string;
  isExported: boolean;
  isRouteHandler?: boolean;
  sourceType: SourceType;
}

/** Score a symbol from name, path, and concrete body evidence. */
export function scoreImportance(input: ImportanceInput): { importance: SymbolImportance; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const pathSegments = input.filePath.toLowerCase();
  const shortName = input.name.split('.').pop() ?? input.name;

  if (isAuthRelated(shortName) || isAuthRelated(input.filePath)) {
    reasons.push('authentication/authorization logic');
    score += 4;
  }
  if (isPaymentRelated(shortName) || isPaymentRelated(input.filePath)) {
    reasons.push('payment logic');
    score += 4;
  }
  if (DB_CALL_RE.test(input.body)) { reasons.push('database operation'); score += 2; }
  if (input.isRouteHandler) { reasons.push('route handler'); score += 2; }
  if (/(^|\/)(controllers?|handlers?|routes?|routers?|api)\//.test(pathSegments)) { reasons.push('controller/route file'); score += 1; }
  if (/(^|\/)(services?|usecases?|domain)\//.test(pathSegments)) { reasons.push('service layer'); score += 1; }
  if (/(^|\/)(middlewares?|guards?)\//.test(pathSegments)) { reasons.push('middleware'); score += 1; }
  if (LIFECYCLE_NAME_RE.test(shortName)) { reasons.push('application lifecycle'); score += 1; }
  if (input.isExported) { reasons.push('exported — part of public API'); score += 1; }

  if (input.sourceType !== 'production') {
    score -= 5;
    reasons.push(`${input.sourceType} code`);
  }

  const importance: SymbolImportance =
    score >= 5 ? 'critical' :
    score >= 3 ? 'high' :
    score >= 1 ? 'medium' :
    'low';
  return { importance, reasons: reasons.slice(0, 4) };
}

/** Numeric weight of an importance level, used for coverage weighting and severity. */
export const IMPORTANCE_WEIGHT: Record<SymbolImportance, number> = {
  critical: 3,
  high: 2,
  medium: 1.25,
  low: 0.5,
};

const RANK: Record<SymbolImportance, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** The higher of two importance levels. */
export function maxImportance(a: SymbolImportance, b: SymbolImportance): SymbolImportance {
  return RANK[a] >= RANK[b] ? a : b;
}
