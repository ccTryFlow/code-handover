import * as fs from 'fs/promises';
import * as path from 'path';
import { FileSummary } from '../types';
import {
  BINARY_EXTENSIONS,
  getLanguageForPath,
  isSensitiveFilePath,
  MAX_ANALYZED_FILE_SIZE,
  shouldIgnoreDirectory,
} from './scanPolicy';

const FRAMEWORK_KEY_FILES: Record<string, string[]> = {
  'Laravel': [
    'app/Http/Controllers',
    'app/Models',
    'routes/web.php',
    'routes/api.php',
    'config/app.php',
    'composer.json',
    '.env.example',
  ],
  'Gin': [
    'main.go',
    'router',
    'routes',
    'controller',
    'handlers',
    'model',
    'service',
  ],
  'ThinkPHP': [
    'think',
    'composer.json',
    'app/controller',
    'app/model',
    'app/service',
    'route',
    'config',
  ],
  'Symfony': [
    'composer.json',
    'bin/console',
    'src/Controller',
    'src/Service',
    'src/Entity',
    'config/routes.yaml',
    'config/bundles.php',
  ],
  'Go-Zero': [
    'go.mod',
    'etc',
    'internal/handler',
    'internal/logic',
    'internal/svc',
    'internal/model',
  ],
  'Spring Boot': [
    'src/main/java',
    'pom.xml',
    'build.gradle',
    'src/main/resources/application.yml',
    'src/main/resources/application.properties',
  ],
  'Django': [
    'manage.py',
    'requirements.txt',
    'pyproject.toml',
    'templates',
    'static',
  ],
  'Flask': [
    'app.py',
    'wsgi.py',
    'requirements.txt',
    'pyproject.toml',
    'templates',
  ],
  'FastAPI': [
    'main.py',
    'requirements.txt',
    'pyproject.toml',
    'routers',
    'app/routers',
  ],
  'NestJS': [
    'package.json',
    'nest-cli.json',
    'src/main.ts',
    'src/modules',
    'src/controllers',
  ],
  'Express': [
    'package.json',
    'app.js',
    'server.js',
    'routes',
    'controllers',
  ],
  'React': [
    'package.json',
    'src/App.jsx',
    'src/App.tsx',
    'src/components',
    'src/pages',
  ],
  'Vue': [
    'src/main.js',
    'src/main.ts',
    'src/components',
    'src/views',
    'src/router',
    'src/store',
    'package.json',
  ],
  'Next.js': [
    'package.json',
    'next.config.js',
    'next.config.mjs',
    'pages',
    'app',
    'src/app',
  ],
  'Rails': [
    'Gemfile',
    'config/routes.rb',
    'config/application.rb',
    'app/controllers',
    'app/models',
    'app/services',
  ],
  'Sinatra': [
    'Gemfile',
    'app.rb',
    'config.ru',
    'routes',
  ],
  'ASP.NET Core': [
    'Program.cs',
    'Startup.cs',
    'appsettings.json',
    'Controllers',
    'Pages',
    'Models',
  ],
  'Angular': [
    'package.json',
    'angular.json',
    'src/app',
    'src/environments',
  ],
  'Nuxt': [
    'package.json',
    'nuxt.config.ts',
    'nuxt.config.js',
    'pages',
    'server',
    'components',
  ],
  'SvelteKit': [
    'package.json',
    'svelte.config.js',
    'src/routes',
    'src/lib',
  ],
  'Electron': [
    'package.json',
    'electron',
    'src/main',
    'src/preload',
  ],
  'Flutter': [
    'pubspec.yaml',
    'lib',
    'android',
    'ios',
    'test',
  ],
  'Android': [
    'settings.gradle',
    'settings.gradle.kts',
    'build.gradle',
    'app/build.gradle',
    'app/src/main/AndroidManifest.xml',
    'app/src/main/java',
    'app/src/main/kotlin',
  ],
  'iOS': [
    'Podfile',
    'Package.swift',
    'Sources',
    'ios',
  ],
  'Phoenix': [
    'mix.exs',
    'config/config.exs',
    'lib',
    'priv/repo',
  ],
  'Ktor': [
    'build.gradle.kts',
    'build.gradle',
    'src/main/kotlin',
    'src/main/resources/application.conf',
  ],
  'Tauri': [
    'src-tauri/Cargo.toml',
    'src-tauri/tauri.conf.json',
    'src-tauri/src',
    'package.json',
  ],
};

