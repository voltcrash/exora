import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { RecoveryScreen } from "./RecoveryScreen.tsx";

test("distinguishes failed and automatically recovering renderers", () => {
  const failedMarkup = renderToStaticMarkup(
    <RecoveryScreen
      action="RESTART RENDERER"
      detail="The graphics session could not be restored."
      heading="RENDERER OFFLINE"
      onRetry={vi.fn()}
    />,
  );

  expect(failedMarkup).toContain('role="alert"');
  expect(failedMarkup).toContain("RENDERER OFFLINE");
  expect(failedMarkup).toContain("RESTART RENDERER");

  const pendingMarkup = renderToStaticMarkup(
    <RecoveryScreen
      action="RESTART NOW"
      detail="Waiting for the browser to restore graphics access."
      heading="RECONNECTING TO GPU"
      onRetry={vi.fn()}
      pending
    />,
  );

  expect(pendingMarkup).toContain('role="status"');
  expect(pendingMarkup).toContain("RECONNECTING TO GPU");
});
