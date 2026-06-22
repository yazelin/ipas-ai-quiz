import { nextBox, isMastered, scoreExam, progressStats, wrongQuestionIds, toMarkdown } from './core.js';

const STORE_KEY = 'ipas_quiz_progress';
// 部署 Cloudflare Worker 後填入,例如 'https://ipas-quiz-sync.你的帳號.workers.dev'。留空=只用本機。
const SYNC_URL = 'https://ipas-quiz-sync.yazelinj303.workers.dev';
const $ = (sel) => document.querySelector(sel);
const view = $('#view');

let DATA = { meta: {}, questions: [] };
let store = load();
let pushTimer = null;

// ---- localStorage ----
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.q) return s;
  } catch {}
  return { v: 1, syncCode: makeCode(), q: {}, updatedAt: 0 };
}
function save() {
  store.updatedAt = Date.now();
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  schedulePush();
}

// ---- 雲端同步(同步碼,免帳號) ----
function schedulePush() {
  if (!SYNC_URL) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushSync, 30000); // ponytail: debounce 30s,避免每答一題寫一次 KV
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

// 範圍 = 章節(若題目尚未分類則退回科目),供「選擇練習範圍」用
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
  view.innerHTML = `
    <section class="card">
      <h2>練習模式</h2>
      <p class="muted">即時看答案與解析。勾選要練的範圍,預設全選。</p>
      <div class="row range-head"><span class="muted" id="range-sum"></span>
        <span><button id="sel-all">全選</button><button id="sel-none">清除</button></span></div>
      <div id="ranges">${ranges}</div>
      <label>關鍵字(選填)
        <input id="pr-kw" placeholder="例如 RAG、特徵工程、Transformer">
      </label>
      <label>題數
        <select id="pr-count"><option value="10">10</option><option value="20">20</option><option value="0">全部(選取範圍)</option></select>
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
    $('#range-sum').textContent = `已選 ${keys.size} 範圍,共 ${pickPool().length} 題`;
  };
  view.querySelectorAll('.rng').forEach((c) => (c.onchange = updateSum));
  $('#pr-kw').oninput = updateSum;
  $('#sel-all').onclick = () => { view.querySelectorAll('.rng').forEach((c) => (c.checked = true)); updateSum(); };
  $('#sel-none').onclick = () => { view.querySelectorAll('.rng').forEach((c) => (c.checked = false)); updateSum(); };
  $('#pr-start').onclick = () => {
    const count = +$('#pr-count').value;
    let pool = shuffle(pickPool());
    if (count) pool = pool.slice(0, count);
    runPractice(pool);
  };
  updateSum();
}

function runPractice(pool, opts = {}) {
  let i = 0;
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
    if (correct) p.correct++; else p.wrong++;
    p.box = nextBox(p.box, correct);
    save();
    view.querySelectorAll('.opt').forEach((b, idx) => {
      b.disabled = true;
      if (idx === q.answer) b.classList.add('correct');
      if (idx === k && !correct) b.classList.add('wrong');
    });
    $('#fb').innerHTML = `
      <p class="${correct ? 'ok' : 'bad'}">${correct ? '答對' : '答錯'}（正解：${esc(q.options[q.answer])}）</p>
      ${q.explanation ? `<p class="exp">${esc(q.explanation)}</p>` : ''}
      <label class="note">筆記<textarea id="note" rows="2" placeholder="寫下你的理解或記憶點…">${esc(p.note || '')}</textarea></label>
      <button class="primary" id="next">${i + 1 < pool.length ? '下一題' : '完成'}</button>`;
    $('#note').oninput = (e) => { p.note = e.target.value; save(); };
    $('#next').onclick = () => { i++; i < pool.length ? render() : home(); };
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
      <p class="muted">整份計時作答,交卷前不顯示答案。練臨場與時間分配。</p>
      <label>試卷<select id="mk-paper">${opts}</select></label>
      <label>時間(分鐘)<input id="mk-min" type="number" value="${lim}" min="1"></label>
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
  const timer = setInterval(() => {
    remaining--;
    const t = $('#timer');
    if (t) t.textContent = `${String((remaining / 60) | 0).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    if (remaining <= 0) { clearInterval(timer); submit(); }
  }, 1000);

  const render = () => {
    const q = pool[i];
    view.innerHTML = `
      <section class="card">
        <div class="row"><span class="muted">${i + 1} / ${pool.length}</span><span id="timer" class="timer">--:--</span></div>
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
    view.querySelectorAll('.opt').forEach((b) => (b.onclick = () => { answers[i] = +b.dataset.k; render(); }));
    if ($('#prev')) $('#prev').onclick = () => { i--; render(); };
    if ($('#next')) $('#next').onclick = () => { i++; render(); };
    if ($('#submit')) $('#submit').onclick = submit;
  };
  function submit() {
    clearInterval(timer);
    // 計入進度(模擬考也更新 Leitner / 統計)
    pool.forEach((q, idx) => {
      const p = qp(q.id);
      const correct = answers[idx] === q.answer;
      p.attempts++;
      if (correct) p.correct++; else p.wrong++;
      p.box = nextBox(p.box, correct);
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
      <p class="muted">目前錯題 ${ids.length} 題（答對 ${require_master()} 次升一格,到第 5 格算掌握,就會移出）。</p>
      ${ids.length ? `<button class="primary" id="drill">只練這些錯題</button>` : '<p>目前沒有錯題,繼續加油。</p>'}
      <ul class="wrong">${list.map((q) => `<li>${esc(q.question)} <span class="muted">（${esc(q.subject)}・第 ${qp(q.id).box} 格）</span></li>`).join('')}</ul>
    </section>`;
  if (ids.length) $('#drill').onclick = () => runPractice(shuffle(list));
}
function require_master() { return 1; } // ponytail: 文案用,Leitner 升格規則在 core.nextBox

