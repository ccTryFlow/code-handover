import type { LanguageAnalyzerAdapter, LanguageFileAnalysis } from '../contracts';
import { analyzeWithStaticPatterns } from './staticFallback';

function splitBaseTypes(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export const csharpLanguageAdapter: LanguageAnalyzerAdapter = {
  language: 'C#',
  extensions: ['.cs'],

  async analyzeFile(_filePath: string, content: string): Promise<LanguageFileAnalysis> {
    const analysis = analyzeWithStaticPatterns(content, {
      lineComment: '//',
      blockComment: true,
      importPatterns: [
        /^\s*using\s+(?:static\s+)?([A-Za-z_][\w.]+)\s*;/gm,
      ],
      typePatterns: [
        {
          kind: 'class',
          pattern: /\b(?:public|protected|private|internal|abstract|sealed|partial|static|\s)*class\s+([A-Za-z_]\w*)(?:\s*:\s*([A-Za-z_][\w.<>,\s]*))?/g,
          nameGroup: 1,
          extendsGroup: 2,
        },
        {
          kind: 'interface',
          pattern: /\b(?:public|protected|private|internal|partial|\s)*interface\s+([A-Za-z_]\w*)(?:\s*:\s*([A-Za-z_][\w.<>,\s]*))?/g,
          nameGroup: 1,
          extendsGroup: 2,
        },
        {
          kind: 'struct',
          pattern: /\b(?:public|protected|private|internal|readonly|partial|\s)*struct\s+([A-Za-z_]\w*)(?:\s*:\s*([A-Za-z_][\w.<>,\s]*))?/g,
          nameGroup: 1,
          implementsGroup: 2,
        },
        {
          kind: 'enum',
          pattern: /\b(?:public|protected|private|internal|\s)*enum\s+([A-Za-z_]\w*)/g,
          nameGroup: 1,
        },
      ],
      functionPatterns: [
        {
          kind: 'method',
          pattern: /\b(?:public|protected|private|internal|static|virtual|override|async|sealed|partial|extern|\s)+[A-Za-z_][\w.<>,?\[\]\s]*\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:where\s+[^{]+)?\{/g,
          nameGroup: 1,
          signatureGroup: 2,
        },
      ],
      callPattern: /\b([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\(/g,
    });

    const classPattern = /\b(?:public|protected|private|internal|abstract|sealed|partial|static|\s)*class\s+([A-Za-z_]\w*)(?:\s*:\s*([A-Za-z_][\w.<>,\s]*))?/g;
    let match: RegExpExecArray | null;
    while ((match = classPattern.exec(content)) !== null) {
      const symbol = analysis.symbols.find(item => item.kind === 'class' && item.name === match?.[1]);
      if (!symbol) continue;
      const baseTypes = splitBaseTypes(match[2]);
      const baseClass = baseTypes.find(item => !/^I[A-Z]/.test(item));
      const interfaces = baseTypes.filter(item => /^I[A-Z]/.test(item));
      symbol.extends = baseClass ? [baseClass] : undefined;
      symbol.implements = interfaces.length > 0 ? interfaces : undefined;
    }

    return analysis;
  },
};
