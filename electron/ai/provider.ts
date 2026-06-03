import { execFile, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const CLI_TIMEOUT_MS = 120000;
const CLI_DETECTION_TIMEOUT_MS = 20000;
const CLI_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const CLI_READINESS_PROMPT = '只输出 OK，不要输出其他内容。';

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

// ============================================================================
// AI Provider Types
// ============================================================================

export type AIProviderType = 'cli' | 'custom';
export type AICustomProviderProtocol = 'openai' | 'anthropic';

export interface AICliProvider {
  type: 'cli';
  name: string;        // e.g. "Claude Code", "Codex", "Gemini"
  cliCommand: string;  // e.g. "claude", "codex", "gemini"
  enabled: boolean;
}

export type AICliProviderStatusType = 'ready' | 'missing' | 'auth-required' | 'error';

export interface AICliProviderStatus {
  available: boolean;
  ready: boolean;
  status: AICliProviderStatusType;
  message: string;
  version?: string;
}

export type AICliProviderDetection = AICliProvider & AICliProviderStatus;

export interface AICustomProvider {
  type: 'custom';
  name: string;        // user-defined name
  baseUrl: string;     // e.g. "https://api.openai.com/v1"
  apiKey: string;
  model: string;       // e.g. "gpt-4o", "qwen-plus"
  protocol?: AICustomProviderProtocol;
  enabled: boolean;
}

export type AIProvider = AICliProvider | AICustomProvider;

export interface AISummaryRequest {
  provider: AIProvider;
  prompt: string;
  systemPrompt: string;
  maxTokens?: number;
}

export interface AISummaryResponse {
  success: boolean;
  content: string;
  error?: string;
  provider: string;
  model?: string;
}

export function resolveCustomProviderProtocol(provider: AICustomProvider): AICustomProviderProtocol {
  if (provider.protocol === 'anthropic' || provider.protocol === 'openai') {
    return provider.protocol;
  }

  return /\/anthropic(?:\/|$)/i.test(provider.baseUrl) ? 'anthropic' : 'openai';
}

function validateCustomProvider(provider: AICustomProvider): string | undefined {
  if (!provider.baseUrl?.trim()) return '请填写 Base URL';
  if (!provider.apiKey?.trim()) return '请填写 API Key';
  if (!provider.model?.trim()) return '请填写模型名称';

  try {
    const url = new URL(provider.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return 'Base URL 仅支持 HTTP 或 HTTPS 协议';
    }
    if (resolveCustomProviderProtocol(provider) === 'openai' && /\/anthropic(?:\/|$)/i.test(url.pathname)) {
      return '检测到 Anthropic 协议 Base URL，请将 API 协议切换为 Anthropic Messages';
    }
  } catch {
    return 'Base URL 格式不正确';
  }

  return undefined;
}

function appendApiPath(baseUrl: string, suffix: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  if (normalizedBaseUrl.toLowerCase().endsWith(suffix)) return normalizedBaseUrl;
  return `${normalizedBaseUrl}${suffix}`;
}

function getCustomProviderUrl(provider: AICustomProvider): string {
  const protocol = resolveCustomProviderProtocol(provider);
  if (protocol === 'anthropic') {
    const normalizedBaseUrl = provider.baseUrl.replace(/\/+$/, '');
    if (normalizedBaseUrl.toLowerCase().endsWith('/v1/messages')) return normalizedBaseUrl;
    return normalizedBaseUrl.toLowerCase().endsWith('/v1')
      ? `${normalizedBaseUrl}/messages`
      : appendApiPath(normalizedBaseUrl, '/v1/messages');
  }

  return appendApiPath(provider.baseUrl, '/chat/completions');
}

async function requestCustomCompletion(
  provider: AICustomProvider,
  prompt: string,
  systemPrompt: string,
  maxTokens: number,
  timeout: number = 120000
): Promise<Response> {
  const protocol = resolveCustomProviderProtocol(provider);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const body = protocol === 'anthropic'
    ? {
        model: provider.model,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
      }
    : {
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      };

  if (protocol === 'anthropic') {
    headers['x-api-key'] = provider.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  return fetch(getCustomProviderUrl(provider), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
}

function getCustomCompletionContent(provider: AICustomProvider, data: any): string {
  if (resolveCustomProviderProtocol(provider) === 'anthropic') {
    if (!Array.isArray(data.content)) return '';
    return data.content
      .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
      .map((block: any) => block.text)
      .join('\n')
      .trim();
  }

  return typeof data.choices?.[0]?.message?.content === 'string'
    ? data.choices[0].message.content.trim()
    : '';
}

// ============================================================================
// Built-in CLI providers
// ============================================================================

export const BUILTIN_CLI_PROVIDERS: AICliProvider[] = [
  {
    type: 'cli',
    name: 'Claude Code',
    cliCommand: 'claude',
    enabled: false,
  },
  {
    type: 'cli',
    name: 'OpenAI Codex',
    cliCommand: 'codex',
    enabled: false,
  },
  {
    type: 'cli',
    name: 'Google Gemini',
    cliCommand: 'gemini',
    enabled: false,
  },
];

// ============================================================================
// CLI Provider Execution
// ============================================================================

export async function checkCliAvailable(cliCommand: string): Promise<boolean> {
  const version = await getCliVersion(cliCommand);
  return Boolean(version);
}

async function getCliVersion(cliCommand: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(cliCommand, ['--version'], {
      timeout: 5000,
      windowsHide: true,
      shell: true,
    });
    const cleaned = cleanupCliOutput(stdout);
    return cleaned || undefined;
  } catch (_e) {
    return undefined;
  }
}

async function runCliWithInput(
  command: string,
  args: string[],
  input: string,
  timeout: number = CLI_TIMEOUT_MS
): Promise<CliRunResult> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      shell: true,
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    let timedOut = false;

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode,
        timedOut,
      });
    };

    const collect = (chunks: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.length;
      chunks.push(chunk);
      if (outputBytes > CLI_MAX_OUTPUT_BYTES) {
        child.kill();
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      finish(null);
    }, timeout);

    child.stdout.on('data', chunk => collect(stdoutChunks, Buffer.from(chunk)));
    child.stderr.on('data', chunk => collect(stderrChunks, Buffer.from(chunk)));
    child.on('error', error => {
      stderrChunks.push(Buffer.from(error.message));
      finish(null);
    });
    child.on('close', code => finish(code));
    child.stdin.end(input, 'utf8');
  });
}

