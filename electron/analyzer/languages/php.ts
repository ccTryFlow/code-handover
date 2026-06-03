import type { Node as TreeSitterNode } from 'web-tree-sitter';
import type { LanguageAnalyzerAdapter, LanguageFileAnalysis } from '../contracts';
import { parseTreeSitterSource } from '../treeSitterRuntime';
import {
  appendUnique,
  appendUniqueList,
  appendUniqueSymbol,
  getFieldText,
  getLine,
  walkNamedNodes,
} from './common';

function getDeclarationKind(nodeType: string): string | undefined {
  const kinds: Record<string, string> = {
    class_declaration: 'class',
    interface_declaration: 'interface',
    trait_declaration: 'trait',
    enum_declaration: 'enum',
  };
  return kinds[nodeType];
}

function getPhpCallName(node: TreeSitterNode): string | undefined {
  const children = node.namedChildren;

  if (node.type === 'scoped_call_expression' && children.length >= 2) {
    return `${children[0].text}::${children[1].text}`;
  }

  if (node.type === 'member_call_expression' && children.length >= 2) {
    return `${children[0].text}->${children[1].text}`;
  }

  if (node.type === 'function_call_expression' && children.length >= 1) {
    return children[0].text;
  }

  return undefined;
}

function getPhpDeclarationRelationships(node: TreeSitterNode): { extends?: string[]; implements?: string[] } {
  const relationships: { extends?: string[]; implements?: string[] } = {};

  for (const child of node.namedChildren) {
    if (child.type === 'base_clause') {
      relationships.extends = appendUniqueList(relationships.extends, child.namedChildren[0]?.text || child.text);
    }

    if (child.type === 'class_interface_clause') {
      for (const interfaceNode of child.namedChildren) {
        relationships.implements = appendUniqueList(relationships.implements, interfaceNode.text);
      }
    }
  }

  return relationships;
}

export const phpLanguageAdapter: LanguageAnalyzerAdapter = {
  language: 'PHP',
  extensions: ['.php', '.php4', '.php5', '.phtml'],

  async analyzeFile(_filePath: string, content: string): Promise<LanguageFileAnalysis> {
    const symbols: LanguageFileAnalysis['symbols'] = [];
    const imports: string[] = [];
    const calls: string[] = [];
    const containers: Array<{ endIndex: number; name: string }> = [];

    const hasErrors = await parseTreeSitterSource(
      'tree-sitter-php',
      'tree-sitter-php.wasm',
      content,
      rootNode => {
        walkNamedNodes(rootNode, node => {
          while (containers.length > 0 && node.startIndex >= containers[containers.length - 1].endIndex) {
            containers.pop();
          }

          if (node.type === 'namespace_definition') {
            const namespaceName = node.namedChildren.find(child => child.type === 'namespace_name')?.text;
            if (namespaceName) {
              appendUniqueSymbol(symbols, {
                name: namespaceName,
                kind: 'namespace',
                line: getLine(node),
              });
            }
          }

          if (node.type === 'namespace_use_clause') {
            appendUnique(imports, node.text);
          }

          const declarationKind = getDeclarationKind(node.type);
          if (declarationKind) {
            const name = getFieldText(node, 'name');
            if (name) {
              const relationships = getPhpDeclarationRelationships(node);
              appendUniqueSymbol(symbols, {
                name,
                kind: declarationKind,
                line: getLine(node),
                extends: relationships.extends,
                implements: relationships.implements,
              });
              containers.push({ endIndex: node.endIndex, name });
            }
          }

          if (node.type === 'method_declaration' || node.type === 'function_definition') {
            const name = getFieldText(node, 'name');
            if (name) {
              appendUniqueSymbol(symbols, {
                name,
                kind: node.type === 'method_declaration' ? 'method' : 'function',
                line: getLine(node),
                parent: containers[containers.length - 1]?.name,
                signature: getFieldText(node, 'parameters'),
                visibility: node.namedChildren.find(child => child.type === 'visibility_modifier')?.text,
              });
            }
          }

          appendUnique(calls, getPhpCallName(node));
        });
      }
    );

    return { symbols, imports, calls, hasErrors };
  },
};
