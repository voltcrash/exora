export interface EmittedJavaScript {
  bytes: number;
  path: string;
}

export interface JavaScriptBudget {
  initialBytes: number;
  largestFileBytes: number;
}

export const DEFAULT_JAVASCRIPT_BUDGET: JavaScriptBudget = {
  initialBytes: 1_500_000,
  largestFileBytes: 800_000,
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
