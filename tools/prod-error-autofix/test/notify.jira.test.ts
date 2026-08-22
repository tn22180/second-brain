import {describe, expect, test} from 'bun:test';
import {
  addComment,
  assertProjectFal,
  buildIssuePayload,
  createIssue,
  falconAppFor,
  issueUrl,
  ISSUE_TYPE_BUG,
  NotFalError,
  type Fetcher,
  type IssueInput,
  type JiraConfig
} from '../src/notify/jira';

const CFG: JiraConfig = {baseUrl: 'https://space.avada.net/', token: 'pat-not-a-real-token'};

const INPUT: IssueInput = {
  issuetypeId: ISSUE_TYPE_BUG,
  summary: '[BUG][APC] /extension/flow/* khong auth',
  description: 'handlers/extension/index.js:16-18 has no auth middleware.',
  appName: 'APC',
  priorityName: 'High',
  assignees: ['tuannv']
};

/** Records what was sent so the assertions can read the real request, not a mock's promise. */
function recorder(status: number, body: string) {
  const calls: {url: string; init: RequestInit}[] = [];
  const fetchImpl: Fetcher = async (url, init) => {
    calls.push({url, init});
    return {ok: status >= 200 && status < 300, status, text: async () => body};
  };
  return {calls, fetchImpl};
}

describe('buildIssuePayload', () => {
  test('project is FAL and the Falcon App option is the Jira spelling, not the registry one', () => {
    const p = buildIssuePayload({...INPUT, appName: 'BLOG'});
    expect((p.fields.project as {key: string}).key).toBe('FAL');
    expect(p.fields.customfield_11203).toEqual({value: 'Blog'});
    expect(p.fields.customfield_10700).toEqual([{name: 'tuannv'}]);
    expect(p.fields.priority).toEqual({name: 'High'});
  });

  test('IMG-OPT has no Falcon App option, so the field is omitted rather than guessed', () => {
    expect(falconAppFor('IMG-OPT')).toBeUndefined();
    const p = buildIssuePayload({...INPUT, appName: 'IMG-OPT'});
    expect(p.fields.customfield_11203).toBeUndefined();
    expect((p.fields.project as {key: string}).key).toBe('FAL');
  });

  test('no assignee means the field is absent, not an empty array Jira would reject', () => {
    const p = buildIssuePayload({...INPUT, assignees: []});
    expect(p.fields.customfield_10700).toBeUndefined();
  });

  test('a secret quoted inside a finding is redacted before it can reach Jira', () => {
    const p = buildIssuePayload({
      ...INPUT,
      description: 'const key = "glpat-<fixture>";'
    });
    expect(p.fields.description).toBe('const key = "<redacted>";');
  });

  test('an empty summary is refused', () => {
    expect(() => buildIssuePayload({...INPUT, summary: '   '})).toThrow('MISSING_SUMMARY');
  });
});

describe('assertProjectFal', () => {
  test('refuses any project that is not FAL, before a request exists', () => {
    expect(() => assertProjectFal({fields: {project: {key: 'SEO'}}})).toThrow(NotFalError);
    expect(() => assertProjectFal({fields: {}})).toThrow(NotFalError);
  });
});

describe('createIssue', () => {
  test('posts to the v2 issue endpoint with a Bearer token and returns the key', async () => {
    const {calls, fetchImpl} = recorder(201, JSON.stringify({key: 'FAL-999'}));
    const res = await createIssue(CFG, INPUT, fetchImpl);

    expect(res).toEqual({ok: true, key: 'FAL-999', detail: undefined});
    // The trailing slash on baseUrl must not produce a double slash.
    expect(calls[0]!.url).toBe('https://space.avada.net/rest/api/2/issue');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer pat-not-a-real-token');
  });

  test('a rejected request is returned, never thrown, and carries Jira\'s reason', async () => {
    const {fetchImpl} = recorder(400, '{"errors":{"customfield_11203":"invalid option"}}');
    const res = await createIssue(CFG, INPUT, fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.key).toBeUndefined();
    expect(res.detail).toContain('HTTP 400');
    expect(res.detail).toContain('customfield_11203');
  });

  test('a network failure degrades the run instead of ending it', async () => {
    const fetchImpl: Fetcher = async () => {
      throw new Error('ECONNREFUSED');
    };
    const res = await createIssue(CFG, INPUT, fetchImpl);
    expect(res).toEqual({ok: false, key: undefined, detail: 'ECONNREFUSED'});
  });

  test('a 200 with no key is a failure, not a silently ticketed finding', async () => {
    const {fetchImpl} = recorder(200, '{}');
    const res = await createIssue(CFG, INPUT, fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.detail).toBe('response carried no issue key');
  });

  test('a bad payload fails before any request is made', async () => {
    const {calls, fetchImpl} = recorder(201, '{"key":"FAL-1"}');
    const res = await createIssue(CFG, {...INPUT, summary: ''}, fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('MISSING_SUMMARY');
    expect(calls).toHaveLength(0);
  });
});

describe('addComment', () => {
  test('comments on the named issue and redacts the body', async () => {
    const {calls, fetchImpl} = recorder(201, '{"id":"1"}');
    const res = await addComment(CFG, 'FAL-720', 'still open, token glpat-<fixture>', fetchImpl);

    expect(res.ok).toBe(true);
    expect(calls[0]!.url).toBe('https://space.avada.net/rest/api/2/issue/FAL-720/comment');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({body: 'still open, token <redacted>'});
  });

  test('a failure is returned so a carried finding is not marked as commented', async () => {
    const {fetchImpl} = recorder(404, 'no such issue');
    const res = await addComment(CFG, 'FAL-000', 'x', fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('HTTP 404');
  });
});

test('issueUrl does not double the slash', () => {
  expect(issueUrl(CFG, 'FAL-720')).toBe('https://space.avada.net/browse/FAL-720');
});
