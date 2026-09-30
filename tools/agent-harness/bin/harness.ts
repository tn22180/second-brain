#!/usr/bin/env bun
// Exit codes are the contract jira-fix relies on: 0 pass · 1 fail / unknown run · 2 usage or bad contract.
import {readFileSync, writeFileSync} from 'node:fs';
import {parseContract} from '../src/contract';
import {openLedger, type Decision} from '../src/ledger';
import {formatVerdict, notifyTelegram} from '../src/notify';
import {parseGraph} from '../src/graph';
import {learn, learnReport} from '../src/learn';
import {runGraph} from '../src/run-graph';
import {verify} from '../src/verify';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n: string) => rest.includes(`--${n}`);
const opt = (n: string) => {
  const i = rest.indexOf(`--${n}`);
  return i > -1 ? rest[i + 1] : undefined;
};
const usage = (msg: string): never => {
  console.error(msg);
  process.exit(2);
};

if (cmd === 'verify') {
  const file = rest[0];
  const out = opt('out');
  if (!file || !out) usage('usage: harness verify <contract.json> --out <verdict.json> [--claimed-done] [--no-notify]');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file!, 'utf8'));
  } catch (e) {
    usage(`contract unreadable: ${(e as Error).message}`);
  }
  const parsed = parseContract(raw);
  if (!parsed.ok) usage(`contract invalid: ${parsed.error}`);
  const contract = (parsed as Extract<typeof parsed, {ok: true}>).contract;
  const v = await verify(contract);
  // Ledger first: it is what open-mr trusts. A verdict file with no ledger row is refused anyway.
  const ledger = openLedger();
  ledger.recordVerdict(v, contract, flag('claimed-done'));
  ledger.close();
  writeFileSync(out!, JSON.stringify(v, null, 2));
  const text = formatVerdict(v, contract.goal);
  console.log(text);
  if (!flag('no-notify')) await notifyTelegram(text);
  process.exit(v.pass ? 0 : 1);
}

if (cmd === 'decide') {
  const [runId, d] = rest;
  if (!runId || (d !== 'approved' && d !== 'rejected')) usage('usage: harness decide <runId> approved|rejected');
  const ledger = openLedger();
  const ok = ledger.recordDecision(runId!, d as Decision);
  ledger.close();
  if (!ok) {
    console.error(`unknown runId ${runId}`);
    process.exit(1);
  }
  process.exit(0);
}

// open-mr.mjs asks this instead of trusting verdict.json, which the agent can write itself.
if (cmd === 'check') {
  const [runId, sha] = rest;
  if (!runId || !sha) usage('usage: harness check <runId> <treeSha>');
  const ledger = openLedger();
  const ok = ledger.passed(runId!, sha!);
  ledger.close();
  if (!ok) console.error(`no passing run ${runId} for tree ${sha}`);
  process.exit(ok ? 0 : 1);
}

if (cmd === 'stats') {
  const rawDays = opt('days') ?? '30';
  if (!/^[1-9]\d*$/.test(rawDays)) usage(`--days must be a positive integer, got: ${rawDays}`);
  const days = Number(rawDays);
  const ledger = openLedger();
  console.log(JSON.stringify(ledger.stats(Date.now() - days * 86_400_000), null, 2));
  ledger.close();
  process.exit(0);
}

// Advice only: writes a report and DMs a count. Nothing here edits a skill.
if (cmd === 'learn') {
  const rawDays = opt('days') ?? '14';
  if (!/^[1-9]\d*$/.test(rawDays)) usage(`--days must be a positive integer, got: ${rawDays}`);
  const out = opt('out');
  if (!out) usage('usage: harness learn --out <report.md> [--days N] [--no-notify]');
  const days = Number(rawDays);
  const ledger = openLedger();
  const l = learn(ledger.learnRows(Date.now() - days * 86_400_000));
  ledger.close();
  writeFileSync(out!, learnReport(l, days));
  const summary = l.note ?? `${l.proposals.length} proposal(s)`;
  console.log(`${summary} → ${out}`);
  if (!flag('no-notify')) await notifyTelegram(`<b>harness learn</b>\n${summary.replace(/&/g, '&amp;').replace(/</g, '&lt;')} · ${out}`);
  process.exit(0);
}

if (cmd === 'graph') {
  const [sub, arg] = rest;
  if (sub === 'status' && arg) {
    const ledger = openLedger();
    console.log(JSON.stringify(ledger.graphNodes(arg), null, 2));
    ledger.close();
    process.exit(0);
  }
  if (sub !== 'run' || !arg) usage('usage: harness graph run <graph.json> | graph status <graphId>');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(arg!, 'utf8'));
  } catch (e) {
    usage(`graph unreadable: ${(e as Error).message}`);
  }
  const parsed = parseGraph(raw);
  if (!parsed.ok) usage(`graph invalid: ${parsed.error}`);
  const graph = (parsed as Extract<typeof parsed, {ok: true}>).graph;
  const ledger = openLedger();
  const res = await runGraph(graph, {ledger, notify: async t => void (flag('no-notify') || (await notifyTelegram(t)))});
  ledger.close();
  console.log(JSON.stringify({...res.outcomes, integration: res.integration}, null, 2));
  process.exit(Object.values(res.outcomes).every(s => s === 'done') ? 0 : 1);
}

usage('usage: harness verify|check|decide|stats|graph|learn');
