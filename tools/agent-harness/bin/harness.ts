#!/usr/bin/env bun
// Exit codes are the contract jira-fix relies on: 0 pass · 1 fail / unknown run · 2 usage or bad contract.
import {readFileSync, writeFileSync} from 'node:fs';
import {parseContract} from '../src/contract';
import {openLedger, type Decision} from '../src/ledger';
import {formatVerdict, notifyTelegram} from '../src/notify';
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
  writeFileSync(out!, JSON.stringify(v, null, 2));
  const ledger = openLedger();
  ledger.recordVerdict(v, contract, flag('claimed-done'));
  ledger.close();
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

if (cmd === 'stats') {
  const days = Number(opt('days') ?? 30);
  const ledger = openLedger();
  console.log(JSON.stringify(ledger.stats(Date.now() - days * 86_400_000), null, 2));
  ledger.close();
  process.exit(0);
}

usage('usage: harness verify|decide|stats');
