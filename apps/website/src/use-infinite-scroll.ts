import { useEffect, useRef } from "react";

interface InfiniteScrollOptions {
  enabled: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
}

export const useInfiniteScroll = <Element extends HTMLElement>({
  enabled,
  onLoadMore,
  rootMargin = "800px",
}: InfiniteScrollOptions) => {
  const sentinelRef = useRef<Element>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!enabled || !sentinel || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [enabled, onLoadMore, rootMargin]);

  return sentinelRef;
};