function stats() {
  setNav('stats');
  const s = progressStats(DATA.questions, store.q);
  // 各章節(範圍)正確率與掌握度
  const byCh = new Map();
  for (const q of DATA.questions) {
    const k = rangeKey(q);
    const p = store.q[q.id] || {};
    const c = byCh.get(k) || { key: k, total: 0, attempts: 0, correct: 0, mastered: 0 };
    c.total++; c.attempts += p.attempts || 0; c.correct += p.correct || 0;
    if ((p.box || 1) >= 5) c.mastered++;
    byCh.set(k, c);
  }
  const chRows = [...byCh.values()].map((x) =>
    `<tr><td>${esc(x.key)}</td><td>${x.attempts ? Math.round((x.correct / x.attempts) * 1000) / 10 + '％' : '—'}</td><td>${x.mastered}/${x.total}</td></tr>`).join('');
  view.innerHTML = `
    <section class="card">
      <h2>學習統計</h2>
      <div class="grid">
        <div><b>${s.total}</b><span>總題數</span></div>
        <div><b>${s.practiced}</b><span>已練習</span></div>
        <div><b>${s.wrongNow}</b><span>目前錯題</span></div>
        <div><b>${s.mastered}</b><span>已掌握</span></div>
      </div>
      <h3>各範圍弱點</h3>
      <table>
        <tr><th>範圍</th><th>正確率</th><th>掌握</th></tr>
        ${chRows}
      </table>
    </section>`;
}

function settings() {
  setNav('settings');
  view.innerHTML = `
    <section class="card">
      <h2>設定</h2>
      <h3>同步碼</h3>
      <p class="muted">${SYNC_URL
        ? '平常背景自動同步,不用管它。換新裝置時,在新裝置輸入這組碼一次即可接上進度。'
        : '雲端同步尚未啟用(需在 app.js 填入 Worker 網址)。目前可用下方「匯出/匯入」轉移。'}</p>
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
      <button id="exp-md">匯出星標筆記（Markdown）</button>

      <h3 class="danger">重設</h3>
      <button class="danger" id="reset">清除本機所有進度</button>
    </section>`;
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
    $('#sync-msg').textContent = pushed || pulled ? '已同步' : '同步失敗(檢查網路或同步碼)';
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
    if (confirm('確定清除本機所有作答進度與筆記?')) { store = { v: 1, syncCode: makeCode(), q: {} }; save(); settings(); }
  };
}

const ROUTES = { home, mock: mockSetup, wrong: wrongbook, stats, settings };

// ---- boot ----
async function boot() {
  document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => ROUTES[b.dataset.v]()));
  try {
    DATA = await (await fetch('questions.json')).json();
  } catch {
    view.innerHTML = `<section class="card"><p class="bad">載入 questions.json 失敗。請用本機伺服器開啟(例如 <code>python3 -m http.server</code>)。</p></section>`;
    return;
  }
  if (DATA.meta?.title) $('#title').textContent = DATA.meta.title;
  if (DATA.meta?.note) { const n = $('#banner'); n.textContent = DATA.meta.note; n.hidden = false; }
  localStorage.setItem(STORE_KEY, JSON.stringify(store)); // 落地可能新生成的 syncCode(不動 updatedAt)
  if (SYNC_URL) await pullSync(); // 開啟先拉雲端,單人多裝置就不會互蓋
  document.addEventListener('visibilitychange', () => { if (document.hidden) pushSync(); });
  home();
}
boot();
