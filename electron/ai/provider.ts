import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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
  try {
    const { stdout } = await execFileAsync(cliCommand, ['--version'], {
      timeout: 5000,
      windowsHide: true,
      shell: true,
    });
    return !!stdout;
  } catch (_e) {
    return false;
  }
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

    // Generic CLI fallback - pipe prompt via stdin
    const { stdout } = await execFileAsync(
      provider.cliCommand,
      ['--prompt', fullPrompt],
      { timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true, shell: true }
    );

    return {
      success: true,
      content: stdout.trim(),
      provider: provider.name,
    };
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
    const { stdout } = await execFileAsync(
      'claude',
      ['-p', prompt, '--output-format', 'text'],
      { timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true, shell: true }
    );
    return { success: true, content: stdout.trim(), provider: 'Claude Code', model: 'claude' };
  } catch (error) {
    return { success: false, content: '', error: (error as Error).message, provider: 'Claude Code' };
  }
}

async function executeCodexCli(prompt: string): Promise<AISummaryResponse> {
  try {
    const { stdout } = await execFileAsync(
      'codex',
      ['-q', prompt],
      { timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true, shell: true }
    );
    return { success: true, content: stdout.trim(), provider: 'OpenAI Codex', model: 'codex' };
  } catch (error) {
    return { success: false, content: '', error: (error as Error).message, provider: 'OpenAI Codex' };
  }
}

async function executeGeminiCli(prompt: string): Promise<AISummaryResponse> {
  try {
    const { stdout } = await execFileAsync(
      'gemini',
      ['-p', prompt],
      { timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true, shell: true }
    );
    return { success: true, content: stdout.trim(), provider: 'Google Gemini', model: 'gemini' };
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

export async function detectAvailableCliProviders(): Promise<Array<AICliProvider & { available: boolean }>> {
  const results = [];
  for (const provider of BUILTIN_CLI_PROVIDERS) {
    const available = await checkCliAvailable(provider.cliCommand);
    results.push({ ...provider, available });
  }
  return results;
}
