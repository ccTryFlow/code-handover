import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execFileAsync = promisify(execFile);
const REMOTE_GIT_TIMEOUT_MS = 30000;
const CLONE_GIT_TIMEOUT_MS = 10 * 60 * 1000;

export interface CloneProgress {
  stage: 'prepare' | 'attempt' | 'receiving' | 'resolving' | 'checkout' | 'finalizing' | 'retrying';
  message: string;
  percent: number;
  raw?: string;
}

interface GitError extends Error {
  code?: string | number | null;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

interface CloneAttempt {
  name: string;
  args: string[];
  startPercent: number;
}

interface GitSpawnResult {
  stdout: string;
  stderr: string;
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
  token?: string,
  onProgress?: (progress: CloneProgress) => void
): Promise<void> {
  let basicToken = '';

  try {
    const header = buildTokenHeaderArgs(url, token);
    basicToken = header.basicToken;

    emitCloneProgress(onProgress, 'prepare', 'Preparing clone target', 8);
    await assertCloneTargetAvailable(localPath);
    await cloneWithRetries(url, localPath, branch, header.args, onProgress);

    if (token && /^https?:\/\//i.test(url)) {
      emitCloneProgress(onProgress, 'finalizing', 'Resetting remote URL credentials', 96);
      await runGit(['-C', localPath, 'remote', 'set-url', 'origin', url], REMOTE_GIT_TIMEOUT_MS);
    }

    emitCloneProgress(onProgress, 'finalizing', 'Clone completed', 100);
  } catch (error) {
    const rawMessage = formatGitError(error, CLONE_GIT_TIMEOUT_MS, 'clone repository');
    const safeMessage = sanitizeCloneError(rawMessage, token, basicToken);
    throw new Error(`克隆仓库失败：${safeMessage}`);
  }
}

async function cloneWithRetries(
  url: string,
  localPath: string,
  branch: string | undefined,
  headerArgs: string[],
  onProgress?: (progress: CloneProgress) => void
): Promise<void> {
  const attempts = buildCloneAttempts(url, localPath, branch, headerArgs);
  const errors: string[] = [];

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];

    try {
      emitCloneProgress(onProgress, 'attempt', attempt.name, attempt.startPercent);
      await runCloneAttempt(attempt, onProgress);
      emitCloneProgress(onProgress, 'finalizing', 'Checking cloned repository', 94);
      await runGit(['-C', localPath, 'rev-parse', '--is-inside-work-tree'], REMOTE_GIT_TIMEOUT_MS);
      return;
    } catch (error) {
      const detail = formatGitError(error, CLONE_GIT_TIMEOUT_MS, attempt.name);
      errors.push(`${attempt.name}: ${detail}`);

      if (!shouldRetryClone(error) || index === attempts.length - 1) {
        throw new Error(buildCloneFailureMessage(errors, isRecoverableTransportError(error)));
      }

      emitCloneProgress(onProgress, 'retrying', 'Cleaning partial clone before retry', Math.min(88, attempt.startPercent + 18));
      await removePartialClone(localPath);
    }
  }
}

function runCloneAttempt(
  attempt: CloneAttempt,
  onProgress?: (progress: CloneProgress) => void
): Promise<GitSpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', attempt.args, {
      env: getGitEnv(),
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, CLONE_GIT_TIMEOUT_MS);

    const handleOutput = (chunk: Buffer, target: Buffer[]) => {
      target.push(chunk);
      const text = chunk.toString('utf8');
      for (const line of splitGitProgress(text)) {
        const progress = parseCloneProgressLine(line, attempt.startPercent);
        if (progress) {
          onProgress?.(progress);
        }
      }
    };

    child.stdout.on('data', chunk => handleOutput(Buffer.from(chunk), stdoutChunks));
    child.stderr.on('data', chunk => handleOutput(Buffer.from(chunk), stderrChunks));

    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(stderr || stdout || `git clone exited with code ${code ?? 'unknown'}`) as GitError;
      error.code = code;
      error.signal = signal;
      error.killed = signal === 'SIGTERM';
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

function splitGitProgress(text: string): string[] {
  return text
    .split(/[\r\n]+/)
    .map(line => line.trim())
    .filter(Boolean);
}

function parseCloneProgressLine(line: string, startPercent: number): CloneProgress | null {
  const percentage = parseFirstPercent(line);
  if (line.includes('Receiving objects')) {
    return {
      stage: 'receiving',
      message: `Receiving objects ${percentage ?? ''}%`.trim(),
      percent: scalePercent(percentage, startPercent, 72),
      raw: line,
    };
  }
  if (line.includes('Resolving deltas')) {
    return {
      stage: 'resolving',
      message: `Resolving deltas ${percentage ?? ''}%`.trim(),
      percent: scalePercent(percentage, 72, 88),
      raw: line,
    };
  }
  if (line.includes('Updating files')) {
    return {
      stage: 'checkout',
      message: `Updating files ${percentage ?? ''}%`.trim(),
      percent: scalePercent(percentage, 88, 94),
      raw: line,
    };
  }
  if (/Cloning into/i.test(line)) {
    return {
      stage: 'attempt',
      message: 'Connecting remote repository',
      percent: Math.max(startPercent, 18),
      raw: line,
    };
  }
  return null;
}

