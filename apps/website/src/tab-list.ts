export const nextTabIndex = (key: string, current: number, count: number): number | null => {
  if (count < 1) return null;
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

export const tabId = (list: string, value: string): string => `${list}-tab-${value}`;

export const tabPanelId = (list: string, value: string): string => `${list}-panel-${value}`;
