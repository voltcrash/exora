import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vite-plus/test";
import { FrameRateSignal } from "./FrameRateSignal.tsx";

test("renders finite and unavailable frame-rate readings compactly", () => {
  const markup = renderToStaticMarkup(<FrameRateSignal fps="51" />);

  expect(markup).toContain('data-testid="frame-rate-reading"');
  expect(markup).toMatch(/data-testid="signal-bars"[^>]*>.*<\/span><strong>51<\/strong>/);
  expect(markup).toContain("<small>FPS</small>");
  expect(markup).not.toContain("DESKTOP");
  expect(markup).not.toContain("MOBILE");
  for (const fps of ["--", "Infinity", "NaN", ""]) {
    const unavailableMarkup = renderToStaticMarkup(<FrameRateSignal fps={fps} />);

    expect(unavailableMarkup).toContain("<strong>∞</strong>");
    expect(unavailableMarkup).not.toContain("<strong>Infinity</strong>");
  }
});
