export type ResourceState<T> =
  | { status: "idle" }
  | { status: "loading"; request: Promise<T> }
  | { status: "ready"; request: Promise<T>; expiresAt: number }
  | { status: "failed"; error: unknown; retryAt: number };

export const createAsyncResource = <T>({ ttlMs = Infinity, retryMs = 60_000 } = {}) => {
  let state: ResourceState<T> = { status: "idle" };
  return {
    get state(): ResourceState<T> {
      return state;
    },
    clear: (): void => {
      state = { status: "idle" };
    },
    get: (load: () => Promise<T>): Promise<T> => {
      if (state.status === "loading" || (state.status === "ready" && state.expiresAt > Date.now()))
        return state.request;
      if (state.status === "failed" && state.retryAt > Date.now())
        return Promise.reject(state.error);
      const request = Promise.resolve().then(load);
      state = { status: "loading", request };
      void request.then(
        () => {
          if (state.status === "loading" && state.request === request)
            state = { status: "ready", request, expiresAt: Date.now() + ttlMs };
        },
        (error: unknown) => {
          if (state.status === "loading" && state.request === request)
            state = { status: "failed", error, retryAt: Date.now() + retryMs };
        },
      );
      return request;
    },
  };
};
