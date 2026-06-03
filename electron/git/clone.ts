import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execFileAsync = promisify(execFile);

function buildTokenHeaderArgs(url: string, token?: string): { args: string[]; basicToken: string } {
  if (!token || !/^https?:\/\//i.test(url)) {
    return { args: [], basicToken: '' };
  }

  const basicToken = Buffer.from(`x-access-token:${token}`, 'utf-8').toString('base64');
  return {
    args: ['-c', `http.extraHeader=Authorization: Basic ${basicToken}`],
    basicToken,
  };
}

export async function cloneRepo(
  url: string,
  localPath: string,
  branch?: string,
  token?: string
): Promise<void> {
  let basicToken = '';

  try {
    const header = buildTokenHeaderArgs(url, token);
    basicToken = header.basicToken;

    await assertCloneTargetAvailable(localPath);

    const args: string[] = [...header.args];
    args.push('clone');
    if (branch) {
      args.push('--branch', branch);
    }
    args.push(url, localPath);

    await execFileAsync('git', args, {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    });

    if (token && /^https?:\/\//i.test(url)) {
      await execFileAsync('git', ['-C', localPath, 'remote', 'set-url', 'origin', url]);
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const safeMessage = sanitizeCloneError(rawMessage, token, basicToken);
    throw new Error(`Failed to clone repository: ${safeMessage}`);
  }
}

export async function getRemoteBranches(url: string, token?: string): Promise<string[]> {
  let basicToken = '';

  try {
    const header = buildTokenHeaderArgs(url, token);
    basicToken = header.basicToken;
    const args = [
      ...header.args,
      'ls-remote',
      '--heads',
      url,
    ];

    const { stdout } = await execFileAsync('git', args, {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    });

    return stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.split(/\s+/)[1])
      .filter(Boolean)
      .map(ref => ref.replace(/^refs\/heads\//, ''))
      .filter(branch => branch.length > 0)
      .sort((a, b) => {
        if (a === 'main' || a === 'master') return -1;
        if (b === 'main' || b === 'master') return 1;
        return a.localeCompare(b);
      });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const safeMessage = sanitizeCloneError(rawMessage, token, basicToken);
    throw new Error(`Failed to get remote branches: ${safeMessage}`);
  }
}

export function getDefaultCloneDirectory(parentPath: string, repoUrl: string): string {
  const repoName = inferRepositoryName(repoUrl);
  return path.join(parentPath, repoName);
}

function inferRepositoryName(repoUrl: string): string {
  const trimmed = repoUrl.trim().replace(/[?#].*$/, '').replace(/[\/\\]+$/, '');
  const normalized = trimmed.includes(':') && !trimmed.includes('://')
    ? trimmed.slice(trimmed.lastIndexOf(':') + 1)
    : trimmed;
  const baseName = path.basename(normalized).replace(/\.git$/i, '');
  const safeName = baseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim();
  return safeName || 'repository';
}

async function assertCloneTargetAvailable(localPath: string): Promise<void> {
  try {
    const entries = await fs.readdir(localPath);
    if (entries.length > 0) {
      throw new Error(`Target directory is not empty: ${localPath}`);
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

function sanitizeCloneError(message: string, token?: string, basicToken?: string): string {
  let safeMessage = message;
  if (token) {
    safeMessage = safeMessage.split(token).join('[redacted-token]');
  }
  if (basicToken) {
    safeMessage = safeMessage.split(basicToken).join('[redacted-token]');
  }
  return safeMessage;
}
