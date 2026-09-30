import {describe, expect, test} from 'bun:test';
import {parseContract} from '../src/contract';

const base = {
  id: 'FAL-720-g1', source: 'jira-fix', goal: 'bind integration key to shop',
  repoPath: '/tmp/wt/apc-FAL-720', allow: ['packages/functions/src/a.js'],
  verify: [{name: 'jest', cmd: ['npx', 'jest', '--ci', 'a.test.js']}]
};

describe('parseContract', () => {
  test('accepts a minimal contract', () => {
    const r = parseContract(base);
    expect(r.ok).toBe(true);
  });
  test('rejects a contract with no postcondition', () => {
    const r = parseContract({...base, verify: []});
    expect(r).toEqual({ok: false, error: 'verify: at least one postcondition command is required'});
  });
  test('rejects empty allow', () => {
    expect(parseContract({...base, allow: []}).ok).toBe(false);
  });
  test('rejects relative repoPath', () => {
    expect(parseContract({...base, repoPath: 'wt/x'}).ok).toBe(false);
  });
  test('rejects id with path characters', () => {
    expect(parseContract({...base, id: '../x'}).ok).toBe(false);
  });
  test('rejects a command given as a shell string', () => {
    expect(parseContract({...base, verify: [{name: 'x', cmd: 'npx jest'}]}).ok).toBe(false);
  });
  test('rejects allow entries escaping the repo', () => {
    expect(parseContract({...base, allow: ['../secrets.env']}).ok).toBe(false);
    expect(parseContract({...base, allow: ['/etc/passwd']}).ok).toBe(false);
  });
});
