import * as fs from 'fs/promises';
import * as path from 'path';
import type { FrameworkSummary, ModuleSummary } from '../types';
import {
  collectFilesByExtensions,
  collectKnownFiles,
  detectByIndicators,
  pathExists,
  readTextIfExists,
  scanModuleDirectories,
} from './frameworkUtils';

async function rootDirectoriesEndingWith(localPath: string, suffix: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(localPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && entry.name.toLowerCase().endsWith(suffix.toLowerCase()))
      .map(entry => entry.name)
      .sort();
  } catch (_error) {
    return [];
  }
}

async function collectRouteSnippets(
  localPath: string,
  files: string[],
  pattern: RegExp,
  format: (match: RegExpExecArray) => string
): Promise<string[]> {
  const routes: string[] = [];
  for (const file of files.slice(0, 80)) {
    const content = await readTextIfExists(path.join(localPath, file));
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      routes.push(format(match));
    }
  }
  return Array.from(new Set(routes));
}

export async function detectRails(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Rails', [
    { file: 'Gemfile', weight: 35, evidence: 'Gemfile 包含 Rails', includes: ['rails'] },
    { file: 'config/application.rb', weight: 20, evidence: '存在 config/application.rb' },
    { file: 'config/routes.rb', weight: 15, evidence: '存在 config/routes.rb' },
    { dir: 'app/controllers', weight: 15, evidence: '存在 app/controllers 目录' },
    { dir: 'app/models', weight: 10, evidence: '存在 app/models 目录' },
  ], 35);
}

export async function scanRailsModules(localPath: string): Promise<ModuleSummary[]> {
  const modules = await scanModuleDirectories(localPath, 'Rails', [
    { name: 'Controllers', type: 'controller', dirs: ['app/controllers'], extensions: ['.rb'], summaryLabel: 'controller files' },
    { name: 'Models', type: 'model', dirs: ['app/models'], extensions: ['.rb'], summaryLabel: 'model files' },
    { name: 'Services', type: 'service', dirs: ['app/services'], extensions: ['.rb'], summaryLabel: 'service files' },
    { name: 'Jobs', type: 'job', dirs: ['app/jobs'], extensions: ['.rb'], summaryLabel: 'job files' },
    { name: 'Views', type: 'view', dirs: ['app/views'], extensions: ['.erb', '.haml', '.slim'], summaryLabel: 'view files' },
    { name: 'Configuration', type: 'config', dirs: ['config'], extensions: ['.rb', '.yml', '.yaml'], summaryLabel: 'config files' },
  ]);

  const routeFiles = await collectKnownFiles(localPath, ['config/routes.rb']);
  if (routeFiles.length > 0) {
    modules.unshift({
      name: 'Routes',
      type: 'route',
      framework: 'Rails',
      files: routeFiles,
      routes: await collectRouteSnippets(localPath, routeFiles, /\b(get|post|put|patch|delete|resources|resource)\s+['":]([^'"\s,)]+)/g, match => `${match[1].toUpperCase()} ${match[2]}`),
      summary: `${routeFiles.length} route files`,
    });
  }

  return modules;
}

export async function detectSinatra(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Sinatra', [
    { file: 'Gemfile', weight: 30, evidence: 'Gemfile 包含 Sinatra', includes: ['sinatra'] },
    { file: 'app.rb', weight: 15, evidence: '存在 app.rb' },
    { file: 'config.ru', weight: 15, evidence: '存在 Rack config.ru' },
  ], 30);
}

