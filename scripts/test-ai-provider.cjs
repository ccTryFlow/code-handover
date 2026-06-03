const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, '.codex-tmp', 'ai-provider-test');
const bundlePath = path.join(tmpDir, 'provider.cjs');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function getChallenge(options) {
  const body = JSON.parse(options.body);
  const content = body.messages.find(message => message.role === 'user')?.content || '';
  return content.match(/CODEHANDOVER_TEST_[0-9a-f-]+/)?.[0];
}

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  esbuild.buildSync({
    entryPoints: [path.join(rootDir, 'electron', 'ai', 'provider.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundlePath,
    logLevel: 'silent',
  });

  const { executeCustomProvider, executeAI, testAIProvider, classifyCliFailure, detectAvailableCliProviders } = require(bundlePath);
  const provider = {
    type: 'custom',
    name: 'Test Provider',
    baseUrl: 'https://example.com/v1',
    apiKey: 'current-key',
    model: 'test-model',
    enabled: true,
  };
  const originalFetch = global.fetch;
  let fetchCalls = 0;

  try {
    global.fetch = async (url, options) => {
      fetchCalls += 1;
      assert(url === 'https://example.com/v1/chat/completions', '应请求 OpenAI 兼容的 chat completions 地址');
      if (options.headers.Authorization.startsWith('Bearer CODEHANDOVER_INVALID_')) {
        return createResponse(401, { error: { message: 'invalid api key' } });
      }
      assert(options.headers.Authorization === 'Bearer current-key', '正式连接测试必须使用当前输入的 API Key');
      const challenge = getChallenge(options);
      assert(challenge, '连接测试请求必须包含随机挑战码');
      return createResponse(200, { choices: [{ message: { content: challenge } }] });
    };

    const verified = await testAIProvider(provider);
    assert(verified.success, '原样返回随机挑战码时应验证成功');

    global.fetch = async (_url, options) => {
      fetchCalls += 1;
      if (options.headers.Authorization.startsWith('Bearer CODEHANDOVER_INVALID_')) {
        return createResponse(401, { error: { message: 'invalid api key' } });
      }
      assert(getChallenge(options), '每次连接测试都应生成随机挑战码');
      return createResponse(200, { choices: [{ message: { content: '连接成功' } }] });
    };

    const staleSuccess = await testAIProvider(provider);
    assert(!staleSuccess.success, '固定成功文本不应绕过随机挑战校验');
    assert(staleSuccess.error.includes('随机挑战校验'), '挑战失败时应返回明确错误');

    global.fetch = async (_url, options) => {
      fetchCalls += 1;
      if (options.headers.Authorization.startsWith('Bearer CODEHANDOVER_INVALID_')) {
        return createResponse(401, { error: { message: 'invalid api key' } });
      }
      return createResponse(200, { choices: [] });
    };

    const emptyCompletion = await testAIProvider(provider);
    assert(!emptyCompletion.success, '空模型回复不应被当作成功');

    global.fetch = async (_url, options) => {
      fetchCalls += 1;
      if (options.headers.Authorization.startsWith('Bearer CODEHANDOVER_INVALID_')) {
        return createResponse(401, { error: { message: 'invalid api key' } });
      }
      return createResponse(401, { error: { message: 'invalid api key' } });
    };

    const unauthorized = await testAIProvider(provider);
    assert(!unauthorized.success, '认证失败不应被当作成功');
    assert(unauthorized.error.includes('401'), '认证失败应保留 HTTP 状态码');

    global.fetch = async (_url, options) => {
      fetchCalls += 1;
      assert(options.headers.Authorization.startsWith('Bearer CODEHANDOVER_INVALID_'), '鉴权对照测试应使用随机无效 API Key');
      return createResponse(200, { choices: [] });
    };

    const ignoredAuthentication = await testAIProvider(provider);
    assert(!ignoredAuthentication.success, '随机无效 API Key 被接受时不应继续显示普通空回复错误');
    assert(ignoredAuthentication.error.includes('鉴权校验异常'), '网关错误放行随机无效 API Key 时应返回明确错误');

    global.fetch = async () => {
      fetchCalls += 1;
      return createResponse(404, { error: { message: 'not found' } });
    };

    const incompatibleEndpoint = await testAIProvider(provider);
    assert(!incompatibleEndpoint.success, '无法确认鉴权的端点不应通过连接测试');
    assert(incompatibleEndpoint.error.includes('无法确认 API Key 鉴权'), '非鉴权错误状态应提示检查 OpenAI 兼容端点');

    const callsBeforeValidation = fetchCalls;
    const missingKey = await testAIProvider({ ...provider, apiKey: '' });
    assert(!missingKey.success, '空 API Key 应直接验证失败');
    assert(missingKey.error.includes('API Key'), '空 API Key 应返回明确错误');
    assert(fetchCalls === callsBeforeValidation, '空 API Key 不应发送网络请求');

    const invalidUrl = await testAIProvider({ ...provider, baseUrl: 'not-a-url' });
    assert(!invalidUrl.success, '非法 Base URL 应直接验证失败');
    assert(invalidUrl.error.includes('Base URL'), '非法 Base URL 应返回明确错误');
    assert(fetchCalls === callsBeforeValidation, '非法 Base URL 不应发送网络请求');

    const anthropicProvider = {
      ...provider,
      protocol: 'anthropic',
      baseUrl: 'https://example.com/api/anthropic',
    };
    global.fetch = async (url, options) => {
      fetchCalls += 1;
      assert(url === 'https://example.com/api/anthropic/v1/messages', 'Anthropic 协议应请求 Messages API 地址');
      assert(!options.headers.Authorization, 'Anthropic 协议不应发送 OpenAI Authorization header');
      assert(options.headers['anthropic-version'] === '2023-06-01', 'Anthropic 协议应携带版本 header');
      if (options.headers['x-api-key'].startsWith('CODEHANDOVER_INVALID_')) {
        return createResponse(401, { type: 'error', error: { message: 'invalid x-api-key' } });
      }
      assert(options.headers['x-api-key'] === 'current-key', 'Anthropic 协议应通过 x-api-key 发送当前 Key');
      const body = JSON.parse(options.body);
      assert(typeof body.system === 'string' && body.system.length > 0, 'Anthropic system prompt 应位于顶层字段');
      assert(body.messages.length === 1 && body.messages[0].role === 'user', 'Anthropic 请求体应符合 Messages API 格式');
      const challenge = getChallenge(options);
      return createResponse(200, { content: [{ type: 'text', text: challenge || 'anthropic response' }] });
    };

    const anthropicVerified = await testAIProvider(anthropicProvider);
    assert(anthropicVerified.success, 'Anthropic Messages 协议应完成随机挑战验证');

    const legacyAnthropicProvider = { ...anthropicProvider };
    delete legacyAnthropicProvider.protocol;
    const legacyAnthropicVerified = await testAIProvider(legacyAnthropicProvider);
    assert(legacyAnthropicVerified.success, '旧配置应根据 /anthropic URL 自动推断协议');

    const completeAnthropicUrl = await executeCustomProvider(
      { ...anthropicProvider, baseUrl: 'https://example.com/api/anthropic/v1/messages' },
      'hello',
      'system'
    );
    assert(completeAnthropicUrl.success, '完整 Anthropic Messages URL 不应重复拼接路径');

    const callsBeforeProtocolMismatch = fetchCalls;
    const protocolMismatch = await testAIProvider({
      ...provider,
      protocol: 'openai',
      baseUrl: 'https://example.com/api/anthropic',
    });
    assert(!protocolMismatch.success, '显式选择 OpenAI 时不应向 Anthropic 地址发送请求');
    assert(protocolMismatch.error.includes('Anthropic Messages'), '协议不匹配时应提示切换 Anthropic Messages');
    assert(fetchCalls === callsBeforeProtocolMismatch, '协议不匹配时不应发送网络请求');

    const childProcess = require('child_process');
    const originalSpawn = childProcess.spawn;
    const spawnedCalls = [];

    childProcess.spawn = (command, args) => {
      const listeners = {};
      const child = {
        stdout: { on: (event, callback) => { listeners[`stdout:${event}`] = callback; } },
        stderr: { on: (event, callback) => { listeners[`stderr:${event}`] = callback; } },
        stdin: {
          end: input => {
            spawnedCalls.push({ command, args, input });
            queueMicrotask(() => {
              listeners['stdout:data']?.(Buffer.from(command === 'codex' ? 'noisy stdout' : 'CLI summary'));
              listeners.close?.(0);
            });
          },
        },
        on: (event, callback) => { listeners[event] = callback; },
        kill: () => undefined,
      };
      return child;
    };

    try {
      const claudeResult = await executeAI({
        provider: { type: 'cli', name: 'Claude Code', cliCommand: 'claude', enabled: true },
        prompt: 'user prompt',
        systemPrompt: 'system prompt',
      });
      assert(claudeResult.success && claudeResult.content === 'CLI summary', 'Claude CLI 应通过 stdin 返回摘要');

      const originalReadFile = fs.promises.readFile;
      fs.promises.readFile = async filePath => {
        assert(String(filePath).includes('codehandover-codex-'), 'Codex 应读取 output-last-message 文件');
        return 'Codex summary';
      };

      const codexResult = await executeAI({
        provider: { type: 'cli', name: 'OpenAI Codex', cliCommand: 'codex', enabled: true },
        prompt: 'user prompt',
        systemPrompt: 'system prompt',
      });
      fs.promises.readFile = originalReadFile;
      assert(codexResult.success && codexResult.content === 'Codex summary', 'Codex CLI 应使用最终消息作为摘要');

      const codexCall = spawnedCalls.find(call => call.command === 'codex');
      assert(codexCall && codexCall.args[0] === 'exec', 'Codex CLI 应使用 codex exec 非交互模式');
      assert(!codexCall.args.includes('-q'), 'Codex CLI 不应继续使用已过期的 -q 参数');
      assert(codexCall.input.includes('system prompt'), 'CLI prompt 应通过 stdin 传入');

      childProcess.spawn = () => {
        const listeners = {};
        return {
          stdout: { on: (event, callback) => { listeners[`stdout:${event}`] = callback; } },
          stderr: { on: (event, callback) => { listeners[`stderr:${event}`] = callback; } },
          stdin: {
            end: () => queueMicrotask(() => {
              listeners['stdout:data']?.(Buffer.from('   '));
              listeners.close?.(0);
            }),
          },
          on: (event, callback) => { listeners[event] = callback; },
          kill: () => undefined,
        };
      };
      const emptyCliResult = await executeAI({
        provider: { type: 'cli', name: 'Claude Code', cliCommand: 'claude', enabled: true },
        prompt: 'user prompt',
        systemPrompt: 'system prompt',
      });
      assert(!emptyCliResult.success && emptyCliResult.error.includes('没有返回摘要内容'), 'CLI 空响应不应被当作成功摘要');

      const authStatus = classifyCliFailure('gemini', {
        stdout: 'Opening authentication page in your browser. Do you want to continue? [Y/n]',
        stderr: 'Authentication cancelled by user.',
        exitCode: 1,
        timedOut: false,
      });
      assert(authStatus === 'auth-required', 'Gemini 登录提示应被识别为需认证状态');
    } finally {
      childProcess.spawn = originalSpawn;
    }

    const originalExecFile = childProcess.execFile;
    const originalReadFileForDetect = fs.promises.readFile;
    const originalRmForDetect = fs.promises.rm;
    childProcess.execFile = (command, _args, _options, callback) => {
      queueMicrotask(() => callback(null, { stdout: `${command} 1.0.0`, stderr: '' }));
      return { kill: () => undefined };
    };
    childProcess.spawn = (command, _args) => {
      const listeners = {};
      return {
        stdout: { on: (event, callback) => { listeners[`stdout:${event}`] = callback; } },
        stderr: { on: (event, callback) => { listeners[`stderr:${event}`] = callback; } },
        stdin: {
          end: () => queueMicrotask(() => {
            if (command === 'gemini') {
              listeners['stdout:data']?.(Buffer.from('Opening authentication page in your browser. Do you want to continue? [Y/n]'));
              listeners['stderr:data']?.(Buffer.from('Authentication cancelled by user.'));
              listeners.close?.(1);
              return;
            }

            listeners['stdout:data']?.(Buffer.from(command === 'codex' ? 'noisy stdout' : 'OK'));
            listeners.close?.(0);
          }),
        },
        on: (event, callback) => { listeners[event] = callback; },
        kill: () => undefined,
      };
    };
    fs.promises.readFile = async filePath => {
      assert(String(filePath).includes('codehandover-codex-detect-'), 'Codex 检测应读取 output-last-message 文件');
      return 'OK';
    };
    fs.promises.rm = async () => undefined;

    try {
      delete require.cache[require.resolve(bundlePath)];
      const detectionModule = require(bundlePath);
      const detected = await detectionModule.detectAvailableCliProviders();
      const claude = detected.find(provider => provider.cliCommand === 'claude');
      const codex = detected.find(provider => provider.cliCommand === 'codex');
      const gemini = detected.find(provider => provider.cliCommand === 'gemini');
      assert(claude?.ready && claude.status === 'ready', 'Claude 检测通过时应标记为 ready');
      assert(codex?.ready && codex.status === 'ready', 'Codex 检测通过时应标记为 ready');
      assert(gemini?.available && !gemini.ready, 'Gemini 命令存在但未认证时不应标记为 ready');
      assert(gemini.status === 'auth-required', 'Gemini 未认证时应返回 auth-required 状态');
      assert(gemini.message.includes('登录') || gemini.message.includes('认证'), 'Gemini 未认证时应返回可读认证提示');
    } finally {
      childProcess.execFile = originalExecFile;
      childProcess.spawn = originalSpawn;
      fs.promises.readFile = originalReadFileForDetect;
      fs.promises.rm = originalRmForDetect;
      delete require.cache[require.resolve(bundlePath)];
    }

    console.log(JSON.stringify({ assertions: 'passed', fetchCalls }, null, 2));
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
