interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface ArchiveCache<T> {
  get(key: string, now: number): T | undefined;
  set(key: string, value: T, expiresAt: number): void;
  size(): number;
}

export interface RequestCoalescer<T> {
  run(key: string, load: () => Promise<T>): Promise<T>;
  size(): number;
}

export const DEFAULT_MAX_ENTRIES = 256;

export const createArchiveCache = <T>(maxEntries = DEFAULT_MAX_ENTRIES): ArchiveCache<T> => {
  const entries = new Map<string, CacheEntry<T>>();

  return {
    get(key, now) {
      const entry = entries.get(key);
      if (!entry) return undefined;

      if (entry.expiresAt <= now) {
        entries.delete(key);
        return undefined;
      }

      // Refresh insertion order to implement LRU eviction.
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },

    set(key, value, expiresAt) {
      entries.delete(key);
      entries.set(key, { expiresAt, value });

      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },

    size: () => entries.size,
  };
};

export const createRequestCoalescer = <T>(): RequestCoalescer<T> => {
  const active = new Map<string, Promise<T>>();

  return {
    run(key, load) {
      const existing = active.get(key);
      if (existing) return existing;

      const request = Promise.resolve().then(load);
      active.set(key, request);
      void request.then(
        () => {
          if (active.get(key) === request) active.delete(key);
        },
        () => {
          if (active.get(key) === request) active.delete(key);
        },
      );
      return request;
    },

    size: () => active.size,
  };
};
