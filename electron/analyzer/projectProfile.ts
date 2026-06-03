import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DependencyManifestSummary,
  DirectorySummary,
  FileSummary,
  ProjectProfile,
  StartCommandSummary,
} from '../types';
import {
  isSensitiveFilePath,
  normalizeRelativePath,
  shouldIgnoreDirectory,
} from './scanPolicy';

const SCRIPT_PRIORITY = ['dev', 'start', 'serve', 'preview', 'build', 'test'];
const MAX_PROFILE_ITEMS = 50;

interface ManifestAnalysis {
  summary: DependencyManifestSummary;
  commands: StartCommandSummary[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function countRecordKeys(value: unknown): number {
  return isRecord(value) ? Object.keys(value).length : 0;
}

function getNestedCommand(directory: string, command: string): string {
  return directory === '.' ? command : `cd ${directory} && ${command}`;
}

function getScriptCommand(packageManager: string, script: string): string {
  switch (packageManager) {
    case 'yarn':
      return `yarn ${script}`;
    case 'pnpm':
      return `pnpm ${script}`;
    case 'bun':
      return `bun run ${script}`;
    default:
      return script === 'start' ? 'npm start' : `npm run ${script}`;
  }
}

function getPackageManager(manifestPath: string, paths: Set<string>): string {
  const directory = path.posix.dirname(manifestPath);
  const resolve = (name: string) => (directory === '.' ? name : `${directory}/${name}`).toLowerCase();

  if (paths.has(resolve('pnpm-lock.yaml'))) return 'pnpm';
  if (paths.has(resolve('yarn.lock'))) return 'yarn';
  if (paths.has(resolve('bun.lockb')) || paths.has(resolve('bun.lock'))) return 'bun';
  return 'npm';
}

function countRequirements(content: string): number {
  return content
    .split(/\r?\n/)
    .filter(line => line.trim() !== '' && !line.trim().startsWith('#'))
    .length;
}

function countTomlSection(content: string, sectionNames: string[]): number {
  let active = false;
  let count = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      active = sectionNames.includes(section[1]);
      continue;
    }

    if (active && /^[A-Za-z0-9_.-]+\s*=/.test(line)) {
      count++;
    }
  }

  return count;
}

function countTomlArrayValue(content: string, key: string): number {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm'));
  if (!match) return 0;
  return match[1]
    .split(',')
    .map(item => item.trim())
    .filter(item => item !== '' && !item.startsWith('#'))
    .length;
}

