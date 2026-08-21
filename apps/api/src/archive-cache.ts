/**
 * The bounded TTL cache both archive adapters keep in front of their TAP endpoint.
 *
 * The cache key is the ADQL string, which embeds whatever the caller searched for, so the set of
 * possible keys is as large as the set of possible search terms. An unbounded `Map` therefore
 * grows for the life of the process: entries are never evicted, and an expired one is only
 * displaced if that exact query is asked for again. Serverless instances are short-lived enough
 * to hide this, but the long-running `vp run @exora/api#start` server is not, and the SIMBAD
 * cache stays on the hot path even when planets are served from PostgreSQL.
 *
 * So entries are capped and evicted least-recently-used. The fixed-key queries — the discovery
 * categories, the featured set, the browsing field — are re-promoted on every hit, which keeps
 * them resident under ordinary traffic; a flood of distinct searches can still push them out,
 * and re-fetching one of a dozen category queries is the cheaper thing to lose.
 */

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface ArchiveCache<T> {
  /** The live value for `key`, or `undefined` when it is absent or past its expiry at `now`. */
  get(key: string, now: number): T | undefined;
  set(key: string, value: T, expiresAt: number): void;
  size(): number;
}

/** How many distinct queries either adapter keeps. Comfortably above the fixed-key working set. */
export const DEFAULT_MAX_ENTRIES = 256;

export const createArchiveCache = <T>(maxEntries = DEFAULT_MAX_ENTRIES): ArchiveCache<T> => {
  // `Map` iterates in insertion order, so deleting and re-inserting on read makes the first key
  // the least recently used one — an LRU queue without a second structure to keep in step.
  const entries = new Map<string, CacheEntry<T>>();

  return {
    get(key, now) {
      const entry = entries.get(key);
      if (!entry) return undefined;

      if (entry.expiresAt <= now) {
        // Drop it rather than leaving a dead entry occupying a slot until it is overwritten.
        entries.delete(key);
        return undefined;
      }

      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },

    set(key, value, expiresAt) {
      // Delete first so an overwrite moves the key to the most-recently-used end rather than
      // keeping its original position.
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
