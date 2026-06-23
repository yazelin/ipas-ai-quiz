import { nextBox, isMastered, scoreExam, progressStats, wrongQuestionIds, toMarkdown, reviewPriority, MASTER_BOX } from './core.js';

const STORE_KEY = 'ipas_quiz_progress';
// 部署 Cloudflare Worker 後填入，例如 'https://ipas-quiz-sync.你的帳號.workers.dev'。留空=只用本機。
const SYNC_URL = 'https://ipas-quiz-sync.yazelinj303.workers.dev';
const VAPID_PUBLIC = 'BNn4Lwq818aHx8cb0LrcQ6IpRgHb9B3P_BOqusct-uFyJPQ4hlDrIOirliHoNdbbg5tg8zWfzBg5SZ0yBhRq7zA';
const $ = (sel) => document.querySelector(sel);
const view = $('#view');

let DATA = { meta: {}, questions: [] };
let CONCEPTS = [];
let store = load();
let pushTimer = null;

// PWA 安裝：接管 beforeinstallprompt，顯示自家「安裝」按鈕（Android/桌面 Chrome）
// 用單機旗標記住「已關掉/已安裝」就別再顯示（install 狀態每台不同，故不進同步 store）
let deferredInstall = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const installBarOff = () => localStorage.getItem('ipas_installbar_off') === '1';
const dismissInstallBar = () => { localStorage.setItem('ipas_installbar_off', '1'); const b = document.getElementById('installbar'); if (b) b.hidden = true; deferredInstall = null; };
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  const bar = document.getElementById('installbar');
  if (bar && !isStandalone() && !installBarOff()) bar.hidden = false;
});
window.addEventListener('appinstalled', dismissInstallBar);

// ---- localStorage ----
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.q) return s;
  } catch {}
  return { v: 1, syncCode: makeCode(), q: {}, recent: [], updatedAt: 0 };
}
// 記一筆最近作答結果(1/0)，保留最近 50 筆，供「近期正確率」
function logRecent(correct) {
  (store.recent ||= []).push(correct ? 1 : 0);
  if (store.recent.length > 50) store.recent = store.recent.slice(-50);
}

// ---- 推播提醒(Web Push)----
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function urlB64ToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function pushIsOn() {
  if (!pushSupported() || !SYNC_URL) return false;
  const reg = await navigator.serviceWorker.ready;
  return !!(await reg.pushManager.getSubscription());
}
async function enablePush(localHour) {
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: '未允許通知權限' };
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(VAPID_PUBLIC) });
  const offsetMin = new Date().getTimezoneOffset();
  let utcMin = (localHour * 60 + offsetMin) % 1440; if (utcMin < 0) utcMin += 1440;
  const r = await fetch(`${SYNC_URL}/push/subscribe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: store.syncCode, subscription: sub.toJSON(), hourUtc: Math.floor(utcMin / 60), offsetMin }),
  });
  return { ok: r.ok };
}
async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  await fetch(`${SYNC_URL}/push/unsubscribe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: store.syncCode }),
  }).catch(() => {});
}