function buildCliFailure(provider: string, result: CliRunResult, fallback?: string): AISummaryResponse {
  const status = classifyCliFailure(provider.toLowerCase(), result);
  const detail = [
    result.timedOut ? '执行超时' : '',
    result.exitCode !== null && result.exitCode !== 0 ? `退出码 ${result.exitCode}` : '',
    cleanupCliOutput(result.stderr || result.stdout || fallback || '').slice(0, 800),
  ].filter(Boolean).join('；');
  const authHint = status === 'auth-required'
    ? '需要先登录或配置认证；'
    : '';

  return {
    success: false,
    content: '',
    error: `${provider} CLI 摘要生成失败：${authHint}${detail || '未返回有效内容'}`,
    provider,
  };
}

function buildCliSuccess(provider: string, model: string, content: string): AISummaryResponse {
  const cleaned = cleanupCliOutput(content);
  if (!cleaned) {
    return {
      success: false,
      content: '',
      error: `${provider} CLI 已执行，但没有返回摘要内容`,
      provider,
      model,
    };
  }

  return {
    success: true,
    content: cleaned,
    provider,
    model,
  };
}

function cleanupCliOutput(content: string): string {
  return content
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export function classifyCliFailure(provider: string, result: CliRunResult): AICliProviderStatusType {
  const output = cleanupCliOutput(`${result.stderr}\n${result.stdout}`).toLowerCase();
  if (
    /authentication|authenticating|login|log in|not logged in|unauthorized|api key|api-key|token|credentials/.test(output)
    || /opening authentication page|authentication cancelled|sign in|sign-in/.test(output)
    || /未登录|登录|认证|鉴权|凭据|密钥/.test(output)
  ) {
    return 'auth-required';
  }

  if (provider.includes('gemini') && /oauth|google account|browser/.test(output)) {
    return 'auth-required';
  }

  return 'error';
}

function buildCliStatusMessage(provider: AICliProvider, status: AICliProviderStatusType, detail?: string): string {
  if (status === 'ready') return `${provider.name} 已安装并通过非交互生成检测`;
  if (status === 'missing') return `未检测到 ${provider.cliCommand} 命令，请先安装 ${provider.name}`;
  if (status === 'auth-required') {
    return `${provider.name} 已安装，但未完成登录或认证；请先在终端运行 ${provider.cliCommand} 完成登录后再使用`;
  }

  return `${provider.name} 已安装，但非交互生成检测失败${detail ? `：${detail}` : ''}`;
}

function statusFromCliFailure(provider: AICliProvider, result: CliRunResult, version?: string): AICliProviderDetection {
  const status = classifyCliFailure(provider.cliCommand, result);
  const detail = [
    result.timedOut ? '执行超时' : '',
    result.exitCode !== null && result.exitCode !== 0 ? `退出码 ${result.exitCode}` : '',
    cleanupCliOutput(result.stderr || result.stdout).slice(0, 240),
  ].filter(Boolean).join('；');

  return {
    ...provider,
    available: true,
    ready: false,
    status,
    message: buildCliStatusMessage(provider, status, detail),
    version,
  };
}

function statusFromCliSuccess(
  provider: AICliProvider,
  result: CliRunResult,
  content: string,
  version?: string
): AICliProviderDetection {
  const cleaned = cleanupCliOutput(content || result.stdout);
  if (!cleaned) {
    return {
      ...provider,
      available: true,
      ready: false,
      status: 'error',
      message: buildCliStatusMessage(provider, 'error', '命令已执行，但没有返回内容'),
      version,
    };
  }

  return {
    ...provider,
    available: true,
    ready: true,
    status: 'ready',
    message: buildCliStatusMessage(provider, 'ready'),
    version,
  };
}

async function checkCliReady(provider: AICliProvider, version: string): Promise<AICliProviderDetection> {
  if (provider.cliCommand === 'claude') {
    const result = await runCliWithInput(
      'claude',
      ['-p', '--output-format', 'text', '--no-session-persistence'],
      CLI_READINESS_PROMPT,
      CLI_DETECTION_TIMEOUT_MS
    );
    if (result.timedOut || result.exitCode !== 0) return statusFromCliFailure(provider, result, version);
    return statusFromCliSuccess(provider, result, result.stdout, version);
  }

  if (provider.cliCommand === 'codex') {
    const outputPath = path.join(os.tmpdir(), `codehandover-codex-detect-${randomUUID()}.txt`);
    try {
      const result = await runCliWithInput(
        'codex',
        [
          'exec',
          '--skip-git-repo-check',
          '--sandbox',
          'read-only',
          '--output-last-message',
          outputPath,
          '-',
        ],
        CLI_READINESS_PROMPT,
        CLI_DETECTION_TIMEOUT_MS
      );
      if (result.timedOut || result.exitCode !== 0) return statusFromCliFailure(provider, result, version);

      const fileContent = await fs.readFile(outputPath, 'utf8').catch(() => '');
      return statusFromCliSuccess(provider, result, fileContent || result.stdout, version);
    } finally {
      await fs.rm(outputPath, { force: true }).catch(() => undefined);
    }
  }

  if (provider.cliCommand === 'gemini') {
    const result = await runCliWithInput(
      'gemini',
      [
        '-p',
        CLI_READINESS_PROMPT,
        '--output-format',
        'text',
        '--approval-mode',
        'yolo',
        '--skip-trust',
      ],
      '',
      CLI_DETECTION_TIMEOUT_MS
    );
    if (result.timedOut || result.exitCode !== 0) return statusFromCliFailure(provider, result, version);
    return statusFromCliSuccess(provider, result, result.stdout, version);
  }

  const result = await runCliWithInput(
    provider.cliCommand,
    ['--prompt', CLI_READINESS_PROMPT],
    '',
    CLI_DETECTION_TIMEOUT_MS
  );
  if (result.timedOut || result.exitCode !== 0) return statusFromCliFailure(provider, result, version);
  return statusFromCliSuccess(provider, result, result.stdout, version);
}

export async function executeCliProvider(
  provider: AICliProvider,
  prompt: string,
  systemPrompt: string
): Promise<AISummaryResponse> {
  try {
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;

    if (provider.cliCommand === 'claude') {
      return await executeClaudeCli(fullPrompt);
    } else if (provider.cliCommand === 'codex') {
      return await executeCodexCli(fullPrompt);
    } else if (provider.cliCommand === 'gemini') {
      return await executeGeminiCli(fullPrompt);
    }

    const { stdout } = await execFileAsync(
      provider.cliCommand,
      ['--prompt', fullPrompt],
      { timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true, shell: true }
    );

    return buildCliSuccess(provider.name, provider.cliCommand, stdout);
  } catch (error) {
    return {
      success: false,
      content: '',
      error: error instanceof Error ? error.message : String(error),
      provider: provider.name,
    };
  }
}

async function executeClaudeCli(prompt: string): Promise<AISummaryResponse> {
  try {
    const result = await runCliWithInput(
      'claude',
      ['-p', '--output-format', 'text', '--no-session-persistence'],
      prompt
    );
    if (result.timedOut || result.exitCode !== 0) return buildCliFailure('Claude Code', result);
    return buildCliSuccess('Claude Code', 'claude', result.stdout);
  } catch (error) {
    return { success: false, content: '', error: (error as Error).message, provider: 'Claude Code' };
  }
}

async function executeCodexCli(prompt: string): Promise<AISummaryResponse> {
  const outputPath = path.join(os.tmpdir(), `codehandover-codex-${randomUUID()}.txt`);
  try {
    const result = await runCliWithInput(
      'codex',
      [
        'exec',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--output-last-message',
        outputPath,
        '-',
      ],
      prompt
    );
    if (result.timedOut || result.exitCode !== 0) return buildCliFailure('OpenAI Codex', result);

    const fileContent = await fs.readFile(outputPath, 'utf8').catch(() => '');
    return buildCliSuccess('OpenAI Codex', 'codex', fileContent || result.stdout);
  } catch (error) {
    return { success: false, content: '', error: (error as Error).message, provider: 'OpenAI Codex' };
  } finally {
    await fs.rm(outputPath, { force: true }).catch(() => undefined);
  }
}

async function executeGeminiCli(prompt: string): Promise<AISummaryResponse> {
  try {
    const result = await runCliWithInput(
      'gemini',
      [
        '-p',
        '请根据标准输入生成代码交接摘要。',
        '--output-format',
        'text',
        '--approval-mode',
        'yolo',
        '--skip-trust',
      ],
      prompt
    );
    if (result.timedOut || result.exitCode !== 0) return buildCliFailure('Google Gemini', result);
    return buildCliSuccess('Google Gemini', 'gemini', result.stdout);
  } catch (error) {
    return { success: false, content: '', error: (error as Error).message, provider: 'Google Gemini' };
  }
}

// ============================================================================
// Custom API Provider Execution (OpenAI-compatible and Anthropic Messages)
// ============================================================================

export async function executeCustomProvider(
  provider: AICustomProvider,
  prompt: string,
  systemPrompt: string,
  maxTokens: number = 4096
): Promise<AISummaryResponse> {
  const validationError = validateCustomProvider(provider);
  if (validationError) {
    return {
      success: false,
      content: '',
      error: validationError,
      provider: provider.name,
      model: provider.model,
    };
  }

  try {
    const response = await requestCustomCompletion(provider, prompt, systemPrompt, maxTokens);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        content: '',
        error: `API error ${response.status}: ${errorText}`,
        provider: provider.name,
        model: provider.model,
      };
    }

    const data = await response.json() as any;
    const content = getCustomCompletionContent(provider, data);
    if (!content) {
      return {
        success: false,
        content: '',
        error: 'API 返回成功状态，但未包含有效的模型回复',
        provider: provider.name,
        model: provider.model,
      };
    }

    return {
      success: true,
      content,
      provider: provider.name,
      model: provider.model,
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: error instanceof Error ? error.message : String(error),
      provider: provider.name,
      model: provider.model,
    };
  }
}

