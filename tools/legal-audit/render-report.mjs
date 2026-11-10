import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { renderMarkdown } from '../legal-workbench/render.mjs';

const directory = path.resolve('legal-review/2026-11-01-audit');
const markdown = await readFile(path.join(directory, 'README.md'), 'utf8');
const decisions = await readFile(path.join(directory, 'DECISIONS.md'), 'utf8');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>RCS Travels — Legal contradictions and owner decisions</title><style>
body{margin:0;color:#162b3b;font:14px/1.5 Arial,sans-serif;background:#edf1f4}main{max-width:1450px;margin:24px auto;background:white;padding:40px}h1{font-size:26px;line-height:1.2}h2{font-size:19px;margin-top:32px;break-after:avoid}p{max-width:100ch}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;margin:18px 0}th,td{border:1px solid #bfcbd3;vertical-align:top;text-align:left;padding:9px;overflow-wrap:break-word}th{background:#eaf0f4;color:#122e43}tr{break-inside:avoid}thead{display:table-header-group}table th:first-child{width:17%}a{color:#174c77}code{font:11px/1.4 monospace;overflow-wrap:anywhere}li{margin-bottom:8px}.decisions{break-before:page}strong{color:#122e43}@page{size:A4 landscape;margin:15mm 13mm 17mm}@media print{body{background:white;font-size:9pt;line-height:1.4}main{padding:0;margin:0;max-width:none}h1{font-size:18pt}h2{font-size:13pt;margin-top:20px}table{font-size:8pt}th,td{padding:6px}code{font-size:7.5pt}a{color:inherit;text-decoration:none}}
</style></head><body><main>${renderMarkdown(markdown)}<section class="decisions">${renderMarkdown(decisions)}</section></main></body></html>`;
const filename = path.join(directory, 'RCS-Legal-Contradictions-and-Decisions-2026-11-01');
await writeFile(`${filename}.html`, html);
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(pathToFileURL(`${filename}.html`).href);
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.pdf({ path: `${filename}.pdf`, format: 'A4', landscape: true, printBackground: true, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<div style="font-size:8px;color:#53606b;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>RCS Travels · Law versus documents/product · 1 November 2026</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
  await page.screenshot({ path: path.join(directory, 'report-preview.png') });
  console.log(JSON.stringify({ pdf: `${filename}.pdf`, horizontalOverflow: overflow }));
} finally { await browser.close(); }
