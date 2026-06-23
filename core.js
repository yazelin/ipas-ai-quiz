// 純邏輯,無 DOM、無 localStorage,方便用 node 測。app.js 與 core.test.mjs 都 import 這裡。

export const MASTER_BOX = 3; // box 從 1 起,到 3 視為「已掌握」= 連續答對 2 次

// Leitner 盒子：答對升一格(上限 MASTER_BOX)、答錯掉回 1。
export function nextBox(box, correct) {
  const b = box || 1;
  return correct ? Math.min(b + 1, MASTER_BOX) : 1;
}

// 出題優先序(數字小先練):答錯未掌握 > 沒做過 > 做過未掌握 > 已掌握。供「智慧複習」排序。
export function reviewPriority(p) {
  const x = p || { box: 1, attempts: 0, wrong: 0 };
  if (isMastered(x.box)) return 3;
  if (x.wrong > 0) return 0;        // 錯過又沒掌握 → 最該練
  if ((x.attempts || 0) === 0) return 1; // 沒做過
  return 2;                          // 做過但還沒掌握
}

export function isMastered(box) {
  return (box || 1) >= MASTER_BOX;
}

// 模擬考計分。questions 為出題順序,answers[i] 為該題選的選項 index(null=未作答)。
export function scoreExam(questions, answers) {
  let correct = 0;
  const wrongIds = [];
  questions.forEach((q, i) => {
    if (answers[i] === q.answer) correct++;
    else wrongIds.push(q.id);
  });
  const total = questions.length;
  return {
    total,
    correct,
    wrong: total - correct,
    percent: total ? Math.round((correct / total) * 1000) / 10 : 0,
    wrongIds,
  };
}

// 依科目彙整正確率與掌握度。progress 為 { [id]: {box, attempts, correct, wrong} }。
export function progressStats(questions, progress) {
  const bySubject = {};
  let practiced = 0, mastered = 0, wrongNow = 0;
  for (const q of questions) {
    const p = progress[q.id] || { box: 1, attempts: 0, correct: 0, wrong: 0 };
    const s = (bySubject[q.subject] ||= { subject: q.subject, total: 0, attempts: 0, correct: 0, mastered: 0 });
    s.total++;
    s.attempts += p.attempts;
    s.correct += p.correct;
    if (isMastered(p.box)) s.mastered++;
    if (p.attempts > 0) practiced++;
    if (isMastered(p.box)) mastered++;
    else if (p.wrong > 0) wrongNow++;
  }
  const subjects = Object.values(bySubject).map((s) => ({
    ...s,
    accuracy: s.attempts ? Math.round((s.correct / s.attempts) * 1000) / 10 : null,
  }));
  return { total: questions.length, practiced, mastered, wrongNow, subjects };
}

// 目前的錯題清單(答錯過、尚未掌握),供「只練錯題 / 錯題本」用。
export function wrongQuestionIds(questions, progress) {
  return questions
    .filter((q) => {
      const p = progress[q.id];
      return p && p.wrong > 0 && !isMastered(p.box);
    })
    .map((q) => q.id);
}

// 把「有星標或有筆記」的題 + 解析 + 筆記整理成 markdown,供匯出。
export function toMarkdown(questions, progress, title = 'iPAS 筆記') {
  const lines = [`# ${title}`, ''];
  let n = 0;
  for (const q of questions) {
    const p = progress[q.id];
    if (!p || (!p.starred && !p.note)) continue;
    n++;
    lines.push(`## ${n}. [${q.subject}] ${q.question}`);
    lines.push(`- 正解：${q.options[q.answer]}`);
    if (q.explanation) lines.push(`- 解析：${q.explanation}`);
    if (p.note) lines.push(`- 我的筆記：${p.note}`);
    lines.push('');
  }
  if (n === 0) lines.push('_(還沒有星標的題目)_');
  return lines.join('\n');
}