export async function scanSinatraModules(localPath: string): Promise<ModuleSummary[]> {
  const modules = await scanModuleDirectories(localPath, 'Sinatra', [
    { name: 'Ruby Source', type: 'service', dirs: ['.', 'routes', 'controllers', 'services'], extensions: ['.rb'], summaryLabel: 'ruby files' },
    { name: 'Views', type: 'view', dirs: ['views'], extensions: ['.erb', '.haml', '.slim'], summaryLabel: 'view files' },
  ]);
  const rubyFiles = await collectFilesByExtensions(localPath, localPath, ['.rb'], 3);
  const routes = await collectRouteSnippets(localPath, rubyFiles, /\b(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/g, match => `${match[1].toUpperCase()} ${match[2]}`);
  if (routes.length > 0) {
    modules.unshift({
      name: 'Routes',
      type: 'route',
      framework: 'Sinatra',
      files: rubyFiles.slice(0, 30),
      routes,
      summary: `${routes.length} route definitions`,
    });
  }
  return modules;
}

export async function detectAspNetCore(localPath: string): Promise<FrameworkSummary | null> {
  const projectFiles = await collectFilesByExtensions(localPath, localPath, ['.csproj', '.fsproj', '.vbproj'], 2);
  let confidence = 0;
  const evidence: string[] = [];

  for (const projectFile of projectFiles.slice(0, 10)) {
    const content = await readTextIfExists(path.join(localPath, projectFile));
    if (/Microsoft\.AspNetCore|Microsoft\.NET\.Sdk\.Web/i.test(content)) {
      confidence += 35;
      evidence.push(`${projectFile} 包含 ASP.NET Core 依赖或 Web SDK`);
      break;
    }
  }

  const program = await readTextIfExists(path.join(localPath, 'Program.cs'));
  if (/WebApplication\.CreateBuilder|Host\.CreateDefaultBuilder/i.test(program)) {
    confidence += 20;
    evidence.push('Program.cs 包含 ASP.NET Core 启动代码');
  }
  if (await pathExists(path.join(localPath, 'Controllers'))) {
    confidence += 15;
    evidence.push('存在 Controllers 目录');
  }
  if (await pathExists(path.join(localPath, 'appsettings.json'))) {
    confidence += 10;
    evidence.push('存在 appsettings.json');
  }

  return confidence >= 35 ? { name: 'ASP.NET Core', confidence: Math.min(confidence, 100), evidence } : null;
}

export async function scanAspNetCoreModules(localPath: string): Promise<ModuleSummary[]> {
  const modules = await scanModuleDirectories(localPath, 'ASP.NET Core', [
    { name: 'Controllers', type: 'controller', dirs: ['Controllers', 'src/Controllers'], extensions: ['.cs', '.fs', '.vb'], summaryLabel: 'controller files' },
    { name: 'Pages', type: 'view', dirs: ['Pages', 'Views'], extensions: ['.cshtml', '.razor'], summaryLabel: 'view/page files' },
    { name: 'Models', type: 'model', dirs: ['Models', 'Data', 'Entities'], extensions: ['.cs', '.fs', '.vb'], summaryLabel: 'model files' },
    { name: 'Services', type: 'service', dirs: ['Services'], extensions: ['.cs', '.fs', '.vb'], summaryLabel: 'service files' },
  ]);
  const configFiles = await collectKnownFiles(localPath, ['Program.cs', 'Startup.cs', 'appsettings.json', 'appsettings.Development.json']);
  if (configFiles.length > 0) {
    modules.push({
      name: 'Configuration',
      type: 'config',
      framework: 'ASP.NET Core',
      files: configFiles,
      summary: `${configFiles.length} startup/config files`,
    });
  }
  return modules;
}

export async function detectAngular(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Angular', [
    { file: 'package.json', weight: 35, evidence: 'package.json 包含 @angular/core', includes: ['@angular/core'] },
    { file: 'angular.json', weight: 25, evidence: '存在 angular.json' },
    { dir: 'src/app', weight: 15, evidence: '存在 src/app 目录' },
  ], 35);
}

export async function scanAngularModules(localPath: string): Promise<ModuleSummary[]> {
  return scanModuleDirectories(localPath, 'Angular', [
    { name: 'App Modules', type: 'component', dirs: ['src/app'], extensions: ['.ts', '.html', '.scss', '.css'], summaryLabel: 'app files' },
    { name: 'Components', type: 'component', dirs: ['src/app', 'src/components'], extensions: ['.ts', '.html'], summaryLabel: 'component files' },
    { name: 'Services', type: 'service', dirs: ['src/app', 'src/services'], extensions: ['.ts'], summaryLabel: 'service files' },
    { name: 'Routing', type: 'route', dirs: ['src/app'], extensions: ['.ts'], summaryLabel: 'routing files' },
    { name: 'Configuration', type: 'config', dirs: ['src/environments'], extensions: ['.ts', '.json'], summaryLabel: 'environment files' },
  ]);
}

