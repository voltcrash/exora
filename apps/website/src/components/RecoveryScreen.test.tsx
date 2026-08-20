import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { RecoveryScreen } from "./RecoveryScreen.tsx";

test("renders an actionable alert for an unrecoverable renderer failure", () => {
  const markup = renderToStaticMarkup(
    <RecoveryScreen
      action="RESTART RENDERER"
      detail="The graphics session could not be restored."
      heading="RENDERER OFFLINE"
      onRetry={vi.fn()}
    />,
  );

  expect(markup).toContain('role="alert"');
  expect(markup).toContain("RENDERER OFFLINE");
  expect(markup).toContain("RESTART RENDERER");
});

test("announces automatic context recovery as progress", () => {
  const markup = renderToStaticMarkup(
    <RecoveryScreen
      action="RESTART NOW"
      detail="Waiting for the browser to restore graphics access."
      heading="RECONNECTING TO GPU"
      onRetry={vi.fn()}
      pending
    />,
  );

  expect(markup).toContain('role="status"');
  expect(markup).toContain("RECONNECTING TO GPU");
});
