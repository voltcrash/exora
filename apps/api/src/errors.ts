export type ErrorClassification = "internal" | "upstream" | "validation";

export class ClassifiedError extends Error {
  readonly classification: ErrorClassification;

  constructor(classification: ErrorClassification, message: string, options?: ErrorOptions) {
    super(message, options);
    this.classification = classification;
  }
}

export class UpstreamError extends ClassifiedError {
  constructor(message: string, options?: ErrorOptions) {
    super("upstream", message, options);
  }
}

export class ValidationError extends ClassifiedError {
  constructor(message: string, options?: ErrorOptions) {
    super("validation", message, options);
    this.name = "ValidationError";
  }
}

export const classifyError = (error: unknown): ErrorClassification =>
  error instanceof ClassifiedError ? error.classification : "internal";

export const classifyStatus = (status: number): ErrorClassification | undefined => {
  if (status === 400 || status === 429) return "validation";
  if (status >= 500) return "internal";
  return undefined;
};
