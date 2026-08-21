import { expect, test } from "vite-plus/test";
import { requestDeadline } from "./request-deadline.ts";

/**
 * Runs a body twice: once on the engine's own `AbortSignal.any`, once with it removed so the
 * hand-assembled path is exercised. That path only runs on engines this suite never runs on, so
 * without this it would ship untested.
 */
const onBothPaths = async (body: () => Promise<void> | void): Promise<void> => {
  await body();

  // Captured as a descriptor rather than as a bare method reference, which would be a detached
  // `AbortSignal.any` with no receiver.
  const native = Object.getOwnPropertyDescriptor(AbortSignal, "any");
  Reflect.deleteProperty(AbortSignal, "any");
  try {
    await body();
  } finally {
    if (native) Object.defineProperty(AbortSignal, "any", native);
  }
};

/**
 * Deadlines here are real milliseconds rather than mocked ones: `AbortSignal.timeout` schedules on
 * a host timer that the fake-timer clock does not stand in for, so a mocked test would sit on a
 * signal that never fires and prove nothing.
 */
const SHORT_DEADLINE_MS = 40;

const whenAborted = async (signal: AbortSignal): Promise<unknown> =>
  signal.aborted
    ? signal.reason
    : new Promise((resolve) => {
        signal.addEventListener("abort", () => resolve(signal.reason), { once: true });
      });

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

test("a request with no caller signal is bounded by its deadline alone", async () => {
  const signal = requestDeadline(SHORT_DEADLINE_MS);
  expect(signal.aborted).toBe(false);

  expect((await whenAborted(signal)) as DOMException).toMatchObject({ name: "TimeoutError" });
});

test("a caller's cancellation still ends the request", async () => {
  await onBothPaths(() => {
    const controller = new AbortController();
    const signal = requestDeadline(SHORT_DEADLINE_MS, controller.signal);

    expect(signal.aborted).toBe(false);
    controller.abort();

    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe("AbortError");
  });
});

test("supplying a cancellation does not surrender the deadline", async () => {
  // The bug this covers: choosing the caller's signal over the timeout left a stalled connection
  // with nothing to end it, so the catalog stayed loading until the tab closed. If that returns,
  // this test hangs on a signal that never aborts rather than failing an assertion.
  await onBothPaths(async () => {
    const controller = new AbortController();
    const signal = requestDeadline(SHORT_DEADLINE_MS, controller.signal);

    expect((await whenAborted(signal)) as DOMException).toMatchObject({ name: "TimeoutError" });

    // The caller's own signal stays clear, which is how the call sites tell a deadline they
    // should report from a cancellation they should ignore.
    expect(controller.signal.aborted).toBe(false);
  });
});

test("a cancellation that already happened aborts the request immediately", async () => {
  await onBothPaths(() => {
    const signal = requestDeadline(SHORT_DEADLINE_MS, AbortSignal.abort(new Error("gone")));

    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).message).toBe("gone");
  });
});

test("whichever reason arrives first is the one the request sees", async () => {
  await onBothPaths(async () => {
    const controller = new AbortController();
    const signal = requestDeadline(SHORT_DEADLINE_MS, controller.signal);

    controller.abort(new Error("caller moved on"));
    await delay(SHORT_DEADLINE_MS * 2);

    expect((signal.reason as Error).message).toBe("caller moved on");
  });
});
