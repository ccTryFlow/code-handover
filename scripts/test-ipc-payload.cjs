const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, '.codex-tmp', 'ipc-payload-test');
const bundlePath = path.join(tmpDir, 'electron-api.cjs');
const mainSourcePath = path.join(rootDir, 'electron', 'main.ts');
const preloadSourcePath = path.join(rootDir, 'electron', 'preload.ts');
const analyzeProgressPagePath = path.join(rootDir, 'src', 'pages', 'AnalyzeProgress.vue');
const remoteRepoPagePath = path.join(rootDir, 'src', 'pages', 'RemoteRepo.vue');
const documentExportPath = path.join(rootDir, 'electron', 'export', 'document.ts');
const pdfExportPath = path.join(rootDir, 'electron', 'export', 'pdf.ts');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  esbuild.buildSync({
    entryPoints: [path.join(rootDir, 'src', 'api', 'electron.ts')],
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    outfile: bundlePath,
    logLevel: 'silent',
  });

  const calls = [];
  const sandbox = {
    window: {
      electronAPI: {
        selectDirectory: async () => null,
        checkGitRepo: async () => false,
        getBranches: async () => ({ branches: [], currentBranch: '' }),
        getRemoteBranches: async () => ({ branches: [], currentBranch: '' }),
        getAuthors: async () => [],
        analyzeProject: async (_localPath, options) => {
          calls.push({ name: 'analyzeProject', payload: options });
          return {};
        },
        generateDocument: async (result, outputPath) => {
          calls.push({ name: 'generateDocument', payload: result, outputPath });
          return outputPath;
        },
        openFile: async () => true,
        getRecentProjects: async () => [],
        removeRecentProject: async () => true,
        getDefaultCloneDirectory: async parentPath => parentPath,
        cloneRepo: async () => ({ success: true }),
        detectCliProviders: async () => [],
        loadAiProviders: async () => [],
        saveAiProviders: async providers => {
          calls.push({ name: 'saveAiProviders', payload: providers });
          return true;
        },
        testAiProvider: async provider => {
          calls.push({ name: 'testAiProvider', payload: provider });
          return { success: true, content: '' };
        },
        aiSummarize: async (result, provider) => {
          calls.push({ name: 'aiSummarize', payload: { result, provider } });
          return { success: true, content: '' };
        },
      },
    },
    exports: {},
    module: { exports: {} },
    console,
  };

  vm.runInNewContext(fs.readFileSync(bundlePath, 'utf8'), sandbox, { filename: bundlePath });
  const api = sandbox.module.exports.default;

  const provider = {
    type: 'custom',
    name: 'Proxy Provider',
    apiKey: 'test-key',
    _testing: false,
    onClick: () => {},
  };
  const proxyProvider = new Proxy(provider, {});

  return Promise.resolve()
    .then(() => api.analyzeProject('D:/repo', { outputType: 'markdown', provider: proxyProvider }))
    .then(() => api.aiSummarize({ projectName: 'demo', fn: () => {} }, proxyProvider))
    .then(() => api.generateDocument({ projectName: 'demo', circular: undefined }, 'D:/repo/handover_demo.md'))
    .then(async () => {
      const analyzeCall = calls.find(call => call.name === 'analyzeProject');
      const aiCall = calls.find(call => call.name === 'aiSummarize');
      assert(analyzeCall.payload.provider.name === 'Proxy Provider', '应保留可序列化 Provider 字段');
      assert(!('onClick' in analyzeCall.payload.provider), '应移除函数字段，避免 IPC 克隆失败');
      assert(!('fn' in aiCall.payload.result), '应移除分析结果中的函数字段');
      verifyAnalyzeProgressIpc();
      verifyProductionEntry();
      verifyContextMenu();
      verifyFailureHandling();
      verifyDocumentExports();
      await verifyMissingElectronBridge(bundlePath);
      JSON.stringify(calls);
      console.log(JSON.stringify({ assertions: 'passed', calls: calls.length }, null, 2));
    });
}

