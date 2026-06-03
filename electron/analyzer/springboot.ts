import * as fs from 'fs/promises';
import * as path from 'path';
import { FrameworkSummary, ModuleSummary, RouteInfo } from '../types';

const SPRINGBOOT_INDICATORS = [
  { file: 'pom.xml', weight: 15, evidence: 'Found Maven pom.xml', check: (content: string) => content.includes('spring-boot') },
  { file: 'build.gradle', weight: 15, evidence: 'Found Gradle build.gradle', check: (content: string) => content.includes('spring-boot') },
  { file: 'build.gradle.kts', weight: 15, evidence: 'Found Gradle build.gradle.kts', check: (content: string) => content.includes('spring-boot') },
  { dir: 'src/main/java', weight: 10, evidence: 'Found src/main/java directory' },
  { file: 'src/main/resources/application.yml', weight: 10, evidence: 'Found Spring application.yml' },
  { file: 'src/main/resources/application.properties', weight: 10, evidence: 'Found Spring application.properties' },
  { file: 'src/main/resources/application-*.yml', weight: 5, evidence: 'Found Spring profile config', isPattern: true },
  { file: 'src/main/resources/application-*.properties', weight: 5, evidence: 'Found Spring profile config', isPattern: true },
];

const ANNOTATION_PATTERNS = {
  controller: /@Controller|@RestController/g,
  service: /@Service/g,
  repository: /@Repository|@Mapper/g,
  entity: /@Entity|@Table/g,
  scheduled: /@Scheduled/g,
  requestMapping: /@(RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(\s*['"`]([^'"`]+)['"`]/g,
};

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

async function findJavaFiles(dirPath: string): Promise<string[]> {
  const javaFiles: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        javaFiles.push(...await findJavaFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.java')) {
        javaFiles.push(fullPath);
      }
    }
  } catch (_e) {
    // Directory can't be read
  }
  return javaFiles;
}

async function scanForAnnotation(javaFiles: string[], annotation: keyof typeof ANNOTATION_PATTERNS): Promise<string[]> {
  const filesWithAnnotation: string[] = [];
  const pattern = ANNOTATION_PATTERNS[annotation];

  for (const filePath of javaFiles) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        filesWithAnnotation.push(filePath);
      }
    } catch (_e) {
      // File can't be read
    }
  }

  return filesWithAnnotation;
}

export async function detectSpringBoot(localPath: string): Promise<FrameworkSummary | null> {
  const evidence: string[] = [];
  let confidence = 0;

  const javaPath = path.join(localPath, 'src/main/java');
  const hasJavaDir = await pathExists(javaPath);

  // Check build files
  const pomXmlPath = path.join(localPath, 'pom.xml');
  const buildGradlePath = path.join(localPath, 'build.gradle');
  const buildGradleKtsPath = path.join(localPath, 'build.gradle.kts');

  const pomContent = await readFileContent(pomXmlPath);
  const gradleContent = await readFileContent(buildGradlePath);
  const gradleKtsContent = await readFileContent(buildGradleKtsPath);

  for (const indicator of SPRINGBOOT_INDICATORS) {
    if (indicator.isPattern && indicator.file) {
      // Handle pattern matching (like application-*.yml)
      const baseDir = path.dirname(path.join(localPath, indicator.file));
      const pattern = path.basename(indicator.file).replace('*', '.*');
      if (await pathExists(baseDir)) {
        try {
          const entries = await fs.readdir(baseDir);
          const matches = entries.filter(e => e.match(new RegExp(pattern)));
          if (matches.length > 0) {
            confidence += indicator.weight;
            evidence.push(indicator.evidence);
          }
        } catch (_e) {
          // Directory can't be read
        }
      }
      continue;
    }

    const targetPath = indicator.file || indicator.dir;
    if (!targetPath) {
      continue;
    }

    const fullPath = path.join(localPath, targetPath);
    if (await pathExists(fullPath)) {
      if (indicator.check) {
        let content = '';
        if (indicator.file === 'pom.xml') content = pomContent;
        else if (indicator.file === 'build.gradle') content = gradleContent;
        else if (indicator.file === 'build.gradle.kts') content = gradleKtsContent;

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

  // Bonus for @SpringBootApplication
  if (hasJavaDir) {
    const javaFiles = await findJavaFiles(javaPath);
    for (const filePath of javaFiles) {
      const content = await readFileContent(filePath);
      if (content.includes('@SpringBootApplication')) {
        confidence += 20;
        evidence.push('Found @SpringBootApplication annotation');
        break;
      }
    }
  }

  if (confidence < 30) {
    return null;
  }

  return {
    name: 'Spring Boot',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

async function extractRequestMappings(javaFiles: string[]): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];

  for (const filePath of javaFiles) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      let currentClass = '';
      let classMapping = '';

      for (const line of lines) {
        const classMatch = line.match(/public\s+class\s+(\w+)/);
        if (classMatch) {
          currentClass = classMatch[1];
        }

        const classRequestMappingMatch = line.match(/@RequestMapping\s*\(\s*['"`]([^'"`]+)['"`]/);
        if (classRequestMappingMatch) {
          classMapping = classRequestMappingMatch[1];
        }

        const patterns = [
          /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*\(\s*['"`]([^'"`]+)['"`]/,
        ];

        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            let method = 'GET';
            if (match[1] === 'PostMapping') method = 'POST';
            else if (match[1] === 'PutMapping') method = 'PUT';
            else if (match[1] === 'DeleteMapping') method = 'DELETE';
            else if (match[1] === 'PatchMapping') method = 'PATCH';
            else if (match[1] === 'RequestMapping') method = 'ANY';

            const fullPath = classMapping && !match[2].startsWith('/')
              ? classMapping + match[2]
              : match[2];

            routes.push({
              method,
              path: fullPath,
              handler: currentClass || 'Unknown',
              file: filePath,
            });
          }
        }
      }
    } catch (_e) {
      // File can't be read
    }
  }

  return routes;
}

export async function scanSpringBootModules(localPath: string): Promise<ModuleSummary[]> {
  const modules: ModuleSummary[] = [];

  const javaPath = path.join(localPath, 'src/main/java');
  if (!(await pathExists(javaPath))) {
    return modules;
  }

  const javaFiles = await findJavaFiles(javaPath);
  const resourcePath = path.join(localPath, 'src/main/resources');

  // Scan for controllers
  const controllerFiles = await scanForAnnotation(javaFiles, 'controller');
  if (controllerFiles.length > 0) {
    const routes = await extractRequestMappings(controllerFiles);
    modules.push({
      name: 'Controllers',
      type: 'controller',
      files: controllerFiles,
      summary: `${controllerFiles.length} controller classes`,
      routes: routes.map(r => r.path),
    });
  }

  // Scan for services
  const serviceFiles = await scanForAnnotation(javaFiles, 'service');
  if (serviceFiles.length > 0) {
    modules.push({
      name: 'Services',
      type: 'service',
      files: serviceFiles,
      summary: `${serviceFiles.length} service classes`,
    });
  }

  // Scan for repositories
  const repositoryFiles = await scanForAnnotation(javaFiles, 'repository');
  if (repositoryFiles.length > 0) {
    modules.push({
      name: 'Repositories',
      type: 'model',
      files: repositoryFiles,
      summary: `${repositoryFiles.length} repository/mapper classes`,
    });
  }

  // Scan for entities
  const entityFiles = await scanForAnnotation(javaFiles, 'entity');
  if (entityFiles.length > 0) {
    modules.push({
      name: 'Entities',
      type: 'model',
      files: entityFiles,
      summary: `${entityFiles.length} entity classes`,
    });
  }

  // Scan for scheduled tasks
  const scheduledFiles = await scanForAnnotation(javaFiles, 'scheduled');
  if (scheduledFiles.length > 0) {
    modules.push({
      name: 'Scheduled Tasks',
      type: 'job',
      files: scheduledFiles,
      summary: `${scheduledFiles.length} scheduled task classes`,
    });
  }

  // Scan config files
  if (await pathExists(resourcePath)) {
    const configFiles: string[] = [];
    try {
      const entries = await fs.readdir(resourcePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.yml') || entry.name.endsWith('.properties'))) {
          configFiles.push(path.join('src/main/resources', entry.name));
        }
      }
    } catch (_e) {
      // Directory can't be read
    }

    if (configFiles.length > 0) {
      modules.push({
        name: 'Configuration',
        type: 'config',
        files: configFiles,
        summary: `${configFiles.length} configuration files`,
      });
    }
  }

  return modules;
}
