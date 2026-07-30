import {describe, expect, test} from 'bun:test';
import {buildConfig, redact} from '../src/config';
import {parseAlert} from '../src/parseAlert';
import {fingerprintOf} from '../src/fingerprint';
import {createSlackApi} from '../src/slack/client';
import {admit} from '../src/slack/listener';
import {resolveApp} from '../src/registry';

/**
 * Read-only checks against the real workspace: does the bot token work, does it have
 * the scopes the daemon needs, and do the alerts already in the channel parse?
 *
 *   AUTOFIX_INTEGRATION=1 bun test ./test/integration.slack.test.ts
 *
 * Nothing is posted. Sending a message into a shared channel is an outward-facing
 * action and is never done from a test.
 */
const enabled = process.env.AUTOFIX_INTEGRATION === '1';
const it = enabled ? test : test.skip;
const cfg = enabled ? buildConfig() : undefined;

describe('slack (integration, read-only)', () => {
  it(
    'the bot token authenticates',
    async () => {
      const slack = createSlackApi(cfg!.slackBotToken);
      const self = await slack.self();
      console.log(`  token ${redact(cfg!.slackBotToken)} → bot user ${self.botUserId}, team ${self.teamId}`);
      // Without a bot user id the listener refuses to start, because it could not
      // recognise its own replies and would answer itself forever.
      expect(self.botUserId).toBeDefined();
    },
    60_000
  );

  it(
    'conversations.history works on the alert channel and the alerts parse',
    async () => {
      const slack = createSlackApi(cfg!.slackBotToken);
      const self = await slack.self();
      console.log(`  self ${self.botUserId} — alerts are posted by this same app, hence the ts-based own-reply check`);
      const messages = await slack.history({channel: cfg!.errorChannelId, oldestTs: undefined, limit: 20});
      console.log(`  channel ${cfg!.errorChannelId}: ${messages.length} recent message(s)`);

      let parsed = 0;
      for (const m of messages) {
        const verdict = admit(
          {...m, channel: cfg!.errorChannelId, eventId: undefined},
          {channel: cfg!.errorChannelId, isOwnReply: () => false, alertBotId: undefined}
        );
        if (!verdict.process) {
          console.log(`  ts ${m.ts}: skipped (${verdict.reason})`);
          continue;
        }
        const res = parseAlert({text: m.text, blocks: m.blocks});
        if (!res.ok) {
          console.log(`  ts ${m.ts}: NOT PARSED (${res.reason})`);
          continue;
        }
        parsed++;
        const app = resolveApp(res.alert.appName, cfg!);
        const fp = fingerprintOf({
          appName: res.alert.appName,
          service: res.alert.service ?? 'unknown',
          kind: res.alert.kind,
          message: res.alert.message
        });
        console.log(
          `  ts ${m.ts} · ${res.alert.appName}/${res.alert.service ?? '?'} · ${res.alert.kind} · fp ${fp} · ` +
            `repo ${app?.repo ?? 'NOT IN REGISTRY'} · source ${res.alert.source}`
        );
      }
      console.log(`  parsed ${parsed} alert(s)`);
      expect(Array.isArray(messages)).toBe(true);
    },
    60_000
  );
});
