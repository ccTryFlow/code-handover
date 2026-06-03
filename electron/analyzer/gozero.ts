import * as path from 'path';
import type { FrameworkSummary, ModuleSummary } from '../types';
import {
  collectFilesByExtensions,
  detectByIndicators,
  pathExists,
  readTextIfExists,
  scanModuleDirectories,
} from './frameworkUtils';

export async function detectGoZero(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Go-Zero', [
    { file: 'go.mod', weight: 30, evidence: 'go.mod 包含 go-zero 依赖', includes: ['zeromicro/go-zero', 'tal-tech/go-zero'] },
    { dir: 'etc', weight: 10, evidence: '存在 etc 配置目录' },
    { dir: 'internal/handler', weight: 15, evidence: '存在 internal/handler 目录' },
    { dir: 'internal/logic', weight: 15, evidence: '存在 internal/logic 目录' },
    { dir: 'internal/svc', weight: 10, evidence: '存在 internal/svc 目录' },
    { dir: 'internal/types', weight: 10, evidence: '存在 internal/types 目录' },
  ], 30);
}

export async function scanGoZeroModules(localPath: string): Promise<ModuleSummary[]> {
  const modules = await scanModuleDirectories(localPath, 'Go-Zero', [
    { name: 'Handlers', type: 'controller', dirs: ['internal/handler'], extensions: ['.go'], summaryLabel: 'handler files' },
    { name: 'Logic', type: 'service', dirs: ['internal/logic'], extensions: ['.go'], summaryLabel: 'logic files' },
    { name: 'Service Context', type: 'service', dirs: ['internal/svc'], extensions: ['.go'], summaryLabel: 'service context files' },
    { name: 'Models', type: 'model', dirs: ['internal/model', 'model'], extensions: ['.go'], summaryLabel: 'model files' },
    { name: 'Configuration', type: 'config', dirs: ['etc'], extensions: ['.yaml', '.yml', '.json', '.toml'], summaryLabel: 'config files' },
  ]);

  const apiFiles = await collectApiFiles(localPath);
  if (apiFiles.length > 0) {
    modules.unshift({
      name: 'API Definitions',
      type: 'route',
      framework: 'Go-Zero',
      files: apiFiles,
      routes: await extractApiRoutes(localPath, apiFiles),
      summary: `${apiFiles.length} api definition files`,
    });
  }

  return modules;
}

async function collectApiFiles(localPath: string): Promise<string[]> {
  const files: string[] = [];
  for (const dir of ['.', 'api', 'apis']) {
    const fullPath = path.join(localPath, dir);
    if (await pathExists(fullPath)) {
      files.push(...await collectFilesByExtensions(fullPath, localPath, ['.api'], 2));
    }
  }
  return Array.from(new Set(files));
}

async function extractApiRoutes(localPath: string, files: string[]): Promise<string[]> {
  const routes: string[] = [];
  for (const file of files) {
    const content = await readTextIfExists(path.join(localPath, file));
    const matches = content.match(/(?:get|post|put|delete|patch|head)\s+\/[^\s]+/gi) || [];
    routes.push(...matches.map(item => item.toUpperCase()));
  }
  return Array.from(new Set(routes));
}
