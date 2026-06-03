import { existsSync } from 'fs';
import { join } from 'path';
import {
  createEmptyStatusCounts,
  getGitHistory,
  GitChangeStatus,
  GitHistoryFileChange,
  isSameGitAuthor,
  normalizeGitPath,
} from './history';

export interface GitChangedFile {
  filePath: string;
  changeCount: number;
  commitHashes?: string[];
  firstCommitDate?: string;
  lastCommitDate?: string;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  additions?: number;
  deletions?: number;
  statusCounts?: Record<GitChangeStatus, number>;
  status?: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'other';
  previousPath?: string;
  exists?: boolean;
  moduleName?: string;
  language?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  riskReasons?: string[];
}

interface ChangedFileAccumulator {
  filePath: string;
  changeCount: number;
  commitHashes: string[];
  firstCommitDate?: string;
  lastCommitDate?: string;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  additions: number;
  deletions: number;
  status: GitChangeStatus;
  statusCounts: Record<GitChangeStatus, number>;
  previousPath?: string;
}

export async function isGitRepo(localPath: string): Promise<boolean> {
  try {
    const gitPath = join(localPath, '.git');
    return existsSync(gitPath);
  } catch (_e) {
    return false;
  }
}

export async function getChangedFiles(
  localPath: string,
  author: string,
  since?: string,
  until?: string
): Promise<GitChangedFile[]> {
  try {
    const fileFrequency = new Map<string, ChangedFileAccumulator>();
    const commits = (await getGitHistory(localPath, since, until))
      .filter(commit => isSameGitAuthor(commit.authorName, commit.authorEmail, author))
      .reverse();

    for (const commit of commits) {
      for (const change of commit.changes) {
        if (change.status === 'renamed' && change.previousPath) {
          const previous = fileFrequency.get(change.previousPath);
          if (previous) {
            fileFrequency.delete(change.previousPath);
            previous.filePath = change.filePath;
            previous.previousPath = previous.previousPath || change.previousPath;
            applyChangeToAccumulator(previous, change, commit);
            fileFrequency.set(change.filePath, previous);
            continue;
          }
        }

        const existing = fileFrequency.get(change.filePath);
        if (existing) {
          applyChangeToAccumulator(existing, change, commit);
        } else {
          fileFrequency.set(change.filePath, {
            filePath: change.filePath,
            changeCount: 0,
            commitHashes: [],
            additions: 0,
            deletions: 0,
            status: 'other',
            statusCounts: createEmptyStatusCounts(),
            previousPath: change.previousPath,
          });
          applyChangeToAccumulator(fileFrequency.get(change.filePath)!, change, commit);
        }
      }
    }

    const changedFiles: GitChangedFile[] = [];

    for (const change of fileFrequency.values()) {
      const fullPath = join(localPath, change.filePath);
      const exists = existsSync(fullPath);
      const metadata = inferFileMetadata(change.filePath, change.changeCount, change.statusCounts, change.additions, change.deletions);
      changedFiles.push({
        filePath: change.filePath,
        changeCount: change.changeCount,
        commitHashes: change.commitHashes,
        firstCommitDate: change.firstCommitDate,
        lastCommitDate: change.lastCommitDate,
        lastCommitHash: change.lastCommitHash,
        lastCommitMessage: change.lastCommitMessage,
        additions: change.additions,
        deletions: change.deletions,
        statusCounts: change.statusCounts,
        status: change.status,
        previousPath: change.previousPath,
        exists,
        moduleName: metadata.moduleName,
        language: metadata.language,
        riskLevel: metadata.riskLevel,
        riskReasons: metadata.riskReasons,
      });
    }

    changedFiles.sort((a, b) => {
      if (a.exists !== b.exists) return a.exists ? -1 : 1;
      if (riskWeight(a.riskLevel) !== riskWeight(b.riskLevel)) {
        return riskWeight(b.riskLevel) - riskWeight(a.riskLevel);
      }
      return b.changeCount - a.changeCount;
    });

    return changedFiles;
  } catch (error) {
    throw new Error(`Failed to get changed files: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function applyChangeToAccumulator(
  accumulator: ChangedFileAccumulator,
  change: GitHistoryFileChange,
  commit: {
    shortHash: string;
    date: string;
    message: string;
  }
): void {
  accumulator.changeCount++;
  accumulator.commitHashes.push(commit.shortHash);
  accumulator.firstCommitDate = accumulator.firstCommitDate || commit.date;
  accumulator.lastCommitDate = commit.date;
  accumulator.lastCommitHash = commit.shortHash;
  accumulator.lastCommitMessage = commit.message;
  accumulator.additions += change.additions || 0;
  accumulator.deletions += change.deletions || 0;
  accumulator.status = mergeStatus(accumulator.status, change.status);
  accumulator.statusCounts[change.status] += 1;
  accumulator.previousPath = accumulator.previousPath || change.previousPath;
}

function mergeStatus(
  current: GitChangeStatus,
  next: GitChangeStatus
): GitChangeStatus {
  if (current === next) return current;
  if (current === 'other') return next;
  if (next === 'deleted') return 'deleted';
  if (next === 'renamed' || current === 'renamed') return 'renamed';
  if (next === 'added' && current === 'modified') return 'added';
  return current;
}

function inferFileMetadata(
  filePath: string,
  changeCount: number,
  statusCounts: Record<GitChangeStatus, number>,
  additions: number,
  deletions: number
): Pick<GitChangedFile, 'moduleName' | 'language' | 'riskLevel' | 'riskReasons'> {
  const normalized = normalizeGitPath(filePath);
  const parts = normalized.split('/').filter(Boolean);
  const extension = normalized.includes('.') ? normalized.slice(normalized.lastIndexOf('.')).toLowerCase() : '';
  const riskReasons: string[] = [];

  if (changeCount >= 8) riskReasons.push('高频修改文件');
  if (additions + deletions >= 500) riskReasons.push('累计变更行数较高');
  if (statusCounts.deleted > 0) riskReasons.push('历史中出现删除操作');
  if (statusCounts.renamed > 0) riskReasons.push('历史中出现重命名操作');
  if (isCriticalPath(normalized)) riskReasons.push('位于接口、配置、数据库或后台任务关键路径');

  return {
    moduleName: inferModuleName(parts),
    language: inferLanguage(extension),
    riskLevel: inferRiskLevel(riskReasons.length, changeCount, additions + deletions),
    riskReasons,
  };
}

function inferModuleName(parts: string[]): string {
  if (parts.length === 0) return 'Root';

  const markerIndexes = [
    parts.findIndex(part => ['Controllers', 'controllers', 'controller', 'handlers', 'handler'].includes(part)),
    parts.findIndex(part => ['Services', 'Service', 'services', 'service'].includes(part)),
    parts.findIndex(part => ['Models', 'models', 'model', 'entity', 'entities'].includes(part)),
    parts.findIndex(part => ['Commands', 'commands', 'command', 'jobs', 'Jobs'].includes(part)),
  ].filter(index => index >= 0);

  if (markerIndexes.length > 0) {
    const index = markerIndexes[0];
    return parts[index + 1]?.replace(/\.[^.]+$/, '') || parts[index];
  }

  return parts.length >= 2 ? `${parts[0]}/${parts[1].replace(/\.[^.]+$/, '')}` : parts[0].replace(/\.[^.]+$/, '');
}

function inferLanguage(extension: string): string {
  const map: Record<string, string> = {
    '.php': 'PHP',
    '.go': 'Go',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.vue': 'Vue',
    '.py': 'Python',
    '.cs': 'C#',
    '.cpp': 'C++',
    '.c': 'C',
    '.rs': 'Rust',
    '.sql': 'SQL',
  };
  return map[extension] || 'Unknown';
}

function isCriticalPath(filePath: string): boolean {
  return /(^routes\/|^config\/|^database\/|\/controllers?\/|\/handlers?\/|\/commands?\/|\/jobs?\/|\/middleware\/|\/migrations\/)/i.test(filePath);
}

function inferRiskLevel(reasonCount: number, changeCount: number, changedLines: number): 'low' | 'medium' | 'high' {
  if (reasonCount >= 3 || changeCount >= 12 || changedLines >= 1000) return 'high';
  if (reasonCount >= 1 || changeCount >= 5 || changedLines >= 300) return 'medium';
  return 'low';
}

function riskWeight(level?: 'low' | 'medium' | 'high'): number {
  if (level === 'high') return 3;
  if (level === 'medium') return 2;
  return 1;
}