function parseFirstPercent(line: string): number | null {
  const match = line.match(/(\d{1,3})%/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function scalePercent(value: number | null, min: number, max: number): number {
  if (value === null) return min;
  return Math.round(min + ((max - min) * value) / 100);
}

function buildCloneAttempts(
  url: string,
  localPath: string,
  branch: string | undefined,
  headerArgs: string[]
): CloneAttempt[] {
  const baseCloneArgs = buildCloneArgs(url, localPath, branch);
  const compatibleCloneArgs = buildCloneArgs(url, localPath, branch, [
    '--single-branch',
    '--no-tags',
  ]);
  const partialCloneArgs = buildCloneArgs(url, localPath, branch, [
    '--single-branch',
    '--no-tags',
    '--filter=blob:none',
  ]);

  return [
    {
      name: 'Standard clone',
      args: [...headerArgs, 'clone', ...baseCloneArgs],
      startPercent: 18,
    },
    {
      name: 'Compatibility clone with HTTP/1.1',
      args: [
        ...headerArgs,
        '-c',
        'http.version=HTTP/1.1',
        '-c',
        'http.lowSpeedLimit=1000',
        '-c',
        'http.lowSpeedTime=60',
        'clone',
        ...compatibleCloneArgs,
      ],
      startPercent: 24,
    },
    {
      name: 'Reduced transfer clone with single branch',
      args: [
        ...headerArgs,
        '-c',
        'http.version=HTTP/1.1',
        '-c',
        'http.lowSpeedLimit=1000',
        '-c',
        'http.lowSpeedTime=60',
        'clone',
        ...partialCloneArgs,
      ],
      startPercent: 30,
    },
  ];
}

function buildCloneArgs(
  url: string,
  localPath: string,
  branch?: string,
  extraArgs: string[] = []
): string[] {
  const args = [...extraArgs];
  if (branch) {
    args.push('--branch', branch);
  }
  args.push(url, localPath);
  return args;
}

function shouldRetryClone(error: unknown): boolean {
  return isRecoverableTransportError(error);
}

function isRecoverableTransportError(error: unknown): boolean {
  const detail = getGitErrorDetail(error);
  return /RPC failed|curl 56|SSL_ERROR_SYSCALL|early EOF|unexpected disconnect|sideband|invalid index-pack output|index-pack failed|Connection reset|Failed to connect|Connection timed out|Operation timed out/i
    .test(detail);
}

function buildCloneFailureMessage(errors: string[], transportLike: boolean): string {
  const retrySummary = errors.length > 1
    ? `已自动重试 ${errors.length} 次，仍未成功。`
    : '';
  const hint = transportLike
    ? '这通常是远程 Git 服务、代理、网络链路或仓库体积导致的传输中断；应用已尝试 HTTP/1.1、单分支和省流模式。请稍后重试，或检查代理/VPN/Git 网络配置。'
    : '';

  return [retrySummary, hint, errors[errors.length - 1]].filter(Boolean).join('\n');
}

async function removePartialClone(localPath: string): Promise<void> {
  try {
    await fs.rm(localPath, { recursive: true, force: true });
  } catch {
    // The next clone attempt will validate the target path again.
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
      .filter(branchName => branchName.length > 0)
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
      throw new Error(`目标目录不是空目录：${localPath}`);
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
  const detail = getGitErrorDetail(error);
  const message = error instanceof Error ? error.message : String(error);

  if (gitError?.killed || gitError?.signal === 'SIGTERM' || /timed out/i.test(message)) {
    return `${action}超时（${Math.round(timeoutMs / 1000)} 秒）。请确认网络能访问远程仓库，或检查代理、Git 服务连接和访问令牌。`;
  }

  if (/Authentication failed|could not read Username|terminal prompts disabled|access denied|Permission denied/i.test(detail)) {
    return `${action}认证失败。私有仓库请填写有效 Token，或确认当前 Git/SSH 凭据可用。\n${detail}`;
  }

  if (/RPC failed|curl 56|SSL_ERROR_SYSCALL|early EOF|unexpected disconnect|sideband|invalid index-pack output|index-pack failed/i.test(detail)) {
    return `${action}传输中断。远程仓库可以使用 Git 访问，但数据下载过程中连接被提前断开。\n${detail}`;
  }

  if (/Could not resolve host|Failed to connect|Connection timed out|Connection reset|unable to access|Operation timed out/i.test(detail)) {
    return `${action}网络连接失败。请确认当前网络、代理或 DNS 能访问远程仓库。\n${detail}`;
  }

  if (/Repository not found|not found/i.test(detail)) {
    return `${action}失败，远程仓库不存在或当前账号没有访问权限。\n${detail}`;
  }

  return detail || `${action}失败`;
}

function getGitErrorDetail(error: unknown): string {
  const gitError = error as GitError;
  const stderr = bufferToString(gitError?.stderr).trim();
  const stdout = bufferToString(gitError?.stdout).trim();
  const message = error instanceof Error ? error.message : String(error);
  return stderr || stdout || message;
}

function emitCloneProgress(
  onProgress: ((progress: CloneProgress) => void) | undefined,
  stage: CloneProgress['stage'],
  message: string,
  percent: number
): void {
  onProgress?.({ stage, message, percent });
}

function bufferToString(value: string | Buffer | undefined): string {
  if (!value) return '';
  return Buffer.isBuffer(value) ? value.toString('utf8') : value;
}
