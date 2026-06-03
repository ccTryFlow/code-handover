const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyDevToolsGuard() {
  const mainSource = readFile('electron/main.ts');
  const devToolsLines = mainSource
    .split(/\r?\n/)
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(item => item.line.includes('openDevTools'));

  assert(mainSource.includes('CODEHANDOVER_OPEN_DEVTOOLS'), 'DevTools 必须由显式环境变量控制');
  assert(devToolsLines.length === 1, '发布前检查只允许保留一个受控的 openDevTools 调用');
  assert(mainSource.includes('!app.isPackaged && process.env.CODEHANDOVER_OPEN_DEVTOOLS === \'1\''), '打包版本不能自动打开 DevTools');
  assert(mainSource.includes('if (shouldOpenDevTools())'), 'openDevTools 必须放在 shouldOpenDevTools 守卫后');
}

function verifyWebRuntimeGuard() {
  const appSource = readFile('src/App.vue');
  const electronApiSource = readFile('src/api/electron.ts');

  assert(electronApiSource.includes('export function isElectronRuntime'), '前端必须导出 Electron 运行环境检测');
  assert(appSource.includes('!isDesktopRuntime'), 'App.vue 必须在非 Electron 环境显示拦截页');
  assert(appSource.includes('CodeHandover 是桌面应用专用'), '网页环境提示必须说明桌面应用专用');
  assert(appSource.includes('普通网页环境无法访问这些能力'), '网页环境提示必须说明 Git/本地文件能力不可用');
}

function verifyInstallerConfig() {
  const packageJson = JSON.parse(readFile('package.json'));
  const buildConfig = packageJson.build || {};
  const winTarget = buildConfig.win && buildConfig.win.target;
  const targetText = JSON.stringify(winTarget || '');
  const nsisConfig = buildConfig.nsis || {};

  assert(packageJson.scripts['electron:build'].includes('electron-builder --win nsis'), 'electron:build 必须生成 Windows NSIS 安装包');
  assert(targetText.includes('nsis'), 'Windows 发布目标必须包含 nsis 安装器');
  assert(buildConfig.win.artifactName && buildConfig.win.artifactName.includes('Setup'), '安装包文件名必须明确包含 Setup');
  assert(nsisConfig.oneClick === false, '安装器必须显示安装向导，不能静默一键安装');
  assert(nsisConfig.createDesktopShortcut === true, '安装器必须创建桌面快捷方式');
  assert(nsisConfig.createStartMenuShortcut === true, '安装器必须创建开始菜单快捷方式');
  assert(nsisConfig.shortcutName === 'CodeHandover', '安装器快捷方式名称必须固定为 CodeHandover');
}

function main() {
  verifyDevToolsGuard();
  verifyWebRuntimeGuard();
  verifyInstallerConfig();
  console.log(JSON.stringify({ assertions: 'passed', checks: ['devtools', 'web-runtime', 'installer'] }, null, 2));
}

main();
