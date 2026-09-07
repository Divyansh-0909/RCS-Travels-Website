import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default;
const root = path.resolve(import.meta.dirname, "../src");
const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
const strings = new Set();

async function filesAt(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesAt(path.join(dir, entry.name))
    : /\.(jsx?|tsx?)$/.test(entry.name) ? [path.join(dir, entry.name)] : []));
  return nested.flat();
}

const clean = (value) => value.replace(/\s+/g, " ").trim();
const add = (value) => {
  const text = clean(value || "");
  if (/[A-Za-z]/.test(text) && text.length > 1 && !/[{}<>]/.test(text)) strings.add(text);
};

for (const file of await filesAt(root)) {
  const source = await fs.readFile(file, "utf8");
  const ast = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
  traverse(ast, {
    JSXText({ node }) { add(node.value); },
    CallExpression({ node }) {
      if (node.callee?.type === "Identifier" && node.callee.name === "tr" && node.arguments[0]?.type === "StringLiteral") add(node.arguments[0].value);
    },
    JSXAttribute({ node }) {
      if (visibleAttributes.has(node.name?.name) && node.value?.type === "StringLiteral") add(node.value.value);
    },
    StringLiteral({ node }) {
      if (file.endsWith(`${path.sep}constants${path.sep}pageMeta.js`) && !node.value.startsWith("/")) add(node.value);
    },
  });
}

const source = [...strings].sort((a, b) => a.localeCompare(b));
async function translateOne(value) {
    const query = new URLSearchParams({ client: "gtx", sl: "en", tl: "hi", dt: "t", q: value });
    query.append("dt", "rm");
    let response;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await fetch(`https://translate.googleapis.com/translate_a/single?${query}`);
      if (response.ok) break;
      if (response.status !== 429) throw new Error(`Translation failed: ${response.status}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
    if (!response?.ok) throw new Error(`Translation failed: ${response?.status}`);
    const json = await response.json();
    const translated = json[0].map((part) => part[0] || "").join("");
    const roman = json[0].map((part) => part[2] || "").join("");
    return { hi: clean(translated), hiLatn: clean(roman || translated) };
}

const existing = {};
for (const locale of ["en", "hi", "hi-Latn"]) {
  const file = path.resolve(import.meta.dirname, `../../shared/i18n/locales/${locale}/website.json`);
  existing[locale] = JSON.parse(await fs.readFile(file, "utf8"));
}
const missing = source.filter((value) => !existing.hi.auto?.[value] || !existing["hi-Latn"].auto?.[value]);
if (process.argv.includes("--audit")) {
  console.log(JSON.stringify(missing, null, 2));
  process.exit(0);
}
const translated = [];
for (const value of source) {
  if (existing.hi.auto?.[value] && existing["hi-Latn"].auto?.[value]) {
    translated.push({ hi: existing.hi.auto[value], hiLatn: existing["hi-Latn"].auto[value] });
  } else {
    translated.push(await translateOne(value));
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}
const hi = translated.map((value) => value.hi);
const hiLatn = translated.map((value) => value.hiLatn);
for (const [locale, values] of [["en", source], ["hi", hi], ["hi-Latn", hiLatn]]) {
  const file = path.resolve(import.meta.dirname, `../../shared/i18n/locales/${locale}/website.json`);
  const catalog = existing[locale];
  catalog.auto = Object.fromEntries(source.map((english, index) => [english, values[index]]));
  await fs.writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(`Generated ${source.length} website translations.`);
