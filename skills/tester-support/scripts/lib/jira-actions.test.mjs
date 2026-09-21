import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTransition } from '../jira-actions.mjs';

const TRANSITIONS = [
  { id: '11', name: 'To Do' },
  { id: '31', name: 'Done', to: { name: 'Done' } },
];

test('pickTransition match không phân biệt hoa thường', () => {
  assert.equal(pickTransition(TRANSITIONS, 'done').id, '31');
});

test('pickTransition không thấy → null', () => {
  assert.equal(pickTransition(TRANSITIONS, 'Reopened'), null);
});
