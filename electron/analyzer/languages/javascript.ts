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

interface JavaScriptAdapterOptions {
  language: string;
  extensions: string[];
  packageName: string;
  wasmFileName: string;
}

function getJavaScriptDeclarationKind(nodeType: string): string | undefined {
  const kinds: Record<string, string> = {
    class_declaration: 'class',
    interface_declaration: 'interface',
    enum_declaration: 'enum',
    type_alias_declaration: 'type',
  };
  return kinds[nodeType];
}

function getJavaScriptName(node: TreeSitterNode): string | undefined {
  return getFieldText(node, 'name')
    || node.namedChildren.find(child => [
      'identifier',
      'property_identifier',
      'type_identifier',
    ].includes(child.type))?.text;
}

function getHeritageNames(node: TreeSitterNode): { extends?: string[]; implements?: string[] } {
  const relationships: { extends?: string[]; implements?: string[] } = {};

  for (const child of node.namedChildren) {
    if (child.type === 'class_heritage') {
      for (const heritageChild of child.namedChildren) {
        if (heritageChild.type === 'extends_clause') {
          relationships.extends = appendUniqueList(
            relationships.extends,
            getFieldText(heritageChild, 'value') || heritageChild.namedChildren[0]?.text
          );
        } else if (heritageChild.type === 'implements_clause') {
          for (const typeNode of heritageChild.namedChildren) {
            relationships.implements = appendUniqueList(relationships.implements, typeNode.text);
          }
        }
      }
    }

    if (child.type === 'extends_type_clause') {
      relationships.extends = appendUniqueList(
        relationships.extends,
        getFieldText(child, 'value') || child.namedChildren[0]?.text
      );
    }
  }

  return relationships;
}

function getJavaScriptImport(node: TreeSitterNode): string | undefined {
  if (node.type !== 'import_statement') return undefined;
  const source = node.namedChildren.find(child => child.type === 'string');
  return source ? stripQuotes(source.text) : undefined;
}

function getJavaScriptCallName(node: TreeSitterNode): string | undefined {
  if (node.type !== 'call_expression' && node.type !== 'new_expression') return undefined;
  return getFieldText(node, 'function')
    || getFieldText(node, 'constructor')
    || node.namedChildren[0]?.text;
}

function createJavaScriptAdapter(options: JavaScriptAdapterOptions): LanguageAnalyzerAdapter {
  return {
    language: options.language,
    extensions: options.extensions,

    async analyzeFile(_filePath: string, content: string): Promise<LanguageFileAnalysis> {
      const symbols: LanguageFileAnalysis['symbols'] = [];
      const imports: string[] = [];
      const calls: string[] = [];
      const containers: Array<{ endIndex: number; name: string }> = [];

      const hasErrors = await parseTreeSitterSource(
        options.packageName,
        options.wasmFileName,
        content,
        rootNode => {
          walkNamedNodes(rootNode, node => {
            while (containers.length > 0 && node.startIndex >= containers[containers.length - 1].endIndex) {
              containers.pop();
            }

            appendUnique(imports, getJavaScriptImport(node));

            const declarationKind = getJavaScriptDeclarationKind(node.type);
            if (declarationKind) {
              const name = getJavaScriptName(node);
              if (name) {
                const relationships = getHeritageNames(node);
                appendUniqueSymbol(symbols, {
                  name,
                  kind: declarationKind,
                  line: getLine(node),
                  parent: containers[containers.length - 1]?.name,
                  extends: relationships.extends,
                  implements: relationships.implements,
                });
                if (node.type === 'class_declaration') {
                  containers.push({ endIndex: node.endIndex, name });
                }
              }
            }

            if (
              node.type === 'function_declaration'
              || node.type === 'generator_function_declaration'
              || node.type === 'method_definition'
            ) {
              const name = getJavaScriptName(node);
              if (name) {
                appendUniqueSymbol(symbols, {
                  name,
                  kind: node.type === 'method_definition' ? 'method' : 'function',
                  line: getLine(node),
                  parent: containers[containers.length - 1]?.name,
                  signature: getFieldText(node, 'parameters'),
                });
              }
            }

            if (node.type === 'variable_declarator') {
              const name = getFieldText(node, 'name');
              const value = node.childForFieldName('value');
              if (name && value && ['arrow_function', 'function_expression'].includes(value.type)) {
                appendUniqueSymbol(symbols, {
                  name,
                  kind: 'function',
                  line: getLine(node),
                  signature: getFieldText(value, 'parameters'),
                });
              }
            }

            appendUnique(calls, getJavaScriptCallName(node));
          });
        }
      );

      return { symbols, imports, calls, hasErrors };
    },
  };
}

export const javascriptLanguageAdapter = createJavaScriptAdapter({
  language: 'JavaScript',
  extensions: ['.js', '.mjs', '.cjs', '.jsx'],
  packageName: 'tree-sitter-javascript',
  wasmFileName: 'tree-sitter-javascript.wasm',
});

export const typescriptLanguageAdapter = createJavaScriptAdapter({
  language: 'TypeScript',
  extensions: ['.ts', '.mts', '.cts'],
  packageName: 'tree-sitter-typescript',
  wasmFileName: 'tree-sitter-typescript.wasm',
});

export const tsxLanguageAdapter = createJavaScriptAdapter({
  language: 'TypeScript',
  extensions: ['.tsx'],
  packageName: 'tree-sitter-typescript',
  wasmFileName: 'tree-sitter-tsx.wasm',
});
