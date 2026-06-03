import { existsSync } from 'fs';
import * as path from 'path';
import { Language, Parser, type Node as TreeSitterNode } from 'web-tree-sitter';

const CORE_WASM_FILE = 'web-tree-sitter.wasm';
const languagePromises = new Map<string, Promise<Language>>();
let runtimePromise: Promise<void> | undefined;

function getResourcesPath(): string | undefined {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

function resolveAssetPath(fileName: string, packageName?: string): string {
  const resourcesPath = getResourcesPath();
  const candidates = [
    resourcesPath ? path.join(resourcesPath, 'tree-sitter', fileName) : '',
    path.join(process.cwd(), 'resources', 'tree-sitter', fileName),
    packageName ? path.join(process.cwd(), 'node_modules', packageName, fileName) : '',
    path.join(process.cwd(), 'node_modules', 'web-tree-sitter', fileName),
    path.join(__dirname, 'tree-sitter', fileName),
  ].filter(Boolean);

  const assetPath = candidates.find(candidate => existsSync(candidate));
  if (!assetPath) {
    throw new Error(`Tree-sitter WASM 资源缺失：${fileName}`);
  }

  return assetPath;
}

async function initializeRuntime(): Promise<void> {
  if (!runtimePromise) {
    runtimePromise = Parser.init({
      locateFile(scriptName: string) {
        return scriptName === CORE_WASM_FILE
          ? resolveAssetPath(CORE_WASM_FILE, 'web-tree-sitter')
          : scriptName;
      },
    });
  }

  await runtimePromise;
}

async function loadLanguage(packageName: string, wasmFileName: string): Promise<Language> {
  await initializeRuntime();

  if (!languagePromises.has(wasmFileName)) {
    languagePromises.set(
      wasmFileName,
      Language.load(resolveAssetPath(wasmFileName, packageName))
    );
  }

  return languagePromises.get(wasmFileName)!;
}

export async function parseTreeSitterSource(
  packageName: string,
  wasmFileName: string,
  content: string,
  inspect: (rootNode: TreeSitterNode) => void
): Promise<boolean> {
  const language = await loadLanguage(packageName, wasmFileName);
  const parser = new Parser();
  let tree: ReturnType<Parser['parse']> = null;

  try {
    parser.setLanguage(language);
    tree = parser.parse(content);
    if (!tree) {
      throw new Error('Tree-sitter 未返回语法树');
    }

    inspect(tree.rootNode);
    return tree.rootNode.hasError;
  } finally {
    tree?.delete();
    parser.delete();
  }
}
