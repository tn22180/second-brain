import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';

/**
 * Gate đứng trước `git push`: chỉ đẩy đúng index mà agent-harness đã tự verify
 * (second-brain/tools/agent-harness). So tree sha của index đã stage chứ không so danh sách
 * file — agent sửa thêm một dòng sau khi verify thì tên file vẫn y nguyên, chỉ nội dung đổi.
 * Tree sha thay vì hash text của `git diff`: bên này ghép stdout theo từng chunk, bên harness
 * decode cả buffer, một ký tự nhiều byte bị cắt đôi là hai bên lệch nhau dù diff y hệt.
 */
export function checkVerdict(verdict, stagedSha) {
  if (!verdict || typeof verdict !== 'object' || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(verdict.diffSha ?? '')) {
    return {ok: false, failure: 'unverified', detail: 'thiếu verdict hợp lệ từ agent-harness'};
  }
  if (verdict.pass !== true) {
    return {ok: false, failure: 'verify_failed', detail: `verdict ${verdict.runId} không pass`};
  }
  if (verdict.diffSha !== stagedSha) {
    return {ok: false, failure: 'diff_changed', detail: `index đã đổi sau khi verify (run ${verdict.runId}) — chạy lại harness verify`};
  }
  return {ok: true};
}

export async function stagedTreeSha(dir, gitFn) {
  const r = await gitFn(dir, ['write-tree'], {timeoutMs: 60_000});
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().slice(0, 300));
  return r.stdout.trim();
}

const DEFAULT_BUN = join(homedir(), '.bun', 'bin', 'bun');
const DEFAULT_BIN = process.env.AGENT_HARNESS_BIN || join(homedir(), 'Documents', 'second-brain', 'tools', 'agent-harness', 'bin', 'harness.ts');

/**
 * Hỏi ledger của agent-harness chứ không tin `verdict.json`: file đó agent tự ghi được, còn row
 * trong ledger chỉ `harness verify` ghi. Harness không chạy được = không qua (fail closed).
 */
export async function ledgerCheck(runId, treeSha, {bun = DEFAULT_BUN, bin = DEFAULT_BIN} = {}) {
  const r = spawnSync(bun, [bin, 'check', String(runId), String(treeSha)], {encoding: 'utf8', timeout: 60_000});
  if (r.status === 0) return {ok: true};
  const why = (r.stderr || r.stdout || r.error?.message || `exit ${r.status}`).trim().slice(0, 300);
  return {ok: false, failure: 'unverified', detail: `ledger agent-harness không có run pass cho index này: ${why}`};
}
