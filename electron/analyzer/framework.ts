import { FRAMEWORK_ADAPTERS } from './frameworkRegistry';

export interface FrameworkSummary {
  name: string;
  confidence: number;
  evidence: string[];
}

export async function detectFrameworks(localPath: string): Promise<FrameworkSummary[]> {
  const frameworks: FrameworkSummary[] = [];

  for (const adapter of FRAMEWORK_ADAPTERS) {
    try {
      const result = await adapter.detect(localPath);
      if (result) {
        frameworks.push(result);
      }
    } catch (error) {
      console.error(`Error detecting ${adapter.name}:`, error);
    }
  }

  return frameworks.sort((a, b) => b.confidence - a.confidence);
}
