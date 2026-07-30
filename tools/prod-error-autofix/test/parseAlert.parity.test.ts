import {beforeAll, describe, expect, test} from 'bun:test';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {buildConfig} from '../src/config';
import {classify, fingerprintOf} from '../src/fingerprint';
import {parseAlert} from '../src/parseAlert';

/**
 * Round-trip test. Payloads are built by the real `buildSlackPayload` from the
 * alerting lib on disk, then parsed back. Any field the sender adds or renames
 * shows up here as a failure instead of as a daemon that silently stops matching.
 */
const LIB_SRC = join(
  buildConfig({SLACK_BOT_TOKEN: 'x', SLACK_ERROR_CHANNEL_ID: 'x'}).paths.reposRoot,
  'avada-prod-error-alert',
  'src',
  'buildSlackPayload.js'
);

type BuildSlackPayload = (input: {
  appName: string;
  service: string;
  severity: string;
  kind: 'app' | 'infra';
  message: string;
  totalCount: number;
  suppressed: number;
  firstSeenMs: number;
  nowMs: number;
  windowMs: number;
  logsUrl: string;
}) => {text: string; blocks: unknown[]};

let build: BuildSlackPayload;

/** Mirrors logsUrlFor in createErrorAlertHandler.js:9-13. */
function logsUrlFor(projectId: string, service: string): string {
  const svc = service.startsWith('job:') ? service.slice(4) : service;
  const query = `resource.labels.service_name="${svc}"\nseverity>=ERROR`;
  return `https://console.cloud.google.com/logs/query;query=${encodeURIComponent(query)}?project=${projectId}`;
}

const NOW = 1_753_800_000_000;

function payload(over: Partial<Parameters<BuildSlackPayload>[0]> = {}) {
  const base = {
    appName: 'BLOG',
    service: 'api',
    severity: 'ERROR',
    kind: 'app' as const,
    message: 'app error[seoProxyApi] flip-sky.myshopify.com AxiosError: Request failed with status code 403',
    totalCount: 1,
    suppressed: 0,
    firstSeenMs: NOW,
    nowMs: NOW,
    windowMs: 600_000,
    logsUrl: logsUrlFor('avada-blog-app', over.service ?? 'api')
  };
  return build({...base, ...over});
}

beforeAll(async () => {
  expect(existsSync(LIB_SRC)).toBe(true);
  const mod = (await import(LIB_SRC)) as {default: BuildSlackPayload};
  build = mod.default;
});

