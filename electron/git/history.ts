import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const COMMIT_PREFIX = '\u001e';
const FIELD_SEPARATOR = '\u001f';

export type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'other';

export interface GitHistoryFileChange {
  filePath: string;
  status: GitChangeStatus;
  previousPath?: string;
  additions: number;
  deletions: number;
}

export interface GitHistoryCommit {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  changes: GitHistoryFileChange[];
  totalAdditions: number;
  totalDeletions: number;
}

export async function getGitHistory(
  localPath: string,
  since?: string,
  until?: string
): Promise<GitHistoryCommit[]> {
  const nameStatusOutput = await runGitLog(localPath, '--name-status', since, until);
  const commits = parseNameStatusLog(nameStatusOutput);
  const numstatOutput = await runGitLog(localPath, '--numstat', since, until);
  attachNumstat(commits, parseNumstatLog(numstatOutput));
  return commits;
}

export function isSameGitAuthor(authorName: string, authorEmail: string, targetAuthor: string): boolean {
  const target = normalizeAuthorText(targetAuthor);
  if (!target) return false;

  const bracketEmail = target.match(/<([^>]+)>/)?.[1];
  if (bracketEmail) {
    return normalizeAuthorText(authorEmail) === normalizeAuthorText(bracketEmail);
  }

  const normalizedName = normalizeAuthorText(authorName);
  const normalizedEmail = normalizeAuthorText(authorEmail);
  if (target.includes('@')) {
    return normalizedEmail === target;
  }
  return normalizedName === target || normalizedEmail === target;
}

export function parseNameStatusLine(line: string): Omit<GitHistoryFileChange, 'additions' | 'deletions'> | null {
  const parts = line.trim().split(/\t+/).filter(Boolean);
  if (parts.length < 2) return null;

  const rawStatus = parts[0];
  const statusCode = rawStatus.charAt(0);

  if ((statusCode === 'R' || statusCode === 'C') && parts.length >= 3) {
    return {
      filePath: normalizeGitPath(parts[2]),
      previousPath: normalizeGitPath(parts[1]),
      status: statusCode === 'R' ? 'renamed' : 'copied',
    };
  }

  return {
    filePath: normalizeGitPath(parts[1]),
    status: normalizeStatus(statusCode),
  };
}

export function normalizeStatus(statusCode: string): GitChangeStatus {
  switch (statusCode) {
    case 'A':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    default:
      return 'other';
  }
}

export function createEmptyStatusCounts(): Record<GitChangeStatus, number> {
  return {
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    copied: 0,
    other: 0,
  };
}

export function normalizeGitPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

async function runGitLog(
  localPath: string,
  changeMode: '--name-status' | '--numstat',
  since?: string,
  until?: string
): Promise<string> {
  const args = [
    'log',
    '--date=short',
    '--find-renames',
    `--pretty=format:${COMMIT_PREFIX}%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%s`,
    changeMode,
  ];

  if (since) args.push(`--since=${since}`);
  if (until) args.push(`--until=${until}`);

  const { stdout } = await execFileAsync('git', args, {
    cwd: localPath,
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout;
}

function parseNameStatusLog(stdout: string): GitHistoryCommit[] {
  const commits: GitHistoryCommit[] = [];
  let currentCommit: GitHistoryCommit | null = null;

  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith(COMMIT_PREFIX)) {
      currentCommit = parseCommitHeader(line);
      commits.push(currentCommit);
      continue;
    }

    if (!currentCommit || line.trim().length === 0) continue;

    const change = parseNameStatusLine(line);
    if (!change) continue;
    currentCommit.changes.push({
      ...change,
      additions: 0,
      deletions: 0,
    });
  }

  return commits;
}

function parseNumstatLog(stdout: string): Map<string, Map<string, { additions: number; deletions: number }>> {
  const statsByCommit = new Map<string, Map<string, { additions: number; deletions: number }>>();
  let currentHash = '';

  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith(COMMIT_PREFIX)) {
      const commit = parseCommitHeader(line);
      currentHash = commit.hash;
      if (!statsByCommit.has(currentHash)) {
        statsByCommit.set(currentHash, new Map());
      }
      continue;
    }

    if (!currentHash || line.trim().length === 0) continue;

    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const additions = parseNumstatNumber(parts[0]);
    const deletions = parseNumstatNumber(parts[1]);
    const filePath = normalizeNumstatPath(parts.slice(2).join('\t'));
    statsByCommit.get(currentHash)!.set(filePath, { additions, deletions });
  }

  return statsByCommit;
}

function attachNumstat(
  commits: GitHistoryCommit[],
  statsByCommit: Map<string, Map<string, { additions: number; deletions: number }>>
): void {
  for (const commit of commits) {
    const stats = statsByCommit.get(commit.hash);
    if (!stats) continue;

    for (const change of commit.changes) {
      const stat = stats.get(change.filePath)
        || (change.previousPath ? stats.get(change.previousPath) : undefined)
        || findRenameStat(stats, change.filePath);
      if (!stat) continue;

      change.additions = stat.additions;
      change.deletions = stat.deletions;
      commit.totalAdditions += stat.additions;
      commit.totalDeletions += stat.deletions;
    }
  }
}

function parseCommitHeader(line: string): GitHistoryCommit {
  const parts = line.slice(COMMIT_PREFIX.length).split(FIELD_SEPARATOR);
  const [hash = '', shortHash = '', authorName = '', authorEmail = '', date = '', ...messageParts] = parts;
  return {
    hash,
    shortHash,
    authorName,
    authorEmail,
    date,
    message: messageParts.join(FIELD_SEPARATOR),
    changes: [],
    totalAdditions: 0,
    totalDeletions: 0,
  };
}

function parseNumstatNumber(value: string): number {
  if (value === '-') return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNumstatPath(filePath: string): string {
  const normalized = normalizeGitPath(filePath);
  const braceRename = normalized.match(/^(.*)\{(.+)\s=>\s(.+)\}(.*)$/);
  if (braceRename) {
    return normalizeGitPath(`${braceRename[1]}${braceRename[3]}${braceRename[4]}`);
  }

  if (normalized.includes(' => ')) {
    return normalizeGitPath(normalized.split(' => ').pop() || normalized);
  }

  return normalized;
}

function findRenameStat(
  stats: Map<string, { additions: number; deletions: number }>,
  filePath: string
): { additions: number; deletions: number } | undefined {
  for (const [statPath, stat] of stats.entries()) {
    if (statPath.endsWith(filePath) || filePath.endsWith(statPath)) {
      return stat;
    }
  }
  return undefined;
}

function normalizeAuthorText(value: string): string {
  return value.trim().replace(/^<|>$/g, '').toLowerCase();
}
