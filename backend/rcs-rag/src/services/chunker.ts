import { createHash } from 'node:crypto';
import { parse } from 'yaml';

export type Metadata = {
  source: string;
  version?: string;
  effectiveFrom?: string | null;
};

export type Chunk = {
  source: string;
  section: string;
  parentSection: string | null;
  title: string;
  version: string;
  effectiveFrom: string | null;
  chunkKey: string;
  content: string;
  metadata: Record<string, unknown>;
};

type Heading = { level: number; title: string; line: number };

export function chunkPolicy(markdown: string, metadata: Metadata): Chunk[] {
  let text = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  let frontmatter: Record<string, unknown> = {};
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---', 4);
    if (end < 0 || !/^\n---(?:\n|$)/.test(text.slice(end))) {
      throw new Error(`Invalid front matter in ${metadata.source}`);
    }
    const parsed: unknown = parse(text.slice(4, end));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Front matter must be a mapping in ${metadata.source}`);
    }
    frontmatter = parsed as Record<string, unknown>;
    text = text.slice(end + 4).trim();
  }

  const effectiveFrom = frontmatter.effective_from ?? metadata.effectiveFrom ?? null;
  if (effectiveFrom !== null && (typeof effectiveFrom !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ||
    !Number.isFinite(Date.parse(effectiveFrom)) ||
    new Date(effectiveFrom).toISOString().slice(0, 10) !== effectiveFrom)) {
    throw new Error(`Invalid effective date in ${metadata.source}`);
  }
  const version = String(frontmatter.version ?? metadata.version ?? 'unversioned');
  const lines = text.split('\n');
  const headings: Heading[] = [];
  let fence: { marker: string; length: number } | null = null;
  for (let line = 0; line < lines.length; line++) {
    const marker = lines[line].match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { marker: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.marker && marker[1].length >= fence.length &&
        /^ {0,3}(?:`+|~+)\s*$/.test(lines[line])) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = lines[line].match(/^(#{1,3})[ \t]+(.+?)\s*#*\s*$/);
    if (heading) headings.push({ level: heading[1].length, title: heading[2], line });
  }

  const titleHeading = headings.find(heading => heading.level === 1);
  const title = titleHeading?.title ?? metadata.source;
  const sections = headings.filter(heading => heading.level >= 2);
  const introEnd = sections[0]?.line ?? lines.length;
  const intro = lines.slice(0, introEnd).filter((_, line) => line !== titleHeading?.line).join('\n').trim();
  const prefix = [
    `# ${title}`,
    frontmatter.status ? `Policy status: ${String(frontmatter.status)}` : '',
    frontmatter.audience ? `Audience: ${String(frontmatter.audience)}` : '',
    intro,
  ].filter(Boolean);

  const chunks: Chunk[] = [];
  const occurrences = new Map<string, number>();
  let parent: Heading | null = null;
  let parentContent = '';
  const add = (section: string, parentSection: string | null, content: string) => {
    if (content.split(/\s+/).length > 500) {
      throw new Error(`Section "${section}" in ${metadata.source} exceeds 500 words; split its content into smaller sections.`);
    }
    const hierarchy = JSON.stringify([parentSection, section]);
    const occurrence = occurrences.get(hierarchy) ?? 0;
    occurrences.set(hierarchy, occurrence + 1);
    chunks.push({
      source: metadata.source, section, parentSection, title, version, effectiveFrom,
      chunkKey: createHash('sha256').update(`${hierarchy}:${occurrence}`).digest('hex'),
      content,
      metadata: { ...frontmatter, title, parent_section: parentSection },
    });
  };

  if (!sections.length) {
    if (intro) add(title, null, prefix.join('\n\n'));
    return chunks;
  }
  for (let index = 0; index < sections.length; index++) {
    const heading = sections[index];
    const end = sections[index + 1]?.line ?? lines.length;
    const body = lines.slice(heading.line, end).join('\n').trim();
    if (heading.level === 2) {
      parent = heading;
      parentContent = body;
      // Heading-only parents supply context without becoming standalone chunks.
      if (lines.slice(heading.line + 1, end).join('\n').trim()) {
        add(heading.title, null, [...prefix, body].join('\n\n'));
      }
    } else {
      add(heading.title, parent?.title ?? null, [...prefix, parentContent, body].filter(Boolean).join('\n\n'));
    }
  }
  return chunks;
}

export default chunkPolicy;
