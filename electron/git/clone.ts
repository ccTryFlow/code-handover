import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execFileAsync = promisify(execFile);
const REMOTE_GIT_TIMEOUT_MS = 30000;
const CLONE_GIT_TIMEOUT_MS = 10 * 60 * 1000;

interface GitError extends Error {
  code?: string | number | null;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

function getGitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'echo',
    SSH_ASKPASS: 'echo',
  };
}

async function runGit(args: string[], timeout: number) {
  return execFileAsync('git', args, {
    env: getGitEnv(),
    timeout,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
}

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

    await runGit(args, CLONE_GIT_TIMEOUT_MS);

    if (token && /^https?:\/\//i.test(url)) {
      await runGit(['-C', localPath, 'remote', 'set-url', 'origin', url], REMOTE_GIT_TIMEOUT_MS);
    }
  } catch (error) {
    const rawMessage = formatGitError(error, CLONE_GIT_TIMEOUT_MS, '克隆仓库');
    const safeMessage = sanitizeCloneError(rawMessage, token, basicToken);
    throw new Error(`克隆仓库失败：${safeMessage}`);
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

    const { stdout } = await runGit(args, REMOTE_GIT_TIMEOUT_MS);

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
    const rawMessage = formatGitError(error, REMOTE_GIT_TIMEOUT_MS, '获取远程分支');
    const safeMessage = sanitizeCloneError(rawMessage, token, basicToken);
    throw new Error(`获取远程分支失败：${safeMessage}`);
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

function formatGitError(error: unknown, timeoutMs: number, action: string): string {
  const gitError = error as GitError;
  const stderr = bufferToString(gitError?.stderr).trim();
  const stdout = bufferToString(gitError?.stdout).trim();
  const message = error instanceof Error ? error.message : String(error);
  const detail = stderr || stdout || message;

  if (gitError?.killed || gitError?.signal === 'SIGTERM' || /timed out/i.test(message)) {
    return `${action}超时（${Math.round(timeoutMs / 1000)} 秒）。请确认网络能访问远程仓库，或检查代理、GitHub 连接和访问令牌。`;
  }

  if (/Authentication failed|could not read Username|terminal prompts disabled|access denied|Permission denied/i.test(detail)) {
    return `${action}认证失败。私有仓库请填写有效 Token，或确认当前 Git/SSH 凭据可用。${detail}`;
  }

  if (/Could not resolve host|Failed to connect|Connection timed out|Connection reset|unable to access/i.test(detail)) {
    return `${action}网络连接失败。请确认当前网络、代理或 DNS 能访问远程仓库。${detail}`;
  }

  if (/Repository not found|not found/i.test(detail)) {
    return `${action}失败，远程仓库不存在或当前账号没有访问权限。${detail}`;
  }

  return detail || `${action}失败`;
}

function bufferToString(value: string | Buffer | undefined): string {
  if (!value) return '';
  return Buffer.isBuffer(value) ? value.toString('utf8') : value;
}
