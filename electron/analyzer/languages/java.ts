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

function getJavaDeclarationKind(nodeType: string): string | undefined {
  const kinds: Record<string, string> = {
    class_declaration: 'class',
    interface_declaration: 'interface',
    enum_declaration: 'enum',
    record_declaration: 'record',
    annotation_type_declaration: 'annotation',
  };
  return kinds[nodeType];
}

function getJavaName(node: TreeSitterNode): string | undefined {
  return getFieldText(node, 'name')
    || node.namedChildren.find(child => child.type === 'identifier' || child.type === 'type_identifier')?.text;
}

function getJavaCallName(node: TreeSitterNode): string | undefined {
  if (node.type !== 'method_invocation') return undefined;

  const name = getFieldText(node, 'name')
    || node.namedChildren.find(child => child.type === 'identifier')?.text;
  const object = getFieldText(node, 'object');
  return name ? (object ? `${object}.${name}` : name) : undefined;
}

function getJavaVisibility(node: TreeSitterNode): string | undefined {
  return node.namedChildren.find(child => child.type === 'modifiers')?.text.split(/\s+/)[0];
}

function getJavaDeclarationRelationships(node: TreeSitterNode): { extends?: string[]; implements?: string[] } {
  const relationships: { extends?: string[]; implements?: string[] } = {};

  for (const child of node.namedChildren) {
    if (child.type === 'superclass') {
      relationships.extends = appendUniqueList(
        relationships.extends,
        getFieldText(child, 'name') || child.namedChildren[0]?.text
      );
    }

    if (child.type === 'super_interfaces' || child.type === 'extends_interfaces') {
      for (const interfaceNode of child.namedChildren) {
        relationships.implements = appendUniqueList(relationships.implements, interfaceNode.text);
      }
    }
  }

  return relationships;
}

export const javaLanguageAdapter: LanguageAnalyzerAdapter = {
  language: 'Java',
  extensions: ['.java'],

  async analyzeFile(_filePath: string, content: string): Promise<LanguageFileAnalysis> {
    const symbols: LanguageFileAnalysis['symbols'] = [];
    const imports: string[] = [];
    const calls: string[] = [];
    const containers: Array<{ endIndex: number; name: string }> = [];

    const hasErrors = await parseTreeSitterSource(
      'tree-sitter-java',
      'tree-sitter-java.wasm',
      content,
      rootNode => {
        walkNamedNodes(rootNode, node => {
          while (containers.length > 0 && node.startIndex >= containers[containers.length - 1].endIndex) {
            containers.pop();
          }

          if (node.type === 'package_declaration') {
            const packageName = node.namedChildren[0]?.text;
            if (packageName) {
              appendUniqueSymbol(symbols, {
                name: packageName,
                kind: 'package',
                line: getLine(node),
              });
            }
          }

          if (node.type === 'import_declaration') {
            appendUnique(imports, node.text.replace(/^import\s+(?:static\s+)?/, '').replace(/;\s*$/, ''));
          }

          const declarationKind = getJavaDeclarationKind(node.type);
          if (declarationKind) {
            const name = getJavaName(node);
            if (name) {
              const relationships = getJavaDeclarationRelationships(node);
              appendUniqueSymbol(symbols, {
                name,
                kind: declarationKind,
                line: getLine(node),
                parent: containers[containers.length - 1]?.name,
                visibility: getJavaVisibility(node),
                extends: relationships.extends,
                implements: relationships.implements,
              });
              containers.push({ endIndex: node.endIndex, name });
            }
          }

          if (node.type === 'method_declaration' || node.type === 'constructor_declaration') {
            const name = getJavaName(node);
            if (name) {
              appendUniqueSymbol(symbols, {
                name,
                kind: node.type === 'constructor_declaration' ? 'constructor' : 'method',
                line: getLine(node),
                parent: containers[containers.length - 1]?.name,
                signature: getFieldText(node, 'parameters'),
                visibility: getJavaVisibility(node),
              });
            }
          }

          appendUnique(calls, getJavaCallName(node));
        });
      }
    );

    return { symbols, imports, calls, hasErrors };
  },
};
