import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { FrameworkSummary, ModuleSummary } from '../types';

const LARAVEL_INDICATORS = [
  { file: 'artisan', weight: 20, evidence: '存在 artisan 文件' },
  { file: 'composer.json', weight: 15, evidence: '存在 composer.json' },
  { dir: 'app/Http/Controllers', weight: 15, evidence: '存在 app/Http/Controllers 目录' },
  { file: 'routes/api.php', weight: 10, evidence: '存在 routes/api.php' },
  { file: 'routes/web.php', weight: 10, evidence: '存在 routes/web.php' },
  { file: 'config/app.php', weight: 10, evidence: '存在 config/app.php' },
  { file: 'phpunit.xml', weight: 5, evidence: '存在 phpunit.xml' },
  { dir: 'database/migrations', weight: 10, evidence: '存在 database/migrations 目录' },
];

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch (_e) { return false; }
}

export async function detectLaravel(localPath: string): Promise<FrameworkSummary | null> {
  const evidence: string[] = [];
  let confidence = 0;

  for (const indicator of LARAVEL_INDICATORS) {
    const fullPath = path.join(localPath, (indicator as any).file || (indicator as any).dir);
    if (await pathExists(fullPath)) {
      confidence += indicator.weight;
      evidence.push(indicator.evidence);
    }
  }

  if (confidence < 30) return null;

  return { name: 'Laravel', confidence: Math.min(confidence, 100), evidence };
}

async function collectFiles(dirPath: string, localPath: string, ext: string = '.php'): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...await collectFiles(full, localPath, ext));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        files.push(path.relative(localPath, full).replace(/\\/g, '/'));
      }
    }
  } catch (_e) { /* skip */ }
  return files;
}

async function parseRouteFile(filePath: string): Promise<string[]> {
  const routes: string[] = [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const regex = /Route::(get|post|put|patch|delete|options|any)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      routes.push(`${match[1].toUpperCase()} ${match[2]}`);
    }
  } catch (_e) { /* skip */ }
  return routes;
}

async function extractTableModel(filePath: string): Promise<string | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const match = content.match(/protected\s+\$table\s*=\s*['"`]([^'"`]+)['"`]/);
    return match ? match[1] : undefined;
  } catch (_e) { return undefined; }
}

export async function scanLaravelModules(localPath: string): Promise<ModuleSummary[]> {
  const modules: ModuleSummary[] = [];

  // Routes
  const allRoutes: string[] = [];
  const routeFiles: string[] = [];
  for (const routeFile of ['routes/api.php', 'routes/web.php']) {
    const fullPath = path.join(localPath, routeFile);
    if (existsSync(fullPath)) {
      routeFiles.push(routeFile);
      allRoutes.push(...await parseRouteFile(fullPath));
    }
  }
  if (routeFiles.length > 0) {
    modules.push({
      name: 'Routes',
      type: 'route',
      framework: 'Laravel',
      files: routeFiles,
      routes: allRoutes,
      summary: `发现 ${allRoutes.length} 个路由定义`,
    });
  }

  // Controllers
  const controllersDir = path.join(localPath, 'app/Http/Controllers');
  if (existsSync(controllersDir)) {
    const files = await collectFiles(controllersDir, localPath);
    if (files.length > 0) {
      modules.push({ name: 'Controllers', type: 'controller', framework: 'Laravel', files, summary: `${files.length} 个控制器文件` });
    }
  }

  // Models
  const modelsDir = path.join(localPath, 'app/Models');
  if (existsSync(modelsDir)) {
    const files = await collectFiles(modelsDir, localPath);
    const tables: string[] = [];
    for (const file of files) {
      const table = await extractTableModel(path.join(localPath, file));
      if (table) tables.push(table);
    }
    if (files.length > 0) {
      modules.push({ name: 'Models', type: 'model', framework: 'Laravel', files, tables, summary: `${files.length} 个模型文件，${tables.length} 个数据表` });
    }
  }

  // Services
  for (const serviceDir of ['app/Http/Services', 'app/Services']) {
    const fullPath = path.join(localPath, serviceDir);
    if (existsSync(fullPath)) {
      const files = await collectFiles(fullPath, localPath);
      if (files.length > 0) {
        modules.push({ name: `Services (${serviceDir})`, type: 'service', framework: 'Laravel', files, summary: `${files.length} 个服务文件` });
      }
    }
  }

  // Commands
  const commandsDir = path.join(localPath, 'app/Console/Commands');
  if (existsSync(commandsDir)) {
    const files = await collectFiles(commandsDir, localPath);
    const commands: string[] = [];
    for (const file of files) {
      try {
        const content = await fs.readFile(path.join(localPath, file), 'utf-8');
        const match = content.match(/protected\s+\$signature\s*=\s*['"`]([^'"`:\s]+)['"`]/);
        if (match) commands.push(match[1]);
      } catch (_e) { /* skip */ }
    }
    if (files.length > 0) {
      modules.push({ name: 'Commands', type: 'command', framework: 'Laravel', files, commands, summary: `${files.length} 个 Artisan 命令` });
    }
  }

  // Jobs
  const jobsDir = path.join(localPath, 'app/Jobs');
  if (existsSync(jobsDir)) {
    const files = await collectFiles(jobsDir, localPath);
    if (files.length > 0) {
      modules.push({ name: 'Jobs', type: 'job', framework: 'Laravel', files, summary: `${files.length} 个队列任务` });
    }
  }

  // Middleware
  const middlewareDir = path.join(localPath, 'app/Http/Middleware');
  if (existsSync(middlewareDir)) {
    const files = await collectFiles(middlewareDir, localPath);
    if (files.length > 0) {
      modules.push({ name: 'Middleware', type: 'middleware', framework: 'Laravel', files, summary: `${files.length} 个中间件` });
    }
  }

  // Config
  const configDir = path.join(localPath, 'config');
  if (existsSync(configDir)) {
    const files = await collectFiles(configDir, localPath);
    if (files.length > 0) {
      modules.push({ name: 'Config', type: 'config', framework: 'Laravel', files, summary: `${files.length} 个配置文件` });
    }
  }

  // Migrations
  const migrationsDir = path.join(localPath, 'database/migrations');
  if (existsSync(migrationsDir)) {
    const files = await collectFiles(migrationsDir, localPath);
    if (files.length > 0) {
      modules.push({ name: 'Migrations', type: 'other', framework: 'Laravel', files, summary: `${files.length} 个数据库迁移文件` });
    }
  }

  return modules;
}
