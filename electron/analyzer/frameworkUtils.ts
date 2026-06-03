import * as fs from 'fs/promises';
import * as path from 'path';
import type { FrameworkSummary, ModuleSummary, ModuleType } from '../types';
import { shouldIgnoreDirectory } from './scanPolicy';

export interface FrameworkIndicator {
  file?: string;
  dir?: string;
  weight: number;
  evidence: string;
  includes?: string[];
}

export interface ModuleDirectoryConfig {
  name: string;
  type: ModuleType;
  dirs: string[];
  extensions: string[];
  summaryLabel: string;
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

export async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (_error) {
    return '';
  }
}

export async function detectByIndicators(
  localPath: string,
  name: string,
  indicators: FrameworkIndicator[],
  threshold: number
): Promise<FrameworkSummary | null> {
  const evidence: string[] = [];
  let confidence = 0;

  for (const indicator of indicators) {
    const relativePath = indicator.file || indicator.dir;
    if (!relativePath) continue;

    const fullPath = path.join(localPath, relativePath);
    if (!(await pathExists(fullPath))) {
      continue;
    }

    if (indicator.includes && indicator.file) {
      const content = await readTextIfExists(fullPath);
      if (!indicator.includes.some(needle => content.includes(needle))) {
        continue;
      }
    }

    confidence += indicator.weight;
    evidence.push(indicator.evidence);
  }

  if (confidence < threshold) {
    return null;
  }

  return { name, confidence: Math.min(confidence, 100), evidence };
}

export async function collectFilesByExtensions(
  dirPath: string,
  localPath: string,
  extensions: string[],
  maxDepth = 4
): Promise<string[]> {
  const files: string[] = [];

  async function visit(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (!shouldIgnoreDirectory(entry.name)) {
            await visit(fullPath, depth + 1);
          }
          continue;
        }

        if (!entry.isFile()) continue;
        const extension = path.extname(entry.name).toLowerCase();
        if (extensions.includes(extension)) {
          files.push(path.relative(localPath, fullPath).replace(/\\/g, '/'));
        }
      }
    } catch (_error) {
      // 目录不可读时跳过，框架识别保持降级结果。
    }
  }

  await visit(dirPath, 0);
  return files.sort();
}

export async function scanModuleDirectories(
  localPath: string,
  framework: string,
  configs: ModuleDirectoryConfig[]
): Promise<ModuleSummary[]> {
  const modules: ModuleSummary[] = [];

  for (const config of configs) {
    const files: string[] = [];
    for (const dir of config.dirs) {
      const fullPath = path.join(localPath, dir);
      if (await pathExists(fullPath)) {
        files.push(...await collectFilesByExtensions(fullPath, localPath, config.extensions));
      }
    }

    const uniqueFiles = Array.from(new Set(files));
    if (uniqueFiles.length > 0) {
      modules.push({
        name: config.name,
        type: config.type,
        framework,
        files: uniqueFiles,
        summary: `${uniqueFiles.length} ${config.summaryLabel}`,
      });
    }
  }

  return modules;
}

export async function collectKnownFiles(localPath: string, relativePaths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const relativePath of relativePaths) {
    if (await pathExists(path.join(localPath, relativePath))) {
      files.push(relativePath);
    }
  }
  return files;
}
