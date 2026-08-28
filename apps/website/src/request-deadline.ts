const firstToAbort = (signals: readonly AbortSignal[]): AbortSignal => {
  if (typeof AbortSignal.any === "function") return AbortSignal.any([...signals]);

  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }

    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
      signal: controller.signal,
    });
  }

  return controller.signal;
};

export const requestDeadline = (timeoutMs: number, signal?: AbortSignal): AbortSignal => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? firstToAbort([signal, timeout]) : timeout;
};
