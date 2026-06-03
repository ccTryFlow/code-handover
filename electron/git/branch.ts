import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function getCurrentBranch(localPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: localPath
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get current branch: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getAllBranches(localPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--all'], {
      cwd: localPath
    });
    const branches = stdout
      .split('\n')
      .map(line => line.trim().replace(/^\*?\s+/, ''))
      .filter(line => line.length > 0);
    return branches;
  } catch (error) {
    throw new Error(`Failed to get all branches: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function checkoutBranch(localPath: string, branch: string): Promise<void> {
  try {
    await execFileAsync('git', ['checkout', branch], {
      cwd: localPath
    });
  } catch (error) {
    throw new Error(`Failed to checkout branch: ${error instanceof Error ? error.message : String(error)}`);
  }
}