export async function detectNuxt(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Nuxt', [
    { file: 'package.json', weight: 35, evidence: 'package.json 包含 Nuxt', includes: ['"nuxt"', '"nuxt3"', '@nuxt/'] },
    { file: 'nuxt.config.ts', weight: 20, evidence: '存在 nuxt.config.ts' },
    { file: 'nuxt.config.js', weight: 20, evidence: '存在 nuxt.config.js' },
    { dir: 'pages', weight: 10, evidence: '存在 pages 目录' },
    { dir: 'server', weight: 10, evidence: '存在 server 目录' },
  ], 35);
}

export async function scanNuxtModules(localPath: string): Promise<ModuleSummary[]> {
  return scanModuleDirectories(localPath, 'Nuxt', [
    { name: 'Pages', type: 'view', dirs: ['pages', 'src/pages'], extensions: ['.vue', '.ts', '.js'], summaryLabel: 'page files' },
    { name: 'Components', type: 'component', dirs: ['components', 'src/components'], extensions: ['.vue', '.ts', '.js'], summaryLabel: 'component files' },
    { name: 'Server Routes', type: 'route', dirs: ['server/api', 'server/routes'], extensions: ['.ts', '.js'], summaryLabel: 'server route files' },
    { name: 'Composables', type: 'util', dirs: ['composables', 'src/composables'], extensions: ['.ts', '.js'], summaryLabel: 'composable files' },
  ]);
}

export async function detectSvelteKit(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'SvelteKit', [
    { file: 'package.json', weight: 35, evidence: 'package.json 包含 @sveltejs/kit', includes: ['@sveltejs/kit'] },
    { file: 'svelte.config.js', weight: 20, evidence: '存在 svelte.config.js' },
    { dir: 'src/routes', weight: 20, evidence: '存在 src/routes 目录' },
  ], 35);
}

export async function scanSvelteKitModules(localPath: string): Promise<ModuleSummary[]> {
  const modules = await scanModuleDirectories(localPath, 'SvelteKit', [
    { name: 'Routes', type: 'route', dirs: ['src/routes'], extensions: ['.svelte', '.js', '.ts'], summaryLabel: 'route files' },
    { name: 'Library', type: 'component', dirs: ['src/lib'], extensions: ['.svelte', '.js', '.ts'], summaryLabel: 'library files' },
  ]);
  const configFiles = await collectKnownFiles(localPath, ['svelte.config.js', 'svelte.config.ts', 'vite.config.js', 'vite.config.ts']);
  if (configFiles.length > 0) {
    modules.push({
      name: 'Configuration',
      type: 'config',
      framework: 'SvelteKit',
      files: configFiles,
      summary: `${configFiles.length} config files`,
    });
  }
  return modules;
}

export async function detectElectron(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Electron', [
    { file: 'package.json', weight: 35, evidence: 'package.json 包含 electron', includes: ['"electron"'] },
    { dir: 'electron', weight: 20, evidence: '存在 electron 目录' },
    { file: 'electron/main.ts', weight: 10, evidence: '存在 electron/main.ts' },
    { file: 'main.js', weight: 10, evidence: '存在 main.js' },
  ], 35);
}

export async function scanElectronModules(localPath: string): Promise<ModuleSummary[]> {
  return scanModuleDirectories(localPath, 'Electron', [
    { name: 'Main Process', type: 'service', dirs: ['electron', 'src/main', 'main'], extensions: ['.ts', '.js', '.mjs', '.cjs'], summaryLabel: 'main-process files' },
    { name: 'Preload', type: 'service', dirs: ['electron', 'src/preload', 'preload'], extensions: ['.ts', '.js'], summaryLabel: 'preload files' },
    { name: 'Renderer', type: 'view', dirs: ['src', 'renderer'], extensions: ['.vue', '.tsx', '.jsx', '.ts', '.js'], summaryLabel: 'renderer files' },
  ]);
}

