import type { AstSymbolSummary } from '../../types';
import type { LanguageFileAnalysis } from '../contracts';
import { appendUnique, appendUniqueSymbol } from './common';

export interface StaticPatternConfig {
  lineComment?: string;
  blockComment?: boolean;
  importPatterns: RegExp[];
  typePatterns: Array<{
    kind: string;
    pattern: RegExp;
    nameGroup: number;
    extendsGroup?: number;
    implementsGroup?: number;
  }>;
  functionPatterns: Array<{
    kind: 'function' | 'method' | 'constructor';
    pattern: RegExp;
    nameGroup: number;
    signatureGroup?: number;
  }>;
  callPattern: RegExp;
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

function splitTypeList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const types = value
    .split(',')
    .map(item => item.trim().replace(/[{:].*$/, '').trim())
    .filter(Boolean);
  return types.length > 0 ? Array.from(new Set(types)) : undefined;
}

function cleanImport(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/^['"`]|['"`]$/g, '').replace(/;$/, '');
}

function getParentForIndex(symbols: AstSymbolSummary[], indexLine: number): string | undefined {
  const candidates = symbols.filter(symbol => ['class', 'struct', 'interface', 'enum', 'trait'].includes(symbol.kind) && symbol.line <= indexLine);
  return candidates[candidates.length - 1]?.name;
}

function stripComments(content: string, config: StaticPatternConfig): string {
  let nextContent = content;
  if (config.blockComment) {
    nextContent = nextContent.replace(/\/\*[\s\S]*?\*\//g, match => '\n'.repeat(match.split(/\r?\n/).length - 1));
  }
  if (config.lineComment) {
    const escaped = config.lineComment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    nextContent = nextContent.replace(new RegExp(`${escaped}.*`, 'g'), '');
  }
  return nextContent;
}

export function analyzeWithStaticPatterns(content: string, config: StaticPatternConfig): LanguageFileAnalysis {
  const parseContent = stripComments(content, config);
  const symbols: AstSymbolSummary[] = [];
  const imports: string[] = [];
  const calls: string[] = [];

  for (const pattern of config.importPatterns) {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(parseContent)) !== null) {
      appendUnique(imports, cleanImport(match[1]));
    }
  }

  for (const typePattern of config.typePatterns) {
    let match: RegExpExecArray | null;
    typePattern.pattern.lastIndex = 0;
    while ((match = typePattern.pattern.exec(parseContent)) !== null) {
      const name = match[typePattern.nameGroup];
      if (!name) continue;
      appendUniqueSymbol(symbols, {
        name,
        kind: typePattern.kind,
        line: getLineNumber(parseContent, match.index),
        extends: splitTypeList(typePattern.extendsGroup ? match[typePattern.extendsGroup] : undefined),
        implements: splitTypeList(typePattern.implementsGroup ? match[typePattern.implementsGroup] : undefined),
      });
    }
  }

  for (const functionPattern of config.functionPatterns) {
    let match: RegExpExecArray | null;
    functionPattern.pattern.lastIndex = 0;
    while ((match = functionPattern.pattern.exec(parseContent)) !== null) {
      const name = match[functionPattern.nameGroup];
      if (!name || ['if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof'].includes(name)) {
        continue;
      }
      const line = getLineNumber(parseContent, match.index);
      appendUniqueSymbol(symbols, {
        name,
        kind: functionPattern.kind,
        line,
        parent: functionPattern.kind === 'method' || functionPattern.kind === 'constructor'
          ? getParentForIndex(symbols, line)
          : undefined,
        signature: functionPattern.signatureGroup ? `(${match[functionPattern.signatureGroup] || ''})` : undefined,
      });
    }
  }

  config.callPattern.lastIndex = 0;
  let callMatch: RegExpExecArray | null;
  while ((callMatch = config.callPattern.exec(parseContent)) !== null) {
    const call = callMatch[1] || callMatch[0].replace(/\s*\($/, '');
    if (!call || ['if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof'].includes(call)) {
      continue;
    }
    appendUnique(calls, call);
  }

  return { symbols, imports, calls, hasErrors: false };
}
