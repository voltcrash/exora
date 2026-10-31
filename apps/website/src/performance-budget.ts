import type { Manifest } from "vite-plus";

export interface EmittedJavaScript {
  bytes: number;
  path: string;
}

export interface JavaScriptBudget {
  initialBytes: number;
  largestFileBytes: number;
}

export const DEFAULT_JAVASCRIPT_BUDGET: JavaScriptBudget = {
  initialBytes: 450_000,
  largestFileBytes: 400_000,
};

export const initialJavaScriptPaths = (
  manifest: Manifest,
  entries: readonly string[],
): ReadonlySet<string> => {
  const paths = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visited.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing initial JavaScript chunk in build manifest: ${key}`);
    visited.add(key);
    if (chunk.file.endsWith(".js")) paths.add(chunk.file);
    chunk.imports?.forEach(visit);
  };
  entries.forEach(visit);
  return paths;
};

export const budgetViolations = (
  emitted: readonly EmittedJavaScript[],
  initialPaths: ReadonlySet<string>,
  budget: JavaScriptBudget = DEFAULT_JAVASCRIPT_BUDGET,
): readonly string[] => {
  const violations: string[] = [];
  for (const artifact of emitted) {
    if (artifact.bytes > budget.largestFileBytes) {
      violations.push(
        `${artifact.path} is ${artifact.bytes.toLocaleString("en-US")} bytes; the emitted JavaScript file budget is ${budget.largestFileBytes.toLocaleString("en-US")} bytes.`,
      );
    }
  }

  const initialBytes = emitted
    .filter((artifact) => initialPaths.has(artifact.path))
    .reduce((total, artifact) => total + artifact.bytes, 0);
  if (initialBytes > budget.initialBytes) {
    violations.push(
      `Initial JavaScript is ${initialBytes.toLocaleString("en-US")} bytes; the emitted initial-path budget is ${budget.initialBytes.toLocaleString("en-US")} bytes.`,
    );
  }
  return violations;
};
