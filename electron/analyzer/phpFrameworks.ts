import * as path from 'path';
import type { FrameworkSummary, ModuleSummary } from '../types';
import {
  collectKnownFiles,
  detectByIndicators,
  readTextIfExists,
  scanModuleDirectories,
} from './frameworkUtils';

export async function detectThinkPHP(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'ThinkPHP', [
    { file: 'composer.json', weight: 30, evidence: 'composer.json 包含 topthink/framework', includes: ['topthink/framework'] },
    { file: 'think', weight: 20, evidence: '存在 think 命令入口' },
    { dir: 'app/controller', weight: 15, evidence: '存在 app/controller 目录' },
    { dir: 'app/model', weight: 10, evidence: '存在 app/model 目录' },
    { dir: 'route', weight: 10, evidence: '存在 route 目录' },
    { dir: 'config', weight: 10, evidence: '存在 config 目录' },
  ], 30);
}

export async function scanThinkPHPModules(localPath: string): Promise<ModuleSummary[]> {
  const modules = await scanModuleDirectories(localPath, 'ThinkPHP', [
    { name: 'Controllers', type: 'controller', dirs: ['app/controller', 'application/index/controller'], extensions: ['.php'], summaryLabel: 'controller files' },
    { name: 'Models', type: 'model', dirs: ['app/model', 'application/common/model'], extensions: ['.php'], summaryLabel: 'model files' },
    { name: 'Services', type: 'service', dirs: ['app/service', 'application/common/service'], extensions: ['.php'], summaryLabel: 'service files' },
    { name: 'Middleware', type: 'middleware', dirs: ['app/middleware', 'application/http/middleware'], extensions: ['.php'], summaryLabel: 'middleware files' },
    { name: 'Configuration', type: 'config', dirs: ['config'], extensions: ['.php', '.json', '.yaml', '.yml'], summaryLabel: 'config files' },
  ]);

  const routeFiles = await collectKnownFiles(localPath, ['route/app.php', 'route/route.php', 'route/api.php']);
  if (routeFiles.length > 0) {
    modules.unshift({
      name: 'Routes',
      type: 'route',
      framework: 'ThinkPHP',
      files: routeFiles,
      routes: await collectPhpRouteSnippets(localPath, routeFiles),
      summary: `${routeFiles.length} route files`,
    });
  }

  return modules;
}

export async function detectSymfony(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Symfony', [
    { file: 'composer.json', weight: 30, evidence: 'composer.json 包含 symfony 依赖', includes: ['symfony/framework-bundle', 'symfony/skeleton', 'symfony/runtime'] },
    { file: 'bin/console', weight: 15, evidence: '存在 bin/console 命令入口' },
    { dir: 'src/Controller', weight: 15, evidence: '存在 src/Controller 目录' },
    { dir: 'config/routes', weight: 10, evidence: '存在 config/routes 目录' },
    { file: 'config/bundles.php', weight: 10, evidence: '存在 config/bundles.php' },
    { dir: 'templates', weight: 5, evidence: '存在 templates 目录' },
  ], 30);
}

export async function scanSymfonyModules(localPath: string): Promise<ModuleSummary[]> {
  const modules = await scanModuleDirectories(localPath, 'Symfony', [
    { name: 'Controllers', type: 'controller', dirs: ['src/Controller'], extensions: ['.php'], summaryLabel: 'controller files' },
    { name: 'Services', type: 'service', dirs: ['src/Service'], extensions: ['.php'], summaryLabel: 'service files' },
    { name: 'Entities', type: 'model', dirs: ['src/Entity'], extensions: ['.php'], summaryLabel: 'entity files' },
    { name: 'Repositories', type: 'model', dirs: ['src/Repository'], extensions: ['.php'], summaryLabel: 'repository files' },
    { name: 'Commands', type: 'command', dirs: ['src/Command'], extensions: ['.php'], summaryLabel: 'console command files' },
    { name: 'Configuration', type: 'config', dirs: ['config'], extensions: ['.php', '.yaml', '.yml', '.xml'], summaryLabel: 'config files' },
    { name: 'Templates', type: 'view', dirs: ['templates'], extensions: ['.twig', '.php'], summaryLabel: 'template files' },
  ]);

  const routeFiles = await collectKnownFiles(localPath, ['config/routes.yaml', 'config/routes/annotations.yaml', 'config/routes.php']);
  if (routeFiles.length > 0) {
    modules.unshift({
      name: 'Routes',
      type: 'route',
      framework: 'Symfony',
      files: routeFiles,
      routes: await collectYamlRouteNames(localPath, routeFiles),
      summary: `${routeFiles.length} route config files`,
    });
  }

  return modules;
}

async function collectPhpRouteSnippets(localPath: string, files: string[]): Promise<string[]> {
  const routes: string[] = [];
  for (const file of files) {
    const content = await readTextIfExists(path.join(localPath, file));
    const matches = content.match(/(?:Route::|->)(?:get|post|put|patch|delete|rule|group)\s*\([^;\n]+/gi) || [];
    routes.push(...matches.slice(0, 20).map(item => item.replace(/\s+/g, ' ').trim()));
  }
  return Array.from(new Set(routes));
}

async function collectYamlRouteNames(localPath: string, files: string[]): Promise<string[]> {
  const routes: string[] = [];
  for (const file of files) {
    const content = await readTextIfExists(path.join(localPath, file));
    const matches = content.match(/^[A-Za-z0-9_.-]+:\s*$/gm) || [];
    routes.push(...matches.map(item => item.replace(':', '').trim()));
  }
  return Array.from(new Set(routes));
}
