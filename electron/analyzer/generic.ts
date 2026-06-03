import * as fs from 'fs/promises';
import * as path from 'path';
import { ModuleSummary } from '../types';
import { shouldIgnoreDirectory } from './scanPolicy';

const COMMON_DIRECTORIES: Array<{ dir: string; type: ModuleSummary['type']; label: string }> = [
  { dir: 'src', type: 'other', label: '源代码' },
  { dir: 'app', type: 'controller', label: '应用核心' },
  { dir: 'lib', type: 'other', label: '公共库' },
  { dir: 'config', type: 'config', label: '配置文件' },
  { dir: 'routes', type: 'route', label: '路由定义' },
  { dir: 'controllers', type: 'controller', label: '控制器' },
  { dir: 'services', type: 'service', label: '服务层' },
  { dir: 'models', type: 'model', label: '数据模型' },
  { dir: 'middleware', type: 'middleware', label: '中间件' },
  { dir: 'commands', type: 'command', label: '命令' },
  { dir: 'jobs', type: 'job', label: '任务' },
];

async function collectModuleFiles(dirPath: string, rootPath: string, maxFiles: number = 50): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!shouldIgnoreDirectory(entry.name)) {
          files.push(...await collectModuleFiles(fullPath, rootPath, maxFiles - files.length));
        }
      } else if (entry.isFile()) {
        files.push(path.relative(rootPath, fullPath).replace(/\\/g, '/'));
      }
    }
  } catch (_e) { /* skip */ }
  return files;
}

export async function scanGenericModules(localPath: string): Promise<ModuleSummary[]> {
  const modules: ModuleSummary[] = [];

  for (const dirInfo of COMMON_DIRECTORIES) {
    const fullPath = path.join(localPath, dirInfo.dir);
    try {
      await fs.access(fullPath);
      const files = await collectModuleFiles(fullPath, localPath);
      if (files.length > 0) {
        modules.push({
          name: dirInfo.label,
          type: dirInfo.type,
          files,
          summary: `${dirInfo.label}目录，包含 ${files.length} 个文件`,
        });
      }
    } catch (_e) { /* directory doesn't exist */ }
  }

  // Scan other top-level directories
  try {
    const entries = await fs.readdir(localPath, { withFileTypes: true });
    const knownDirs = new Set(COMMON_DIRECTORIES.map(d => d.dir));
    for (const entry of entries) {
      if (entry.isDirectory() && !knownDirs.has(entry.name) && !shouldIgnoreDirectory(entry.name)) {
        const fullPath = path.join(localPath, entry.name);
        const files = await collectModuleFiles(fullPath, localPath, 20);
        if (files.length > 0) {
          modules.push({
            name: entry.name,
            type: 'other',
            files,
            summary: `${entry.name} 目录，包含 ${files.length} 个文件`,
          });
        }
      }
    }
  } catch (_e) { /* skip */ }

  return modules;
}
