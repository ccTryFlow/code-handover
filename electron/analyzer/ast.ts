import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  AstAnalysisResult,
  AstFileSummary,
  AstCallGraphEdge,
  AstDependencyReferenceEdge,
  AstRelationshipGraph,
  FileSummary,
} from '../types';
import { getLanguageAnalyzerAdapter } from './languageRegistry';
import { normalizeRelativePath } from './scanPolicy';

const MAX_AST_FILES = 300;
const MAX_RELATIONSHIP_EDGES = 1500;

function formatFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

function normalizeAstPath(filePath: string): string {
  return normalizeRelativePath(filePath).replace(/^\/+/, '');
}

function stripImportDecorations(importPath: string): string {
  return importPath
    .replace(/^type\s+/, '')
    .replace(/^static\s+/, '')
    .trim()
    .replace(/;$/, '');
}

function classifyImport(importPath: string): AstDependencyReferenceEdge['kind'] {
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    return 'relative';
  }

  if (/^[A-Z][A-Za-z0-9_]*(?:[\\/][A-Z][A-Za-z0-9_]*)+/.test(importPath)) {
    return 'module';
  }

  return 'package';
}

function resolveRelativeImport(
  fromFile: string,
  importPath: string,
  filePathIndex: Map<string, string>
): string | undefined {
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return undefined;
  }

  const fromDir = path.posix.dirname(fromFile);
  const basePath = normalizeAstPath(
    importPath.startsWith('/')
      ? importPath.slice(1)
      : path.posix.normalize(path.posix.join(fromDir, importPath))
  );
  const extensions = [
    '',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.vue',
    '.php',
    '.go',
    '.java',
    '.py',
    '.cs',
    '.c',
    '.h',
    '.cc',
    '.cpp',
    '.cxx',
    '.hpp',
    '.rs',
  ];
  const candidates = extensions.flatMap(extension => [
    `${basePath}${extension}`,
    `${basePath}/index${extension}`,
  ]);

  for (const candidate of candidates) {
    const resolved = filePathIndex.get(candidate.toLowerCase());
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
}

function getSymbolDisplayName(file: AstFileSummary, symbolName: string): string {
  const symbol = file.symbols.find(item => item.name === symbolName);
  return symbol?.parent ? `${symbol.parent}::${symbol.name}` : symbolName;
}

function getCallLookupKey(call: string): string {
  const segments = call.split(/::|->|\./).filter(Boolean);
  return (segments[segments.length - 1] || call).replace(/\(.*/, '');
}

function buildDependencyReferences(
  astFiles: AstFileSummary[],
  filePathIndex: Map<string, string>
): AstDependencyReferenceEdge[] {
  const edges: AstDependencyReferenceEdge[] = [];
  const seen = new Set<string>();

  for (const file of astFiles) {
    for (const rawImport of file.imports) {
      const importPath = stripImportDecorations(rawImport);
      if (!importPath) continue;

      const edge: AstDependencyReferenceEdge = {
        fromFile: file.path,
        importPath,
        kind: classifyImport(importPath),
      };
      edge.toFile = resolveRelativeImport(file.path, importPath, filePathIndex);

      const key = `${edge.fromFile}\0${edge.importPath}\0${edge.toFile || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(edge);
      }
      if (edges.length >= MAX_RELATIONSHIP_EDGES) return edges;
    }
  }

  return edges;
}

function buildCallGraph(astFiles: AstFileSummary[]): AstCallGraphEdge[] {
  const symbolIndex = new Map<string, AstFileSummary[]>();
  for (const file of astFiles) {
    for (const symbol of file.symbols) {
      if (!['function', 'method', 'constructor'].includes(symbol.kind)) {
        continue;
      }
      const key = symbol.name.toLowerCase();
      const files = symbolIndex.get(key) || [];
      files.push(file);
      symbolIndex.set(key, files);
    }
  }

  const edges: AstCallGraphEdge[] = [];
  const seen = new Set<string>();
  for (const file of astFiles) {
    for (const call of file.calls) {
      const lookupKey = getCallLookupKey(call).toLowerCase();
      const targets = symbolIndex.get(lookupKey) || [];
      const uniqueTargetPaths = Array.from(new Set(targets.map(target => target.path)));
      const toFile = uniqueTargetPaths.length === 1 ? uniqueTargetPaths[0] : undefined;
      const edge: AstCallGraphEdge = {
        fromFile: file.path,
        toFile,
        call,
        resolvedSymbol: toFile ? getSymbolDisplayName(targets[0], getCallLookupKey(call)) : undefined,
      };
      const key = `${edge.fromFile}\0${edge.call}\0${edge.toFile || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(edge);
      }
      if (edges.length >= MAX_RELATIONSHIP_EDGES) return edges;
    }
  }

  return edges;
}

function buildRelationshipGraph(astFiles: AstFileSummary[]): AstRelationshipGraph {
  const filePathIndex = new Map(astFiles.map(file => [file.path.toLowerCase(), file.path]));
  const inheritance = astFiles.flatMap(file =>
    file.symbols.flatMap(symbol =>
      (symbol.extends || []).map(base => ({
        file: file.path,
        symbol: symbol.name,
        base,
      }))
    )
  ).slice(0, MAX_RELATIONSHIP_EDGES);
  const interfaceImplementations = astFiles.flatMap(file =>
    file.symbols.flatMap(symbol =>
      (symbol.implements || []).map(interfaceName => ({
        file: file.path,
        symbol: symbol.name,
        interfaceName,
      }))
    )
  ).slice(0, MAX_RELATIONSHIP_EDGES);

  return {
    callGraph: buildCallGraph(astFiles),
    inheritance,
    interfaceImplementations,
    dependencyReferences: buildDependencyReferences(astFiles, filePathIndex),
  };
}

export async function analyzeProjectAst(
  localPath: string,
  files: FileSummary[]
): Promise<AstAnalysisResult> {
  const supportedFiles = files.filter(file => getLanguageAnalyzerAdapter(file.path));
  const filesToAnalyze = supportedFiles.slice(0, MAX_AST_FILES);
  const astFiles: AstAnalysisResult['files'] = [];
  const failures: AstAnalysisResult['failures'] = [];

  for (const file of filesToAnalyze) {
    const adapter = getLanguageAnalyzerAdapter(file.path);
    if (!adapter) continue;

    try {
      const content = await fs.readFile(path.join(localPath, file.path), 'utf8');
      const analysis = await adapter.analyzeFile(file.path, content);
      astFiles.push({
        path: normalizeAstPath(file.path),
        language: adapter.language,
        ...analysis,
      });
    } catch (error) {
      failures.push({
        path: normalizeRelativePath(file.path),
        reason: formatFailureReason(error),
      });
    }
  }

  return {
    engine: astFiles.some(file => ['C#', 'C', 'C++', 'Rust'].includes(file.language))
      ? 'tree-sitter-wasm+static-fallback'
      : 'tree-sitter-wasm',
    languages: Array.from(new Set(astFiles.map(file => file.language))).sort(),
    files: astFiles,
    relationships: buildRelationshipGraph(astFiles),
    parsedFileCount: astFiles.length,
    skippedFileCount: Math.max(0, supportedFiles.length - filesToAnalyze.length),
    symbolCount: astFiles.reduce((sum, file) => sum + file.symbols.length, 0),
    importCount: astFiles.reduce((sum, file) => sum + file.imports.length, 0),
    callCount: astFiles.reduce((sum, file) => sum + file.calls.length, 0),
    failures,
  };
}
