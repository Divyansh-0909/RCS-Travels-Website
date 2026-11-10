import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ROOT, createWorkbench } from './workbench.mjs';

const escape = value => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
function inline(text) {
  return escape(text).replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/gu, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/gu, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
}

export function renderMarkdown(markdown) {
  return markdown.trim().split(/\r?\n\s*\r?\n/u).map(block => {
    const lines = block.split(/\r?\n/u);
    if (/^#{1,3} /u.test(block)) {
      const level = block.match(/^#+/u)[0].length;
      return `<h${level}>${inline(block.slice(level + 1))}</h${level}>`;
    }
    if (lines[0].startsWith('|') && lines[1]?.match(/^\|[\s:|-]+\|$/u)) {
      const cells = line => line.trim().replace(/^\||\|$/gu, '').split('|').map(cell => cell.trim());
      const header = cells(lines[0]).map(cell => `<th>${inline(cell)}</th>`).join('');
      const rows = lines.slice(2).map(line => `<tr>${cells(line).map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('');
      return `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    if (/^- /u.test(block)) return `<ul>${block.split(/\n(?=- )/u).map(item => `<li>${inline(item.slice(2).replace(/\s*\n\s*/gu, ' '))}</li>`).join('')}</ul>`;
    if (/^\d+\. /u.test(block)) return `<ol>${block.split(/\n(?=\d+\. )/u).map(item => `<li>${inline(item.replace(/^\d+\. /u, '').replace(/\s*\n\s*/gu, ' '))}</li>`).join('')}</ol>`;
    return `<p>${inline(block.replace(/\s*\n\s*/gu, ' '))}</p>`;
  }).join('\n');
}

export async function renderPack() {
  const call = createWorkbench();
  const { documents } = await call('legal_document');
  const articles = [];
  for (const id of documents) {
    const { text } = await call('legal_document', { id });
    articles.push(`<article id="${id}">${renderMarkdown(text)}</article>`);
  }
  for (const filename of ['ADOPTION.md', 'RESEARCH.md']) articles.push(`<article class="appendix">${renderMarkdown(await readFile(path.join(ROOT, filename), 'utf8'))}</article>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RCS Travels — Legal Document Candidates — 1 November 2026</title><style>
  *{box-sizing:border-box} body{margin:0;color:#16202a;background:#eef1f4;font:16px/1.55 Georgia,'Times New Roman',serif} main{max-width:900px;margin:24px auto;background:white;padding:54px 64px} h1,h2,h3{font-family:Arial,sans-serif;color:#172f44;line-height:1.2;break-after:avoid} h1{font-size:27px;margin:0 0 22px} h2{font-size:18px;margin:28px 0 10px} h3{font-size:16px} p{margin:0 0 13px} a{color:#174c77;overflow-wrap:anywhere} code{font:12px/1.4 monospace;overflow-wrap:anywhere} table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px} th,td{border:1px solid #cbd3da;padding:9px;vertical-align:top;text-align:left;overflow-wrap:anywhere} th{background:#edf2f5} tr{break-inside:avoid} li{margin:0 0 9px} article{padding-top:34px;margin-top:40px;border-top:1px solid #bbc7d0} .cover{padding:20px 0 40px} .cover h1{font-size:38px} .status{border-left:4px solid #98722c;padding:13px 17px;background:#fcf8ed;font-family:Arial,sans-serif;font-size:14px} .contents{font-family:Arial,sans-serif;font-size:14px} .appendix{font-size:14px}
  @page{size:A4;margin:18mm 17mm 19mm} @media print{body{background:white;font-size:10.5pt;line-height:1.48} main{max-width:none;margin:0;padding:0} h1{font-size:21pt} h2{font-size:13pt;margin-top:19px} table{font-size:9pt} th,td{padding:6px} article{break-before:page;border:0;margin:0;padding:0}.cover{break-after:page;padding:12mm 0 0}.cover h1{font-size:29pt}.appendix{font-size:9.5pt} a{color:inherit;text-decoration:none}}
  @media screen and (max-width:640px){main{margin:0;padding:28px 20px}table{font-size:12px}th,td{padding:5px}.cover h1{font-size:30px}}
  </style></head><body><main><section class="cover"><h1>RCS Travels<br>Legal document candidates</h1><p>Prepared 1 November 2026 · English · India</p><p class="status">Eight completed drafting candidates. They are not adopted, in effect, deployed or independently reviewed. Source and operational gaps are recorded in the appendices. This pack does not certify legal compliance.</p><ol class="contents">${documents.map(id => `<li><a href="#${id}">${id.slice(3).replace(/-/gu, ' ')}</a></li>`).join('')}</ol><p>RCS Legal Workbench · local Codex workflow</p></section>${articles.join('\n')}</main></body></html>`;
}

async function main() {
  const [directory] = process.argv.slice(2);
  if (!directory) throw new Error('Usage: node render.mjs <existing-export-directory>');
  const destination = path.resolve(directory);
  const htmlPath = path.join(destination, 'RCS-Travels-Legal-Candidates.html');
  await writeFile(htmlPath, await renderPack(), { encoding: 'utf8', flag: 'wx' });
  // Optional artifact generation uses the project's existing Playwright installation.
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1500 } });
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: path.join(destination, 'RCS-Travels-Legal-Candidates.pdf'), format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<div style="width:100%;font-size:8px;color:#596575;padding:0 18mm;display:flex;justify-content:space-between"><span>RCS Travels · Candidate, not adopted · 1 November 2026</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
    await page.screenshot({ path: path.join(destination, 'preview-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(destination, 'preview-mobile.png'), fullPage: false });
    process.stdout.write(`${JSON.stringify({ html: htmlPath, pdf: path.join(destination, 'RCS-Travels-Legal-Candidates.pdf') })}\n`);
  } finally { await browser.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