export async function detectFlutter(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Flutter', [
    { file: 'pubspec.yaml', weight: 35, evidence: 'pubspec.yaml 包含 Flutter', includes: ['flutter:'] },
    { dir: 'lib', weight: 15, evidence: '存在 lib 目录' },
    { dir: 'android', weight: 10, evidence: '存在 android 目录' },
    { dir: 'ios', weight: 10, evidence: '存在 ios 目录' },
  ], 35);
}

export async function scanFlutterModules(localPath: string): Promise<ModuleSummary[]> {
  return scanModuleDirectories(localPath, 'Flutter', [
    { name: 'Dart Source', type: 'view', dirs: ['lib'], extensions: ['.dart'], summaryLabel: 'dart files' },
    { name: 'Tests', type: 'other', dirs: ['test', 'integration_test'], extensions: ['.dart'], summaryLabel: 'test files' },
    { name: 'Android Shell', type: 'config', dirs: ['android'], extensions: ['.gradle', '.kt', '.java', '.xml'], summaryLabel: 'android files' },
    { name: 'iOS Shell', type: 'config', dirs: ['ios'], extensions: ['.swift', '.m', '.mm', '.plist', '.pbxproj'], summaryLabel: 'ios files' },
  ]);
}

export async function detectAndroid(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Android', [
    { file: 'settings.gradle', weight: 15, evidence: '存在 settings.gradle' },
    { file: 'settings.gradle.kts', weight: 15, evidence: '存在 settings.gradle.kts' },
    { file: 'app/build.gradle', weight: 20, evidence: '存在 app/build.gradle' },
    { file: 'app/src/main/AndroidManifest.xml', weight: 25, evidence: '存在 AndroidManifest.xml' },
    { dir: 'app/src/main/java', weight: 10, evidence: '存在 Java 源码目录' },
    { dir: 'app/src/main/kotlin', weight: 10, evidence: '存在 Kotlin 源码目录' },
  ], 35);
}

export async function scanAndroidModules(localPath: string): Promise<ModuleSummary[]> {
  return scanModuleDirectories(localPath, 'Android', [
    { name: 'Activities / Kotlin', type: 'controller', dirs: ['app/src/main/kotlin'], extensions: ['.kt', '.java'], summaryLabel: 'kotlin/java files' },
    { name: 'Activities / Java', type: 'controller', dirs: ['app/src/main/java'], extensions: ['.java', '.kt'], summaryLabel: 'java/kotlin files' },
    { name: 'Resources', type: 'view', dirs: ['app/src/main/res'], extensions: ['.xml'], summaryLabel: 'resource files' },
    { name: 'Configuration', type: 'config', dirs: ['app'], extensions: ['.gradle', '.kts', '.xml'], summaryLabel: 'config files' },
  ]);
}

export async function detectIOS(localPath: string): Promise<FrameworkSummary | null> {
  const xcodeProjects = await rootDirectoriesEndingWith(localPath, '.xcodeproj');
  let confidence = 0;
  const evidence: string[] = [];

  if (xcodeProjects.length > 0) {
    confidence += 35;
    evidence.push(`存在 Xcode 工程: ${xcodeProjects[0]}`);
  }
  if (await pathExists(path.join(localPath, 'Podfile'))) {
    confidence += 25;
    evidence.push('存在 Podfile');
  }
  if (await pathExists(path.join(localPath, 'Package.swift'))) {
    confidence += 20;
    evidence.push('存在 Package.swift');
  }
  if (await pathExists(path.join(localPath, 'Sources'))) {
    confidence += 10;
    evidence.push('存在 Sources 目录');
  }

  return confidence >= 35 ? { name: 'iOS', confidence: Math.min(confidence, 100), evidence } : null;
}

export async function scanIOSModules(localPath: string): Promise<ModuleSummary[]> {
  const xcodeProjects = await rootDirectoriesEndingWith(localPath, '.xcodeproj');
  const modules = await scanModuleDirectories(localPath, 'iOS', [
    { name: 'Swift Sources', type: 'service', dirs: ['Sources', 'ios', 'App'], extensions: ['.swift', '.m', '.mm'], summaryLabel: 'source files' },
    { name: 'Resources', type: 'view', dirs: ['Resources', 'Assets.xcassets', 'ios'], extensions: ['.storyboard', '.xib', '.plist'], summaryLabel: 'resource files' },
  ]);
  if (xcodeProjects.length > 0) {
    modules.unshift({
      name: 'Xcode Projects',
      type: 'config',
      framework: 'iOS',
      files: xcodeProjects,
      summary: `${xcodeProjects.length} Xcode project directories`,
    });
  }
  return modules;
}

