import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vite-plus/test";
import { FrameRateSignal } from "./FrameRateSignal.tsx";

test("keeps the signal bars beside a finite frame-rate reading", () => {
  const markup = renderToStaticMarkup(<FrameRateSignal fps="51" />);

  expect(markup).toContain('data-testid="frame-rate-reading"');
  expect(markup).toMatch(/data-testid="signal-bars"[^>]*>.*<\/span><strong>51<\/strong>/);
  expect(markup).toContain("<small>FPS</small>");
  expect(markup).not.toContain("DESKTOP");
  expect(markup).not.toContain("MOBILE");
});

test("prints a compact infinity symbol before a reading is available", () => {
  for (const fps of ["--", "Infinity", "NaN", ""]) {
    const markup = renderToStaticMarkup(<FrameRateSignal fps={fps} />);

    expect(markup).toContain("<strong>∞</strong>");
    expect(markup).not.toContain("<strong>Infinity</strong>");
  }
});
