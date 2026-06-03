const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
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

  assert(mainSource.includes('CODEHANDOVER_OPEN_DEVTOOLS'), 'DevTools must be controlled by an explicit environment variable');
  assert(devToolsLines.length === 1, 'Release guard allows only one guarded openDevTools call');
  assert(mainSource.includes('!app.isPackaged && process.env.CODEHANDOVER_OPEN_DEVTOOLS === \'1\''), 'Packaged builds must not open DevTools automatically');
  assert(mainSource.includes('if (shouldOpenDevTools())'), 'openDevTools must stay behind shouldOpenDevTools');
}

function verifyWebRuntimeGuard() {
  const appSource = readFile('src/App.vue');
  const electronApiSource = readFile('src/api/electron.ts');

  assert(electronApiSource.includes('export function isElectronRuntime'), 'Renderer API must export Electron runtime detection');
  assert(appSource.includes('!isDesktopRuntime'), 'App.vue must show the web-runtime blocker outside Electron');
  assert(appSource.includes('desktop-required'), 'App.vue must keep the desktop-only fallback surface');
  assert(appSource.includes('https://github.com/ccTryFlow/code-handover'), 'The desktop-only fallback must keep a repository link');
}

function verifyInstallerConfig() {
  const packageJson = JSON.parse(readFile('package.json'));
  const buildConfig = packageJson.build || {};
  const winConfig = buildConfig.win || {};
  const winTarget = winConfig.target;
  const targetText = JSON.stringify(winTarget || '');
  const nsisConfig = buildConfig.nsis || {};

  assert(packageJson.scripts['electron:build'].includes('electron-builder --win nsis'), 'electron:build must generate a Windows NSIS installer');
  assert(packageJson.scripts['electron:build'].includes('--publish never'), 'electron:build must not publish GitHub Releases directly');
  assert(buildConfig.publish === null, 'electron-builder publish must stay disabled; GitHub Actions owns release publishing');
  assert(buildConfig.afterPack === 'scripts/embed-windows-icon.cjs', 'Windows builds must run the icon embedding afterPack hook');
  assert(fileExists(buildConfig.afterPack), 'The Windows icon embedding afterPack hook must exist');
  assert(targetText.includes('nsis'), 'Windows release targets must include the NSIS installer');
  assert(winConfig.artifactName && winConfig.artifactName.includes('Setup'), 'Installer artifact names must include Setup');
  assert(winConfig.icon === 'public/favicon.ico', 'Windows installer must use the checked-in CodeHandover icon');
  assert(fileExists(winConfig.icon), 'Windows icon file must exist before packaging');
  assert(winConfig.signAndEditExecutable === false, 'Built-in Windows signing must stay disabled for unsigned personal releases');
  assert(packageJson.devDependencies && packageJson.devDependencies.rcedit, 'Windows icon embedding must keep rcedit as a dev dependency');
  assert(nsisConfig.oneClick === false, 'Installer must show the setup wizard instead of silent one-click install');
  assert(nsisConfig.createDesktopShortcut === true, 'Installer must create a desktop shortcut');
  assert(nsisConfig.createStartMenuShortcut === true, 'Installer must create a Start Menu shortcut');
  assert(nsisConfig.shortcutName === 'CodeHandover', 'Installer shortcut name must stay CodeHandover');
}

function main() {
  verifyDevToolsGuard();
  verifyWebRuntimeGuard();
  verifyInstallerConfig();
  console.log(JSON.stringify({ assertions: 'passed', checks: ['devtools', 'web-runtime', 'installer'] }, null, 2));
}

main();
