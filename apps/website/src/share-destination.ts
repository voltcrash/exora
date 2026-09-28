export type ShareOutcome = "cancelled" | "copied" | "failed" | "shared";

export interface ShareTarget {
  title: string;
  url: string;
}

type ShareNavigator = Pick<Navigator, "clipboard"> & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

/** Hands the link to the platform share sheet where one exists, and copies it everywhere else. */
export const shareDestination = async (
  target: ShareTarget,
  browser: ShareNavigator = navigator,
): Promise<ShareOutcome> => {
  const data = { title: target.title, url: target.url };
  if (browser.share && (browser.canShare?.(data) ?? true)) {
    try {
      await browser.share(data);
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
    }
  }
  try {
    await browser.clipboard.writeText(target.url);
    return "copied";
  } catch {
    return "failed";
  }
};
