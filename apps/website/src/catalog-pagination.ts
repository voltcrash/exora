export const appendUniqueById = <Item extends { id: string }>(
  current: readonly Item[],
  incoming: readonly Item[],
): Item[] => {
  const seen = new Set(current.map((item) => item.id));
  const additions = incoming.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return additions.length > 0 ? [...current, ...additions] : [...current];
};
