import path from 'path';

export const LANGUAGE_MAP: Record<string, string> = {
  '.abap': 'ABAP',
  '.adb': 'Ada',
  '.ads': 'Ada',
  '.api': 'Go-Zero API',
  '.apex': 'Apex',
  '.astro': 'Astro',
  '.aspx': 'ASP.NET',
  '.awk': 'Awk',
  '.blade.php': 'Blade',
  '.php': 'PHP',
  '.php4': 'PHP',
  '.php5': 'PHP',
  '.phtml': 'PHP',
  '.twig': 'Twig',
  '.go': 'Go',
  '.java': 'Java',
  '.jsp': 'JSP',
  '.js': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.jsx': 'JavaScript',
  '.ts': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.py': 'Python',
  '.pyw': 'Python',
  '.ipynb': 'Jupyter Notebook',
  '.xml': 'XML',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.ini': 'INI',
  '.conf': 'Config',
  '.cfg': 'Config',
  '.properties': 'Properties',
  '.sql': 'SQL',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.less': 'Less',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.cshtml': 'Razor',
  '.razor': 'Razor',
  '.json': 'JSON',
  '.jsonc': 'JSON',
  '.md': 'Markdown',
  '.mdx': 'MDX',
  '.txt': 'Text',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.bat': 'Batch',
  '.cmd': 'Batch',
  '.ps1': 'PowerShell',
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',
  '.proto': 'Protocol Buffers',
  '.thrift': 'Thrift',
  '.rb': 'Ruby',
  '.erb': 'ERB',
  '.rake': 'Ruby',
  '.rs': 'Rust',
  '.c': 'C',
  '.h': 'C',
  '.cc': 'C++',
  '.cpp': 'C++',
  '.cxx': 'C++',
  '.hpp': 'C++',
  '.hh': 'C++',
  '.hxx': 'C++',
  '.m': 'MATLAB',
  '.mm': 'Objective-C++',
  '.cs': 'C#',
  '.fs': 'F#',
  '.fsi': 'F#',
  '.fsx': 'F#',
  '.vb': 'Visual Basic .NET',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.dart': 'Dart',
  '.lua': 'Lua',
  '.r': 'R',
  '.scala': 'Scala',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.erl': 'Erlang',
  '.hrl': 'Erlang',
  '.hs': 'Haskell',
  '.clj': 'Clojure',
  '.cljs': 'Clojure',
  '.groovy': 'Groovy',
  '.gradle': 'Gradle',
  '.pl': 'Perl',
  '.pm': 'Perl',
  '.t': 'Perl',
  '.fsproj': 'F# Project',
  '.vbproj': 'VB.NET Project',
  '.csproj': 'C# Project',
  '.sln': 'Visual Studio Solution',
  '.tf': 'HCL',
  '.tfvars': 'HCL',
  '.hcl': 'HCL',
  '.sol': 'Solidity',
  '.zig': 'Zig',
  '.nim': 'Nim',
  '.cr': 'Crystal',
  '.elm': 'Elm',
  '.jl': 'Julia',
  '.ino': 'Arduino',
  '.v': 'Verilog',
  '.sv': 'SystemVerilog',
  '.vhd': 'VHDL',
  '.vhdl': 'VHDL',
};

export const LANGUAGE_FILENAME_MAP: Record<string, string> = {
  '.babelrc': 'JSON',
  '.dockerignore': 'Dockerfile',
  '.editorconfig': 'EditorConfig',
  '.env': 'Env',
  '.eslintignore': 'Text',
  '.eslintrc': 'JSON',
  '.gitattributes': 'Git Config',
  '.gitignore': 'Git Config',
  '.npmrc': 'Config',
  '.prettierrc': 'JSON',
  'build': 'Bazel',
  'cmakelists.txt': 'CMake',
  'dockerfile': 'Dockerfile',
  'fastfile': 'Ruby',
  'gemfile': 'Ruby',
  'guardfile': 'Ruby',
  'jenkinsfile': 'Groovy',
  'justfile': 'Just',
  'makefile': 'Makefile',
  'mix.exs': 'Elixir',
  'package.swift': 'Swift',
  'podfile': 'Ruby',
  'procfile': 'Procfile',
  'rakefile': 'Ruby',
  'vagrantfile': 'Ruby',
  'workspace': 'Bazel',
};

export const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'vendor',
  'storage',
  'runtime',
  'dist',
  'build',
  'target',
  '.idea',
  '.vscode',
  'public',
  'assets',
  '__pycache__',
  '.gradle',
  '.mvn',
  'cache',
  'tmp',
  'temp',
  '.next',
  '.nuxt',
  'coverage',
  '.vite',
  'vendor/bundle',
]);

export const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.jar',
  '.war',
  '.class',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.wav',
  '.otf',
  '.ear',
  '.pyc',
  '.pyo',
  '.node',
]);

export const MAX_ANALYZED_FILE_SIZE = 100 * 1024;

export function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

export function getLanguageForPath(filePath: string): string | undefined {
  const normalizedPath = normalizeRelativePath(filePath);
  const baseName = path.posix.basename(normalizedPath).toLowerCase();
  const extension = path.posix.extname(baseName).toLowerCase();

  if (baseName.endsWith('.blade.php')) {
    return LANGUAGE_MAP['.blade.php'];
  }

  if (
    extension === '.m'
    && /(?:^|\/)(ios|macos|objc|objective-c|objectivec)(?:\/|$)/i.test(normalizedPath)
  ) {
    return 'Objective-C';
  }

  return LANGUAGE_FILENAME_MAP[baseName] || LANGUAGE_MAP[extension];
}

export function shouldIgnoreDirectory(directoryName: string): boolean {
  return IGNORED_DIRECTORY_NAMES.has(directoryName);
}

export function isSensitiveFilePath(filePath: string): boolean {
  const normalizedPath = normalizeRelativePath(filePath);
  const baseName = path.posix.basename(normalizedPath);

  if (
    /^\.env(?:\..+)?$/i.test(baseName)
    && !/\.(?:example|sample|template|dist)$/i.test(baseName)
  ) {
    return true;
  }

  return /(?:^|\/)(?:id_rsa|id_ed25519|credentials?|secrets?)(?:\.[^/]+)?$/i.test(normalizedPath)
    || /\.(?:pem|key|p12|pfx)$/i.test(baseName);
}
