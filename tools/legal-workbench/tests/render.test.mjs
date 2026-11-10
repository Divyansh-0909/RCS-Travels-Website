import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderPack } from '../render.mjs';

test('artifact rendering preserves headings, tables, wrapped list items and safe source links', () => {
  const html = renderMarkdown('# Title\n\n| Data | Purpose |\n| --- | --- |\n| Phone | Account |\n\n- A long item\n  continued here.\n- Another item.\n\n[Source](https://example.test/law)');
  assert.match(html, /<h1>Title<\/h1>/u);
  assert.match(html, /<thead><tr><th>Data<\/th><th>Purpose<\/th>/u);
  assert.match(html, /<li>A long item continued here\.<\/li>/u);
  assert.match(html, /href="https:\/\/example.test\/law"/u);
});

test('artifact rendering escapes embedded HTML and never activates non-HTTPS Markdown links', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert)\n\n<img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<script|<img|href="javascript:/u);
  assert.match(html, /&lt;script&gt;/u);
});

test('full pack includes eight candidates, two internal appendices and accurate candidate status', async () => {
  const html = await renderPack();
  assert.equal((html.match(/<article\b/gu) ?? []).length, 10);
  assert.match(html, /not adopted, in effect, deployed or independently reviewed/u);
  assert.match(html, /Captain Payments Policy/u);
  assert.match(html, /Indian-source and product review/u);
});
