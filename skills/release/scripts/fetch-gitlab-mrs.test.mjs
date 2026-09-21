// Test phần NẠP CẤU HÌNH của fetch-gitlab-mrs.sh (cờ --check-env, không gọi mạng).
// Bug từng có: `export $(grep ... | xargs)` nạp cả dòng rỗng `GITLAB_TOKEN=` từ .env,
// đè giá trị đã set qua `env` của ~/.claude/settings.json → báo thiếu token dù đã điền.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Dựng bản sao skill trong tmp để .env giả không đụng .env thật của dev. */
function fakeSkill(envFileBody) {
  const root = mkdtempSync(join(tmpdir(), 'release-skill-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(HERE, 'fetch-gitlab-mrs.sh'), join(root, 'scripts', 'fetch-gitlab-mrs.sh'));
  if (envFileBody !== null) writeFileSync(join(root, '.env'), envFileBody);
  return root;
}

/** Chạy script với env sạch (chỉ PATH + biến truyền vào) → { code, out }. */
function run(root, env) {
  try {
    const out = execFileSync('bash', [join(root, 'scripts', 'fetch-gitlab-mrs.sh'), '--check-env'], {
      env: { PATH: process.env.PATH, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

test('.env đủ token, không có biến môi trường → dùng .env', () => {
  const root = fakeSkill('GITLAB_TOKEN=glpat-file\nGITLAB_PROJECT_ID=111\n');
  const r = run(root, {});
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GITLAB_PROJECT_ID=111/);
  rmSync(root, { recursive: true, force: true });
});

test('biến môi trường thắng .env (settings.json là nguồn chính)', () => {
  const root = fakeSkill('GITLAB_TOKEN=glpat-file\nGITLAB_PROJECT_ID=111\n');
  const r = run(root, { GITLAB_TOKEN: 'glpat-env', GITLAB_PROJECT_ID: '222' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GITLAB_PROJECT_ID=222/);
  rmSync(root, { recursive: true, force: true });
});

test('REGRESSION: .env cũ với dòng rỗng KHÔNG đè giá trị từ môi trường', () => {
  const root = fakeSkill('GITLAB_TOKEN=\nGITLAB_PROJECT_ID=\n');
  const r = run(root, { GITLAB_TOKEN: 'glpat-env', GITLAB_PROJECT_ID: '333' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GITLAB_PROJECT_ID=333/);
  rmSync(root, { recursive: true, force: true });
});

test('không có .env, chỉ có biến môi trường → chạy được', () => {
  const root = fakeSkill(null);
  const r = run(root, { GITLAB_TOKEN: 'glpat-env', GITLAB_PROJECT_ID: '444' });
  assert.equal(r.code, 0, r.out);
  rmSync(root, { recursive: true, force: true });
});

test('.env nạp bù phần thiếu: PROJECT_ID từ file, TOKEN từ môi trường', () => {
  const root = fakeSkill('GITLAB_PROJECT_ID=555\n');
  const r = run(root, { GITLAB_TOKEN: 'glpat-env' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GITLAB_PROJECT_ID=555/);
  rmSync(root, { recursive: true, force: true });
});

test('.env có nháy + khoảng trắng → strip đúng', () => {
  const root = fakeSkill('GITLAB_TOKEN = "glpat-quoted" \nGITLAB_PROJECT_ID=\'666\'\n');
  const r = run(root, {});
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /GITLAB_PROJECT_ID=666/);
  rmSync(root, { recursive: true, force: true });
});

test('thiếu hoàn toàn → exit 1, thông báo chỉ sang settings.json TRƯỚC .env', () => {
  const root = fakeSkill(null);
  const r = run(root, {});
  assert.equal(r.code, 1);
  assert.match(r.out, /settings\.json/);
  assert.ok(r.out.indexOf('settings.json') < r.out.indexOf('.env'), 'settings.json phải đứng trước');
  rmSync(root, { recursive: true, force: true });
});
