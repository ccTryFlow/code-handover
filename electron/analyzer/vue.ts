import * as fs from 'fs/promises';
import * as path from 'path';
import { FrameworkSummary, ModuleSummary, RouteInfo } from '../types';

const VUE_INDICATORS = [
  { file: 'package.json', weight: 15, evidence: 'Found package.json', check: (content: string) => content.includes('"vue"') },
  { file: 'vite.config.js', weight: 15, evidence: 'Found Vite config' },
  { file: 'vite.config.ts', weight: 15, evidence: 'Found Vite TypeScript config' },
  { file: 'vue.config.js', weight: 10, evidence: 'Found Vue CLI config' },
  { file: 'src/main.js', weight: 10, evidence: 'Found src/main.js' },
  { file: 'src/main.ts', weight: 10, evidence: 'Found src/main.ts' },
  { dir: 'src/components', weight: 10, evidence: 'Found src/components directory' },
  { dir: 'src/views', weight: 10, evidence: 'Found src/views directory' },
  { dir: 'src/pages', weight: 10, evidence: 'Found src/pages directory' },
];

const MODULE_SCAN_DIRS = [
  'src/views',
  'src/pages',
  'src/components',
  'src/router',
  'src/store',
  'src/api',
  'src/utils',
  'src/composables',
  'src/assets',
  'src/styles',
  'src/layouts',
  'src/middleware',
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

export async function detectVue(localPath: string): Promise<FrameworkSummary | null> {
  const evidence: string[] = [];
  let confidence = 0;

  const packageJsonPath = path.join(localPath, 'package.json');
  const packageJsonContent = await readFileContent(packageJsonPath);

  for (const indicator of VUE_INDICATORS) {
    if (indicator.file) {
      const fullPath = path.join(localPath, indicator.file);
      if (await pathExists(fullPath)) {
        if (indicator.check) {
          if (indicator.file === 'package.json') {
            if (indicator.check(packageJsonContent)) {
              confidence += indicator.weight;
              evidence.push(indicator.evidence);
            }
          } else {
            confidence += indicator.weight;
            evidence.push(indicator.evidence);
          }
        } else {
          confidence += indicator.weight;
          evidence.push(indicator.evidence);
        }
      }
    } else if (indicator.dir) {
      const fullPath = path.join(localPath, indicator.dir);
      if (await pathExists(fullPath)) {
        confidence += indicator.weight;
        evidence.push(indicator.evidence);
      }
    }
  }

  if (confidence < 25) {
    return null;
  }

  return {
    name: 'Vue',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

async function parseVueRouterFile(filePath: string): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Try to match route definitions in various formats
    const patterns = [
      // Vue Router 4 - createRouter format
      /\{\s*path:\s*['"`]([^'"`]+)['"`]\s*,\s*(?:name:\s*['"`]([^'"`]+)['"`]\s*,)?(?:component:\s*[\w.]+\s*)?\}/g,
      // Vue Router 3 - RouterOptions format
      /path:\s*['"`]([^'"`]+)['"`]/g,
      // Named routes
      /name:\s*['"`]([^'"`]+)['"`]/g,
    ];

    const lines = content.split('\n');
    for (const line of lines) {
      const routeMatch = line.match(/path:\s*['"`]([^'"`]+)['"`]/);
      const nameMatch = line.match(/name:\s*['"`]([^'"`]+)['"`]/);
      const componentMatch = line.match(/component:\s*()?(\w+)/);

      if (routeMatch) {
        routes.push({
          method: 'GET',
          path: routeMatch[1],
          handler: nameMatch ? nameMatch[1] : componentMatch ? componentMatch[2] : undefined,
          file: filePath,
        });
      }
    }
  } catch (_e) {
    // File might not exist or can't be read
  }
  return routes;
}

async function scanVueDirectory(
  localPath: string,
  dirPath: string,
  moduleType: string
): Promise<{ files: string[]; count: number }> {
  const fullPath = path.join(localPath, dirPath);
  if (!(await pathExists(fullPath))) {
    return { files: [], count: 0 };
  }

  const files: string[] = [];
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.vue') || entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
        files.push(path.join(dirPath, entry.name));
      } else if (entry.isDirectory()) {
        const subPath = path.join(fullPath, entry.name);
        try {
          const subEntries = await fs.readdir(subPath, { withFileTypes: true });
          for (const subEntry of subEntries) {
            if (subEntry.isFile() && (subEntry.name.endsWith('.vue') || subEntry.name.endsWith('.js') || subEntry.name.endsWith('.ts'))) {
              files.push(path.join(dirPath, entry.name, subEntry.name));
            }
          }
        } catch (_e) {
          // Skip subdirectories that can't be read
        }
      }
    }
  } catch (_e) {
    // Directory can't be read
  }

  return { files, count: files.length };
}

export async function scanVueModules(localPath: string): Promise<ModuleSummary[]> {
  const modules: ModuleSummary[] = [];

  // Scan router
  const routerPaths = [
    'src/router/index.js',
    'src/router/index.ts',
    'src/router.js',
    'src/router.ts',
  ];

  const allRoutes: RouteInfo[] = [];
  const existingRouterPaths: string[] = [];
  for (const routerPath of routerPaths) {
    const fullPath = path.join(localPath, routerPath);
    if (await pathExists(fullPath)) {
      existingRouterPaths.push(routerPath);
      allRoutes.push(...await parseVueRouterFile(fullPath));
    }
  }

  if (allRoutes.length > 0) {
    modules.push({
      name: 'Router',
      type: 'route',
      files: existingRouterPaths,
      summary: `Found ${allRoutes.length} route definitions`,
      routes: allRoutes.map(r => r.path),
    });
  }

  // Scan views/pages
  const viewsDirs = ['src/views', 'src/pages'];
  for (const viewsDir of viewsDirs) {
    const { files, count } = await scanVueDirectory(localPath, viewsDir, 'view');
    if (count > 0) {
      modules.push({
        name: path.basename(viewsDir),
        type: 'view',
        files,
        summary: `${count} view components`,
      });
    }
  }

  // Scan components
  const { files: components, count: componentCount } = await scanVueDirectory(localPath, 'src/components', 'component');
  if (componentCount > 0) {
    modules.push({
      name: 'Components',
      type: 'component',
      files: components,
      summary: `${componentCount} reusable components`,
    });
  }

  // Scan store (Pinia/Vuex)
  const storeDirs = ['src/store', 'src/stores', 'src/store/modules'];
  for (const storeDir of storeDirs) {
    const { files, count } = await scanVueDirectory(localPath, storeDir, 'store');
    if (count > 0) {
      modules.push({
        name: 'Store',
        type: 'store',
        files,
        summary: `${count} store modules`,
      });
    }
  }

  // Scan API
  const { files: apiFiles, count: apiCount } = await scanVueDirectory(localPath, 'src/api', 'util');
  if (apiCount > 0) {
    modules.push({
      name: 'API',
      type: 'util',
      files: apiFiles,
      summary: `${apiCount} API service files`,
    });
  }

  // Scan utils
  const { files: utilFiles, count: utilsCount } = await scanVueDirectory(localPath, 'src/utils', 'util');
  if (utilsCount > 0) {
    modules.push({
      name: 'Utils',
      type: 'util',
      files: utilFiles,
      summary: `${utilsCount} utility files`,
    });
  }

  // Scan composables
  const { files: composableFiles, count: composablesCount } = await scanVueDirectory(localPath, 'src/composables', 'util');
  if (composablesCount > 0) {
    modules.push({
      name: 'Composables',
      type: 'util',
      files: composableFiles,
      summary: `${composablesCount} composable functions`,
    });
  }

  // Scan layouts
  const { files: layoutFiles, count: layoutsCount } = await scanVueDirectory(localPath, 'src/layouts', 'component');
  if (layoutsCount > 0) {
    modules.push({
      name: 'Layouts',
      type: 'component',
      files: layoutFiles,
      summary: `${layoutsCount} layout components`,
    });
  }

  return modules;
}
