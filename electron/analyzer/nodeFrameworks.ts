import * as path from 'path';
import type { FrameworkSummary, ModuleSummary } from '../types';
import {
  collectKnownFiles,
  detectByIndicators,
  readTextIfExists,
  scanModuleDirectories,
} from './frameworkUtils';

export async function detectNestJS(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'NestJS', [
    { file: 'package.json', weight: 35, evidence: 'package.json 包含 @nestjs/core', includes: ['@nestjs/core'] },
    { file: 'src/main.ts', weight: 15, evidence: '存在 src/main.ts' },
    { file: 'nest-cli.json', weight: 20, evidence: '存在 nest-cli.json' },
    { dir: 'src/modules', weight: 10, evidence: '存在 src/modules 目录' },
  ], 30);
}

export async function scanNestJSModules(localPath: string): Promise<ModuleSummary[]> {
  const modules = await scanModuleDirectories(localPath, 'NestJS', [
    { name: 'Controllers', type: 'controller', dirs: ['src'], extensions: ['.ts'], summaryLabel: 'TypeScript files' },
    { name: 'Modules', type: 'service', dirs: ['src/modules'], extensions: ['.ts'], summaryLabel: 'module files' },
    { name: 'Services', type: 'service', dirs: ['src/services', 'src'], extensions: ['.ts'], summaryLabel: 'service files' },
    { name: 'Entities', type: 'model', dirs: ['src/entities', 'src/models'], extensions: ['.ts'], summaryLabel: 'model files' },
    { name: 'Configuration', type: 'config', dirs: ['config', 'src/config'], extensions: ['.ts', '.js', '.json', '.yaml', '.yml'], summaryLabel: 'config files' },
  ]);

  const routeFiles = modules.flatMap(module => module.files).filter(file => /\.(?:controller|resolver)\.ts$/.test(file));
  if (routeFiles.length > 0) {
    modules.unshift({
      name: 'Routes',
      type: 'route',
      framework: 'NestJS',
      files: routeFiles,
      routes: await extractDecoratorRoutes(localPath, routeFiles),
      summary: `${routeFiles.length} controller/resolver files`,
    });
  }

  return modules;
}

export async function detectExpress(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Express', [
    { file: 'package.json', weight: 30, evidence: 'package.json 包含 express', includes: ['"express"', "'express'"] },
    { file: 'app.js', weight: 10, evidence: '存在 app.js' },
    { file: 'server.js', weight: 10, evidence: '存在 server.js' },
    { dir: 'routes', weight: 10, evidence: '存在 routes 目录' },
    { dir: 'controllers', weight: 10, evidence: '存在 controllers 目录' },
  ], 25);
}

export async function scanExpressModules(localPath: string): Promise<ModuleSummary[]> {
  const modules = await scanModuleDirectories(localPath, 'Express', [
    { name: 'Routes', type: 'route', dirs: ['routes', 'src/routes'], extensions: ['.js', '.ts', '.mjs', '.cjs'], summaryLabel: 'route files' },
    { name: 'Controllers', type: 'controller', dirs: ['controllers', 'src/controllers'], extensions: ['.js', '.ts', '.mjs', '.cjs'], summaryLabel: 'controller files' },
    { name: 'Services', type: 'service', dirs: ['services', 'src/services'], extensions: ['.js', '.ts', '.mjs', '.cjs'], summaryLabel: 'service files' },
    { name: 'Models', type: 'model', dirs: ['models', 'src/models'], extensions: ['.js', '.ts', '.mjs', '.cjs'], summaryLabel: 'model files' },
    { name: 'Middleware', type: 'middleware', dirs: ['middleware', 'middlewares', 'src/middleware'], extensions: ['.js', '.ts', '.mjs', '.cjs'], summaryLabel: 'middleware files' },
  ]);
  const routeModule = modules.find(module => module.name === 'Routes');
  if (routeModule) {
    routeModule.routes = await extractExpressRoutes(localPath, routeModule.files);
  }
  return modules;
}

