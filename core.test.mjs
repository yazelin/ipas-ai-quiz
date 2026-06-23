// node core.test.mjs  — 邏輯壞掉就會 throw。
import assert from 'node:assert';
import { nextBox, isMastered, scoreExam, progressStats, wrongQuestionIds, toMarkdown, reviewPriority } from './core.js';

// 出題優先序:錯題(0) < 沒做過(1) < 做過未掌握(2) < 已掌握(3)
assert.equal(reviewPriority({ box: 1, attempts: 2, wrong: 1 }), 0);
assert.equal(reviewPriority({ box: 1, attempts: 0, wrong: 0 }), 1);
assert.equal(reviewPriority({ box: 2, attempts: 1, wrong: 0 }), 2);
assert.equal(reviewPriority({ box: 3, attempts: 3, wrong: 0 }), 3);

// Leitner(MASTER_BOX=3:連對 2 次即掌握)
assert.equal(nextBox(1, true), 2);
assert.equal(nextBox(2, true), 3, '連對 2 次到頂');
assert.equal(nextBox(3, true), 3, '已到頂不超過 3');
assert.equal(nextBox(2, false), 1, '答錯掉回 1');
assert.equal(isMastered(3), true);
assert.equal(isMastered(2), false);

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

// markdown 匯出(收星標)
const md = toMarkdown(qs, { c: { starred: true, note: '記得 RAG' } });
assert.ok(md.includes('[S2]'));
assert.ok(md.includes('A. x'), '要列出所有選項');
assert.ok(md.includes('B. y ✓（正解）'), '正解選項要標 ✓');
assert.ok(md.includes('我的筆記：記得 RAG'));
assert.ok(!md.includes('qa'), '沒星標也沒筆記的不該出現');

// 有筆記但沒星標也要收(筆記不漏)
const md2 = toMarkdown(qs, { a: { note: '只有筆記沒星標' } });
assert.ok(md2.includes('只有筆記沒星標'), '有筆記就該收');
assert.ok(md2.includes('qa'));

console.log('PASS');
