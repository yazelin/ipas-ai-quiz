// node core.test.mjs  — 邏輯壞掉就會 throw。
import assert from 'node:assert';
import { nextBox, isMastered, scoreExam, progressStats, wrongQuestionIds, toMarkdown } from './core.js';

// Leitner
assert.equal(nextBox(1, true), 2);
assert.equal(nextBox(4, true), 5);
assert.equal(nextBox(5, true), 5, '已到頂不超過 5');
assert.equal(nextBox(3, false), 1, '答錯掉回 1');
assert.equal(isMastered(5), true);
assert.equal(isMastered(4), false);

// 計分
const qs = [
  { id: 'a', subject: 'S1', answer: 1, options: ['x', 'y'], question: 'qa' },
  { id: 'b', subject: 'S1', answer: 0, options: ['x', 'y'], question: 'qb' },
  { id: 'c', subject: 'S2', answer: 1, options: ['x', 'y'], question: 'qc', explanation: 'because' },
];
const r = scoreExam(qs, [1, 1, null]); // a 對、b 錯、c 未作答(錯)
assert.equal(r.correct, 1);
assert.equal(r.wrong, 2);
assert.deepEqual(r.wrongIds, ['b', 'c']);
assert.equal(r.percent, 33.3);

// 統計 + 錯題
const prog = {
  a: { box: 5, attempts: 5, correct: 5, wrong: 0 },
  b: { box: 1, attempts: 2, correct: 0, wrong: 2 },
};
const st = progressStats(qs, prog);
assert.equal(st.practiced, 2);
assert.equal(st.mastered, 1);
assert.equal(st.wrongNow, 1);
const s1 = st.subjects.find((s) => s.subject === 'S1');
assert.equal(s1.accuracy, 71.4); // 5 correct / 7 attempts
assert.deepEqual(wrongQuestionIds(qs, prog), ['b']);

// markdown 匯出(只收星標)
const md = toMarkdown(qs, { c: { starred: true, note: '記得 RAG' } });
assert.ok(md.includes('[S2]'));
assert.ok(md.includes('正解：y'));
assert.ok(md.includes('我的筆記：記得 RAG'));
assert.ok(!md.includes('qa'), '沒星標的不該出現');

console.log('PASS');
