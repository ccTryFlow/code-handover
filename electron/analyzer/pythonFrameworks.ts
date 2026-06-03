import * as path from 'path';
import type { FrameworkSummary, ModuleSummary } from '../types';
import {
  collectFilesByExtensions,
  detectByIndicators,
  pathExists,
  readTextIfExists,
  scanModuleDirectories,
} from './frameworkUtils';

export async function detectDjango(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Django', [
    { file: 'manage.py', weight: 25, evidence: '存在 manage.py' },
    { file: 'requirements.txt', weight: 20, evidence: 'requirements.txt 包含 Django', includes: ['Django', 'django'] },
    { file: 'pyproject.toml', weight: 20, evidence: 'pyproject.toml 包含 Django', includes: ['django'] },
    { file: 'Pipfile', weight: 15, evidence: 'Pipfile 包含 Django', includes: ['django'] },
    { dir: 'templates', weight: 5, evidence: '存在 templates 目录' },
  ], 30);
}

export async function scanDjangoModules(localPath: string): Promise<ModuleSummary[]> {
  const appDirs = await collectPythonAppDirs(localPath);
  const modules = await scanModuleDirectories(localPath, 'Django', [
    { name: 'Views', type: 'controller', dirs: appDirs, extensions: ['.py'], summaryLabel: 'python files' },
    { name: 'Templates', type: 'view', dirs: ['templates'], extensions: ['.html'], summaryLabel: 'template files' },
    { name: 'Configuration', type: 'config', dirs: ['config'], extensions: ['.py', '.yaml', '.yml'], summaryLabel: 'config files' },
  ]);

  const routeFiles = await collectNamedPythonFiles(localPath, ['urls.py']);
  if (routeFiles.length > 0) {
    modules.unshift({
      name: 'URL Routes',
      type: 'route',
      framework: 'Django',
      files: routeFiles,
      routes: await extractPythonRouteDecorators(localPath, routeFiles, /path\s*\(\s*['"`]([^'"`]+)['"`]/g),
      summary: `${routeFiles.length} urls.py files`,
    });
  }

  const modelFiles = await collectNamedPythonFiles(localPath, ['models.py']);
  if (modelFiles.length > 0) {
    modules.push({
      name: 'Models',
      type: 'model',
      framework: 'Django',
      files: modelFiles,
      summary: `${modelFiles.length} models.py files`,
    });
  }

  return modules;
}

export async function detectFlask(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Flask', [
    { file: 'requirements.txt', weight: 25, evidence: 'requirements.txt 包含 Flask', includes: ['Flask', 'flask'] },
    { file: 'pyproject.toml', weight: 20, evidence: 'pyproject.toml 包含 Flask', includes: ['flask'] },
    { file: 'app.py', weight: 15, evidence: '存在 app.py' },
    { file: 'wsgi.py', weight: 10, evidence: '存在 wsgi.py' },
    { dir: 'templates', weight: 5, evidence: '存在 templates 目录' },
  ], 25);
}

export async function scanFlaskModules(localPath: string): Promise<ModuleSummary[]> {
  const pythonDirs = await collectPythonSourceDirs(localPath);
  const modules = await scanModuleDirectories(localPath, 'Flask', [
    { name: 'Python Source', type: 'service', dirs: pythonDirs, extensions: ['.py'], summaryLabel: 'python files' },
    { name: 'Templates', type: 'view', dirs: ['templates'], extensions: ['.html'], summaryLabel: 'template files' },
  ]);
  const routeFiles = await collectPythonFiles(localPath);
  const routes = await extractPythonRouteDecorators(localPath, routeFiles, /@(?:\w+\.)?route\s*\(\s*['"`]([^'"`]+)['"`]/g);
  if (routes.length > 0) {
    modules.unshift({
      name: 'Routes',
      type: 'route',
      framework: 'Flask',
      files: routeFiles.slice(0, 30),
      routes,
      summary: `${routes.length} route decorators`,
    });
  }
  return modules;
}

export async function detectFastAPI(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'FastAPI', [
    { file: 'requirements.txt', weight: 25, evidence: 'requirements.txt 包含 FastAPI', includes: ['fastapi', 'FastAPI'] },
    { file: 'pyproject.toml', weight: 20, evidence: 'pyproject.toml 包含 FastAPI', includes: ['fastapi'] },
    { file: 'main.py', weight: 10, evidence: '存在 main.py' },
    { dir: 'routers', weight: 10, evidence: '存在 routers 目录' },
    { dir: 'app/routers', weight: 10, evidence: '存在 app/routers 目录' },
  ], 25);
}

export async function scanFastAPIModules(localPath: string): Promise<ModuleSummary[]> {
  const modules = await scanModuleDirectories(localPath, 'FastAPI', [
    { name: 'Routers', type: 'route', dirs: ['routers', 'app/routers'], extensions: ['.py'], summaryLabel: 'router files' },
    { name: 'Services', type: 'service', dirs: ['services', 'app/services'], extensions: ['.py'], summaryLabel: 'service files' },
    { name: 'Models', type: 'model', dirs: ['models', 'schemas', 'app/models', 'app/schemas'], extensions: ['.py'], summaryLabel: 'model/schema files' },
    { name: 'Configuration', type: 'config', dirs: ['config', 'app/config'], extensions: ['.py', '.yaml', '.yml', '.toml'], summaryLabel: 'config files' },
  ]);
  const routeFiles = await collectPythonFiles(localPath);
  const routes = await extractPythonRouteDecorators(localPath, routeFiles, /@(?:\w+\.)?(?:get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g);
  if (routes.length > 0) {
    modules.unshift({
      name: 'Routes',
      type: 'route',
      framework: 'FastAPI',
      files: routeFiles.slice(0, 30),
      routes,
      summary: `${routes.length} route decorators`,
    });
  }
  return modules;
}

async function collectPythonAppDirs(localPath: string): Promise<string[]> {
  const dirs: string[] = [];
  try {
    const entries = await import('fs/promises').then(fs => fs.readdir(localPath, { withFileTypes: true }));
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (await pathExists(path.join(localPath, entry.name, 'apps.py'))) {
        dirs.push(entry.name);
      }
    }
  } catch (_error) {
    // 降级为空目录列表。
  }
  return dirs.length > 0 ? dirs : ['.'];
}

async function collectPythonSourceDirs(localPath: string): Promise<string[]> {
  const preferred = ['app', 'src', 'api', 'blueprints'];
  const existing: string[] = [];
  for (const dir of preferred) {
    if (await pathExists(path.join(localPath, dir))) {
      existing.push(dir);
    }
  }
  return existing.length > 0 ? existing : ['.'];
}

async function collectPythonFiles(localPath: string): Promise<string[]> {
  return collectFilesByExtensions(localPath, localPath, ['.py'], 4);
}

async function collectNamedPythonFiles(localPath: string, names: string[]): Promise<string[]> {
  const files = await collectPythonFiles(localPath);
  return files.filter(file => names.includes(path.posix.basename(file)));
}

async function extractPythonRouteDecorators(localPath: string, files: string[], pattern: RegExp): Promise<string[]> {
  const routes: string[] = [];
  for (const file of files.slice(0, 80)) {
    const content = await readTextIfExists(path.join(localPath, file));
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      routes.push(match[1]);
    }
  }
  return Array.from(new Set(routes));
}
