// 題庫健康檢查 — 把人工查過的慣例固化成可執行檢查,未來加題/加梯次後跑一下就知道有沒有踩坑。
// 用法:node tools/check-questions.mjs   (有「錯誤」會 exit 1;「提醒」只印不擋)
import fs from 'fs';

const q = JSON.parse(fs.readFileSync('questions.json', 'utf8')).questions;
const assets = fs.readdirSync('assets').filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f));
const errors = [];
const warns = [];

// 1) 結構:選項剛好 4 個、answer 0–3、id 不重複
const ids = new Set();
for (const x of q) {
  if (!Array.isArray(x.options) || x.options.length !== 4) errors.push(`${x.id}:options 不是 4 個(${x.options?.length})`);
  if (!(Number.isInteger(x.answer) && x.answer >= 0 && x.answer <= 3)) errors.push(`${x.id}:answer 不在 0–3(${x.answer})`);
  if (ids.has(x.id)) errors.push(`${x.id}:id 重複`);
  ids.add(x.id);
}

// 2) 圖片:壞圖 / 檔名慣例(image 必須 = assets/<id>.png)/ 孤兒圖
const withImg = q.filter((x) => x.image);
const used = new Set();
for (const x of withImg) {
  if (!fs.existsSync(x.image)) errors.push(`${x.id}:image 指到的檔不存在(${x.image})`);
  const want = `assets/${x.id}.webp`;
  if (x.image !== want) errors.push(`${x.id}:image 檔名不符慣例,應為 ${want}(現為 ${x.image})`);
  used.add(x.image.replace(/^assets\//, ''));
}
for (const f of assets) if (!used.has(f)) errors.push(`孤兒圖(沒有題目引用):assets/${f}`);

// 3) 提醒:題幹提到圖、但沒掛 image(可能漏抽圖,如歷史上的 q39);非硬錯,因有少數題沒圖也能答
const refFig = /附圖|如圖|見圖|參考圖|下圖|上圖|右圖|左圖|圖中|圖示|如下圖/;
for (const x of q) if (!x.image && refFig.test(x.question || '')) warns.push(`${x.id}:題幹提到圖卻沒掛 image — 確認是否漏抽圖`);

// 4) 提醒:中文標點 house style 為全形,偵測「中文緊鄰半形 , ; : ? !」或「半形括號夾中文」
const half = /[一-鿿][,;:!?]|[,;:!?][一-鿿]|[一-鿿]\([^()]*[一-鿿]|\([^()]*[一-鿿][^()]*\)/;
let halfCount = 0;
for (const x of q) for (const t of [x.question, x.explanation, ...(x.options || [])]) if (t && half.test(t)) { halfCount++; break; }
if (halfCount) warns.push(`${halfCount} 題有「中文緊鄰半形標點 / 半形括號夾中文」,house style 應全形(夾純英文的括號可維持半形)`);

// 4b) 反向:全形括號（）夾「純 ASCII(含英數)」應改半形()(house style:夾純英文的括號維持半形)
//     內層限定純半形可見字元 [ -~],故含中文或中文標點(如「（A、B）」)不會誤報。
const fullEng = /（[ -~]*[A-Za-z0-9][ -~]*）/;
let fullEngCount = 0;
for (const x of q) for (const t of [x.question, x.explanation, ...(x.options || [])]) if (t && fullEng.test(t)) { fullEngCount++; break; }
if (fullEngCount) warns.push(`${fullEngCount} 題有「全形（）夾純英數」,house style 應半形()(如 （Model）→ (Model))`);

console.log(`題數 ${q.length}|帶圖題 ${withImg.length}|assets 圖 ${assets.length}`);
if (warns.length) { console.log('\n提醒:'); warns.forEach((w) => console.log('  - ' + w)); }
if (errors.length) { console.log('\n錯誤:'); errors.forEach((e) => console.log('  ✗ ' + e)); console.log(`\n共 ${errors.length} 個錯誤`); process.exit(1); }
console.log('\n✓ 全部通過');
