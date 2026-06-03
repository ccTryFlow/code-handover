import type { LanguageAnalyzerAdapter, LanguageFileAnalysis } from '../contracts';
import { javascriptLanguageAdapter, tsxLanguageAdapter, typescriptLanguageAdapter } from './javascript';

interface VueScriptBlock {
  content: string;
  lang: string;
  setup: boolean;
}

function parseAttributes(rawAttributes: string): Record<string, string | boolean> {
  const attributes: Record<string, string | boolean> = {};
  const pattern = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(rawAttributes)) !== null) {
    attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? true;
  }

  return attributes;
}

function extractScriptBlocks(content: string): VueScriptBlock[] {
  const blocks: VueScriptBlock[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const attributes = parseAttributes(match[1]);
    const lang = String(attributes.lang || 'js').toLowerCase();
    blocks.push({
      content: match[2],
      lang,
      setup: Boolean(attributes.setup),
    });
  }

  return blocks;
}

function getAdapterForBlock(block: VueScriptBlock): LanguageAnalyzerAdapter {
  if (block.lang === 'tsx' || block.lang === 'jsx') {
    return tsxLanguageAdapter;
  }
  if (block.lang === 'ts' || block.lang === 'typescript') {
    return typescriptLanguageAdapter;
  }
  return javascriptLanguageAdapter;
}

export const vueLanguageAdapter: LanguageAnalyzerAdapter = {
  language: 'Vue',
  extensions: ['.vue'],

  async analyzeFile(filePath: string, content: string): Promise<LanguageFileAnalysis> {
    const blocks = extractScriptBlocks(content);
    const symbols: LanguageFileAnalysis['symbols'] = [];
    const imports: string[] = [];
    const calls: string[] = [];
    let hasErrors = false;

    for (const block of blocks) {
      const adapter = getAdapterForBlock(block);
      const analysis = await adapter.analyzeFile(`${filePath}.${block.lang}`, block.content);
      hasErrors = hasErrors || analysis.hasErrors;
      imports.push(...analysis.imports.filter(item => !imports.includes(item)));
      calls.push(...analysis.calls.filter(item => !calls.includes(item)));
      symbols.push(
        ...analysis.symbols
          .filter(symbol => !symbols.some(item => item.kind === symbol.kind && item.name === symbol.name && item.line === symbol.line))
          .map(symbol => ({
            ...symbol,
            kind: block.setup && symbol.kind === 'function' ? 'setup-function' : symbol.kind,
          }))
      );
    }

    return { symbols, imports, calls, hasErrors };
  },
};
