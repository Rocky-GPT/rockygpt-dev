/**
 * @module lib/security-headers
 * Shared response headers for every page, asset, and route handler.
 *
 * Adapted from the student UI's copy. Three of its allowances are gone because
 * the surfaces that earned them are not here: the campus map is not framed, no
 * media is played, and there is no PWA manifest. What is added instead is a
 * robots directive, because this app renders real student conversations and a
 * leaked url must not become a search result.
 */

export type CspMode = 'enforce' | 'report-only';

export interface SecurityHeader {
  key: string;
  value: string;
}

interface SecurityHeaderOptions {
  nodeEnv?: string;
  cspMode?: string;
  cspReportUri?: string;
}

/**
 * CSP is enforced unless a deployment deliberately opts into a report-only
 * observation window. An invalid value fails the build instead of silently
 * weakening the policy.
 */
export function resolveCspMode(value = process.env.ROCKY_CSP_MODE): CspMode {
  if (!value || value === 'enforce') return 'enforce';
  if (value === 'report-only') return 'report-only';

  throw new Error(`Invalid ROCKY_CSP_MODE "${value}". Expected "enforce" or "report-only".`);
}

function resolveReportUri(value = process.env.ROCKY_CSP_REPORT_URI): string | undefined {
  const reportUri = value?.trim();
  if (!reportUri) return undefined;

  if (/^\/[A-Za-z0-9/_?&=.%~-]*$/.test(reportUri)) return reportUri;

  let parsed: URL;
  try {
    parsed = new URL(reportUri);
  } catch {
    throw new Error('ROCKY_CSP_REPORT_URI must be a root-relative path or an HTTPS URL.');
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('ROCKY_CSP_REPORT_URI must be a root-relative path or an HTTPS URL.');
  }

  return parsed.toString();
}

/**
 * Builds the application CSP. The two unsafe-inline allowances are required by
 * Next.js bootstrap/style tags and the app's React style props.
 *
 * `connect-src 'self'` is what governs `EventSource`, so the same-origin log
 * stream is covered without naming it.
 */
export function buildContentSecurityPolicy(options: SecurityHeaderOptions = {}): string {
  const isDevelopment = (options.nodeEnv ?? process.env.NODE_ENV) !== 'production';
  const reportUri = resolveReportUri(options.cspReportUri);
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDevelopment ? ' ws: wss:' : ''}`,
    "frame-src 'none'",
    "worker-src 'self' blob:",
  ];

  if (!isDevelopment) directives.push('upgrade-insecure-requests');
  if (reportUri) directives.push(`report-uri ${reportUri}`);

  return directives.join('; ');
}

/** Shared response headers for every page, asset, and route handler. */
export function buildSecurityHeaders(options: SecurityHeaderOptions = {}): SecurityHeader[] {
  const isDevelopment = (options.nodeEnv ?? process.env.NODE_ENV) !== 'production';
  const cspMode = resolveCspMode(options.cspMode);
  const headers: SecurityHeader[] = [
    {
      key: cspMode === 'report-only' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
      value: buildContentSecurityPolicy(options),
    },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()' },
    // Not access control. It stops a leaked url becoming a search result, which
    // matters more here than in the student app because these pages render real
    // conversations.
    { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  ];

  // CSP frame-ancestors is authoritative; X-Frame-Options protects legacy clients.
  if (!isDevelopment) {
    headers.push({ key: 'X-Frame-Options', value: 'DENY' });
  }

  return headers;
}
