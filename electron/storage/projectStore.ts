import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { existsSync } from 'fs';

const STORE_DIR = path.join(os.homedir(), '.codehandover');
const STORE_FILE = path.join(STORE_DIR, 'projects.json');

interface StoredProject {
  name: string;
  path: string;
  lastAnalyzed: string;
  language?: string;
  framework?: string;
  documentPath?: string;
  fileCount?: number;
  moduleCount?: number;
}

async function ensureStoreDir(): Promise<void> {
  if (!existsSync(STORE_DIR)) {
    await fs.mkdir(STORE_DIR, { recursive: true });
  }
}

async function readProjects(): Promise<StoredProject[]> {
  try {
    if (!existsSync(STORE_FILE)) {
      return [];
    }
    const content = (await fs.readFile(STORE_FILE, 'utf-8')).replace(/^\uFEFF/, '');
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to read projects store:', error);
    return [];
  }
}

async function writeProjects(projects: StoredProject[]): Promise<void> {
  await ensureStoreDir();
  await fs.writeFile(STORE_FILE, JSON.stringify(projects, null, 2), 'utf-8');
}

/**
 * Save a project to the recent projects store
 * @param project - Project information to save
 */
export async function saveProject(project: StoredProject): Promise<void> {
  const projects = await readProjects();

  // Remove existing entry with the same path
  const filtered = projects.filter(p => p.path !== project.path);

  // Add new entry at the beginning
  filtered.unshift({
    name: project.name,
    path: project.path,
    lastAnalyzed: project.lastAnalyzed,
    language: project.language,
    framework: project.framework,
    documentPath: project.documentPath,
    fileCount: project.fileCount,
    moduleCount: project.moduleCount,
  });

  // Keep only the most recent 20 projects
  const trimmed = filtered.slice(0, 20);

  await writeProjects(trimmed);
}

/**
 * Get the list of recent projects
 * @returns Array of recent projects, sorted by last analyzed date (most recent first)
 */
export async function getRecentProjects(): Promise<StoredProject[]> {
  try {
    const projects = await readProjects();

    // Sort by lastAnalyzed date, most recent first
    return projects.sort((a, b) =>
      new Date(b.lastAnalyzed).getTime() - new Date(a.lastAnalyzed).getTime()
    );
  } catch (error) {
    console.error('Failed to get recent projects:', error);
    return [];
  }
}

/**
 * Remove a project from the recent projects store
 * @param projectPath - Path of the project to remove
 */
export async function removeProject(projectPath: string): Promise<void> {
  const projects = await readProjects();
  const filtered = projects.filter(p => p.path !== projectPath);
  await writeProjects(filtered);
}

/**
 * Clear all recent projects
 */
export async function clearRecentProjects(): Promise<void> {
  await writeProjects([]);
}
