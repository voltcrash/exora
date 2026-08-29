import type { ReactNode } from "react";

/*
 * THE DESTINATION PANEL MODEL
 *
 * Every main screen — world, moon, star, black hole, orbital diorama, solar region — describes
 * itself to the same panel through this model instead of composing its own aside. What varies
 * between destinations is the content, never the shape: a heading naming the archive, four
 * measured values, the places this object can be left for, and the reading behind it grouped into
 * tabs so a subsystem with six sections costs exactly as much screen as a black hole with one.
 */

export type PanelTone = "accent" | "cyan" | "gold" | "quiet";

export interface PanelMetric {
  label: string;
  unit?: ReactNode;
  value: string;
}

/** A label with the value measured for it, and optionally the sentence qualifying that value. */
export interface PanelFact {
  detail?: ReactNode;
  label: string;
  tone?: PanelTone;
  value: ReactNode;
}

/** Somewhere this destination can be left for: a host star, a diorama, a parent body. */
export interface PanelLink {
  action: string;
  disabled?: boolean;
  error?: string;
  glyph: string;
  id: string;
  onSelect: () => void;
  pressed?: boolean;
  title: string;
  tone?: PanelTone;
}

/** A member of this destination — a world, a moon, a ring, a dataset — listed and often visitable. */
export interface PanelBody {
  id: string;
  kind?: string;
  meta?: string;
  name: string;
  onSelect?: () => void;
  status?: string;
}

export type PanelBlock =
  | { bodies: readonly PanelBody[]; label?: string; type: "bodies" }
  | { content: ReactNode; label?: string; type: "custom" }
  | { facts: readonly PanelFact[]; type: "facts" }
  | { text: string; tone?: PanelTone; type: "status" };

export interface PanelTab {
  blocks: readonly PanelBlock[];
  count?: number;
  id: string;
  label: string;
}

export interface DestinationPanelModel {
  footer: ReactNode;
  label: string;
  links: readonly PanelLink[];
  metrics: readonly PanelMetric[];
  source: string;
  tabs: readonly PanelTab[];
  title: string;
}

const hasContent = (block: PanelBlock): boolean => {
  switch (block.type) {
    case "bodies":
      return block.bodies.length > 0;
    case "facts":
      return block.facts.length > 0;
    case "custom":
      return block.content !== null && block.content !== false && block.content !== undefined;
    case "status":
      return block.text.length > 0;
  }
};

/** Drops the blocks a destination has nothing to put in, then the tabs that leaves empty. */
export const presentTabs = (
  tabs: readonly (PanelTab | false | null | undefined)[],
): readonly PanelTab[] =>
  tabs.flatMap((tab) => {
    if (!tab) return [];
    const blocks = tab.blocks.filter(hasContent);
    return blocks.length > 0 ? [{ ...tab, blocks }] : [];
  });

/** Keeps the entries a destination actually has, so callers can list conditional ones inline. */
export const present = <Item>(
  items: readonly (Item | false | null | undefined)[],
): readonly Item[] => items.filter((item): item is Item => Boolean(item));
