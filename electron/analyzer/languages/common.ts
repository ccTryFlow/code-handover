import type { Node as TreeSitterNode } from 'web-tree-sitter';
import type { AstSymbolSummary } from '../../types';

export function walkNamedNodes(
  node: TreeSitterNode,
  visit: (node: TreeSitterNode) => void
): void {
  visit(node);
  for (const child of node.namedChildren) {
    walkNamedNodes(child, visit);
  }
}

export function stripQuotes(value: string): string {
  return value.replace(/^['"`]|['"`]$/g, '');
}

export function appendUnique(values: string[], value: string | undefined): void {
  if (value && !values.includes(value)) {
    values.push(value);
  }
}

export function appendUniqueSymbol(
  symbols: AstSymbolSummary[],
  symbol: AstSymbolSummary
): void {
  if (!symbols.some(item => item.kind === symbol.kind && item.name === symbol.name && item.line === symbol.line)) {
    symbols.push(symbol);
  }
}

export function getLine(node: TreeSitterNode): number {
  return node.startPosition.row + 1;
}

export function getFieldText(node: TreeSitterNode, fieldName: string): string | undefined {
  return node.childForFieldName(fieldName)?.text;
}

export function normalizeTypeName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/\s+/g, ' ')
    .replace(/^\s*(?:public|protected|private|internal|static|abstract|final|sealed|virtual|override|async)\s+/g, '')
    .trim()
    || undefined;
}

export function appendUniqueList(values: string[] | undefined, value: string | undefined): string[] | undefined {
  const normalized = normalizeTypeName(value);
  if (!normalized) return values;
  const nextValues = values || [];
  if (!nextValues.includes(normalized)) {
    nextValues.push(normalized);
  }
  return nextValues;
}