function countRubyGemEntries(content: string): number {
  return (content.match(/^\s*gem\s+['"]/gm) ?? []).length;
}

function countPubspecDependencies(content: string): number {
  let active = false;
  let count = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (/^(?:dependencies|dev_dependencies):\s*$/.test(line)) {
      active = true;
      continue;
    }
    if (active && /^[A-Za-z_][\w-]*:\s*/.test(line)) {
      count++;
      continue;
    }
    if (active && /^\S/.test(line)) {
      active = false;
    }
  }

  return count;
}

async function readManifestAnalysis(
  localPath: string,
  file: FileSummary,
  allPaths: Set<string>
): Promise<ManifestAnalysis | null> {
  const normalizedPath = normalizeRelativePath(file.path);
  const baseName = path.posix.basename(normalizedPath).toLowerCase();
  const extension = path.posix.extname(baseName);
  const fullPath = path.join(localPath, file.path);
  const content = await fs.readFile(fullPath, 'utf8');

  if (baseName === 'package.json') {
    const packageJson = JSON.parse(content) as unknown;
    if (!isRecord(packageJson)) return null;

    const packageManager = getPackageManager(normalizedPath, allPaths);
    const directory = path.posix.dirname(normalizedPath);
    const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : {};
    const commands = SCRIPT_PRIORITY
      .filter(script => typeof scripts[script] === 'string')
      .map(script => ({
        command: getNestedCommand(directory, getScriptCommand(packageManager, script)),
        source: normalizedPath,
      }));

    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Node.js',
        dependencyCount: countRecordKeys(packageJson.dependencies),
        devDependencyCount: countRecordKeys(packageJson.devDependencies),
        packageManager,
      },
      commands,
    };
  }

  if (baseName === 'composer.json') {
    const composerJson = JSON.parse(content) as unknown;
    if (!isRecord(composerJson)) return null;

    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'PHP Composer',
        dependencyCount: countRecordKeys(composerJson.require),
        devDependencyCount: countRecordKeys(composerJson['require-dev']),
        packageManager: 'composer',
      },
      commands: [],
    };
  }

  if (baseName === 'go.mod') {
    const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/)?.[1] ?? '';
    const standaloneRequires = content.match(/^\s*require\s+\S+\s+\S+/gm) ?? [];
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Go Modules',
        dependencyCount: countRequirements(requireBlock) + standaloneRequires.length,
        packageManager: 'go',
      },
      commands: [],
    };
  }

  if (baseName === 'pom.xml') {
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Java Maven',
        dependencyCount: (content.match(/<dependency>/g) ?? []).length,
        packageManager: 'maven',
      },
      commands: [],
    };
  }

  if (baseName === 'build.gradle' || baseName === 'build.gradle.kts') {
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Java Gradle',
        dependencyCount: (content.match(/\b(?:api|implementation|compileOnly|runtimeOnly|testImplementation)\s*\(?/g) ?? []).length,
        packageManager: 'gradle',
      },
      commands: [],
    };
  }

  if (baseName === 'requirements.txt') {
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Python pip',
        dependencyCount: countRequirements(content),
        packageManager: 'pip',
      },
      commands: [],
    };
  }

  if (baseName === 'pyproject.toml') {
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Python pyproject',
        dependencyCount: countTomlArrayValue(content, 'dependencies')
          + countTomlSection(content, ['project.dependencies', 'tool.poetry.dependencies']),
        packageManager: 'python',
      },
      commands: [],
    };
  }

  if (baseName === 'pipfile') {
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Python Pipenv',
        dependencyCount: countTomlSection(content, ['packages']),
        devDependencyCount: countTomlSection(content, ['dev-packages']),
        packageManager: 'pipenv',
      },
      commands: [],
    };
  }

  if (baseName === 'gemfile') {
    const isRails = /(?:^|\n)\s*gem\s+['"]rails['"]/i.test(content);
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Ruby Bundler',
        dependencyCount: countRubyGemEntries(content),
        packageManager: 'bundler',
      },
      commands: [
        { command: getNestedCommand(path.posix.dirname(normalizedPath), 'bundle install'), source: normalizedPath },
        ...(isRails ? [{ command: getNestedCommand(path.posix.dirname(normalizedPath), 'bundle exec rails server'), source: normalizedPath }] : []),
      ],
    };
  }

  if (baseName === 'cargo.toml') {
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Rust Cargo',
        dependencyCount: countTomlSection(content, ['dependencies']),
        devDependencyCount: countTomlSection(content, ['dev-dependencies']),
        packageManager: 'cargo',
      },
      commands: [],
    };
  }

  if (baseName === 'pubspec.yaml') {
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Dart / Flutter pub',
        dependencyCount: countPubspecDependencies(content),
        packageManager: 'flutter',
      },
      commands: [
        { command: getNestedCommand(path.posix.dirname(normalizedPath), 'flutter pub get'), source: normalizedPath },
        { command: getNestedCommand(path.posix.dirname(normalizedPath), 'flutter run'), source: normalizedPath },
      ],
    };
  }

  if (baseName === 'mix.exs') {
    const isPhoenix = content.includes(':phoenix') || content.includes('Phoenix');
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Elixir Mix',
        dependencyCount: (content.match(/\{:\w+/g) ?? []).length,
        packageManager: 'mix',
      },
      commands: [
        { command: getNestedCommand(path.posix.dirname(normalizedPath), 'mix deps.get'), source: normalizedPath },
        { command: getNestedCommand(path.posix.dirname(normalizedPath), isPhoenix ? 'mix phx.server' : 'mix run'), source: normalizedPath },
      ],
    };
  }

  if (baseName === 'package.swift') {
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'Swift Package Manager',
        dependencyCount: (content.match(/\.package\s*\(/g) ?? []).length,
        packageManager: 'swift',
      },
      commands: [{ command: getNestedCommand(path.posix.dirname(normalizedPath), 'swift run'), source: normalizedPath }],
    };
  }

  if (baseName === 'podfile') {
    return {
      summary: {
        path: normalizedPath,
        ecosystem: 'iOS CocoaPods',
        dependencyCount: (content.match(/^\s*pod\s+['"]/gm) ?? []).length,
        packageManager: 'cocoapods',
      },
      commands: [{ command: getNestedCommand(path.posix.dirname(normalizedPath), 'pod install'), source: normalizedPath }],
    };
  }

  if (extension === '.csproj' || extension === '.fsproj' || extension === '.vbproj') {
    return {
      summary: {
        path: normalizedPath,
        ecosystem: '.NET NuGet',
        dependencyCount: (content.match(/<PackageReference\b/g) ?? []).length,
        packageManager: 'dotnet',
      },
      commands: [],
    };
  }

  return null;
}

function isManifestPath(filePath: string): boolean {
  const baseName = path.posix.basename(filePath).toLowerCase();
  return [
    'package.json',
    'composer.json',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'requirements.txt',
    'pyproject.toml',
    'pipfile',
    'gemfile',
    'cargo.toml',
    'pubspec.yaml',
    'mix.exs',
    'package.swift',
    'podfile',
  ].includes(baseName) || ['.csproj', '.fsproj', '.vbproj'].includes(path.posix.extname(baseName));
}

function isReadmePath(filePath: string): boolean {
  return /^readme(?:\.[^/]+)?$/i.test(path.posix.basename(filePath));
}

function isDocumentationPath(filePath: string): boolean {
  const normalizedPath = normalizeRelativePath(filePath);
  const baseName = path.posix.basename(normalizedPath);
  return /^(?:docs?|documentation)\//i.test(normalizedPath)
    || /^(?:CHANGELOG|CONTRIBUTING|LICENSE)(?:\.[^/]+)?$/i.test(baseName);
}

function isConfigPath(filePath: string): boolean {
  const normalizedPath = normalizeRelativePath(filePath);
  const baseName = path.posix.basename(normalizedPath);

  return /^(?:config|configs|configuration)\//i.test(normalizedPath)
    || /^\.env\.(?:example|sample|template|dist)$/i.test(baseName)
    || /^application(?:-[^.]+)?\.(?:properties|ya?ml)$/i.test(baseName)
    || /^(?:docker-compose(?:\.[^.]+)?\.ya?ml|Dockerfile|Makefile)$/i.test(baseName)
    || /(?:^|\.)(?:config|rc)\.(?:js|cjs|mjs|ts|json|ya?ml)$/i.test(baseName)
    || /^(?:tsconfig|jsconfig|vite\.config|webpack\.config|eslint\.config).*/i.test(baseName);
}

function createDirectorySummaries(files: FileSummary[]): DirectorySummary[] {
  const counts = new Map<string, number>();

  for (const file of files) {
    const normalizedPath = normalizeRelativePath(file.path);
    const segments = normalizedPath.split('/');
    if (segments.length < 2) continue;

    counts.set(segments[0], (counts.get(segments[0]) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([directoryPath, fileCount]) => ({ path: directoryPath, fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount || a.path.localeCompare(b.path))
    .slice(0, MAX_PROFILE_ITEMS);
}

async function scanSensitiveFiles(
  dirPath: string,
  rootPath: string,
  sensitiveFiles: string[]
): Promise<void> {
  if (sensitiveFiles.length >= MAX_PROFILE_ITEMS) return;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (sensitiveFiles.length >= MAX_PROFILE_ITEMS) return;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = normalizeRelativePath(path.relative(rootPath, fullPath));
      if (entry.isDirectory()) {
        if (!shouldIgnoreDirectory(entry.name)) {
          await scanSensitiveFiles(fullPath, rootPath, sensitiveFiles);
        }
      } else if (entry.isFile() && isSensitiveFilePath(relativePath)) {
        sensitiveFiles.push(relativePath);
      }
    }
  } catch (_error) {
    // 敏感文件扫描只输出路径提示，目录不可读时保持降级结果。
  }
}

function addCommand(commands: StartCommandSummary[], command: string, source: string): void {
  if (!commands.some(item => item.command === command)) {
    commands.push({ command, source });
  }
}

function addConventionalCommands(
  paths: Set<string>,
  manifests: DependencyManifestSummary[],
  commands: StartCommandSummary[]
): void {
  if (paths.has('artisan')) addCommand(commands, 'php artisan serve', 'artisan');
  if (paths.has('manage.py')) addCommand(commands, 'python manage.py runserver', 'manage.py');
  if (paths.has('main.py')) addCommand(commands, 'python main.py', 'main.py');
  if (paths.has('go.mod')) addCommand(commands, 'go run .', 'go.mod');
  if (paths.has('cargo.toml')) addCommand(commands, 'cargo run', 'Cargo.toml');
  if (paths.has('pubspec.yaml')) addCommand(commands, 'flutter run', 'pubspec.yaml');
  if (paths.has('mix.exs')) addCommand(commands, 'mix run', 'mix.exs');
  if (paths.has('makefile')) addCommand(commands, 'make', 'Makefile');

  if (paths.has('pom.xml') && Array.from(paths).some(filePath => /application\.(?:properties|ya?ml)$/i.test(filePath))) {
    addCommand(commands, 'mvn spring-boot:run', 'pom.xml');
  }

  if (
    (paths.has('build.gradle') || paths.has('build.gradle.kts'))
    && Array.from(paths).some(filePath => /application\.(?:properties|ya?ml)$/i.test(filePath))
  ) {
    addCommand(commands, './gradlew bootRun', paths.has('build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle');
  }

  for (const manifest of manifests.filter(item => item.ecosystem === '.NET NuGet')) {
    addCommand(commands, `dotnet run --project ${manifest.path}`, manifest.path);
  }
}

export async function buildProjectProfile(
  localPath: string,
  files: FileSummary[]
): Promise<ProjectProfile> {
  const normalizedFiles = files.map(file => ({
    ...file,
    path: normalizeRelativePath(file.path),
  }));
  const allPaths = new Set(normalizedFiles.map(file => file.path.toLowerCase()));
  const dependencyManifests: DependencyManifestSummary[] = [];
  const startCommands: StartCommandSummary[] = [];

  for (const file of normalizedFiles.filter(item => isManifestPath(item.path)).slice(0, MAX_PROFILE_ITEMS)) {
    try {
      const analysis = await readManifestAnalysis(localPath, file, allPaths);
      if (analysis) {
        dependencyManifests.push(analysis.summary);
        for (const command of analysis.commands) {
          addCommand(startCommands, command.command, command.source);
        }
      }
    } catch (_error) {
      // 清单损坏时仍保留其他项目画像，不让单个文件阻断交接文档生成。
    }
  }

  addConventionalCommands(allPaths, dependencyManifests, startCommands);

  const sensitiveFiles: string[] = [];
  await scanSensitiveFiles(localPath, localPath, sensitiveFiles);

  return {
    readmeFiles: normalizedFiles.filter(file => isReadmePath(file.path)).map(file => file.path).slice(0, MAX_PROFILE_ITEMS),
    documentationFiles: normalizedFiles.filter(file => isDocumentationPath(file.path)).map(file => file.path).slice(0, MAX_PROFILE_ITEMS),
    dependencyManifests,
    configFiles: normalizedFiles.filter(file => isConfigPath(file.path)).map(file => file.path).slice(0, MAX_PROFILE_ITEMS),
    sensitiveFiles: sensitiveFiles.sort(),
    startCommands: startCommands.slice(0, MAX_PROFILE_ITEMS),
    topLevelDirectories: createDirectorySummaries(normalizedFiles),
  };
}
