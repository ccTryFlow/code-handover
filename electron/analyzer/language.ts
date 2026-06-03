import * as fs from 'fs/promises';
import * as path from 'path';
import { getLanguageForPath, shouldIgnoreDirectory } from './scanPolicy';

export interface LanguageSummary {
  language: string;
  fileCount: number;
  percentage: number;
  extensions: string[];
}

async function scanDirectory(
  dirPath: string,
  rootPath: string,
  languageCounts: Map<string, { count: number; extensions: Set<string> }>
): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!shouldIgnoreDirectory(entry.name)) {
          await scanDirectory(fullPath, rootPath, languageCounts);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      const relativePath = path.relative(rootPath, fullPath);
      const language = getLanguageForPath(relativePath);
      if (!language) {
        continue;
      }

      if (!languageCounts.has(language)) {
        languageCounts.set(language, { count: 0, extensions: new Set() });
      }

      const data = languageCounts.get(language)!;
      data.count++;
      data.extensions.add(extension || path.basename(relativePath));
    }
  } catch (_error) {
    // 单个目录不可读时跳过，避免影响整个项目的基础画像。
  }
}

export async function detectLanguages(localPath: string): Promise<LanguageSummary[]> {
  const languageCounts = new Map<string, { count: number; extensions: Set<string> }>();

  try {
    await scanDirectory(localPath, localPath, languageCounts);
  } catch (error) {
    console.error('Error scanning directory:', error);
    return [];
  }

  const totalFiles = Array.from(languageCounts.values()).reduce((sum, data) => sum + data.count, 0);
  const summaries = Array.from(languageCounts.entries()).map(([language, data]) => ({
    language,
    fileCount: data.count,
    percentage: totalFiles > 0 ? (data.count / totalFiles) * 100 : 0,
    extensions: Array.from(data.extensions).sort(),
  }));

  return summaries.sort((a, b) => b.fileCount - a.fileCount);
}
