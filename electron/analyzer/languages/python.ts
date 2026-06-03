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

function getPythonCallName(node: TreeSitterNode): string | undefined {
  if (node.type !== 'call') return undefined;
  return getFieldText(node, 'function') || node.namedChildren[0]?.text;
}

function getPythonImport(node: TreeSitterNode): string | undefined {
  if (node.type === 'import_statement') {
    return node.text.replace(/^import\s+/, '');
  }
  if (node.type === 'import_from_statement') {
    return node.text.replace(/^from\s+/, '').replace(/\s+import\s+/, '::');
  }
  return undefined;
}

function getPythonBaseClasses(node: TreeSitterNode): string[] | undefined {
  const superclasses = node.namedChildren.find(child => child.type === 'argument_list');
  if (!superclasses) return undefined;

  let bases: string[] | undefined;
  for (const child of superclasses.namedChildren) {
    bases = appendUniqueList(bases, child.text);
  }
  return bases;
}

export const pythonLanguageAdapter: LanguageAnalyzerAdapter = {
  language: 'Python',
  extensions: ['.py'],

  async analyzeFile(_filePath: string, content: string): Promise<LanguageFileAnalysis> {
    const symbols: LanguageFileAnalysis['symbols'] = [];
    const imports: string[] = [];
    const calls: string[] = [];
    const containers: Array<{ endIndex: number; name: string }> = [];

    const hasErrors = await parseTreeSitterSource(
      'tree-sitter-python',
      'tree-sitter-python.wasm',
      content,
      rootNode => {
        walkNamedNodes(rootNode, node => {
          while (containers.length > 0 && node.startIndex >= containers[containers.length - 1].endIndex) {
            containers.pop();
          }

          appendUnique(imports, getPythonImport(node));

          if (node.type === 'class_definition') {
            const name = getFieldText(node, 'name') || node.namedChildren[0]?.text;
            if (name) {
              appendUniqueSymbol(symbols, {
                name,
                kind: 'class',
                line: getLine(node),
                parent: containers[containers.length - 1]?.name,
                extends: getPythonBaseClasses(node),
              });
              containers.push({ endIndex: node.endIndex, name });
            }
          }

          if (node.type === 'function_definition') {
            const name = getFieldText(node, 'name') || node.namedChildren[0]?.text;
            if (name) {
              appendUniqueSymbol(symbols, {
                name,
                kind: containers.length > 0 ? 'method' : 'function',
                line: getLine(node),
                parent: containers[containers.length - 1]?.name,
                signature: getFieldText(node, 'parameters'),
                visibility: name.startsWith('_') ? 'private' : 'public',
              });
            }
          }

          appendUnique(calls, getPythonCallName(node));
        });
      }
    );

    return { symbols, imports, calls, hasErrors };
  },
};
