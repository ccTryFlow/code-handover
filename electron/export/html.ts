import * as fs from 'fs/promises';
import * as path from 'path';
import type { ProjectAnalysisResult } from '../types';
import { buildMarkdownContent } from './markdown';

export async function generateHtml(result: ProjectAnalysisResult, outputPath: string): Promise<string> {
  const html = buildHtmlDocument(await buildMarkdownContent(result), `${result.projectName} 交接文档`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, 'utf-8');
  return outputPath;
}

export function buildHtmlDocument(markdown: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: "Microsoft YaHei", "Segoe UI", sans-serif; }
    body { margin: 0; color: #1e293b; background: #f8fafc; line-height: 1.75; }
    main { box-sizing: border-box; max-width: 980px; margin: 32px auto; padding: 42px 54px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 16px 38px rgba(15, 23, 42, .08); }
    h1, h2, h3, h4 { color: #0f172a; line-height: 1.35; }
    h1 { margin-top: 0; padding-bottom: 14px; border-bottom: 2px solid #2563eb; }
    h2 { margin-top: 34px; padding-bottom: 8px; border-bottom: 1px solid #dbeafe; }
    h3 { margin-top: 26px; color: #1d4ed8; }
    p { margin: 10px 0; }
    ul, ol { padding-left: 26px; }
    li { margin: 5px 0; }
    code { padding: 2px 5px; border-radius: 5px; color: #be123c; background: #f1f5f9; font-family: Consolas, monospace; }
    pre { overflow-x: auto; padding: 14px 16px; border-radius: 10px; color: #e2e8f0; background: #0f172a; }
    pre code { padding: 0; color: inherit; background: transparent; }
    blockquote { margin: 14px 0; padding: 2px 16px; border-left: 4px solid #93c5fd; color: #475569; background: #eff6ff; }
    @media print { body { background: #fff; } main { max-width: none; margin: 0; padding: 0; border: 0; box-shadow: none; } }
  </style>
</head>
<body>
  <main>${renderMarkdown(markdown)}</main>
</body>
</html>`;
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let listType = '';
  let inCodeBlock = false;

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = '';
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      closeList();
      html.push(inCodeBlock ? '</code></pre>' : '<pre><code>');
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const unorderedItem = /^-\s+(.+)$/.exec(line);
    const orderedItem = /^\d+\.\s+(.+)$/.exec(line);
    const item = unorderedItem || orderedItem;
    if (item) {
      const nextListType = unorderedItem ? 'ul' : 'ol';
      if (listType !== nextListType) {
        closeList();
        listType = nextListType;
        html.push(`<${listType}>`);
      }
      html.push(`<li>${renderInline(item[1])}</li>`);
      continue;
    }

    closeList();
    if (!line.trim()) {
      continue;
    }

    if (line.startsWith('> ')) {
      html.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
      continue;
    }

    html.push(`<p>${renderInline(line)}</p>`);
  }

  closeList();
  if (inCodeBlock) html.push('</code></pre>');
  return html.join('\n');
}

function renderInline(value: string): string {
  const codeSegments: string[] = [];
  const withPlaceholders = value.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSegments.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codeSegments.length - 1}\u0000`;
  });

  return escapeHtml(withPlaceholders)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\u0000(\d+)\u0000/g, (_match, index: string) => codeSegments[Number(index)]);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
