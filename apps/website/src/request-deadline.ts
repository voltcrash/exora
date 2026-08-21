/**
 * Joins a caller's cancellation to a request's own deadline.
 *
 * Every archive request has two independent reasons to stop: the component that asked for it
 * unmounted or moved on, and the request took longer than it is worth waiting for. Passing one
 * `AbortSignal` to `fetch` can only express one of them, and choosing the caller's signal when
 * there is one silently drops the deadline — a stalled connection then has nothing left to end it,
 * and the catalog spins until the tab is closed.
 *
 * Kept free of the DOM and of `fetch` so the rule can be tested on its own.
 */

/**
 * One signal that aborts as soon as any of its inputs does, carrying that input's reason.
 *
 * `AbortSignal.any` is the whole of this where it exists. It arrived in Safari 17.4, later than
 * the baseline this bundle targets and later than `AbortSignal.timeout`, which every engine in
 * that baseline already has — so on those engines the combination has to be assembled by hand.
 * Listeners are registered against the controller's own signal, which unregisters them the moment
 * it aborts and leaves nothing attached to a signal that outlives the request.
 */
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

/**
 * The signal a request should actually be issued with.
 *
 * Aborting through the caller's signal leaves that signal's `aborted` set, which is how the call
 * sites tell "I cancelled this" from "this failed": they check their own controller and stay
 * quiet, and treat anything else — including the deadline expiring — as an error worth showing.
 * That distinction is why the timeout's `TimeoutError` reason is forwarded rather than replaced.
 */
export const requestDeadline = (timeoutMs: number, signal?: AbortSignal): AbortSignal => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? firstToAbort([signal, timeout]) : timeout;
};
