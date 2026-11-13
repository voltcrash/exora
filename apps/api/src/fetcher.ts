export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * The global fetch, looked up on every call. Workers throw "Illegal invocation" when fetch is
 * stored on an object and called as its method, as `this.#fetcher(url)` would.
 */
export const globalFetch: Fetcher = (input, init) => fetch(input, init);
