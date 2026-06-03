import type { LanguageAnalyzerAdapter, LanguageFileAnalysis } from '../contracts';
import { analyzeWithStaticPatterns } from './staticFallback';

const cLikeConfig = {
  lineComment: '//',
  blockComment: true,
  importPatterns: [
    /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm,
  ],
  typePatterns: [
    {
      kind: 'struct',
      pattern: /\bstruct\s+([A-Za-z_]\w*)(?:\s*:\s*(?:public|protected|private)?\s*([A-Za-z_][\w:<>]*))?/g,
      nameGroup: 1,
      extendsGroup: 2,
    },
    {
      kind: 'class',
      pattern: /\bclass\s+([A-Za-z_]\w*)(?:\s*:\s*(?:public|protected|private)?\s*([A-Za-z_][\w:<>]*))?/g,
      nameGroup: 1,
      extendsGroup: 2,
    },
    {
      kind: 'enum',
      pattern: /\benum(?:\s+class)?\s+([A-Za-z_]\w*)/g,
      nameGroup: 1,
    },
  ],
  functionPatterns: [
    {
      kind: 'function' as const,
      pattern: /\b(?:[A-Za-z_][\w:<>\*&\s]+\s+)+([A-Za-z_]\w*(?:::[A-Za-z_]\w*)?)\s*\(([^;{}()]*)\)\s*(?:const\s*)?(?:noexcept\s*)?\{/g,
      nameGroup: 1,
      signatureGroup: 2,
    },
  ],
  callPattern: /\b([A-Za-z_]\w*(?:::[A-Za-z_]\w*)?(?:\.[A-Za-z_]\w*)?)\s*\(/g,
};

export const cLanguageAdapter: LanguageAnalyzerAdapter = {
  language: 'C',
  extensions: ['.c', '.h'],

  async analyzeFile(_filePath: string, content: string): Promise<LanguageFileAnalysis> {
    return analyzeWithStaticPatterns(content, cLikeConfig);
  },
};

export const cppLanguageAdapter: LanguageAnalyzerAdapter = {
  language: 'C++',
  extensions: ['.cc', '.cpp', '.cxx', '.hpp'],

  async analyzeFile(_filePath: string, content: string): Promise<LanguageFileAnalysis> {
    return analyzeWithStaticPatterns(content, cLikeConfig);
  },
};