// ---- 每日目標 / 連續打卡 / 考前倒數 ----
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); };
const dailyGoal = () => (store.settings && store.settings.dailyGoal) || 20;
const todayCount = () => (store.daily && store.daily.date === today() ? store.daily.count : 0);
// 顯示用的連續天數：最後達標日是今天或昨天才還活著，否則歸 0
function liveStreak() {
  const s = store.streak; if (!s || !s.lastDate) return 0;
  return (s.lastDate === today() || s.lastDate === yesterday()) ? s.count : 0;
}
function daysUntilExam() {
  const e = store.settings && store.settings.examDate; if (!e) return null;
  const diff = Math.ceil((new Date(e + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  return diff;
}
// 每答一題呼叫：累加今日題數、記每日歷史、達標當下更新打卡
function bumpDaily(correct) {
  const t = today();
  store.settings ||= { dailyGoal: 20, examDate: '' };
  if (!store.daily || store.daily.date !== t) store.daily = { date: t, count: 0 };
  store.daily.count++;
  // 每日歷史（答題數/答對數），保留最近 30 天
  store.history ||= {};
  const h = (store.history[t] ||= { a: 0, c: 0 });
  h.a++; if (correct) h.c++;
  const days = Object.keys(store.history).sort();
  if (days.length > 30) delete store.history[days[0]];
  store.streak ||= { count: 0, lastDate: '' };
  if (store.daily.count === dailyGoal() && store.streak.lastDate !== t) {
    store.streak = { count: (store.streak.lastDate === yesterday() ? store.streak.count : 0) + 1, lastDate: t };
  }
}
function save() {
  store.updatedAt = Date.now();
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  schedulePush();
}

// ---- 雲端同步（同步碼，免帳號） ----
function schedulePush() {
  if (!SYNC_URL) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushSync, 5000); // ponytail: debounce 5s，夠快又不會每題寫一次 KV
}
async function pushSync() {
  clearTimeout(pushTimer); pushTimer = null;
  if (!SYNC_URL || !store.syncCode) return false;
  try {
    const r = await fetch(`${SYNC_URL}/sync/${encodeURIComponent(store.syncCode)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(store),
    });
    return r.ok;
  } catch { return false; }
}
async function pullSync() {
  if (!SYNC_URL || !store.syncCode) return false;
  try {
    const r = await fetch(`${SYNC_URL}/sync/${encodeURIComponent(store.syncCode)}`);
    if (!r.ok) return false;
    const remote = await r.json();
    if (remote && remote.q && (remote.updatedAt || 0) > (store.updatedAt || 0)) {
      store = remote;
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
      return true;
    }
  } catch {}
  return false;
}
function qp(id) {
  return (store.q[id] ||= { box: 1, attempts: 0, correct: 0, wrong: 0, note: '', starred: false });
}
function makeCode() {
  const a = ['fox', 'owl', 'koi', 'elm', 'jade', 'mint', 'sage', 'wren', 'lark', 'reef'];
  const b = ['river', 'cloud', 'stone', 'ember', 'tide', 'grove', 'dune', 'frost', 'maple', 'comet'];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(a)}-${pick(b)}-${Math.floor(10 + Math.random() * 90)}`;
}

// ---- helpers ----
const subjects = () => [...new Set(DATA.questions.map((q) => q.subject))];
const papers = () => [...new Set(DATA.questions.map((q) => `${q.level}｜${q.round}｜${q.subject}`))];
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// 教材對應：指到該題所屬科目的學習指引章節 + 開啟官方 PDF
function guideLine(q) {
  const url = DATA.meta && DATA.meta.guides && DATA.meta.guides[q.subject];
  if (!url && !q.chapter) return '';
  const ch = q.chapter ? `—『${esc(q.chapter)}』章` : '';
  const link = url ? ` <a href="${esc(url)}" target="_blank" rel="noopener">開啟學習指引 ↗</a>` : '';
  return `<p class="guide">教材對應：${esc(q.subject)} ${ch}${link}</p>`;
}
// 回報這題：開 GitHub issue form,自動帶入題號與科目
function reportLink(q) {
  const url = `https://github.com/yazelin/ipas-ai-quiz/issues/new?template=question-report.yml`
    + `&qid=${encodeURIComponent(q.id)}&subject=${encodeURIComponent(q.subject)}`;
  return `<p class="report-line"><a href="${url}" target="_blank" rel="noopener">這題有誤？回報給作者</a></p>`;
}
// 今日挑戰：用日期當種子，固定挑 3 題（每天不同、當天穩定）
function dailyChallenge() {
  const qs = DATA.questions; if (!qs.length) return [];
  let seed = 0; for (const ch of today()) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const picks = [];
  for (let n = 0; n < 3 && n < qs.length; n++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    let i = seed % qs.length;
    while (picks.includes(i)) i = (i + 1) % qs.length;
    picks.push(i);
  }
  return picks.map((i) => qs[i]);
}
// 今日觀念卡：優先挑「你較弱的章節」，逐日輪過你的弱章；沒練過則全站輪播
function todayConcept() {
  if (!CONCEPTS.length) return null;
  const dayNum = Math.floor(new Date(today() + 'T00:00:00').getTime() / 86400000);
  const byCh = {};
  for (const q of DATA.questions) {
    const p = store.q[q.id]; if (!p) continue;
    const c = (byCh[q.chapter || q.subject] ||= { attempted: 0, mastered: 0, wrongNow: 0 });
    if (p.attempts > 0) c.attempted++;
    if (isMastered(p.box)) c.mastered++;
    else if (p.wrong > 0) c.wrongNow++;
  }
  const weak = Object.entries(byCh)
    .map(([ch, c]) => ({ ch, score: c.attempted ? c.wrongNow * 2 + (c.attempted - c.mastered) : 0 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (weak.length) {
    const chosen = weak[dayNum % weak.length].ch;
    const pool = CONCEPTS.filter((c) => c.chapter === chosen);
    if (pool.length) return { ...pool[dayNum % pool.length], weak: true };
  }
  return CONCEPTS[((dayNum % CONCEPTS.length) + CONCEPTS.length) % CONCEPTS.length];
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// ---- views ----
function setNav(active) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === active));
}

// 範圍 = 章節（若題目尚未分類則退回科目），供「選擇練習範圍」用
const rangeKey = (q) => q.chapter || q.subject;
function rangeGroups() {
  const m = new Map();
  for (const q of DATA.questions) {
    const k = rangeKey(q);
    const g = m.get(k) || { key: k, level: q.level, count: 0 };
    g.count++; m.set(k, g);
  }
  return [...m.values()];
}

function home() {
  setNav('home');
  const groups = rangeGroups();
  const byLevel = {};
  groups.forEach((g) => (byLevel[g.level] ||= []).push(g));
  const ranges = Object.entries(byLevel).map(([lv, gs]) =>
    `<div class="range-group"><div class="range-lv">${esc(lv)}</div>${gs.map((g) =>
      `<label class="range-item"><input type="checkbox" class="rng" value="${esc(g.key)}" checked><span>${esc(g.key)}</span><b>${g.count}</b></label>`).join('')}</div>`).join('');
  const g = dailyGoal(), dc = todayCount(), strk = liveStreak(), du = daysUntilExam();
  const goalHit = dc >= g;
  const dailyStrip = `
    <section class="card daily-card">
      <div class="daily">
        <div><b class="${goalHit ? 'hit' : ''}">${dc}/${g}</b><span>今日題數${goalHit ? ' ✓' : ''}</span></div>
        <div><b>${strk}</b><span>連續天數</span></div>
        ${du != null ? `<div><b>${du < 0 ? '—' : du}</b><span>${du < 0 ? '考試已過' : '距考試（天）'}</span></div>` : ''}
      </div>
      <button id="share">分享進度</button>
    </section>`;
  const chDone = store.challengeDone === today();
  const challengeCard = `
    <section class="card">
      <div class="row"><h3 style="margin:0">今日挑戰 ${chDone ? '✓ 已完成' : '3 題'}</h3>
        <button class="primary" id="challenge" style="margin:0;padding:8px 14px">${chDone ? '再做一次' : '開始'}</button></div>
      <p class="muted" style="margin:6px 0 0">每天 3 題，養成每日刷題的習慣。</p>
    </section>`;
  const cc = todayConcept();
  const conceptCard = cc ? `
    <section class="card concept-card">
      <div class="ck">今日 AI 觀念${cc.chapter ? ' · ' + esc(cc.chapter) : ''}${cc.weak ? ' · 針對你較弱的範圍' : ''}</div>
      <h3>${esc(cc.title)}</h3>
      <p>${esc(cc.body)}</p>
    </section>` : '';
  view.innerHTML = `${dailyStrip}${challengeCard}${conceptCard}
    <section class="card">
      <h2>練習模式</h2>
      <p class="muted">即時看答案與解析。勾選要練的範圍，預設全選。</p>
      <div class="row range-head"><span class="muted" id="range-sum"></span>
        <span><button id="sel-all">全選</button><button id="sel-none">清除</button></span></div>
      <div id="ranges">${ranges}</div>
      <label>關鍵字（選填）
        <input id="pr-kw" placeholder="例如 RAG、特徵工程、Transformer">
      </label>
      <label>出題方式
        <select id="pr-mode">
          <option value="smart">智慧複習（優先錯題與沒做過的）</option>
          <option value="random">隨機</option>
        </select>
      </label>
      <label>題數
        <select id="pr-count"><option value="10">10</option><option value="20">20</option><option value="0">全部（選取範圍）</option></select>
      </label>
      <button class="primary" id="pr-start">開始練習</button>
    </section>`;
  const selectedKeys = () => new Set([...view.querySelectorAll('.rng:checked')].map((c) => c.value));
  const kw = () => $('#pr-kw').value.trim().toLowerCase();
  const matchKw = (q) => {
    const k = kw();
    if (!k) return true;
    return `${q.question}${q.topic || ''}${q.chapter || ''}${q.options.join(' ')}`.toLowerCase().includes(k);
  };
  const pickPool = () => {
    const keys = selectedKeys();
    return DATA.questions.filter((q) => keys.has(rangeKey(q)) && matchKw(q));
  };
  const updateSum = () => {
    const keys = selectedKeys();
    $('#range-sum').textContent = `已選 ${keys.size} 範圍，共 ${pickPool().length} 題`;
  };
  view.querySelectorAll('.rng').forEach((c) => (c.onchange = updateSum));
  $('#pr-kw').oninput = updateSum;
  $('#sel-all').onclick = () => { view.querySelectorAll('.rng').forEach((c) => (c.checked = true)); updateSum(); };
  $('#sel-none').onclick = () => { view.querySelectorAll('.rng').forEach((c) => (c.checked = false)); updateSum(); };
  $('#pr-start').onclick = () => {
    const count = +$('#pr-count').value;
    let pool = pickPool();
    if ($('#pr-mode').value === 'smart') {
      // 依優先序排（錯題→沒做過→做過未掌握→已掌握），同級隨機
      pool = pool.map((q) => ({ q, pr: reviewPriority(store.q[q.id]), r: Math.random() }))
        .sort((a, b) => a.pr - b.pr || a.r - b.r).map((x) => x.q);
    } else {
      pool = shuffle(pool);
    }
    if (count) pool = pool.slice(0, count);
    runPractice(pool);
  };
  $('#challenge').onclick = () => { store.challengeDone = today(); save(); runPractice(dailyChallenge()); };
  $('#share').onclick = async () => {
    const txt = `我在 iPAS AI 應用規劃師模擬考刷題：連續打卡 ${strk} 天、今日 ${dc}/${g} 題。一起來練歷屆考古題！`;
    const url = location.origin + location.pathname;
    if (navigator.share) { try { await navigator.share({ title: 'iPAS 模考練習', text: txt, url }); } catch {} }
    else { try { await navigator.clipboard.writeText(`${txt} ${url}`); $('#share').textContent = '已複製連結'; } catch {} }
  };
  updateSum();
}

function runPractice(pool, opts = {}) {
  let i = 0;
  let right = 0, wrong = 0;
  const sessionWrong = [];
  if (!pool.length) {
    view.innerHTML = `<section class="card"><p>沒有符合的題目。</p></section>`;
    return;
  }
  const render = () => {
    const q = pool[i];
    const p = qp(q.id);
    view.innerHTML = `
      <section class="card">
        <div class="row"><span class="muted">${i + 1} / ${pool.length}</span>
          <button class="star ${p.starred ? 'on' : ''}" id="star">${p.starred ? '★ 已標' : '☆ 標記'}</button></div>
        <p class="qmeta muted">${esc(q.subject)}${q.topic ? '・' + esc(q.topic) : ''}</p>
        <h3>${esc(q.question)}</h3>
        ${q.image ? `<img class="qfig" src="${esc(q.image)}" alt="題目附圖" loading="lazy">` : ''}
        <div id="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join('')}</div>
        <div id="fb"></div>
      </section>`;
    $('#star').onclick = () => { p.starred = !p.starred; save(); render(); };
    view.querySelectorAll('.opt').forEach((btn) =>
      (btn.onclick = () => answer(q, +btn.dataset.k)));
  };
  const answer = (q, k) => {
    const p = qp(q.id);
    const correct = k === q.answer;
    p.attempts++;
    if (correct) { p.correct++; right++; } else { p.wrong++; wrong++; sessionWrong.push(q); }
    p.box = nextBox(p.box, correct);
    logRecent(correct);
    bumpDaily(correct);
    save();
    view.querySelectorAll('.opt').forEach((b, idx) => {
      b.disabled = true;
      if (idx === q.answer) b.classList.add('correct');
      if (idx === k && !correct) b.classList.add('wrong');
    });
    $('#fb').innerHTML = `
      <p class="${correct ? 'ok' : 'bad'}">${correct ? '答對' : '答錯'}（正解：${esc(q.options[q.answer])}）</p>
      ${q.explanation ? `<p class="exp">${esc(q.explanation)}</p>` : ''}
      ${guideLine(q)}
      ${reportLink(q)}
      <label class="note">筆記<textarea id="note" rows="2" placeholder="寫下你的理解或記憶點…">${esc(p.note || '')}</textarea></label>
      <button class="primary" id="next">${i + 1 < pool.length ? '下一題' : '完成'}</button>`;
    $('#note').oninput = (e) => { p.note = e.target.value; save(); };
    $('#next').onclick = () => { i++; i < pool.length ? render() : finish(); };
  };
  const finish = () => {
    const total = right + wrong;
    const pct = total ? Math.round((right / total) * 1000) / 10 : 0;
    view.innerHTML = `
      <section class="card">
        <h2>練習完成</h2>
        <p class="score">${pct}％</p>
        <p>這組 ${total} 題,答對 ${right}、答錯 ${wrong}</p>
        ${sessionWrong.length ? '<button class="primary" id="redo-wrong">只練這次錯的</button>' : '<p class="muted">這組全對,讚!</p>'}
        <button id="again">再練一次</button>
        <button id="back">回首頁</button>
      </section>`;
    if (sessionWrong.length) $('#redo-wrong').onclick = () => runPractice(sessionWrong.slice());
    $('#again').onclick = () => runPractice(shuffle(pool.slice()));
    $('#back').onclick = home;
  };
  render();
}

function mockSetup() {
  setNav('mock');
  const opts = papers().map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  const lim = DATA.meta.defaultTimeLimitMin || 60;
  view.innerHTML = `
    <section class="card">
      <h2>模擬考模式</h2>
      <p class="muted">整份計時作答，交卷前不顯示答案。練臨場與時間分配。</p>
      <label>試卷<select id="mk-paper">${opts}</select></label>
      <label>時間（分鐘）<input id="mk-min" type="number" value="${lim}" min="1"></label>
      <button class="primary" id="mk-start">開始模擬考</button>
    </section>`;
  $('#mk-start').onclick = () => {
    const paper = $('#mk-paper').value;
    const mins = +$('#mk-min').value || lim;
    const pool = DATA.questions.filter((q) => `${q.level}｜${q.round}｜${q.subject}` === paper);
    runMock(pool, mins);
  };
}

function runMock(pool, mins) {
  const answers = new Array(pool.length).fill(null);
  let i = 0;
  let remaining = mins * 60;
  const fmt = () => `${String((remaining / 60) | 0).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const timer = setInterval(() => {
    remaining--;
    const t = $('#timer');
    if (t) t.textContent = fmt();
    if (remaining <= 0) { clearInterval(timer); submit(); }
  }, 1000);

  const render = () => {
    const q = pool[i];
    view.innerHTML = `
      <section class="card">
        <div class="row"><span class="muted">${i + 1} / ${pool.length}</span><span id="timer" class="timer">${fmt()}</span></div>
        <p class="qmeta muted">${esc(q.subject)}</p>
        <h3>${esc(q.question)}</h3>
        ${q.image ? `<img class="qfig" src="${esc(q.image)}" alt="題目附圖" loading="lazy">` : ''}
        <div id="opts">${q.options.map((o, k) =>
          `<button class="opt ${answers[i] === k ? 'picked' : ''}" data-k="${k}">${esc(o)}</button>`).join('')}</div>
        <div class="row">
          <button id="prev" ${i === 0 ? 'disabled' : ''}>上一題</button>
          ${i + 1 < pool.length ? '<button id="next">下一題</button>' : '<button class="primary" id="submit">交卷</button>'}
        </div>
      </section>`;
    // 點選項只切換 picked class,不整卡重 render(否則 #timer 被重建會閃 --:--)
    view.querySelectorAll('.opt').forEach((b) => (b.onclick = () => {
      answers[i] = +b.dataset.k;
      view.querySelectorAll('.opt').forEach((x) => x.classList.toggle('picked', +x.dataset.k === answers[i]));
    }));
    if ($('#prev')) $('#prev').onclick = () => { i--; render(); };
    if ($('#next')) $('#next').onclick = () => { i++; render(); };
    if ($('#submit')) $('#submit').onclick = submit;
  };
  function submit() {
    clearInterval(timer);
    // 計入進度（模擬考也更新 Leitner / 統計）
    pool.forEach((q, idx) => {
      const p = qp(q.id);
      const correct = answers[idx] === q.answer;
      p.attempts++;
      if (correct) p.correct++; else p.wrong++;
      p.box = nextBox(p.box, correct);
      logRecent(correct);
      bumpDaily(correct);
    });
    save();
    const r = scoreExam(pool, answers);
    view.innerHTML = `
      <section class="card">
        <h2>結果</h2>
        <p class="score">${r.percent}％</p>
        <p>答對 ${r.correct} / ${r.total}，答錯 ${r.wrong}</p>
        <button class="primary" id="review">檢討錯題</button>
        <button id="back">回首頁</button>
      </section>`;
    $('#back').onclick = home;
    $('#review').onclick = () => runPractice(pool.filter((q) => r.wrongIds.includes(q.id)));
  }
  render();
}

function wrongbook() {
  setNav('wrong');
  const ids = wrongQuestionIds(DATA.questions, store.q);
  const list = ids.map((id) => DATA.questions.find((q) => q.id === id));
  view.innerHTML = `
    <section class="card">
      <h2>錯題本</h2>
      <p class="muted">答錯過、還沒掌握的題會留在這。同一題之後「連續答對 ${MASTER_BOX - 1} 次」就算掌握、自動移出。</p>
      ${ids.length ? `<button class="primary" id="drill">只練這些錯題</button>` : '<p>目前沒有錯題，繼續加油。</p>'}
      <ul class="wrong">${list.map((q) => `<li>${esc(q.question)} <span class="muted">（${esc(q.subject)}・再連對 ${Math.max(1, MASTER_BOX - (qp(q.id).box || 1))} 次就掌握）</span></li>`).join('')}</ul>
    </section>`;
  if (ids.length) $('#drill').onclick = () => runPractice(shuffle(list));
}

function notes() {
  setNav('notes');
  const items = DATA.questions.filter((q) => { const p = store.q[q.id]; return p && (p.note || p.starred); });
  view.innerHTML = `
    <section class="card">
      <h2>我的筆記</h2>
      <p class="muted">有寫筆記、或加星 ⭐ 的題目都在這。筆記可直接在下面改,會自動存。</p>
      ${items.length
        ? '<button id="exp-notes">匯出筆記（Markdown）</button>'
        : '<p>還沒有筆記或星標題。練習時在題目下方寫筆記、或點 ☆ 加星,就會出現在這。</p>'}
      ${items.map((q) => {
        const p = qp(q.id);
        return `<div class="note-item">
          <div class="row"><span class="muted">${p.starred ? '⭐ ' : ''}${esc(q.subject)}</span>
            <button class="goto" data-id="${esc(q.id)}">前往該題</button></div>
          <p class="qn">${esc(q.question)}</p>
          <textarea class="note-edit" data-id="${esc(q.id)}" rows="2" placeholder="寫下你的理解或記憶點…">${esc(p.note || '')}</textarea>
        </div>`;
      }).join('')}
    </section>`;
  view.querySelectorAll('.note-edit').forEach((t) => (t.oninput = (e) => { qp(e.target.dataset.id).note = e.target.value; save(); }));
  view.querySelectorAll('.goto').forEach((b) => (b.onclick = () => { const q = DATA.questions.find((x) => x.id === b.dataset.id); if (q) runPractice([q]); }));
  if (items.length) $('#exp-notes').onclick = () => download('ipas-notes.md', toMarkdown(DATA.questions, store.q), 'text/markdown');
}

function stats() {
  setNav('stats');
  const s = progressStats(DATA.questions, store.q);
  const cover = s.total ? Math.round((s.practiced / s.total) * 1000) / 10 : 0;
  const rec = store.recent || [];
  const recAcc = rec.length ? Math.round((rec.reduce((a, b) => a + b, 0) / rec.length) * 1000) / 10 : null;
  // 各章節（範圍）正確率與掌握度
  const byCh = new Map();
  for (const q of DATA.questions) {
    const k = rangeKey(q);
    const p = store.q[q.id] || {};
    const c = byCh.get(k) || { key: k, total: 0, attempts: 0, correct: 0, mastered: 0 };
    c.total++; c.attempts += p.attempts || 0; c.correct += p.correct || 0;
    if (isMastered(p.box)) c.mastered++;
    byCh.set(k, c);
  }
  const chRows = [...byCh.values()].map((x) =>
    `<tr><td>${esc(x.key)}</td><td>${x.attempts ? Math.round((x.correct / x.attempts) * 1000) / 10 + '％' : '—'}</td><td>${x.mastered}/${x.total}</td></tr>`).join('');
  // 成就徽章
  const strk = liveStreak();
  const badges = [
    { on: s.practiced >= 50, t: '練習 50 題' },
    { on: s.practiced >= 200, t: '練習 200 題' },
    { on: s.practiced >= s.total, t: '全部練過' },
    { on: strk >= 3, t: '連續 3 天' },
    { on: strk >= 7, t: '連續 7 天' },
    { on: strk >= 30, t: '連續 30 天' },
    { on: recAcc != null && recAcc >= 80, t: '近期 80% 命中' },
    { on: [...byCh.values()].some((c) => c.total > 0 && c.mastered === c.total), t: '某範圍全掌握' },
  ];
  const badgeHtml = badges.map((b) => `<span class="badge ${b.on ? '' : 'lock'}">${b.on ? '✓ ' : ''}${b.t}</span>`).join('');
  // 最近 14 天題數趨勢
  const days14 = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(today() + 'T00:00:00'); d.setDate(d.getDate() - i); days14.push(ymd(d)); }
  const hist = store.history || {};
  const maxA = Math.max(1, ...days14.map((d) => (hist[d] && hist[d].a) || 0));
  const bars = days14.map((d) => `<div class="bar" style="height:${Math.round((((hist[d] && hist[d].a) || 0) / maxA) * 100)}%" title="${d}:${(hist[d] && hist[d].a) || 0} 題"></div>`).join('');
  view.innerHTML = `
    <section class="card">
      <h2>學習統計</h2>
      <div class="grid">
        <div><b>${cover}％</b><span>涵蓋率（練過 ${s.practiced}/${s.total}）</span></div>
        <div><b>${recAcc == null ? '—' : recAcc + '％'}</b><span>近期正確率（最近 ${rec.length}）</span></div>
        <div><b>${s.wrongNow}</b><span>目前錯題</span></div>
        <div><b>${s.mastered}</b><span>已掌握</span></div>
      </div>
      <p class="muted" style="font-size:13px">「掌握」= 同一題連續答對 2 次。用「智慧複習」會優先讓你重做沒掌握與答錯的題，掌握數才會往上跑。</p>
      <h3>成就</h3>
      <div class="badges">${badgeHtml}</div>
      <h3>最近 14 天題數</h3>
      <div class="trend">${bars}</div>
      <div class="trend-lab"><span>${days14[0].slice(5)}</span><span>今天</span></div>
      <h3>各範圍弱點</h3>
      <table>
        <tr><th>範圍</th><th>正確率</th><th>掌握</th></tr>
        ${chRows}
      </table>
    </section>`;
}

function settings() {
  setNav('settings');
  if (SYNC_URL) pushSync(); // 打開設定頁就把最新進度上傳，確保拿碼去別台時雲端已是最新
  const remHour = (store.settings && store.settings.reminderHour) || 20;
  view.innerHTML = `
    <section class="card">
      <h2>設定</h2>
      <h3>安裝成 App</h3>
      <p class="muted">裝起來有 App icon、可全螢幕、離線也能刷。</p>
      <button id="set-install">安裝</button>
      <span id="set-install-msg" class="muted"></span>

      <h3>學習目標</h3>
      <label>每日目標題數
        <input id="set-goal" type="number" min="1" max="611" value="${dailyGoal()}">
      </label>
      <label>考試日期（首頁倒數用）
        <input id="set-exam" type="date" value="${(store.settings && store.settings.examDate) || ''}">
      </label>

      <h3>每日提醒（推播）</h3>
      <p class="muted">到設定時間若今天還沒練，會推播提醒你刷題。iPhone 需先把本站「加到主畫面」，並從安裝後的 App 開啟才收得到。</p>
      <label>提醒時間
        <select id="rem-hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === remHour ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select>
      </label>
      <button id="rem-toggle">${pushSupported() ? '載入中…' : '此瀏覽器不支援推播'}</button>
      <button id="rem-test">傳測試通知</button>
      <span id="rem-msg" class="muted"></span>

      <h3>同步碼</h3>
      <p class="muted">${SYNC_URL
        ? '平常背景自動同步（每隔幾秒、切走 App 時、打開本頁時都會上傳）。換新裝置時：先在舊裝置打開這頁（會上傳），再到新裝置輸入這組碼。'
        : '雲端同步尚未啟用（需在 app.js 填入 Worker 網址）。目前可用下方「匯出/匯入」轉移。'}</p>
      <p class="code" id="code">${esc(store.syncCode)}</p>
      <label>在新裝置輸入既有同步碼
        <input id="code-in" placeholder="例如 fox-river-82">
      </label>
      <button id="code-set">套用此碼</button>
      ${SYNC_URL ? '<button id="sync-now">立即同步</button>' : ''}
      <span id="sync-msg" class="muted"></span>

      <h3>備份 / 轉移</h3>
      <button id="exp">匯出進度（JSON）</button>
      <button id="imp-btn">匯入進度（JSON）</button>
      <input id="imp" type="file" accept="application/json" hidden>
      <button id="exp-md">匯出筆記（Markdown）</button>

      <h3 class="danger">重設</h3>
      <button class="danger" id="reset">清除本機所有進度</button>
    </section>`;
  const insBtn = $('#set-install'), insMsg = $('#set-install-msg');
  if (insBtn) {
    if (isStandalone()) { insBtn.textContent = '已安裝 ✓'; insBtn.disabled = true; }
    else if (deferredInstall) {
      insBtn.onclick = async () => {
        deferredInstall.prompt();
        const c = await deferredInstall.userChoice.catch(() => ({}));
        if (c && c.outcome === 'accepted') { insBtn.textContent = '已安裝 ✓'; insBtn.disabled = true; dismissInstallBar(); }
        deferredInstall = null;
      };
    } else {
      insBtn.disabled = true;
      insBtn.textContent = '由瀏覽器選單安裝';
      insMsg.textContent = /iphone|ipad|ipod/i.test(navigator.userAgent)
        ? '（iPhone:Safari 分享鈕 → 加入主畫面）'
        : '（Chrome ⋮ 選單 → 安裝應用程式 / 加到主畫面）';
    }
  }
  $('#set-goal').onchange = (e) => { store.settings ||= {}; store.settings.dailyGoal = Math.max(1, +e.target.value || 20); save(); };
  $('#set-exam').onchange = (e) => { store.settings ||= {}; store.settings.examDate = e.target.value; save(); };
  if ($('#rem-hour')) $('#rem-hour').onchange = async (e) => {
    store.settings ||= {}; store.settings.reminderHour = +e.target.value; save();
    if (await pushIsOn()) { await enablePush(+e.target.value); $('#rem-msg').textContent = '提醒時間已更新'; }
  };
  if (pushSupported() && $('#rem-toggle')) {
    const btn = $('#rem-toggle');
    pushIsOn().then((on) => { btn.textContent = on ? '關閉提醒' : '開啟提醒'; });
    btn.onclick = async () => {
      btn.disabled = true; $('#rem-msg').textContent = '處理中…';
      try {
        if (await pushIsOn()) { await disablePush(); btn.textContent = '開啟提醒'; $('#rem-msg').textContent = '已關閉提醒'; }
        else {
          const r = await enablePush((store.settings && store.settings.reminderHour) || 20);
          if (r.ok) { btn.textContent = '關閉提醒'; $('#rem-msg').textContent = '已開啟，每天到點提醒'; }
          else { $('#rem-msg').textContent = '開啟失敗：' + (r.reason || '請稍後再試'); }
        }
      } catch { $('#rem-msg').textContent = '發生錯誤，請稍後再試'; }
      btn.disabled = false;
    };
  }
  if ($('#rem-test')) $('#rem-test').onclick = async () => {
    $('#rem-msg').textContent = '傳送測試中…';
    try {
      const r = await fetch(`${SYNC_URL}/push/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: store.syncCode }) });
      const j = await r.json().catch(() => ({}));
      $('#rem-msg').textContent = r.ok ? '已傳送，看通知有沒有跳出' : (j.error === 'not_subscribed' ? '請先「開啟提醒」' : '失敗：' + (j.error || r.status));
    } catch { $('#rem-msg').textContent = '傳送失敗'; }
  };
  $('#code-set').onclick = async () => {
    const v = $('#code-in').value.trim();
    if (!v) return;
    store.syncCode = v;
    store.updatedAt = 0; // 讓開啟時的 pull 一定採用雲端那份
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    if (SYNC_URL) await pullSync();
    settings();
  };
  if ($('#sync-now')) $('#sync-now').onclick = async () => {
    $('#sync-msg').textContent = '同步中…';
    const pulled = await pullSync();
    const pushed = await pushSync();
    $('#sync-msg').textContent = pushed || pulled ? '已同步' : '同步失敗（檢查網路或同步碼）';
    if (pulled) setTimeout(settings, 600);
  };
  $('#exp').onclick = () => download('ipas-progress.json', JSON.stringify(store, null, 2), 'application/json');
  $('#exp-md').onclick = () => download('ipas-notes.md', toMarkdown(DATA.questions, store.q), 'text/markdown');
  $('#imp-btn').onclick = () => $('#imp').click();
  $('#imp').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (s && s.q) { store = s; save(); alert('已匯入。'); home(); }
      else alert('檔案格式不符。');
    } catch { alert('讀取失敗。'); }
  };
  $('#reset').onclick = () => {
    if (confirm('確定清除本機所有作答進度與筆記？')) { store = { v: 1, syncCode: makeCode(), q: {} }; save(); settings(); }
  };
}

