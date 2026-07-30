import {classify, type ErrorKind} from './fingerprint';

/**
 * Reads a Slack message produced by `avada-prod-error-alert`'s `buildSlackPayload`
 * back into structured form.
 *
 * Layout being parsed (buildSlackPayload.js:35-54):
 *   text     `${icon} [${appName}] ${firstLine.slice(0, 140)}`
 *   blocks[0] section  `${icon} *[${appName}] ${service}*  ·  \`${severity}\`  ·  _${tag}_`
 *   blocks[1] section  ```<message, escaped, first 700 chars>```
 *   blocks[2] context  `${countLine}  ·  first seen ${n}m ago  ·  window ${n}m  ·  <${logsUrl}|Logs Explorer>`
 */

export interface ParsedAlert {
  appName: string;
  /** As resolved by the lib's resolveService — may carry a `job:` prefix. */
  service: string | undefined;
  /** `service` with any `job:` prefix stripped; this is what gcloud queries want. */
  serviceName: string | undefined;
  isJob: boolean;
  severity: string;
  kind: ErrorKind;
  /** Snippet, un-escaped. Truncated to 700 chars by the sender. */
  message: string;
  totalCount: number;
  suppressed: number;
  firstSeenMinutesAgo: number | undefined;
  windowMinutes: number | undefined;
  logsUrl: string | undefined;
  projectId: string | undefined;
  /**
   * `blocks` is the real thing. `text` is the fully rendered header a human copies
   * out of Slack. `short` is the notification fallback string, which carries only
   * the app and the first line — see `parseShortHeader` for what that costs.
   */
  source: 'blocks' | 'text' | 'short';
}

export type ParseResult =
  | {ok: true; alert: ParsedAlert}
  | {ok: false; reason: 'no_content' | 'no_header' | 'no_message'};

export interface SlackMessageLike {
  text?: string | undefined;
  blocks?: unknown;
}

/** Reverses `escapeSlackText` (buildSlackPayload.js:3-8). `&` last, or `&amp;lt;` would double-decode. */
export function unescapeSlack(str: string): string {
  return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const ICONS = [':red_circle:', ':warning:', '🔴', '⚠️'];
const TAG_TO_KIND: Record<string, ErrorKind> = {'app error': 'app', 'infra self-heal': 'infra'};

/**
 * Tolerates both the mrkdwn source (`*[BLOG] api*  ·  \`ERROR\`  ·  _app error_`) and the
 * rendered text a human copies out of Slack (`[BLOG] api  ·  ERROR  ·  app error`).
 */
const HEADER_RE =
  /\*?\[([^\]]+)\]\s*([^*·]*?)\*?\s*·\s*`?([A-Za-z_]+)`?\s*·\s*_?(app error|infra self-heal)_?/u;

const COUNT_RE = /\*?×(\d+)\*?\s*total/u;
const SUPPRESSED_RE = /(\d+)\s+suppressed since last alert/u;
const FIRST_SEEN_RE = /first seen\s+(\d+)m ago/u;
const WINDOW_RE = /window\s+(\d+)m/u;
const LINK_RE = /<(https?:\/\/[^|>]+)\|[^>]*>/u;
const BARE_URL_RE = /(https?:\/\/console\.cloud\.google\.com\/logs\/\S+)/u;

interface Header {
  appName: string;
  service: string | undefined;
  severity: string;
  kind: ErrorKind;
}

export function parseHeader(text: string): Header | undefined {
  const m = HEADER_RE.exec(text);
  if (!m) return undefined;
  const [, rawApp, rawService, severity, tag] = m;
  const service = (rawService ?? '').trim();
  return {
    appName: unescapeSlack((rawApp ?? '').trim()),
    service: service ? unescapeSlack(service) : undefined,
    severity: (severity ?? 'ERROR').toUpperCase(),
    // Trust the sender's tag over re-running classify() here: the lib classified
    // the *full* message, while the snippet we receive is cut at 700 chars, so an
    // infra pattern past that point would be invisible to us. Trusting the tag is
    // also what keeps our fingerprint equal to the one the alerting side stored.
    kind: TAG_TO_KIND[tag ?? ''] ?? 'app'
  };
}

/**
 * Last resort: the `text` field alone (`${icon} [${appName}] ${firstLine}`), which
 * has no service, no severity and no kind tag.
 *
 * Parsing it is still worth it — the app name alone resolves a repo and a prod
 * project through the registry, so the alert stays actionable. But `kind` has to be
 * re-derived with `classify`, and that can disagree with the sender when the infra
 * pattern sits past the first line. Callers must treat `source: 'short'` as lower
 * confidence, not as equivalent to a block parse.
 */
