#!/usr/bin/env bash
# 把 iPAS 公告試題 PDF 轉成文字,供結構化成 questions.json。
# 用法: ./tools/extract.sh '<PDF網址>' out.txt
# PDF 直連網址形如 https://www.ipas.org.tw/api/proxy/uploads/certification_resource/<hash>/<檔名>.pdf
# (在 https://ipd.nat.gov.tw/ipas/certification/AIAP/learning-resources 用瀏覽器開發者工具的 Network 看真實連結)
set -euo pipefail
URL="$1"; OUT="${2:-exam.txt}"
command -v pdftotext >/dev/null || { echo "需要 poppler-utils (pdftotext)"; exit 1; }
TMP="$(mktemp --suffix=.pdf)"
curl -fsSL "$URL" -o "$TMP"
pdftotext -layout "$TMP" "$OUT"
rm -f "$TMP"
echo "已輸出 $OUT($(wc -l < "$OUT") 行)。答案在最左欄,逐題結構化成 questions.json 即可。"
# ponytail: 不寫脆弱的 regex parser 去硬解版面(全形答案字、換行題幹、各卷版面不同)。
# 結構化交給 LLM 讀這份文字輸出 JSON,比正則穩,且這批 PDF 一年才更新兩次,值不得養 parser。
