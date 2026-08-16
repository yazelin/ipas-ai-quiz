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

// ---- guessLevel / nextExam ----
import { guessLevel, nextExam } from './core.js';
const bId = (n) => `114-4-b-s1-q${n}`, mId = (n) => `114-2-m-s1-q${n}`;
const mk = (ids) => Object.fromEntries(ids.map((i) => [i, { box: 1 }]));

assert.equal(guessLevel(mk([1,2,3,4,5,6].map(bId))), '初級');
assert.equal(guessLevel(mk([1,2,3,4,5,6].map(mId))), '中級');
assert.equal(guessLevel(mk([...[1,2,3].map(bId), ...[1,2,3].map(mId)])), null, '五五波不猜');
assert.equal(guessLevel(mk([bId(1), bId(2)])), null, '題數太少不猜');
assert.equal(guessLevel({}), null);
assert.equal(guessLevel(null), null, '沒有 progress 不能爆');
// 學習指引題的 id 沒有梯次前綴,一樣要算進去
assert.equal(guessLevel(mk(['lg-b-s1-q1','lg-b-s1-q2','lg-b-s2-q3','lg-b-s2-q4','lg-b-s2-q5'])), '初級');
// 8:2 偏一邊 → 判得出來
assert.equal(guessLevel(mk([...[1,2,3,4,5,6,7,8].map(bId), ...[1,2].map(mId)])), '初級');

const EX = { 初級: ['2026-08-15', '2026-11-07'], 中級: ['2026-05-23', '2026-11-14'] };
assert.deepEqual(nextExam(EX, '2026-08-17'), { level: '初級', date: '2026-11-07' }, '跨級取最近的一場');
assert.deepEqual(nextExam(EX, '2026-08-17', '中級'), { level: '中級', date: '2026-11-14' });
assert.deepEqual(nextExam(EX, '2026-08-15', '初級'), { level: '初級', date: '2026-08-15' }, '考試當天還算數');
assert.equal(nextExam(EX, '2027-01-01'), null, '全部過期回 null');
assert.equal(nextExam({}, '2026-08-17'), null);

console.log('PASS (含 guessLevel / nextExam)');
