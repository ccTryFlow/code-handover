import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface GitAuthorSummary {
  name: string;
  email: string;
  commitCount: number;
}

export async function getAuthors(localPath: string): Promise<GitAuthorSummary[]> {
  try {
    const { stdout } = await execFileAsync('git', ['shortlog', '-sne', '--all'], {
      cwd: localPath
    });

    const authors: GitAuthorSummary[] = [];
    const lines = stdout.split('\n').filter(line => line.trim().length > 0);

    for (const line of lines) {
      const match = line.match(/^\s*(\d+)\s+(.+?)\s+<([^>]+)>$/);
      if (match) {
        const [, commitCount, name, email] = match;
        authors.push({
          name: name.trim(),
          email: email.trim(),
          commitCount: parseInt(commitCount, 10)
        });
      }
    }

    return authors;
  } catch (error) {
    throw new Error(`Failed to get authors: ${error instanceof Error ? error.message : String(error)}`);
  }
}