function verifyAnalyzeProgressIpc() {
  const mainSource = fs.readFileSync(mainSourcePath, 'utf8');
  const preloadSource = fs.readFileSync(preloadSourcePath, 'utf8');
  const pageSource = fs.readFileSync(analyzeProgressPagePath, 'utf8');

  assert(
    mainSource.includes("event.sender.send('analyze-progress', progress)"),
    '主进程应把分析进度通过 analyze-progress 事件发送给渲染进程'
  );
  assert(
    preloadSource.includes('onAnalyzeProgress') && preloadSource.includes("ipcRenderer.on('analyze-progress'"),
    'preload 应暴露分析进度订阅 API'
  );
  assert(
    preloadSource.includes("removeListener('analyze-progress'"),
    'preload 的分析进度订阅 API 应返回取消监听函数'
  );
  assert(
    pageSource.includes('electronAPI.onAnalyzeProgress(handleAnalyzeProgress)') && pageSource.includes('onUnmounted'),
    '分析进度页应订阅进度事件并在卸载时取消监听'
  );
}

function verifyProductionEntry() {
  const mainSource = fs.readFileSync(mainSourcePath, 'utf8');
  assert(
    mainSource.includes('process.env.VITE_DEV_SERVER_URL'),
    '开发模式应使用 Vite 注入的服务地址'
  );
  assert(
    mainSource.includes("path.join(__dirname, '../dist/index.html')"),
    '生产模式应加载 dist/index.html'
  );
}

function verifyContextMenu() {
  const mainSource = fs.readFileSync(mainSourcePath, 'utf8');
  assert(
    mainSource.includes("webContents.on('context-menu'"),
    '主进程应注册桌面右键菜单'
  );
  assert(
    mainSource.includes("role: 'cut'") &&
      mainSource.includes("role: 'copy'") &&
      mainSource.includes("role: 'paste'") &&
      mainSource.includes("role: 'selectAll'"),
    '桌面右键菜单应支持剪切、复制、粘贴和全选'
  );
}

function verifyFailureHandling() {
  const mainSource = fs.readFileSync(mainSourcePath, 'utf8');
  const remoteRepoPageSource = fs.readFileSync(remoteRepoPagePath, 'utf8');
  assert(
    mainSource.includes('const errorMessage = await shell.openPath(filePath)') &&
      mainSource.includes('if (errorMessage)'),
    '主进程应识别 shell.openPath 返回的错误文本'
  );
  assert(
    remoteRepoPageSource.includes('if (!result.success)') &&
      remoteRepoPageSource.includes("throw new Error(result.error || '未知错误')"),
    '远程仓库页面应拦截 cloneRepo 返回的失败结果'
  );
}

function verifyDocumentExports() {
  const documentSource = fs.readFileSync(documentExportPath, 'utf8');
  const pdfSource = fs.readFileSync(pdfExportPath, 'utf8');
  assert(
    documentSource.includes("extension === '.html'") &&
      documentSource.includes("extension === '.pdf'") &&
      documentSource.includes('generateMarkdown(result, outputPath)'),
    '统一导出入口应按文件扩展名分发 Markdown、HTML 和 PDF'
  );
  assert(
    pdfSource.includes('webContents.printToPDF') && pdfSource.includes("pageSize: 'A4'"),
    'PDF 导出应使用 Electron 打印能力生成 A4 文档'
  );
}

async function verifyMissingElectronBridge(bundlePath) {
  const sandbox = {
    window: {},
    exports: {},
    module: { exports: {} },
    console,
  };

  vm.runInNewContext(fs.readFileSync(bundlePath, 'utf8'), sandbox, { filename: bundlePath });
  const api = sandbox.module.exports.default;

  let error;
  try {
    await api.generateDocument({ projectName: 'demo' }, 'D:/repo/handover_demo.md');
  } catch (caughtError) {
    error = caughtError;
  }

  assert(error && typeof error.message === 'string', '缺少 Electron bridge 时生成文档应明确失败');
  assert(error.message.includes('Electron'), '缺少 Electron bridge 时错误信息应提示桌面桥接缺失');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