async function scanDirectoryRecursive(
  dirPath: string,
  rootPath: string,
  extensions?: string[],
  files: FileSummary[] = []
): Promise<FileSummary[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      if (entry.isDirectory()) {
        if (shouldIgnoreDirectory(entry.name)) {
          continue;
        }
        await scanDirectoryRecursive(fullPath, rootPath, extensions, files);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        if (BINARY_EXTENSIONS.has(ext) || isSensitiveFilePath(relativePath)) {
          continue;
        }

        if (extensions && extensions.length > 0 && !extensions.includes(ext)) {
          continue;
        }

        try {
          const stats = await fs.stat(fullPath);

          if (stats.size > MAX_ANALYZED_FILE_SIZE) {
            continue;
          }

          files.push({
            path: relativePath,
            name: entry.name,
            extension: ext,
            language: getLanguageForPath(relativePath) || 'Unknown',
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
          });
        } catch (_e) {
          // Skip files that can't be accessed
        }
      }
    }
  } catch (_e) {
    // Skip directories that can't be read
  }

  return files;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch (_e) {
    return false;
  }
}

export async function scanFiles(localPath: string, extensions?: string[]): Promise<FileSummary[]> {
  return scanDirectoryRecursive(localPath, localPath, extensions);
}

export async function scanKeyFiles(localPath: string, framework?: string): Promise<string[]> {
  const keyFiles: string[] = [];

  // If framework is specified, look for framework-specific key files
  if (framework && FRAMEWORK_KEY_FILES[framework]) {
    for (const keyPath of FRAMEWORK_KEY_FILES[framework]) {
      const fullPath = path.join(localPath, keyPath);
      if (await pathExists(fullPath)) {
        try {
          const stats = await fs.stat(fullPath);
          if (stats.isDirectory()) {
            // For directories, scan for files inside
            const files = await scanDirectoryRecursive(fullPath, localPath);
            // Add up to 10 most relevant files from this directory
            const relevantFiles = files
              .filter(f => f.size < MAX_ANALYZED_FILE_SIZE)
              .sort((a, b) => b.size - a.size)
              .slice(0, 10);
            keyFiles.push(...relevantFiles.map(f => f.path));
          } else if (stats.isFile()) {
            keyFiles.push(keyPath);
          }
        } catch (_e) {
          // Skip inaccessible files
        }
      }
    }
  } else {
    // Generic key file detection for unknown frameworks
    const genericKeyFiles = [
      'README.md',
      'README.txt',
      'readme.md',
      'package.json',
      'composer.json',
      'pom.xml',
      'build.gradle',
      'go.mod',
      'requirements.txt',
      'Gemfile',
      'Cargo.toml',
      'pubspec.yaml',
      'mix.exs',
      'Package.swift',
      'Podfile',
      'angular.json',
      'nuxt.config.ts',
      'nuxt.config.js',
      'svelte.config.js',
      'src-tauri/Cargo.toml',
      'settings.gradle',
      'settings.gradle.kts',
      'appsettings.json',
      '.env.example',
      '.gitignore',
      'LICENSE',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'doc/',
      'docs/',
      'config/',
    ];

    for (const keyPath of genericKeyFiles) {
      const fullPath = path.join(localPath, keyPath);
      if (keyPath.endsWith('/')) {
        if (await pathExists(fullPath)) {
          const files = await scanDirectoryRecursive(fullPath, localPath);
          const relevantFiles = files
            .filter(f => f.size < MAX_ANALYZED_FILE_SIZE)
            .sort((a, b) => b.size - a.size)
            .slice(0, 5);
          keyFiles.push(...relevantFiles.map(f => f.path));
        }
      } else if (await pathExists(fullPath)) {
        keyFiles.push(keyPath);
      }
    }
  }

  // Windows 路径大小写不敏感，按规范化路径去重可避免 README.md/readme.md 重复。
  return Array.from(
    new Map(keyFiles.map(filePath => [filePath.replace(/\\/g, '/').toLowerCase(), filePath])).values()
  ).slice(0, 50);
}
