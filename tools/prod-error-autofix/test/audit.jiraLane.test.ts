import {describe, expect, test} from 'bun:test';
import {
  buildComments,
  buildTicket,
  needsTicket,
  runJiraLane,
  type JiraLaneInput
} from '../src/audit/jiraLane';
import type {AuditFinding} from '../src/audit/ledger';
import type {AuditFindingRow} from '../src/state/store';
import type {CreateResult, IssueInput, JiraConfig} from '../src/notify/jira';

const CFG: JiraConfig = {baseUrl: 'https://space.avada.net', token: 'not-a-real-token'};

function finding(over: Partial<AuditFinding> & {fp: string}): AuditFinding {
  return {
    app: 'APC',
    kind: 'security',
    file: 'packages/functions/src/handlers/api.js',
    line: 64,
    rule: 'auth',
    title: 'session gate mounted after the swagger gate',
    severity: 'high',
    ...over
  };
}

function row(over: Partial<AuditFindingRow> & {fp: string}): AuditFindingRow {
  return {
    ...finding({fp: over.fp}),
    status: 'open',
    firstSeenMs: 1,
    lastSeenMs: 2,
    mrUrl: undefined,
    jiraKey: undefined,
    ...over
  };
}

function input(over: Partial<JiraLaneInput> = {}): JiraLaneInput {
  return {
    appName: 'APC',
    dateStr: '2026-08-22',
    fresh: [],
    carried: [],
    resolved: [],
    assignees: ['tuannv'],
    ...over
  };
}

describe('buildTicket', () => {
  test('nothing new means no ticket at all', () => {
    expect(buildTicket(input())).toBeUndefined();
    // Carried findings that already have a ticket are news for that ticket, not a new one.
    expect(buildTicket(input({carried: [row({fp: 'a', jiraKey: 'FAL-720'})]}))).toBeUndefined();
  });

  test('one ticket holds every fresh finding, not one ticket each', () => {
    const t = buildTicket(input({fresh: [finding({fp: 'a'}), finding({fp: 'b'}), finding({fp: 'c'})]}))!;
    expect(t.summary).toBe('[BUG][APC] Audit 2026-08-22: 3 phat hien security');
    expect(t.description).toContain('Moi (3):');
    expect(t.appName).toBe('APC');
    expect(t.assignees).toEqual(['tuannv']);
  });

  test('a carried finding with no ticket is folded in, or it would never get one', () => {
    // It is not fresh on any later day, so nothing else would ever pick it up.
    const t = buildTicket(input({fresh: [finding({fp: 'a'})], carried: [row({fp: 'old'})]}))!;
    expect(needsTicket(input({fresh: [finding({fp: 'a'})], carried: [row({fp: 'old'})]}))).toHaveLength(2);
    expect(t.summary).toContain('2 phat hien');
    expect(t.description).toContain('Ton tu truoc, chua tung co ticket (1):');
  });

  test('priority follows the worst severity in the ticket, not the first', () => {
    const low = buildTicket(input({fresh: [finding({fp: 'a', severity: 'low'})]}))!;
    expect(low.priorityName).toBe('Medium');

    const mixed = buildTicket(
      input({fresh: [finding({fp: 'a', severity: 'low'}), finding({fp: 'b', severity: 'high'})]})
    )!;
    expect(mixed.priorityName).toBe('Highest');
  });

  test('the summary carries the Jira board name, which is not the registry name', () => {
    const t = buildTicket(input({appName: 'IMG-OPT', fresh: [finding({fp: 'a'})]}))!;
    expect(t.summary).toBe('[BUG][Speed] Audit 2026-08-22: 1 phat hien security');
    // appName stays the registry one so the Falcon App field resolves the same way.
    expect(t.appName).toBe('IMG-OPT');
  });
});

describe('buildComments', () => {
  test('findings sharing a ticket share one comment', () => {
    const c = buildComments(
      input({
        carried: [row({fp: 'a', jiraKey: 'FAL-720'}), row({fp: 'b', jiraKey: 'FAL-720'})],
        resolved: [row({fp: 'c', jiraKey: 'FAL-720', status: 'resolved'})]
      })
    );
    expect([...c.keys()]).toEqual(['FAL-720']);
    const body = c.get('FAL-720')!;
    expect(body).toContain('Khong con phat hien (1):');
    expect(body).toContain('Van con (2):');
  });

  test('a resolved finding that was never ticketed produces no comment', () => {
    expect(buildComments(input({resolved: [row({fp: 'a', status: 'resolved'})]})).size).toBe(0);
  });

  test('two tickets get two comments', () => {
    const c = buildComments(
      input({carried: [row({fp: 'a', jiraKey: 'FAL-720'}), row({fp: 'b', jiraKey: 'FAL-721'})]})
    );
    expect([...c.keys()].sort()).toEqual(['FAL-720', 'FAL-721']);
  });
});

describe('runJiraLane', () => {
  function spies(create: CreateResult) {
    const created: IssueInput[] = [];
    const comments: {key: string; body: string}[] = [];
    return {
      created,
      comments,
      deps: {
        cfg: CFG,
        createIssue: async (_c: JiraConfig, i: IssueInput) => {
          created.push(i);
          return create;
        },
        addComment: async (_c: JiraConfig, key: string, body: string) => {
          comments.push({key, body});
          return {ok: true, detail: undefined};
        }
      }
    };
  }

  test('an empty diff posts nothing at all', async () => {
    const s = spies({ok: true, key: 'FAL-1', detail: undefined});
    const res = await runJiraLane(input(), s.deps);
    expect(s.created).toHaveLength(0);
    expect(s.comments).toHaveLength(0);
    expect(res.ticketKey).toBeUndefined();
    expect(res.ticketedFps).toEqual([]);
  });

  test('a created ticket returns the fps to stamp and its url', async () => {
    const s = spies({ok: true, key: 'FAL-900', detail: undefined});
    const res = await runJiraLane(input({fresh: [finding({fp: 'a'}), finding({fp: 'b'})]}), s.deps);
    expect(res.ticketKey).toBe('FAL-900');
    expect(res.ticketUrl).toBe('https://space.avada.net/browse/FAL-900');
    expect(res.ticketedFps).toEqual(['a', 'b']);
    expect(res.failures).toEqual([]);
  });

  test('a failed create stamps nothing, so tomorrow tries again instead of losing the finding', async () => {
    const s = spies({ok: false, key: undefined, detail: 'HTTP 400'});
    const res = await runJiraLane(input({fresh: [finding({fp: 'a'})]}), s.deps);
    expect(res.ticketKey).toBeUndefined();
    expect(res.ticketedFps).toEqual([]);
    expect(res.failures).toEqual(['create: HTTP 400']);
  });

  test('a failed comment does not stop the other comments', async () => {
    const comments: string[] = [];
    const res = await runJiraLane(
      input({carried: [row({fp: 'a', jiraKey: 'FAL-720'}), row({fp: 'b', jiraKey: 'FAL-721'})]}),
      {
        cfg: CFG,
        addComment: async (_c, key) => {
          comments.push(key);
          return key === 'FAL-720' ? {ok: false, detail: 'HTTP 404'} : {ok: true, detail: undefined};
        }
      }
    );
    expect(comments.sort()).toEqual(['FAL-720', 'FAL-721']);
    expect(res.commented).toEqual(['FAL-721']);
    expect(res.failures).toEqual(['comment FAL-720: HTTP 404']);
  });
});
