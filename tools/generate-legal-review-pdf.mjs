import { chromium } from "playwright";
import { legalDocs, LEGAL_UPDATED } from "../frontend/src/constants/legal.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outputDir = path.resolve("legal-review");
const outputPath = path.join(outputDir, "RCS-Travels-Legal-Documents-Lawyer-Review.pdf");
const previewPath = path.join(outputDir, "RCS-Travels-Legal-Documents-Lawyer-Review-preview.png");

const order = [
  "/terms",
  "/privacy",
  "/refunds",
  "/grievance",
  "/driver-terms",
  "/driver-privacy",
  "/driver-payments",
  "/driver-grievance",
];

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const inlineMarkup = (value = "") => {
  const escaped = escapeHtml(value);
  const linked = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2">$1</a>',
  );
  return linked.replace(
    /(\[TO CONFIRM:[\s\S]*?\])/g,
    '<span class="to-confirm">$1</span>',
  );
};

const renderParagraphs = (items = []) => items.map((text) => {
  const isConfirm = text.includes("[TO CONFIRM:");
  return `<p class="${isConfirm ? "confirm-block" : ""}">${inlineMarkup(text)}</p>`;
}).join("");

const renderList = (items = []) => {
  if (!items.length) return "";
  return `<ul>${items.map((item) => `<li>${inlineMarkup(item)}</li>`).join("")}</ul>`;
};

const documentsHtml = order.map((route, index) => {
  const doc = legalDocs[route];
  if (!doc) throw new Error(`Missing legal document for ${route}`);
  const sections = doc.sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.heading)}</h2>
      ${renderParagraphs(section.body)}
      ${renderList(section.list)}
      ${renderParagraphs(section.after)}
    </section>
  `).join("");

  return `
    <article class="document ${index > 0 ? "page-break" : ""}">
      <div class="doc-kicker">RCS Travels - Draft for Legal Review</div>
      <h1>${escapeHtml(doc.title)}</h1>
      <p class="standfirst">${escapeHtml(doc.standfirst)}</p>
      <p class="effective-date"><strong>Effective date:</strong> ${inlineMarkup(LEGAL_UPDATED)}</p>
      ${sections}
    </article>
  `;
}).join("");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>RCS Travels Legal Documents - Lawyer Review Draft</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 16mm 18mm;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #171717;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.52;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .cover {
      min-height: 255mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      page-break-after: always;
    }
    .brand {
      font-size: 12pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 14mm;
    }
    .cover h1 {
      font-size: 31pt;
      line-height: 1.08;
      margin: 0 0 7mm;
      max-width: 150mm;
    }
    .cover .subtitle {
      font-size: 15pt;
      color: #4a4a4a;
      margin: 0 0 18mm;
    }
    .cover-note {
      border-left: 4px solid #202020;
      padding: 3mm 0 3mm 5mm;
      max-width: 150mm;
      color: #3d3d3d;
    }
    .cover-meta {
      margin-top: 18mm;
      color: #666;
      font-size: 9.5pt;
    }
    .document.page-break { page-break-before: always; }
    .doc-kicker {
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      font-size: 8.5pt;
      font-weight: 700;
      margin-bottom: 2.5mm;
    }
    .document > h1 {
      font-size: 24pt;
      line-height: 1.12;
      margin: 0 0 2mm;
    }
    .standfirst {
      font-size: 12pt;
      color: #555;
      margin: 0 0 3mm;
    }
    .effective-date {
      font-size: 9.5pt;
      color: #555;
      margin: 0 0 9mm;
      padding-bottom: 4mm;
      border-bottom: 1px solid #d6d6d6;
    }
    section { margin: 0 0 6mm; }
    h2 {
      font-size: 13pt;
      line-height: 1.25;
      margin: 0 0 2mm;
      page-break-after: avoid;
    }
    p { margin: 0 0 3mm; orphans: 3; widows: 3; }
    ul {
      margin: 1.5mm 0 3mm 5mm;
      padding-left: 4.5mm;
    }
    li { margin: 0 0 1.6mm; }
    a { color: #202020; text-decoration: underline; }
    .confirm-block {
      background: #fff4d6;
      border: 1px solid #e7c66b;
      border-radius: 4px;
      padding: 3mm 3.5mm;
      page-break-inside: avoid;
    }
    .to-confirm { font-weight: 700; }
  </style>
</head>
<body>
  <div class="cover">
    <div class="brand">RCS Travels</div>
    <h1>Legal Documents</h1>
    <p class="subtitle">Draft package for lawyer review</p>
    <div class="cover-note">
      This PDF contains the current customer and driver-facing legal drafts for RCS Travels. It is intended for legal review and is not the final public version. All highlighted <strong>[TO CONFIRM]</strong> items remain unresolved until reviewed and approved.
    </div>
    <div class="cover-meta">Prepared: 13 September 2026</div>
  </div>
  ${documentsHtml}
</body>
</html>`;

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#777;padding-top:4px;">RCS Travels - Draft for Legal Review</div>',
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#777;padding-bottom:4px;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    margin: { top: "20mm", right: "16mm", bottom: "20mm", left: "16mm" },
  });

  const viewer = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
  await viewer.goto(pathToFileURL(outputPath).href, { waitUntil: "load" });
  await viewer.waitForTimeout(1000);
  await viewer.screenshot({ path: previewPath });
} finally {
  await browser.close();
}

console.log(outputPath);