// 從 UA 粗略判斷裝置/瀏覽器,給「意見回饋」表單預填(僅 OS + 瀏覽器名,不含版本)
function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '其他';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
    : /Version\/[\d.]+.*Safari/.test(ua) ? 'Safari' : '瀏覽器';
  return `${os} · ${br}`;
}

const ROUTES = { home, mock: mockSetup, wrong: wrongbook, notes, stats, settings };

// ---- boot ----
async function boot() {
  document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => ROUTES[b.dataset.v]()));
  // 「意見回饋」連結自動帶入裝置/瀏覽器(GitHub issue form 以 &env= 預填同名欄位)
  const fbLink = document.getElementById('fb-link');
  if (fbLink) fbLink.href += `&env=${encodeURIComponent(deviceLabel())}`;
  if (isStandalone() || installBarOff()) { const b = document.getElementById('installbar'); if (b) b.hidden = true; }
  const ib = document.getElementById('install-btn');
  if (ib) ib.onclick = async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => {});
    dismissInstallBar();
  };
  const ix = document.getElementById('install-x');
  if (ix) ix.onclick = dismissInstallBar;
  try {
    DATA = await (await fetch('questions.json')).json();
  } catch {
    view.innerHTML = `<section class="card"><p class="bad">載入 questions.json 失敗。請用本機伺服器開啟（例如 <code>python3 -m http.server</code>）。</p></section>`;
    return;
  }
  try { CONCEPTS = ((await (await fetch('concepts.json')).json()).cards) || []; } catch { CONCEPTS = []; }
  if (DATA.meta?.title) $('#title').textContent = DATA.meta.title;
  if (DATA.meta?.note) { const n = $('#banner'); n.textContent = DATA.meta.note; n.hidden = false; }
  localStorage.setItem(STORE_KEY, JSON.stringify(store)); // 落地可能新生成的 syncCode(不動 updatedAt)
  if (SYNC_URL) await pullSync(); // 開啟先拉雲端，單人多裝置就不會互蓋
  document.addEventListener('visibilitychange', () => { if (document.hidden) pushSync(); });
  home();
}
boot();
