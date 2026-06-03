import * as fs from 'fs/promises';
import * as path from 'path';
import { FrameworkSummary, ModuleSummary, RouteInfo } from '../types';

const GIN_INDICATORS = [
  { file: 'go.mod', weight: 20, evidence: 'Found go.mod file', check: (content: string) => content.includes('module') },
  { file: 'main.go', weight: 15, evidence: 'Found main.go file' },
  { file: 'go.mod', weight: 25, evidence: 'Found gin-gonic/gin dependency', check: (content: string) => content.includes('gin-gonic/gin') },
  { file: 'go.sum', weight: 10, evidence: 'Found gin in go.sum', check: (content: string) => content.includes('gin-gonic/gin') },
];

const MODULE_SCAN_DIRS = [
  'main.go',
  'router',
  'routes',
  'controller',
  'controllers',
  'handler',
  'handlers',
  'service',
  'services',
  'model',
  'models',
  'entity',
  'config',
  'worker',
  'consumer',
  'cron',
];

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch (_e) {
    return false;
  }
}

async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (_e) {
    return '';
  }
}

export async function detectGin(localPath: string): Promise<FrameworkSummary | null> {
  const evidence: string[] = [];
  let confidence = 0;

  const goModPath = path.join(localPath, 'go.mod');
  const goSumPath = path.join(localPath, 'go.sum');
  const mainGoPath = path.join(localPath, 'main.go');

  const goModContent = await readFileContent(goModPath);
  const goSumContent = await readFileContent(goSumPath);

  for (const indicator of GIN_INDICATORS) {
    const fullPath = path.join(localPath, indicator.file);
    if (await pathExists(fullPath)) {
      if (indicator.check) {
        const content = indicator.file === 'go.mod' ? goModContent : goSumContent;
        if (indicator.check(content)) {
          confidence += indicator.weight;
          evidence.push(indicator.evidence);
        }
      } else {
        confidence += indicator.weight;
        evidence.push(indicator.evidence);
      }
    }
  }

  if (confidence < 30) {
    return null;
  }

  return {
    name: 'Gin',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

async function parseGoRouteFile(filePath: string): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const patterns = [
        /(\w+)\.\s*(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|ANY)\s*\(\s*['"`]([^'"`]+)['"`]/,
        /r\.\s*(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|Any)\s*\(\s*['"`]([^'"`]+)['"`]/,
      ];

      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          routes.push({
            method: match[2].toUpperCase(),
            path: match[3],
            handler: match[1],
            file: filePath,
          });
        }
      }
    }
  } catch (_e) {
    // File might not exist or can't be read
  }
  return routes;
}

async function scanGoDirectoryModules(
  localPath: string,
  moduleType: string,
  dirPaths: string[]
): Promise<ModuleSummary[]> {
  const modules: ModuleSummary[] = [];

  for (const dirPath of dirPaths) {
    const fullPath = path.join(localPath, dirPath);
    if (!(await pathExists(fullPath))) {
      continue;
    }

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.go') || entry.name.endsWith('.html'))) {
          files.push(path.join(dirPath, entry.name));
        } else if (entry.isDirectory()) {
          const subPath = path.join(fullPath, entry.name);
          try {
            const subEntries = await fs.readdir(subPath, { withFileTypes: true });
            for (const subEntry of subEntries) {
              if (subEntry.isFile() && (subEntry.name.endsWith('.go') || subEntry.name.endsWith('.html'))) {
                files.push(path.join(dirPath, entry.name, subEntry.name));
              }
            }
          } catch (_e) {
            // Skip subdirectories that can't be read
          }
        }
      }

      if (files.length > 0) {
        modules.push({
          name: path.basename(dirPath),
          type: moduleType as any,
          files,
          summary: `${moduleType} directory with ${files.length} files`,
        });
      }
    } catch (_e) {
      // Skip directories that can't be read
    }
  }

  return modules;
}

export async function scanGinModules(localPath: string): Promise<ModuleSummary[]> {
  const modules: ModuleSummary[] = [];

  // Scan main.go for basic info
  const mainGoPath = path.join(localPath, 'main.go');
  if (await pathExists(mainGoPath)) {
    modules.push({
      name: 'Main',
      type: 'other',
      files: ['main.go'],
      summary: 'Main application entry point',
    });
  }

  // Scan router directories for routes
  const routerDirs = ['router', 'routes'];
  const allRoutes: RouteInfo[] = [];

  for (const routerDir of routerDirs) {
    const routerPath = path.join(localPath, routerDir);
    if (await pathExists(routerPath)) {
      try {
        const entries = await fs.readdir(routerPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.go')) {
            const filePath = path.join(routerPath, entry.name);
            allRoutes.push(...await parseGoRouteFile(filePath));
          }
        }
      } catch (_e) {
        // Directory can't be read
      }
    }
  }

  if (allRoutes.length > 0) {
    modules.push({
      name: 'Routes',
      type: 'route',
      files: routerDirs,
      summary: `Found ${allRoutes.length} route definitions`,
      routes: allRoutes.map(r => r.path),
    });
  }

  // Scan other module directories
  const otherDirs = [
    { dirs: ['controller', 'controllers'], type: 'controller' },
    { dirs: ['handler', 'handlers'], type: 'controller' },
    { dirs: ['service', 'services'], type: 'service' },
    { dirs: ['model', 'models'], type: 'model' },
    { dirs: ['entity'], type: 'model' },
    { dirs: ['config'], type: 'config' },
    { dirs: ['worker'], type: 'job' },
    { dirs: ['consumer'], type: 'job' },
    { dirs: ['cron'], type: 'command' },
  ];

  for (const { dirs, type } of otherDirs) {
    const found = await scanGoDirectoryModules(localPath, type, dirs);
    modules.push(...found);
  }

  return modules;
}
