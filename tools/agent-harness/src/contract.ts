import {isAbsolute} from 'node:path';

export interface VerifyCommand {
  name: string;
  cmd: string[];
  timeoutMs?: number;
}

export interface Contract {
  id: string;
  source: string;
  goal: string;
  /** Absolute worktree path. */
  repoPath: string;
  /** Commit the worktree was cut from. HEAD must still be here: the agent never commits, open-mr does. */
  baseSha: string;
  /** Repo-relative files, or dirs ending with '/', the diff may touch. */
  allow: string[];
  /** Postconditions; each must exit 0. */
  verify: VerifyCommand[];
  /** When set, the new tests must FAIL with the source changes reverted (jest only). */
  reproduce?: {testCmd: string[]};
  security?: {appName: string; model?: string};
}

type Parsed = {ok: true; contract: Contract} | {ok: false; error: string};

const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string' && x.length > 0);

/**
 * A contract is written before the agent runs, so the agent cannot move its own goalposts.
 * Validation only — no defaults are invented here: a missing postcondition is an error,
 * because "no check" is exactly the silent pass this harness exists to prevent.
 */
export function parseContract(raw: unknown): Parsed {
  const c = raw as Partial<Contract> | null;
  if (!c || typeof c !== 'object') return {ok: false, error: 'contract must be an object'};
  // The id becomes a file name and a ledger key.
  if (typeof c.id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(c.id) || c.id.includes('..')) {
    return {ok: false, error: 'id: [A-Za-z0-9._-]+ only'};
  }
  for (const k of ['source', 'goal'] as const) {
    if (typeof c[k] !== 'string' || !c[k]) return {ok: false, error: `${k}: required`};
  }
  if (typeof c.repoPath !== 'string' || !isAbsolute(c.repoPath)) {
    return {ok: false, error: 'repoPath: absolute path required'};
  }
  if (typeof c.baseSha !== 'string' || !/^[0-9a-f]{40}$/.test(c.baseSha)) {
    return {ok: false, error: 'baseSha: full 40-hex commit sha required'};
  }
  if (!isStrArray(c.allow)) return {ok: false, error: 'allow: at least one path required'};
  if (c.allow.some(p => isAbsolute(p) || p.split('/').includes('..'))) {
    return {ok: false, error: 'allow: repo-relative paths only'};
  }
  if (!Array.isArray(c.verify) || c.verify.length === 0) {
    return {ok: false, error: 'verify: at least one postcondition command is required'};
  }
  for (const v of c.verify) {
    // argv, never a shell string: the contract is data and must not smuggle a pipeline.
    if (!v || typeof v.name !== 'string' || !v.name || !isStrArray(v.cmd)) {
      return {ok: false, error: 'verify: each entry needs name and cmd as a non-empty string array'};
    }
  }
  if (c.reproduce !== undefined && !isStrArray(c.reproduce?.testCmd)) {
    return {ok: false, error: 'reproduce.testCmd: string array required'};
  }
  if (c.security !== undefined && (typeof c.security?.appName !== 'string' || !c.security.appName)) {
    return {ok: false, error: 'security.appName: required'};
  }
  return {ok: true, contract: c as Contract};
}