describe('parseAlert round-trips buildSlackPayload', () => {
  test('first occurrence, app error', () => {
    const res = parseAlert(payload());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alert).toMatchObject({
      appName: 'BLOG',
      service: 'api',
      serviceName: 'api',
      isJob: false,
      severity: 'ERROR',
      kind: 'app',
      totalCount: 1,
      suppressed: 0,
      windowMinutes: 10,
      firstSeenMinutesAgo: 0,
      projectId: 'avada-blog-app',
      source: 'blocks'
    });
    expect(res.alert.message).toBe(
      'app error[seoProxyApi] flip-sky.myshopify.com AxiosError: Request failed with status code 403'
    );
  });

  test('repeat burst carries count and suppressed', () => {
    const res = parseAlert(payload({totalCount: 54, suppressed: 12, firstSeenMs: NOW - 3 * 60_000}));
    expect(res.ok && res.alert.totalCount).toBe(54);
    expect(res.ok && res.alert.suppressed).toBe(12);
    expect(res.ok && res.alert.firstSeenMinutesAgo).toBe(3);
  });

  test('infra kind survives, even when the snippet is cut before the infra pattern', () => {
    // The sender classifies the full message; we only receive its first 700 chars.
    const message = `${'padding text '.repeat(60)}Memory limit of 1024 MiB exceeded with 1046 MiB used`;
    expect(message.length).toBeGreaterThan(700);
    const res = parseAlert(payload({kind: 'infra', message}));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alert.kind).toBe('infra');
    // Proof the tag is load-bearing: re-classifying the truncated snippet is wrong.
    expect(classify(res.alert.message)).toBe('app');
  });

  test('cloud run job service keeps the prefix but exposes the bare name', () => {
    const res = parseAlert(payload({service: 'job:image-optimization'}));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alert.service).toBe('job:image-optimization');
    expect(res.alert.serviceName).toBe('image-optimization');
    expect(res.alert.isJob).toBe(true);
  });

  test('escaped characters come back as written', () => {
    const message = 'expected <Buffer> & got "null" > limit';
    const res = parseAlert(payload({message}));
    expect(res.ok && res.alert.message).toBe(message);
  });

  test('app names and services are unescaped in the header too', () => {
    const res = parseAlert(payload({appName: 'A&B', service: 'api<v2>'}));
    expect(res.ok && res.alert.appName).toBe('A&B');
    expect(res.ok && res.alert.service).toBe('api<v2>');
  });

  test('parsed fields reproduce the sender fingerprint recipe', () => {
    const res = parseAlert(payload());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const {appName, service, kind, message} = res.alert;
    expect(fingerprintOf({appName, service: service!, kind, message})).toMatch(/^[0-9a-z]+$/);
  });

  test('every app in scope parses', () => {
    for (const appName of ['SEO', 'BLOG', 'APC', 'AEO', 'IMG-OPT']) {
      const res = parseAlert(payload({appName}));
      expect(res.ok && res.alert.appName).toBe(appName);
    }
  });
});

describe('parseAlert on degraded input', () => {
  test('parses the rendered text a human copies out of Slack', () => {
    // Verbatim from jobs/product-error-auto-fix.md.
    const text =
      ':red_circle: [BLOG] api  ·  ERROR  ·  app error[seoProxyApi] flip-sky.myshopify.com error https://seo.apps.avada.io AxiosError: Request failed with status code 403';
    const res = parseAlert({text});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alert).toMatchObject({appName: 'BLOG', service: 'api', kind: 'app', source: 'text'});
    expect(res.alert.message).toContain('AxiosError: Request failed with status code 403');
    expect(res.alert.logsUrl).toBeUndefined();
  });

  test('the short notification fallback still yields app and message', () => {
    const {text} = payload();
    const res = parseAlert({text});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alert).toMatchObject({appName: 'BLOG', service: undefined, source: 'short'});
    expect(res.alert.message).toContain('AxiosError');
  });

  test('a short parse re-derives kind, and says so via source', () => {
    // No tag in the text fallback, so classify() runs on the first line only.
    const infra = build({
      appName: 'SEO',
      service: 'api',
      severity: 'ERROR',
      kind: 'infra',
      message: 'Memory limit of 1024 MiB exceeded with 1046 MiB used',
      totalCount: 1,
      suppressed: 0,
      firstSeenMs: NOW,
      nowMs: NOW,
      windowMs: 600_000,
      logsUrl: logsUrlFor('avada-seo', 'api')
    });
    const res = parseAlert({text: infra.text});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alert.source).toBe('short');
    expect(res.alert.kind).toBe('infra');
  });

  test('non-alert chatter is rejected, not guessed at', () => {
    expect(parseAlert({text: 'deploy done'})).toEqual({ok: false, reason: 'no_header'});
    expect(parseAlert({})).toEqual({ok: false, reason: 'no_content'});
    expect(parseAlert({text: '[BLOG] api  ·  ERROR  ·  app error'})).toEqual({
      ok: false,
      reason: 'no_message'
    });
  });

  test('an extra block ahead of the snippet does not break parsing', () => {
    const p = payload();
    const banner = {type: 'section', text: {type: 'mrkdwn', text: 'sprint note'}};
    const res = parseAlert({...p, blocks: [p.blocks[0], banner, ...p.blocks.slice(1)]});
    expect(res.ok && res.alert.message).toContain('AxiosError');
  });
});
