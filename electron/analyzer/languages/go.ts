import type { Node as TreeSitterNode } from 'web-tree-sitter';
import type { LanguageAnalyzerAdapter, LanguageFileAnalysis } from '../contracts';
import { parseTreeSitterSource } from '../treeSitterRuntime';
import {
  appendUnique,
  appendUniqueList,
  appendUniqueSymbol,
  getFieldText,
  getLine,
  stripQuotes,
  walkNamedNodes,
} from './common';

function getGoVisibility(name: string): string {
  return /^[A-Z]/.test(name) ? 'exported' : 'package';
}

function getGoCallName(node: TreeSitterNode): string | undefined {
  if (node.type !== 'call_expression') return undefined;
  return getFieldText(node, 'function') || node.namedChildren[0]?.text;
}

function getGoEmbeddedInterfaces(definition: TreeSitterNode | undefined): string[] | undefined {
  if (!definition || definition.type !== 'interface_type') return undefined;

  let interfaces: string[] | undefined;
  for (const child of definition.namedChildren) {
    if (child.type === 'type_elem') {
      interfaces = appendUniqueList(interfaces, child.namedChildren[0]?.text || child.text);
    }
  }
  return interfaces;
}

export const goLanguageAdapter: LanguageAnalyzerAdapter = {
  language: 'Go',
  extensions: ['.go'],

  async analyzeFile(_filePath: string, content: string): Promise<LanguageFileAnalysis> {
    const symbols: LanguageFileAnalysis['symbols'] = [];
    const imports: string[] = [];
    const calls: string[] = [];

    const hasErrors = await parseTreeSitterSource(
      'tree-sitter-go',
      'tree-sitter-go.wasm',
      content,
      rootNode => {
        walkNamedNodes(rootNode, node => {
          if (node.type === 'package_clause') {
            const name = node.namedChildren[0]?.text;
            if (name) {
              appendUniqueSymbol(symbols, {
                name,
                kind: 'package',
                line: getLine(node),
              });
            }
          }

          if (node.type === 'import_spec') {
            appendUnique(imports, stripQuotes(getFieldText(node, 'path') || node.namedChildren[0]?.text || ''));
          }

          if (node.type === 'type_spec') {
            const name = getFieldText(node, 'name') || node.namedChildren[0]?.text;
            const definition = node.namedChildren.find(child => child.type !== 'type_identifier');
            if (name) {
              appendUniqueSymbol(symbols, {
                name,
                kind: definition?.type === 'struct_type'
                  ? 'struct'
                : definition?.type === 'interface_type'
                    ? 'interface'
                    : 'type',
                line: getLine(node),
                visibility: getGoVisibility(name),
                extends: getGoEmbeddedInterfaces(definition),
              });
            }
          }

          if (node.type === 'function_declaration' || node.type === 'method_declaration') {
            const name = getFieldText(node, 'name')
              || node.namedChildren.find(child => child.type === 'identifier' || child.type === 'field_identifier')?.text;
            const parameterLists = node.namedChildren.filter(child => child.type === 'parameter_list');
            if (name) {
              appendUniqueSymbol(symbols, {
                name,
                kind: node.type === 'method_declaration' ? 'method' : 'function',
                line: getLine(node),
                parent: node.type === 'method_declaration' ? parameterLists[0]?.text : undefined,
                signature: parameterLists[node.type === 'method_declaration' ? 1 : 0]?.text,
                visibility: getGoVisibility(name),
              });
            }
          }

          appendUnique(calls, getGoCallName(node));
        });
      }
    );

    return { symbols, imports, calls, hasErrors };
  },
};
