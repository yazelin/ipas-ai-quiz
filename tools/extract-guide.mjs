import fs from 'fs';
const clean=s=>s.replace(/([一-鿿])\s+([一-鿿])/g,'$1$2').replace(/([一-鿿])\s+([一-鿿])/g,'$1$2').replace(/([一-鿿])([A-Za-z0-9])/g,'$1 $2').replace(/([A-Za-z0-9])([一-鿿])/g,'$1 $2').replace(/\s{2,}/g,' ').trim();
const [,, file, level, subjShort, subjFull] = process.argv;
const raw = fs.readFileSync(file,'utf8');
let lines = raw.split('\n').map(l=>l.replace(/[　\t]/g,' ').replace(/\s+/g,' ').trim());
lines = lines.filter(l=>l!=='' && !/^\d+-\d+$/.test(l));
const optRe=/^（\s*([ＡＢＣＤA-D])\s*）\s*(.*)$/, toAZ=c=>'ABCD'['ＡＢＣＤ'.indexOf(c)]??c;
const chHdr=/^第([一二三四五六七八九十]+)章\s*(.+)$/;
const numLine=l=>l.match(/^(\d+)\.\s*(.*)$/);
const items=lines.map(l=>{const o=l.match(optRe),n=numLine(l),h=l.match(chHdr);
  if(h) return {t:'ch',name:h[2].trim()};
  if(o) return {t:'opt',L:toAZ(o[1]),txt:o[2]};
  if(n&&/^Ans/.test(n[2])) return {t:'ans',n:+n[1],a:(n[2].match(/Ans（?([A-D])）?/)||[])[1]};
  if(n) return {t:'num',n:+n[1],txt:n[2]};
  return {t:'text',txt:l};
});
// 題目 + 章名(最近的 ch header)
const Q=[]; let ch=-1,prevN=99,lastCh='';
for(let i=0;i<items.length;i++){
  if(items[i].t==='ch') lastCh=items[i].name;
  if(items[i].t==='opt'&&items[i].L==='A'){
    let j=i-1,tail=[]; while(j>=0&&items[j].t==='text'){tail.unshift(items[j].txt);j--;}
    if(!(j>=0&&items[j].t==='num')) continue;
    const num=items[j].n, stem=(items[j].txt+' '+tail.join(' ')).trim();
    const opts={}; let k=i,curL=null;
    while(k<items.length){const it=items[k];
      if(it.t==='opt'){curL=it.L;opts[curL]=it.txt;}
      else if(it.t==='text'&&curL){opts[curL]+=it.txt;} else break; k++;}
    if(opts.A&&opts.B&&opts.C&&opts.D){ if(num<=prevN)ch++; prevN=num; Q.push({ch,n:num,stem,options:opts,chapter:lastCh}); }
    i=k-1;
  }
}
// 答案
const A=[]; ch=-1;prevN=99;let cur=null; const f=items.findIndex(x=>x.t==='ans');
for(let i=f;i<items.length;i++){const it=items[i];
  if(it.t==='ans'){if(cur)A.push(cur); if(it.n<=prevN)ch++;prevN=it.n; cur={ch,n:it.n,a:it.a,exp:''};}
  else if(cur&&it.t!=='ch'){ cur.exp+=(it.txt||''); }}
if(cur)A.push(cur);
// 組裝
const sIdx=subjShort.replace('科目','');
const out=[]; let seq=0;
for(const q of Q){ const a=A.find(x=>x.ch===q.ch&&x.n===q.n); if(!a) continue; seq++;
  out.push({
    level, round:'學習指引', source:'學習指引', subject:subjFull,
    chapter:q.chapter||subjFull, topic:'',
    question:clean(q.stem),
    options:['A','B','C','D'].map(k=>q.options[k].replace(/\s+$/,'')),
    answer:'ABCD'.indexOf(a.a),
    explanation:clean(a.exp.replace(/^解析[:：]\s*/,'')),
    id:`lg-${level==='初級'?'b':'m'}-s${sIdx}-q${seq}`,
  });
}
fs.writeFileSync(file.replace('.txt','.new.json'), JSON.stringify(out,null,2));
console.log(`${level}${subjShort}: ${out.length} 題  章節:`, [...new Set(out.map(x=>x.chapter))].join(' | '));
