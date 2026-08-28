/**
 * The keyboard half of the ARIA tabs pattern, without React or a DOM.
 *
 * A tab list is not a group of buttons: only the selected tab is in the page's tab order, and the
 * arrow keys move between the rest. Tabbing through eleven curated collections to reach the search
 * field is exactly the behaviour that rule exists to prevent.
 *
 * Kept pure so the traversal is unit-testable in isolation.
 */

/**
 * Resolves a key press against the currently selected tab, returning the index the selection
 * should move to, or `null` when the key means nothing to a tab list and belongs to the page.
 *
 * Left and Right wrap, which is what makes a small horizontal list feel continuous; Home and End
 * jump to the ends. Up and Down are deliberately absent — they belong to a vertical tab list, and
 * every list here is horizontal.
 */
export const nextTabIndex = (key: string, current: number, count: number): number | null => {
  if (count < 1) return null;
  // A selection that is not in the list (or was never made) still has to answer arrow keys, so
  // traversal starts from the first tab rather than refusing to move.
  const index = current >= 0 && current < count ? current : 0;

  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
};

/** DOM id for a tab control, referenced by its panel's `aria-labelledby`. */
export const tabId = (list: string, value: string): string => `${list}-tab-${value}`;

/** DOM id for a tab panel, referenced by its tab's `aria-controls`. */
export const tabPanelId = (list: string, value: string): string => `${list}-panel-${value}`;
