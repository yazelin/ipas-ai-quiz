// 純邏輯,無 DOM、無 localStorage,方便用 node 測。app.js 與 core.test.mjs 都 import 這裡。

export const MASTER_BOX = 3; // box 從 1 起,到 3 視為「已掌握」= 連續答對 2 次

// 答對往前一格、答錯退回第一格,推到第三格就算掌握(紙卡背單字的老做法)。
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
    if (q.image) lines.push('- (此題含附圖,請對照站上題目)');
    q.options.forEach((o, i) => lines.push(`- ${'ABCD'[i]}. ${o}${i === q.answer ? ' ✓（正解）' : ''}`));
    if (q.explanation) lines.push(`- 解析：${q.explanation}`);
    if (p.note) lines.push(`- 我的筆記：${p.note}`);
    lines.push('');
  }
  if (n === 0) lines.push('_(還沒有星標或筆記的題目)_');
  return lines.join('\n');
}

// 從練習紀錄推「這個人在準備哪一級」。題目 id 內含級別:`-b-`=初級、`-m-`=中級
// (114-4-b-s1-q1 / lg-m-s2-q7)。790 題零例外,所以不必查題庫,看 id 就夠。
// 回傳 null = 資料不足以判斷(沒練過,或兩級練得差不多)。
// 門檻 0.6:實測 400 個活躍使用者有 92% 落在單邊 60% 以上,中間那 5% 混著練的本來就不該猜。
export function guessLevel(progress, minAnswered = 5) {
  let b = 0, m = 0;
  for (const id of Object.keys(progress || {})) {
    if (id.includes('-b-')) b++;
    else if (id.includes('-m-')) m++;
  }
  const n = b + m;
  if (n < minAnswered) return null;
  if (b / n >= 0.6) return '初級';
  if (m / n >= 0.6) return '中級';
  return null;
}

// 從官方日期表挑「還沒到的最近一場」。level 給了就只看那一級,沒給就看全部。
// exams = { '初級': ['2026-11-07', ...], '中級': [...] };todayStr = 'YYYY-MM-DD'
export function nextExam(exams, todayStr, level = null) {
  let best = null;
  for (const [lv, dates] of Object.entries(exams || {})) {
    if (level && lv !== level) continue;
    for (const d of dates || []) {
      if (d < todayStr) continue;
      if (!best || d < best.date) best = { level: lv, date: d };
    }
  }
  return best;
}

// 挑最近已考完的一場，供考後期間沿用；未傳 level 時跨級挑最近日期。
export function latestExam(exams, todayStr, level = null) {
  let best = null;
  for (const [lv, dates] of Object.entries(exams || {})) {
    if (level && lv !== level) continue;
    for (const date of dates || []) {
      if (date > todayStr) continue;
      if (!best || date > best.date) best = { level: lv, date };
    }
  }
  return best;
}

// 考後感謝卡的純條件判斷。nowLocal 使用瀏覽器當地時間 YYYY-MM-DDTHH:mm。
export function shouldShowPostExamThanks({ examDate, nowLocal, totalAttempts, dismissed, enabled, preview = false }) {
  if (preview) return true;
  if (!enabled || dismissed || !Number.isFinite(totalAttempts) || totalAttempts < 20) return false;
  if (typeof examDate !== 'string' || typeof nowLocal !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return false;

  const examDay = Date.parse(`${examDate}T00:00:00Z`);
  const nowMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(nowLocal);
  if (!Number.isFinite(examDay) || !nowMatch) return false;
  if (+nowMatch[2] > 23 || +nowMatch[3] > 59) return false;
  const nowDay = Date.parse(`${nowMatch[1]}T00:00:00Z`);
  if (!Number.isFinite(nowDay) || new Date(examDay).toISOString().slice(0, 10) !== examDate
      || new Date(nowDay).toISOString().slice(0, 10) !== nowMatch[1]) return false;

  const dayOffset = (nowDay - examDay) / 86400000;
  if (dayOffset < 0 || dayOffset > 14) return false;
  return dayOffset > 0 || `${nowMatch[2]}:${nowMatch[3]}` >= '17:00';
}
