import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function getLinesLastChangedByAuthor(
  localPath: string,
  filePath: string,
  author: string
): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['blame', '--line-porcelain', '--', filePath], {
      cwd: localPath,
      maxBuffer: 10 * 1024 * 1024,
    });

    const ownedLines: string[] = [];
    let currentAuthorName = '';
    let currentAuthorEmail = '';

    for (const line of stdout.split(/\r?\n/)) {
      if (line.startsWith('author ')) {
        currentAuthorName = line.slice('author '.length).trim();
        continue;
      }
      if (line.startsWith('author-mail ')) {
        currentAuthorEmail = line.slice('author-mail '.length).trim().replace(/^<|>$/g, '');
        continue;
      }
      if (line.startsWith('\t')) {
        ownedLines.push(isSameAuthor(currentAuthorName, currentAuthorEmail, author) ? line.slice(1) : '');
      }
    }

    return ownedLines;
  } catch (_error) {
    // 个人文档宁可少列接口，也不能在 blame 失败时回退成整份多人共享路由文件。
    return [];
  }
}

function isSameAuthor(authorName: string, authorEmail: string, targetAuthor: string): boolean {
  const normalizedTarget = targetAuthor.trim().toLowerCase();
  return authorName.trim().toLowerCase() === normalizedTarget
    || authorEmail.trim().toLowerCase() === normalizedTarget;
}
