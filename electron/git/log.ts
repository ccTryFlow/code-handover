import { execFile } from 'child_process';
import { promisify } from 'util';
import { getGitHistory, isSameGitAuthor } from './history';

const execFileAsync = promisify(execFile);

export interface GitCommit {
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  files: string[];
  additions?: number;
  deletions?: number;
}

export async function getCommitsByAuthor(
  localPath: string,
  author: string,
  since?: string,
  until?: string
): Promise<GitCommit[]> {
  try {
    return (await getGitHistory(localPath, since, until))
      .filter(commit => isSameGitAuthor(commit.authorName, commit.authorEmail, author))
      .map(commit => ({
        hash: commit.shortHash,
        authorName: commit.authorName,
        authorEmail: commit.authorEmail,
        date: commit.date,
        message: commit.message,
        files: Array.from(new Set(commit.changes.map(change => change.filePath))),
        additions: commit.totalAdditions,
        deletions: commit.totalDeletions,
      }));
  } catch (error) {
    throw new Error(`Failed to get commits: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getCommitHash(localPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: localPath
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get commit hash: ${error instanceof Error ? error.message : String(error)}`);
  }
}
