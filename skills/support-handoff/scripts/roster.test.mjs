import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filterRoster, byJiraUsername, mention, loadRoster, emailsOf, byEmail } from './roster.mjs';

const R = [
  { jiraUsername: 'lamln', name: 'Lâm', email: 'lamln@avadagroup.com', slackUid: 'U1', role: 'techlead', board: 'board1' },
  { jiraUsername: 'tuannv', name: 'Tuân', email: 'tuannv@avadagroup.com', emailAliases: ['tuannv@avada.email'], slackUid: 'U9', role: 'techlead', board: 'board1' },
  { jiraUsername: 'tranggt', name: 'Trang', slackUid: 'U2', role: 'tester', board: 'board1' },
  { jiraUsername: 'trangdt', name: 'Trang', slackUid: '', role: 'tester', board: 'board2' },
];

const tmpRoster = (name, body) => {
  const f = path.join(os.tmpdir(), `sh-roster-${name}-${process.pid}.json`);
  fs.writeFileSync(f, body);
  return f;
};

test('lọc theo role', () => {
  assert.deepEqual(filterRoster(R, { role: 'tester' }).map((x) => x.jiraUsername), ['tranggt', 'trangdt']);
});
test('lọc theo board + role', () => {
  assert.deepEqual(filterRoster(R, { role: 'techlead', board: 'board1' }).map((x) => x.jiraUsername), ['lamln', 'tuannv']);
});
test('không filter → nguyên list', () => {
  assert.equal(filterRoster(R, {}).length, 4);
});
test('tra theo jiraUsername phân biệt được tên trùng', () => {
  assert.equal(byJiraUsername(R, 'trangdt').board, 'board2');
  assert.equal(byJiraUsername(R, 'tranggt').board, 'board1');
});
test('không có username → null', () => {
  assert.equal(byJiraUsername(R, 'khongcoai'), null);
});
test('mention: có UID → <@UID>, rỗng → tên thường', () => {
  assert.equal(mention(R[0]), '<@U1>');
  assert.equal(mention(R[3]), 'Trang');
});

// --- loadRoster: file hỏng phải báo rõ, đừng ném lỗi JSON thô ---

test('loadRoster: JSON hỏng → ném ROSTER_INVALID', () => {
  const f = tmpRoster('badjson', '{ "members": [ broken json,,, ]');
  try { assert.throws(() => loadRoster(f), /ROSTER_INVALID/); } finally { fs.unlinkSync(f); }
});

test('loadRoster: không có mảng members → ném ROSTER_INVALID', () => {
  const f = tmpRoster('noarray', JSON.stringify([{ jiraUsername: 'lamln' }]));
  try { assert.throws(() => loadRoster(f), /ROSTER_INVALID/); } finally { fs.unlinkSync(f); }
});

test('loadRoster: thiếu field bắt buộc (role) → ném ROSTER_INVALID', () => {
  const f = tmpRoster('missingfield', JSON.stringify({ members: [{ jiraUsername: 'lamln', name: 'Lâm', slackUid: '', board: null }] }));
  try { assert.throws(() => loadRoster(f), /ROSTER_INVALID[\s\S]*role/); } finally { fs.unlinkSync(f); }
});

test('loadRoster: thiếu hẳn key slackUid → ném ROSTER_INVALID', () => {
  const f = tmpRoster('nokey', JSON.stringify({ members: [{ jiraUsername: 'lamln', name: 'Lâm', role: 'techlead', board: null }] }));
  try { assert.throws(() => loadRoster(f), /ROSTER_INVALID[\s\S]*slackUid/); } finally { fs.unlinkSync(f); }
});

test('loadRoster: slackUid rỗng và board null là HỢP LỆ, không được ném', () => {
  const f = tmpRoster('emptyok', JSON.stringify({ members: [{ jiraUsername: 'dungta', name: 'Dũng', role: 'designer', board: null, slackUid: '' }] }));
  try { assert.equal(loadRoster(f).length, 1); } finally { fs.unlinkSync(f); }
});

test('roster thật đọc được, đủ field, jiraUsername không trùng', () => {
  const all = loadRoster();
  assert.ok(all.length >= 19, 'roster phải có ít nhất 19 người');
  assert.equal(new Set(all.map((m) => m.jiraUsername)).size, all.length, 'jiraUsername bị trùng');
});

// --- email: người vào công ty trước đây đăng ký Slack bằng @avada.email, sau mới đổi
// sang @avadagroup.com. CẢ HAI đều đúng, tra người phải khớp cả hai. ---

test('emailsOf gộp email chính + alias, hạ chữ thường', () => {
  assert.deepEqual(emailsOf(R[0]), ['lamln@avadagroup.com']);
  assert.deepEqual(emailsOf(R[1]), ['tuannv@avadagroup.com', 'tuannv@avada.email']);
});

test('byEmail khớp cả email hiện hành lẫn địa chỉ cũ', () => {
  assert.equal(byEmail(R, 'tuannv@avadagroup.com').jiraUsername, 'tuannv');
  assert.equal(byEmail(R, 'tuannv@avada.email').jiraUsername, 'tuannv');
  assert.equal(byEmail(R, 'TuanNV@Avada.Email').jiraUsername, 'tuannv');
  assert.equal(byEmail(R, 'khongai@avada.io'), null);
});

test('roster thật: mọi email + alias không đụng nhau giữa các người', () => {
  const all = loadRoster();
  const seen = new Map();
  for (const m of all) {
    for (const e of emailsOf(m)) {
      assert.equal(seen.has(e), false, `email ${e} dùng cho cả ${seen.get(e)} và ${m.jiraUsername}`);
      seen.set(e, m.jiraUsername);
    }
  }
});

test('roster thật: ai cũng đã có slackUid', () => {
  const thieu = loadRoster().filter((m) => !m.slackUid).map((m) => m.jiraUsername);
  assert.deepEqual(thieu, [], `còn thiếu slackUid: ${thieu.join(', ')}`);
});