export function parseShortHeader(text: string): Header | undefined {
  let stripped = text;
  for (const icon of ICONS) stripped = stripped.split(icon).join('');
  const m = /^\s*\*?\[([^\]]+)\]\*?\s+(\S[\s\S]*)$/u.exec(stripped);
  if (!m) return undefined;
  return {
    appName: unescapeSlack((m[1] ?? '').trim()),
    service: undefined,
    severity: 'ERROR',
    kind: classify(unescapeSlack(m[2] ?? ''))
  };
}

function stripFence(text: string): string {
  const fenced = /```([\s\S]*?)```/u.exec(text);
  return (fenced?.[1] ?? text).replace(/^\n+/, '').replace(/\n+$/, '');
}

function textOf(block: unknown): string {
  if (!block || typeof block !== 'object') return '';
  const b = block as {text?: {text?: unknown}; elements?: unknown};
  if (typeof b.text?.text === 'string') return b.text.text;
  if (Array.isArray(b.elements)) {
    return b.elements
      .map(el =>
        el && typeof el === 'object' && typeof (el as {text?: unknown}).text === 'string'
          ? (el as {text: string}).text
          : ''
      )
      .join(' ');
  }
  return '';
}

function projectIdFrom(logsUrl: string | undefined): string | undefined {
  if (!logsUrl) return undefined;
  try {
    const value = new URL(logsUrl).searchParams.get('project');
    return value ? value : undefined;
  } catch {
    return undefined;
  }
}

interface Meta {
  totalCount: number;
  suppressed: number;
  firstSeenMinutesAgo: number | undefined;
  windowMinutes: number | undefined;
  logsUrl: string | undefined;
}

export function parseMeta(text: string): Meta {
  const count = COUNT_RE.exec(text);
  const suppressed = SUPPRESSED_RE.exec(text);
  const firstSeen = FIRST_SEEN_RE.exec(text);
  const window = WINDOW_RE.exec(text);
  const link = LINK_RE.exec(text) ?? BARE_URL_RE.exec(text);
  return {
    // 'first occurrence' carries no number; the sender means exactly one.
    totalCount: count ? Number(count[1]) : 1,
    suppressed: suppressed ? Number(suppressed[1]) : 0,
    firstSeenMinutesAgo: firstSeen ? Number(firstSeen[1]) : undefined,
    windowMinutes: window ? Number(window[1]) : undefined,
    logsUrl: link ? link[1] : undefined
  };
}

export function parseAlert(message: SlackMessageLike): ParseResult {
  const blocks = Array.isArray(message.blocks) ? message.blocks : [];
  const blockTexts = blocks.map(textOf);
  const fallbackText = typeof message.text === 'string' ? message.text : '';
  if (!blockTexts.some(t => t) && !fallbackText) return {ok: false, reason: 'no_content'};

  const headerText = blockTexts[0] || fallbackText;
  const full = parseHeader(headerText);
  const header = full ?? parseShortHeader(headerText);
  if (!header) return {ok: false, reason: 'no_header'};

  const source: ParsedAlert['source'] = !full
    ? 'short'
    : blockTexts.some(t => t)
      ? 'blocks'
      : 'text';

  let body: string;
  if (source === 'short') {
    let stripped = headerText;
    for (const icon of ICONS) stripped = stripped.split(icon).join('');
    body = /^\s*\*?\[[^\]]+\]\*?\s+([\s\S]*)$/u.exec(stripped)?.[1] ?? '';
  } else if (source === 'blocks') {
    // blocks[1] holds the fenced snippet. Fall back to scanning every block so a
    // future extra block ahead of it does not break parsing outright.
    const fenced = blockTexts.slice(1).find(t => t.includes('```'));
    body = stripFence(fenced ?? '');
  } else {
    // Rendered text: the snippet is glued straight onto the header, no separator.
    body = headerText.slice((HEADER_RE.exec(headerText)?.index ?? 0) + (HEADER_RE.exec(headerText)?.[0].length ?? 0));
    for (const icon of ICONS) body = body.split(icon).join('');
  }
  const messageText = unescapeSlack(body).trim();
  if (!messageText) return {ok: false, reason: 'no_message'};

  const meta = parseMeta(blockTexts.slice(1).join('\n') || fallbackText);
  const isJob = header.service?.startsWith('job:') ?? false;

  return {
    ok: true,
    alert: {
      appName: header.appName,
      service: header.service,
      serviceName: isJob ? header.service!.slice(4) : header.service,
      isJob,
      severity: header.severity,
      kind: header.kind,
      message: messageText,
      totalCount: meta.totalCount,
      suppressed: meta.suppressed,
      firstSeenMinutesAgo: meta.firstSeenMinutesAgo,
      windowMinutes: meta.windowMinutes,
      logsUrl: meta.logsUrl,
      projectId: projectIdFrom(meta.logsUrl),
      source
    }
  };
}
