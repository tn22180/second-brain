import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUpdateFields, tierOfBatch, passGate, parseRawArgs, singleKey,
  buildUnlinkDraft, assertLinkBothEndsFal,
} from './verbs-write.mjs';
import { FIELDS, classifyTier, gate } from '../../../../scripts/lib/jira.mjs';

test('buildUpdateFields: tên người-đọc-được → field id thật', () => {
  const { fields } = buildUpdateFields({ app: 'Team', devPoint: 3, assignees: ['lamln', 'dungtt'] });
  assert.deepEqual(fields[FIELDS.falconApp], { value: 'Team' });
  assert.deepEqual(fields[FIELDS.devPoint], { value: '3' });
  assert.deepEqual(fields[FIELDS.assignees], [{ name: 'lamln' }, { name: 'dungtt' }]);
});

test('buildUpdateFields: assignees LUÔN là mảng, dù chỉ 1 người', () => {
  const { fields } = buildUpdateFields({ assignees: 'lamln' });
  assert.deepEqual(fields[FIELDS.assignees], [{ name: 'lamln' }]);
});

test('buildUpdateFields: trả names để xếp tầng', () => {
  const { names } = buildUpdateFields({ dueDate: '2026-08-01', description: 'x' });
  assert.deepEqual(names.sort(), ['description', 'dueDate']);
});

test('buildUpdateFields: dueDate sai định dạng → ném, không POST rác', () => {
  assert.throws(() => buildUpdateFields({ dueDate: '01/08/2026' }), /INVALID_DUE_DATE_FORMAT/);
});

test('buildUpdateFields: input rỗng → ném thay vì PUT rỗng', () => {
  assert.throws(() => buildUpdateFields({}), /EMPTY_UPDATE/);
});

test('buildUpdateFields: field lạ → ném, đừng đoán field id', () => {
  assert.throws(() => buildUpdateFields({ storyPoints: 5 }), /UNKNOWN_FIELD/);
});

// Nối 2 mảnh: names của buildUpdateFields phải ăn khớp với classifyTier.
test('update chỉ field nhẹ trên issue của mình → T1', () => {
  const { names } = buildUpdateFields({ devPoint: 3, dueDate: '2026-08-01' });
  assert.equal(classifyTier('update', { mine: true, updateFields: names }), 'T1');
});

test('update chạm description → T2 kể cả issue của mình', () => {
  const { names } = buildUpdateFields({ devPoint: 3, description: 'x' });
  assert.equal(classifyTier('update', { mine: true, updateFields: names }), 'T2');
});

// ── tierOfBatch: bất biến "tầng NGHIÊM NHẤT trong lô thắng" ────────────────────
test('tierOfBatch: lô toàn issue của mình → T1', () => {
  const own = new Map([
    ['FAL-1', { mine: true }],
    ['FAL-2', { mine: true }],
  ]);
  assert.equal(tierOfBatch('comment', own), 'T1');
});

test('tierOfBatch: lô lẫn 1 issue của người khác → T2 (tầng nghiêm nhất thắng)', () => {
  const own = new Map([
    ['FAL-1', { mine: true }],
    ['FAL-2', { mine: false }],
  ]);
  assert.equal(tierOfBatch('comment', own), 'T2');
});

test('tierOfBatch: verb update, lô của mình nhưng updateFields chạm description → T2', () => {
  const own = new Map([
    ['FAL-1', { mine: true }],
    ['FAL-2', { mine: true }],
  ]);
  assert.equal(tierOfBatch('update', own, ['description']), 'T2');
});

// ── passGate: chặn ghi khi chưa đủ quyền, và KHÔNG được chặn trong im lặng ─────
test('passGate: T0/T1 luôn cho qua, không cần cờ', () => {
  assert.equal(passGate('T0', {}, ['dòng draft']), true);
  assert.equal(passGate('T1', {}, ['dòng draft']), true);
});

test('passGate: T2 không cờ → chặn; có --confirm → cho qua', () => {
  assert.equal(passGate('T2', {}, ['dòng draft']), false);
  assert.equal(passGate('T2', { confirm: true }, ['dòng draft']), true);
});

test('passGate: T3 dù có --force vẫn chặn (force không có tác dụng ở tầng T3)', () => {
  assert.equal(passGate('T3', { force: true }, ['dòng draft']), false);
});

test('passGate: khi chặn PHẢI in draft ra console — im lặng mà chặn là lỗi', () => {
  const calls = [];
  const orig = console.log;
  console.log = (...a) => calls.push(a.join(' '));
  let ok;
  try {
    ok = passGate('T2', {}, ['FAL-1: comment "x"']);
  } finally {
    console.log = orig;
  }
  assert.equal(ok, false);
  assert.ok(calls.some((l) => l.includes('DRAFT [T2]')), 'phải in dòng DRAFT [tier]');
  assert.ok(calls.some((l) => l.includes('FAL-1: comment')), 'phải in nội dung draft đã truyền vào');
});

// ── singleKey: attach/link không hỗ trợ batch — nhiều key phải NÉM, không lặng lẽ cắt bớt ─────
test('singleKey: 1 key → trả về key đó', () => {
  assert.equal(singleKey('FAL-279', 'attach'), 'FAL-279');
});