export async function detectReact(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'React', [
    { file: 'package.json', weight: 30, evidence: 'package.json 包含 react', includes: ['"react"'] },
    { file: 'src/App.jsx', weight: 10, evidence: '存在 src/App.jsx' },
    { file: 'src/App.tsx', weight: 10, evidence: '存在 src/App.tsx' },
    { dir: 'src/components', weight: 10, evidence: '存在 src/components 目录' },
  ], 25);
}

export async function scanReactModules(localPath: string): Promise<ModuleSummary[]> {
  return scanModuleDirectories(localPath, 'React', [
    { name: 'Pages', type: 'view', dirs: ['src/pages', 'src/views', 'pages', 'app'], extensions: ['.jsx', '.tsx', '.js', '.ts'], summaryLabel: 'page files' },
    { name: 'Components', type: 'component', dirs: ['src/components', 'components'], extensions: ['.jsx', '.tsx', '.js', '.ts'], summaryLabel: 'component files' },
    { name: 'Hooks', type: 'util', dirs: ['src/hooks', 'hooks'], extensions: ['.js', '.ts', '.jsx', '.tsx'], summaryLabel: 'hook files' },
    { name: 'API', type: 'util', dirs: ['src/api', 'api'], extensions: ['.js', '.ts'], summaryLabel: 'api files' },
  ]);
}

export async function detectNextJS(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Next.js', [
    { file: 'package.json', weight: 35, evidence: 'package.json 包含 next', includes: ['"next"'] },
    { file: 'next.config.js', weight: 15, evidence: '存在 next.config.js' },
    { file: 'next.config.mjs', weight: 15, evidence: '存在 next.config.mjs' },
    { dir: 'pages', weight: 10, evidence: '存在 pages 目录' },
    { dir: 'app', weight: 10, evidence: '存在 app 目录' },
  ], 30);
}

export async function scanNextJSModules(localPath: string): Promise<ModuleSummary[]> {
  const modules = await scanModuleDirectories(localPath, 'Next.js', [
    { name: 'Pages/App Router', type: 'view', dirs: ['pages', 'app', 'src/pages', 'src/app'], extensions: ['.jsx', '.tsx', '.js', '.ts'], summaryLabel: 'route/page files' },
    { name: 'Components', type: 'component', dirs: ['components', 'src/components'], extensions: ['.jsx', '.tsx', '.js', '.ts'], summaryLabel: 'component files' },
    { name: 'API Routes', type: 'route', dirs: ['pages/api', 'src/pages/api', 'app/api', 'src/app/api'], extensions: ['.js', '.ts'], summaryLabel: 'api route files' },
    { name: 'Configuration', type: 'config', dirs: ['.'], extensions: ['.js', '.mjs', '.ts', '.json'], summaryLabel: 'config files' },
  ]);
  const configFiles = await collectKnownFiles(localPath, ['next.config.js', 'next.config.mjs', 'next.config.ts']);
  if (configFiles.length > 0) {
    modules.push({
      name: 'Next Config',
      type: 'config',
      framework: 'Next.js',
      files: configFiles,
      summary: `${configFiles.length} config files`,
    });
  }
  return modules;
}

async function extractDecoratorRoutes(localPath: string, files: string[]): Promise<string[]> {
  const routes: string[] = [];
  for (const file of files.slice(0, 60)) {
    const content = await readTextIfExists(path.join(localPath, file));
    const matches = content.match(/@(Controller|Get|Post|Put|Delete|Patch|Options|Head)\s*\(\s*['"`]?([^'"`)]*)['"`]?\s*\)/g) || [];
    routes.push(...matches.map(item => item.replace(/\s+/g, ' ').trim()));
  }
  return Array.from(new Set(routes));
}

async function extractExpressRoutes(localPath: string, files: string[]): Promise<string[]> {
  const routes: string[] = [];
  for (const file of files.slice(0, 60)) {
    const content = await readTextIfExists(path.join(localPath, file));
    const pattern = /\.(get|post|put|patch|delete|options|head|all|use)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      routes.push(`${match[1].toUpperCase()} ${match[2]}`);
    }
  }
  return Array.from(new Set(routes));
}
