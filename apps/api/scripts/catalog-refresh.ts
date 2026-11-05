export const assertCatalogSize = (count: number, previous = 0, allowShrink = false): void => {
  if (count < 1_000 || (!allowShrink && count < previous * 0.95)) {
    throw new Error(
      `NASA returned ${count} planets after ${previous}; refusing to shrink the snapshot. Inspect the archive before using --allow-shrink.`,
    );
  }
};
