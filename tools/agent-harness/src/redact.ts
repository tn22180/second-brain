/**
 * Mask credentials in text the harness stores or sends. Verdict details are stderr tails; they
 * land in the ledger, in Telegram, and — through self-improve — in the second-brain git repo,
 * which is exactly how 75 secrets reached git once before (prod-error autofix, 2026-09).
 * Shapes, not a secret inventory: a new provider's format may slip through, so this is a floor.
 */
const R = '[REDACTED]';

const RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, R],
  [/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, (_m, p) => `${p} ${R}`],
  [/\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+/g, R],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, R],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{20,}/g, R],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, R],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, R],
  [/\bAIza[0-9A-Za-z_-]{35}/g, R],
  [/\d{8,10}:AA[A-Za-z0-9_-]{30,}/g, R],
  // NAME=value / "name": "value" where the name says what it is.
  [/\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|TOKEN_KEY)[A-Za-z0-9_]*)(\s*=\s*)(["']?)[^\s"']{4,}\3/gi,
    (_m, k, eq, q) => `${k}${eq}${q}${R}${q}`],
  [/("[A-Za-z0-9_]*(?:token|secret|password|api_?key|private_?key)[A-Za-z0-9_]*"\s*:\s*)"[^"]{4,}"/gi, (_m, k) => `${k}"${R}"`]
];

export function redact(text: string): string {
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep as never);
  return out;
}
