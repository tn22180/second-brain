import {describe, expect, test} from 'bun:test';
import {buildConfig} from '../src/config';
import {probeDeploy} from '../src/gcloud/deploy';
import {fetchLogs, summarize} from '../src/gcloud/logs';
import {probeMerge} from '../src/git/mergeProbe';
import {resolveApp} from '../src/registry';

/**
 * Hits real GCP and real git, read-only. Off by default so the normal suite stays
 * hermetic and fast:
 *
 *   AUTOFIX_INTEGRATION=1 bun test ./test/integration.probes.test.ts
 *
 * Everything here is a read. No writes, no deploys, no pushes.
 */
const enabled = process.env.AUTOFIX_INTEGRATION === '1';
const cfg = buildConfig({SLACK_BOT_TOKEN: 'x', SLACK_ERROR_CHANNEL_ID: 'x'});
const it = enabled ? test : test.skip;

describe('live probes (integration)', () => {
  it(
    'reads real error logs for BLOG api',
    async () => {
      const app = resolveApp('BLOG', cfg)!;
      const res = await fetchLogs({
        projectId: app.prodProject,
        service: 'api',
        alertTsMs: Date.now() - 6 * 60 * 60 * 1000,
        windowMs: 6 * 60 * 60 * 1000,
        limit: 3,
        timeoutMs: cfg.timeouts.gcloudMs
      });
      if (!res.ok) throw new Error(`fetchLogs failed: ${res.failure} — ${res.detail}`);
      console.log(`  BLOG/api last 12h: ${summarize(res.value)}`);
      expect(res.value.queries.length).toBe(3);
      const anyEntry = res.value.queries.flatMap(q => q.entries)[0];
      if (anyEntry) expect(typeof anyEntry.timestamp).toBe('string');
    },
    120_000
  );

  it(
    'reads the deploy time of a gen2 function and a gen1 function',
    async () => {
      const gen2 = await probeDeploy({
        projectId: 'avada-blog-app',
        serviceName: 'api',
        isJob: false,
        region: 'us-central1',
        timeoutMs: cfg.timeouts.gcloudMs
      });
      if (!gen2.ok) throw new Error(`gen2 probe failed: ${gen2.failure} — ${gen2.detail}`);
      console.log(`  BLOG/api deployed ${new Date(gen2.value.deployedAtMs!).toISOString()} via ${gen2.value.source}`);
      expect(gen2.value.deployedAtMs).toBeGreaterThan(0);

      const gen1 = await probeDeploy({
        projectId: 'seo-on-aeo',
        serviceName: 'proxy',
        isJob: false,
        region: 'us-central1',
        timeoutMs: cfg.timeouts.gcloudMs
      });
      if (!gen1.ok) throw new Error(`gen1 probe failed: ${gen1.failure} — ${gen1.detail}`);
      console.log(`  AEO/proxy deployed ${new Date(gen1.value.deployedAtMs!).toISOString()} via ${gen1.value.source}`);
      expect(gen1.value.source).toBe('functions.updateTime');
    },
    120_000
  );

  it(
    'a Cloud Run job yields a generation and no deploy timestamp',
    async () => {
      const res = await probeDeploy({
        projectId: 'avada-seo',
        serviceName: 'avada-seo-optimize-image-job',
        isJob: true,
        region: 'us-central1',
        timeoutMs: cfg.timeouts.gcloudMs
      });
      if (!res.ok) throw new Error(`job probe failed: ${res.failure} — ${res.detail}`);
      console.log(`  SEO job generation=${res.value.generation}`);
      expect(res.value.deployedAtMs).toBeUndefined();
      expect(res.value.generation).toBeGreaterThan(0);
    },
    120_000
  );

  it(
    'merge probe answers for a commit already on master',
    async () => {
      const app = resolveApp('BLOG', cfg)!;
      const head = Bun.spawnSync(['git', '-C', app.repoPath, 'rev-parse', 'origin/master~5']);
      const fixSha = new TextDecoder().decode(head.stdout).trim();
      expect(fixSha.length).toBeGreaterThan(0);

      const merged = await probeMerge({
        repoPath: app.repoPath,
        baseBranch: app.defaultBranch,
        fixSha,
        fixBranch: undefined,
        timeoutMs: 60_000
      });
      if (!merged.ok) throw new Error(`merge probe failed: ${merged.detail}`);
      console.log(
        `  ${fixSha.slice(0, 8)} merged=${merged.value.merged} landed=${merged.value.landedSha?.slice(0, 8)} at ${
          merged.value.mergedAtMs ? new Date(merged.value.mergedAtMs).toISOString() : 'n/a'
        }`
      );
      expect(merged.value.merged).toBe(true);
      expect(merged.value.mergedAtMs).toBeGreaterThan(0);
    },
    120_000
  );
});
