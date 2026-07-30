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
    expect(cfg.caps).toMatchObject({maxConcurrentJobs: 1, mrPerHour: 5, mrPerRepoPerDay: 3, maxFixAttempts: 3});
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
});

describe('redact', () => {
  test('never returns the secret', () => {
    expect(redact('xoxb-supersecret-tail')).toBe('<redacted:tail>');
    expect(redact(undefined)).toBe('<unset>');
    expect(redact('ab')).toBe('<redacted>');
  });
});
