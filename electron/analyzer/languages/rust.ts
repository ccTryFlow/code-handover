import type { LanguageAnalyzerAdapter, LanguageFileAnalysis } from '../contracts';
import { analyzeWithStaticPatterns } from './staticFallback';

export const rustLanguageAdapter: LanguageAnalyzerAdapter = {
  language: 'Rust',
  extensions: ['.rs'],

  async analyzeFile(_filePath: string, content: string): Promise<LanguageFileAnalysis> {
    return analyzeWithStaticPatterns(content, {
      lineComment: '//',
      blockComment: true,
      importPatterns: [
        /^\s*use\s+([^;]+);/gm,
        /^\s*extern\s+crate\s+([A-Za-z_]\w*)\s*;/gm,
      ],
      typePatterns: [
        {
          kind: 'struct',
          pattern: /\b(?:pub\s+)?struct\s+([A-Za-z_]\w*)/g,
          nameGroup: 1,
        },
        {
          kind: 'enum',
          pattern: /\b(?:pub\s+)?enum\s+([A-Za-z_]\w*)/g,
          nameGroup: 1,
        },
        {
          kind: 'trait',
          pattern: /\b(?:pub\s+)?trait\s+([A-Za-z_]\w*)(?:\s*:\s*([A-Za-z_][\w:<>,\s+]*))?/g,
          nameGroup: 1,
          extendsGroup: 2,
        },
        {
          kind: 'impl',
          pattern: /\bimpl(?:\s*<[^>]+>)?\s+(?:(?:(?:dyn\s+)?([A-Za-z_][\w:<>]*))\s+for\s+)?([A-Za-z_][\w:<>]*)/g,
          nameGroup: 2,
          implementsGroup: 1,
        },
      ],
      functionPatterns: [
        {
          kind: 'function',
          pattern: /\b(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g,
          nameGroup: 1,
          signatureGroup: 2,
        },
      ],
      callPattern: /\b([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)!?\s*\(/g,
    });
  },
};
