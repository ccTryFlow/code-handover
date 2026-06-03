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
  const nsisConfig = buildConfig.nsis || {};
  const msiConfig = buildConfig.msi || {};
  const ciWorkflow = readFile('.github/workflows/ci.yml');
  const releaseWorkflow = readFile('.github/workflows/release.yml');

  assert(packageJson.scripts['electron:build'].includes('electron-builder --win'), 'electron:build must generate Windows installer packages');
  assert(packageJson.scripts['electron:build'].includes('nsis'), 'electron:build must generate the x64 NSIS .exe installer');
  assert(packageJson.scripts['electron:build'].includes('msi'), 'electron:build must generate the x64 MSI installer');
  assert(packageJson.scripts['electron:build'].includes('--publish never'), 'electron:build must not publish GitHub Releases directly');
  assert(buildConfig.publish === null, 'electron-builder publish must stay disabled; GitHub Actions owns release publishing');
  assert(buildConfig.afterPack === 'scripts/embed-windows-icon.cjs', 'Windows builds must run the icon embedding afterPack hook');
  assert(fileExists(buildConfig.afterPack), 'The Windows icon embedding afterPack hook must exist');
  assert(packageJson.scripts['electron:build'].includes('--x64'), 'electron:build must generate only Windows x64 installers');
  assert(!packageJson.scripts['electron:build:win'].includes('ia32'), 'electron:build:win must not generate ia32 packages');
  assert(packageJson.scripts['electron:build:win:x64'].includes('nsis'), 'electron:build:win:x64 must generate the x64 NSIS .exe installer');
  assert(packageJson.scripts['electron:build:win:x64'].includes('msi'), 'electron:build:win:x64 must generate the x64 MSI installer');
  assert(!packageJson.scripts['electron:build:win:x64'].includes('portable'), 'electron:build:win:x64 must not generate portable packages');
  assert(Array.isArray(winTarget) && winTarget.length === 2, 'Windows release targets must contain only NSIS and MSI');
  const nsisTarget = winTarget.find(target => target.target === 'nsis');
  const msiTarget = winTarget.find(target => target.target === 'msi');
  assert(nsisTarget, 'Windows release target must include the NSIS .exe installer');
  assert(msiTarget, 'Windows release target must include the MSI installer');
  assert(Array.isArray(nsisTarget.arch) && nsisTarget.arch.length === 1 && nsisTarget.arch[0] === 'x64', 'NSIS release target must use only x64');
  assert(Array.isArray(msiTarget.arch) && msiTarget.arch.length === 1 && msiTarget.arch[0] === 'x64', 'MSI release target must use only x64');
  assert(winConfig.artifactName && winConfig.artifactName.includes('Setup'), 'Installer artifact names must include Setup');
  assert(msiConfig.artifactName && msiConfig.artifactName.includes('${arch}') && msiConfig.artifactName.endsWith('.${ext}'), 'MSI artifact name must include arch and extension placeholders');
  assert(winConfig.icon === 'public/favicon.ico', 'Windows installer must use the checked-in CodeHandover icon');
  assert(fileExists(winConfig.icon), 'Windows icon file must exist before packaging');
  assert(winConfig.signAndEditExecutable === false, 'Built-in Windows signing must stay disabled for unsigned personal releases');
  assert(packageJson.devDependencies && packageJson.devDependencies.rcedit, 'Windows icon embedding must keep rcedit as a dev dependency');
  assert(!Object.prototype.hasOwnProperty.call(buildConfig, 'portable'), 'Portable release target must stay disabled');
  assert(!ciWorkflow.includes('ia32'), 'CI workflow must not build ia32 packages');
  assert(!releaseWorkflow.includes('ia32'), 'Release workflow must not build ia32 packages');
  assert(!ciWorkflow.includes('.blockmap'), 'CI workflow must not upload blockmap files');
  assert(!ciWorkflow.includes('latest.yml'), 'CI workflow must not upload latest.yml');
  assert(!releaseWorkflow.includes('.blockmap'), 'Release workflow must not publish blockmap files');
  assert(!releaseWorkflow.includes('latest.yml'), 'Release workflow must not publish latest.yml');
  assert(ciWorkflow.includes('CodeHandover-Setup-*-x64.exe'), 'CI workflow must upload only the x64 setup executable');
  assert(ciWorkflow.includes('CodeHandover-Setup-*-x64.msi'), 'CI workflow must upload only the x64 MSI installer');
  assert(releaseWorkflow.includes('CodeHandover-Setup-*-x64.exe'), 'Release workflow must publish only the x64 setup executable');
  assert(releaseWorkflow.includes('CodeHandover-Setup-*-x64.msi'), 'Release workflow must publish only the x64 MSI installer');
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