export async function detectPhoenix(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Phoenix', [
    { file: 'mix.exs', weight: 35, evidence: 'mix.exs 包含 Phoenix', includes: [':phoenix', 'Phoenix'] },
    { file: 'config/config.exs', weight: 15, evidence: '存在 config/config.exs' },
    { dir: 'lib', weight: 10, evidence: '存在 lib 目录' },
    { dir: 'priv/repo', weight: 10, evidence: '存在 priv/repo 目录' },
  ], 35);
}

export async function scanPhoenixModules(localPath: string): Promise<ModuleSummary[]> {
  return scanModuleDirectories(localPath, 'Phoenix', [
    { name: 'Web Layer', type: 'controller', dirs: ['lib'], extensions: ['.ex', '.exs'], summaryLabel: 'elixir files' },
    { name: 'Contexts', type: 'service', dirs: ['lib'], extensions: ['.ex'], summaryLabel: 'context files' },
    { name: 'Migrations', type: 'migration', dirs: ['priv/repo/migrations'], extensions: ['.exs'], summaryLabel: 'migration files' },
    { name: 'Configuration', type: 'config', dirs: ['config'], extensions: ['.exs'], summaryLabel: 'config files' },
  ]);
}

export async function detectKtor(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Ktor', [
    { file: 'build.gradle.kts', weight: 30, evidence: 'build.gradle.kts 包含 Ktor', includes: ['io.ktor'] },
    { file: 'build.gradle', weight: 30, evidence: 'build.gradle 包含 Ktor', includes: ['io.ktor'] },
    { file: 'pom.xml', weight: 25, evidence: 'pom.xml 包含 Ktor', includes: ['ktor-server'] },
    { dir: 'src/main/kotlin', weight: 10, evidence: '存在 Kotlin 源码目录' },
    { file: 'src/main/resources/application.conf', weight: 10, evidence: '存在 Ktor application.conf' },
  ], 35);
}

export async function scanKtorModules(localPath: string): Promise<ModuleSummary[]> {
  return scanModuleDirectories(localPath, 'Ktor', [
    { name: 'Kotlin Source', type: 'service', dirs: ['src/main/kotlin'], extensions: ['.kt', '.kts'], summaryLabel: 'kotlin files' },
    { name: 'Routes', type: 'route', dirs: ['src/main/kotlin'], extensions: ['.kt'], summaryLabel: 'route files' },
    { name: 'Configuration', type: 'config', dirs: ['src/main/resources'], extensions: ['.conf', '.yaml', '.yml', '.properties'], summaryLabel: 'config files' },
  ]);
}

export async function detectTauri(localPath: string): Promise<FrameworkSummary | null> {
  return detectByIndicators(localPath, 'Tauri', [
    { file: 'src-tauri/Cargo.toml', weight: 35, evidence: 'src-tauri/Cargo.toml 包含 Tauri', includes: ['tauri'] },
    { file: 'src-tauri/tauri.conf.json', weight: 20, evidence: '存在 tauri.conf.json' },
    { dir: 'src-tauri/src', weight: 10, evidence: '存在 src-tauri/src 目录' },
  ], 35);
}

export async function scanTauriModules(localPath: string): Promise<ModuleSummary[]> {
  return scanModuleDirectories(localPath, 'Tauri', [
    { name: 'Rust Backend', type: 'service', dirs: ['src-tauri/src'], extensions: ['.rs'], summaryLabel: 'rust files' },
    { name: 'Configuration', type: 'config', dirs: ['src-tauri'], extensions: ['.toml', '.json'], summaryLabel: 'config files' },
    { name: 'Frontend', type: 'view', dirs: ['src', 'app', 'pages'], extensions: ['.vue', '.tsx', '.jsx', '.ts', '.js', '.svelte'], summaryLabel: 'frontend files' },
  ]);
}