export async function testAIProvider(provider: AIProvider): Promise<AISummaryResponse> {
  const challenge = `CODEHANDOVER_TEST_${randomUUID()}`;

  if (provider.type === 'custom') {
    const validationError = validateCustomProvider(provider);
    if (validationError) {
      return {
        success: false,
        content: '',
        error: validationError,
        provider: provider.name,
        model: provider.model,
      };
    }

    const invalidKeyProvider: AICustomProvider = {
      ...provider,
      apiKey: `CODEHANDOVER_INVALID_${randomUUID()}`,
    };

    try {
      const controlResponse = await requestCustomCompletion(
        invalidKeyProvider,
        `仅回复随机挑战码：${challenge}`,
        '你正在执行 API Key 鉴权对照测试。',
        50,
        15000
      );

      if (controlResponse.ok) {
        return {
          success: false,
          content: '',
          error: `鉴权校验异常：随机无效 API Key 仍被服务端接受（HTTP ${controlResponse.status}）。请检查 Base URL、API Key 鉴权配置或网关策略`,
          provider: provider.name,
          model: provider.model,
        };
      }

      if (![401, 403].includes(controlResponse.status)) {
        return {
          success: false,
          content: '',
          error: `无法确认 API Key 鉴权：随机无效 API Key 返回 HTTP ${controlResponse.status}，预期为 401 或 403。请检查 Base URL 是否为 OpenAI 兼容端点`,
          provider: provider.name,
          model: provider.model,
        };
      }
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `鉴权对照请求失败：${error instanceof Error ? error.message : String(error)}`,
        provider: provider.name,
        model: provider.model,
      };
    }
  }

  const result = await executeAI({
    provider,
    prompt: `仅回复下面这一行随机挑战码，不要添加任何其他内容：\n${challenge}`,
    systemPrompt: '你正在执行连接测试。必须原样返回用户提供的随机挑战码。',
    maxTokens: 100,
  });

  if (!result.success) return result;

  if (!result.content.includes(challenge)) {
    return {
      ...result,
      success: false,
      error: 'API 已响应，但未通过本次随机挑战校验',
    };
  }

  return result;
}

// ============================================================================
// Unified AI Execution
// ============================================================================

export async function executeAI(request: AISummaryRequest): Promise<AISummaryResponse> {
  if (request.provider.type === 'cli') {
    return executeCliProvider(request.provider, request.prompt, request.systemPrompt);
  } else {
    return executeCustomProvider(
      request.provider,
      request.prompt,
      request.systemPrompt,
      request.maxTokens
    );
  }
}

// ============================================================================
// Detect available CLI tools
// ============================================================================

export async function detectAvailableCliProviders(): Promise<AICliProviderDetection[]> {
  const results: AICliProviderDetection[] = [];
  for (const provider of BUILTIN_CLI_PROVIDERS) {
    const version = await getCliVersion(provider.cliCommand);
    if (!version) {
      results.push({
        ...provider,
        available: false,
        ready: false,
        status: 'missing',
        message: buildCliStatusMessage(provider, 'missing'),
      });
      continue;
    }

    try {
      results.push(await checkCliReady(provider, version));
    } catch (error) {
      results.push({
        ...provider,
        available: true,
        ready: false,
        status: 'error',
        message: buildCliStatusMessage(
          provider,
          'error',
          error instanceof Error ? error.message : String(error)
        ),
        version,
      });
    }
  }
  return results;
}