test('singleKey: nhiều key phẩy-ngăn (attach) → ném MULTI_KEY_UNSUPPORTED, không lặng lẽ cắt bớt', () => {
  assert.throws(() => singleKey('FAL-279,FAL-280', 'attach'), /MULTI_KEY_UNSUPPORTED/);
});

test('singleKey: nhiều key phẩy-ngăn (link) → ném MULTI_KEY_UNSUPPORTED', () => {
  assert.throws(() => singleKey('FAL-279,FAL-280', 'link (key nguồn)'), /MULTI_KEY_UNSUPPORTED/);
  assert.throws(() => singleKey('FAL-279,FAL-280', 'link (key đích)'), /MULTI_KEY_UNSUPPORTED/);
});

test('singleKey: message liệt kê đủ key thừa (không chỉ đếm số) để user biết cắt cái nào', () => {
  assert.throws(() => singleKey('FAL-279,FAL-280,FAL-281', 'attach'), /FAL-279, FAL-280, FAL-281/);
});

// ── parseRawArgs: escape hatch raw — chuẩn hoá method/path trước khi gọi mạng ──
test('parseRawArgs: chuẩn hoá method hoa, path tự thêm tiền tố REST v2', () => {
  assert.deepEqual(parseRawArgs(['put', '/issue/FAL-279']), { method: 'PUT', path: '/rest/api/2/issue/FAL-279' });
});

test('parseRawArgs: path đã đủ đường dẫn thì giữ nguyên (cho Agile API)', () => {
  assert.deepEqual(parseRawArgs(['POST', '/rest/agile/1.0/sprint/59/issue']),
    { method: 'POST', path: '/rest/agile/1.0/sprint/59/issue' });
});

test('parseRawArgs: method lạ → ném', () => {
  assert.throws(() => parseRawArgs(['FETCH', '/issue/FAL-279']), /BAD_METHOD/);
});

test('raw DELETE xếp T3 — không có --force', () => {
  const { method } = parseRawArgs(['delete', '/issue/FAL-279']);
  assert.equal(classifyTier('raw', { method }), 'T3');
  assert.equal(gate('T3', { force: true }).allowed, false);
});

// ── parseRawArgs: guard project FAL — raw tự do endpoint/field nhưng KHÔNG tự do project ──
test('parseRawArgs: path chứa key ngoài FAL → ném NOT_FAL_KEY', () => {
  assert.throws(() => parseRawArgs(['DELETE', '/issue/OPS-123']), /NOT_FAL_KEY/);
});

test('parseRawArgs: path chứa FAL-279 → không ném, trả path đúng', () => {
  assert.deepEqual(parseRawArgs(['GET', '/issue/FAL-279']), { method: 'GET', path: '/rest/api/2/issue/FAL-279' });
});

test('parseRawArgs: path không chứa key nào → không ném (không chặn nhầm endpoint không theo issue)', () => {
  assert.doesNotThrow(() => parseRawArgs(['GET', '/field']));
  // "59" là số nhưng không phải issue key — chặn nhầm là hỏng verb sprint.
  assert.doesNotThrow(() => parseRawArgs(['POST', '/rest/agile/1.0/sprint/59/issue']));
});

test('parseRawArgs: key viết thường → ném (regex chỉ nhận key khớp đúng ^FAL-\\d+$)', () => {
  assert.throws(() => parseRawArgs(['GET', '/issue/fal-279']), /NOT_FAL_KEY/);
});

// ── buildUnlinkDraft / assertLinkBothEndsFal: draft T3 của unlink phải nói rõ xoá cái gì ──────
test('buildUnlinkDraft: in đủ 2 đầu link + loại link, không chỉ mỗi id', () => {
  const linkJson = {
    type: { name: 'Relates' },
    inwardIssue: { key: 'FAL-280' },
    outwardIssue: { key: 'FAL-279' },
  };
  const draft = buildUnlinkDraft('123', linkJson);
  assert.match(draft, /id=123/);
  assert.match(draft, /FAL-280/);
  assert.match(draft, /FAL-279/);
  assert.match(draft, /Relates/);
  assert.match(draft, /KHÔNG HOÀN TÁC/);
});

test('buildUnlinkDraft: thiếu field trong response vẫn không throw, in "?" thay vì crash', () => {
  assert.doesNotThrow(() => buildUnlinkDraft('123', {}));
});

test('assertLinkBothEndsFal: cả 2 đầu là FAL → không ném', () => {
  assert.doesNotThrow(() => assertLinkBothEndsFal({
    inwardIssue: { key: 'FAL-280' }, outwardIssue: { key: 'FAL-279' },
  }));
});

test('assertLinkBothEndsFal: đầu inward khác project → ném NOT_FAL_KEY', () => {
  assert.throws(() => assertLinkBothEndsFal({
    inwardIssue: { key: 'OPS-1' }, outwardIssue: { key: 'FAL-279' },
  }), /NOT_FAL_KEY/);
});

test('assertLinkBothEndsFal: đầu outward khác project → ném NOT_FAL_KEY', () => {
  assert.throws(() => assertLinkBothEndsFal({
    inwardIssue: { key: 'FAL-279' }, outwardIssue: { key: 'OPS-1' },
  }), /NOT_FAL_KEY/);
});
