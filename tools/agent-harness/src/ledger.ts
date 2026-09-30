import {Database} from 'bun:sqlite';
import {mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import type {Contract} from './contract';
import type {Verdict} from './verify';

export type Decision = 'approved' | 'rejected';

export interface Stats {
  runs: number;
  claimedDone: number;
  /** Agent said done, verifier said no — the number that says whether a loop may trust "done". */
  falseDone: number;
  falseDoneRate: number | null;
  passed: number;
  approved: number;
  rejected: number;
  /** Distinct contracts with a claimed-done run. A run-level rate counts one stubborn task N times. */
  tasks: number;
  tasksFalseDone: number;
  taskFalseDoneRate: number | null;
}

export interface RunRow {
  run_id: string;
  contract_id: string;
  pass: number;
  claimed_done: number;
  agent: string | null;
  model: string | null;
  round: number | null;
  decision: string | null;
}

export const defaultLedgerPath = () =>
  process.env.AGENT_HARNESS_DB || join(homedir(), '.cache', 'agent-harness', 'ledger.db');

export class Ledger {
  constructor(private db: Database) {
    db.run(`CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      source TEXT NOT NULL,
      goal TEXT NOT NULL,
      at_ms INTEGER NOT NULL,
      claimed_done INTEGER NOT NULL,
      pass INTEGER NOT NULL,
      diff_sha TEXT NOT NULL,
      changed_json TEXT NOT NULL,
      checks_json TEXT NOT NULL,
      cost_usd REAL NOT NULL,
      decision TEXT,
      decided_ms INTEGER
    )`);
    const cols = new Set((db.query(`PRAGMA table_info(runs)`).all() as {name: string}[]).map(r => r.name));
    for (const [name, type] of [['agent', 'TEXT'], ['model', 'TEXT'], ['round', 'INTEGER']]) {
      if (!cols.has(name!)) db.run(`ALTER TABLE runs ADD COLUMN ${name} ${type}`);
    }
  }

  recordVerdict(v: Verdict, c: Contract, claimedDone: boolean): void {
    // PRIMARY KEY makes a replayed verdict throw instead of silently rewriting history.
    this.db.run(
      `INSERT INTO runs (run_id, contract_id, source, goal, at_ms, claimed_done, pass, diff_sha, changed_json, checks_json, cost_usd, agent, model, round)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.runId, c.id, c.source, c.goal, v.at, claimedDone ? 1 : 0, v.pass ? 1 : 0, v.diffSha,
        JSON.stringify(v.changed), JSON.stringify(v.checks), v.costUsd,
        c.meta?.agent ?? null, c.meta?.model ?? null, c.meta?.round ?? null]
    );
  }

  /** The push gate's question: did this run pass, on exactly this tree? */
  passed(runId: string, diffSha: string): boolean {
    const row = this.db.query(`SELECT 1 FROM runs WHERE run_id = ? AND diff_sha = ? AND pass = 1`).get(runId, diffSha);
    return row != null;
  }

  run(runId: string): RunRow | null {
    return (this.db
      .query(`SELECT run_id, contract_id, pass, claimed_done, agent, model, round, decision FROM runs WHERE run_id = ?`)
      .get(runId) as RunRow | null) ?? null;
  }

  recordDecision(runId: string, d: Decision, at = Date.now()): boolean {
    const r = this.db.run(`UPDATE runs SET decision = ?, decided_ms = ? WHERE run_id = ?`, [d, at, runId]);
    return r.changes === 1;
  }

  stats(sinceMs: number): Stats {
    const row = this.db
      .query(
        `SELECT COUNT(*) runs,
                COALESCE(SUM(claimed_done), 0) claimed,
                COALESCE(SUM(claimed_done = 1 AND pass = 0), 0) falseDone,
                COALESCE(SUM(pass), 0) passed,
                COALESCE(SUM(decision = 'approved'), 0) approved,
                COALESCE(SUM(decision = 'rejected'), 0) rejected
         FROM runs WHERE at_ms >= ?`
      )
      .get(sinceMs) as {runs: number; claimed: number; falseDone: number; passed: number; approved: number; rejected: number};
    const t = this.db
      .query(
        `SELECT COUNT(*) tasks, COALESCE(SUM(bad), 0) bad FROM (
           SELECT contract_id, MAX(pass = 0) bad FROM runs
           WHERE at_ms >= ? AND claimed_done = 1 GROUP BY contract_id)`
      )
      .get(sinceMs) as {tasks: number; bad: number};
    return {
      runs: row.runs,
      claimedDone: row.claimed,
      falseDone: row.falseDone,
      falseDoneRate: row.claimed ? row.falseDone / row.claimed : null,
      passed: row.passed,
      approved: row.approved,
      rejected: row.rejected,
      tasks: t.tasks,
      tasksFalseDone: t.bad,
      taskFalseDoneRate: t.tasks ? t.bad / t.tasks : null
    };
  }

  close() {
    this.db.close();
  }
}

export function openLedger(path = defaultLedgerPath()): Ledger {
  mkdirSync(dirname(path), {recursive: true});
  return new Ledger(new Database(path, {create: true}));
}
