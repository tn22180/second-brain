import {describe, expect, test} from 'bun:test';
import {buildConfig, ConfigError, parseDotenv, redact} from '../src/config';

const base = {SLACK_BOT_TOKEN: 'xoxb-abc1234', SLACK_ERROR_CHANNEL_ID: 'C0PROD'};

describe('parseDotenv', () => {
  test('parses pairs, skips comments and blanks', () => {
    expect(
      parseDotenv(['# comment', '', 'A=1', 'B = two ', 'C="quoted"', "D='q2'", 'malformed'].join('\n'))
    ).toEqual({A: '1', B: 'two', C: 'quoted', D: 'q2'});
  });

  test('keeps $ and = inside a value — tokens are not templates', () => {
    expect(parseDotenv('T=xoxb-a$b=c/d')).toEqual({T: 'xoxb-a$b=c/d'});
  });
});

describe('buildConfig', () => {
  test('lists every missing key at once', () => {
    let err: unknown;
    try {
      buildConfig({});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).missing).toEqual(['SLACK_BOT_TOKEN', 'SLACK_ERROR_CHANNEL_ID']);
  });

  test('accepts SLACK_CHANNEL_ID as an alias', () => {
    const cfg = buildConfig({SLACK_BOT_TOKEN: 'xoxb-1', SLACK_CHANNEL_ID: 'C9'});
    expect(cfg.errorChannelId).toBe('C9');
  });

  test('no app token means poll transport, not a crash', () => {
    expect(buildConfig(base).transport).toBe('poll');
  });

  test('app token switches to socket', () => {
    expect(buildConfig({...base, SLACK_APP_TOKEN: 'xapp-1'}).transport).toBe('socket');
  });

  test('socket cannot be forced without an app token', () => {
    expect(buildConfig({...base, AUTOFIX_TRANSPORT: 'socket'}).transport).toBe('poll');
  });

  test('defaults match the agreed caps and models', () => {
    const cfg = buildConfig(base);
    expect(cfg.caps).toMatchObject({maxConcurrentJobs: 2, mrPerHour: 5, mrPerRepoPerDay: 3, maxFixAttempts: 3});
    expect(cfg.analyzeMaxRounds).toBe(5);
    expect(cfg.brainSliceTokenBudget).toBe(6000);
    expect(cfg.models.analyze).not.toBe(cfg.models.fix);
  });

  test('state lives outside the git repo', () => {
    const cfg = buildConfig(base);
    expect(cfg.paths.stateDb.includes(cfg.paths.projectRoot)).toBe(false);
    expect(cfg.paths.worktreeRoot.includes(cfg.paths.projectRoot)).toBe(false);
    expect(cfg.paths.brainRoot.startsWith(cfg.paths.projectRoot)).toBe(true);
  });

  test('numeric overrides are validated', () => {
    expect(() => buildConfig({...base, AUTOFIX_MR_PER_HOUR: 'lots'})).toThrow(/must be a number/);
    expect(buildConfig({...base, AUTOFIX_MR_PER_HOUR: '9'}).caps.mrPerHour).toBe(9);
  });

  test('the fix lane is off unless AUTOFIX_FIX_ENABLED says otherwise', () => {
    expect(buildConfig({...base}).fixEnabled).toBe(false);
    expect(buildConfig({...base, AUTOFIX_FIX_ENABLED: 'true'}).fixEnabled).toBe(true);
    expect(buildConfig({...base, AUTOFIX_FIX_ENABLED: 'false'}).fixEnabled).toBe(false);
  });

  test('the audit sweep is on by default, its MR lane is off', () => {
    const cfg = buildConfig(base);
    expect(cfg.audit.enabled).toBe(true);
    expect(cfg.audit.mrEnabled).toBe(false);
    expect(buildConfig({...base, AUDIT_ENABLED: 'false'}).audit.enabled).toBe(false);
    expect(buildConfig({...base, AUDIT_MR_ENABLED: 'true'}).audit.mrEnabled).toBe(true);
  });

  test('the Jira lane needs BOTH the flag and a token — either alone leaves it off', () => {
    expect(buildConfig(base).audit.jira).toBeUndefined();
    expect(buildConfig({...base, AUDIT_JIRA_ENABLED: 'true'}).audit.jira).toBeUndefined();
    expect(buildConfig({...base, JIRA_TOKEN: 'not-a-real-token'}).audit.jira).toBeUndefined();

    const on = buildConfig({...base, AUDIT_JIRA_ENABLED: 'true', JIRA_TOKEN: 'not-a-real-token'}).audit.jira;
    expect(on).toEqual({baseUrl: 'https://space.avada.net', token: 'not-a-real-token', assignees: []});
  });

  test('assignees is a comma list, and an empty one stays empty', () => {
    const jira = (env: Record<string, string>) =>
      buildConfig({...base, AUDIT_JIRA_ENABLED: 'true', JIRA_TOKEN: 'not-a-real-token', ...env}).audit.jira;
    expect(jira({AUDIT_JIRA_ASSIGNEE: 'tuannv'})!.assignees).toEqual(['tuannv']);
    expect(jira({AUDIT_JIRA_ASSIGNEE: ' tuannv , dungta '})!.assignees).toEqual(['tuannv', 'dungta']);
    expect(jira({AUDIT_JIRA_ASSIGNEE: ''})!.assignees).toEqual([]);
    expect(jira({JIRA_BASE_URL: 'https://jira.example'})!.baseUrl).toBe('https://jira.example');
  });

  test('audit models default to opus for security, sonnet for triage and supervisor', () => {
    const cfg = buildConfig(base);
    expect(cfg.audit.models).toEqual({security: 'claude-opus-5', triage: 'claude-sonnet-5', supervisor: 'claude-sonnet-5'});
    expect(buildConfig({...base, AUDIT_SECURITY_MODEL: 'x'}).audit.models.security).toBe('x');
  });

  test('audit timeouts default per the spec, security sized above the flat 15m for seo', () => {
    const cfg = buildConfig(base);
    expect(cfg.audit.timeouts).toEqual({
      securityMs: 20 * 60_000,
      triageMs: 6 * 60_000,
      supervisorMs: 5 * 60_000,
      eslintMs: 10 * 60_000,
      jobMs: 45 * 60_000,
      runMs: 150 * 60_000
    });
    expect(buildConfig({...base, AUDIT_SECURITY_TIMEOUT_MS: '999'}).audit.timeouts.securityMs).toBe(999);
  });

  test('the digest lands on Monday by default', () => {
    expect(buildConfig(base).audit.digestWeekday).toBe(1);
    expect(buildConfig({...base, AUDIT_DIGEST_WEEKDAY: '3'}).audit.digestWeekday).toBe(3);
  });
});

describe('redact', () => {
  test('never returns the secret', () => {
    expect(redact('xoxb-supersecret-tail')).toBe('<redacted:tail>');
    expect(redact(undefined)).toBe('<unset>');
    expect(redact('ab')).toBe('<redacted>');
  });
});
