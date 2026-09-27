import { expect, test, vi } from "vite-plus/test";
import { shareDestination } from "./share-destination.ts";

const target = {
  title: "TRAPPIST-1 e · Exora",
  url: "https://exora.voltcrash.com/?planet=TRAPPIST-1%20e",
};

const clipboard = (writeText = vi.fn(async () => {})) => ({ writeText }) as unknown as Clipboard;

test("uses the platform share sheet when one is offered", async () => {
  const share = vi.fn(async () => {});
  const writeText = vi.fn(async () => {});

  expect(await shareDestination(target, { clipboard: clipboard(writeText), share })).toBe("shared");
  expect(share).toHaveBeenCalledWith(target);
  expect(writeText).not.toHaveBeenCalled();
});

test("copies the link where there is no share sheet", async () => {
  const writeText = vi.fn(async () => {});

  expect(await shareDestination(target, { clipboard: clipboard(writeText) })).toBe("copied");
  expect(writeText).toHaveBeenCalledWith(target.url);
});

test("respects a dismissed share sheet instead of copying behind the user's back", async () => {
  const writeText = vi.fn(async () => {});
  const share = vi.fn(async () => {
    throw new DOMException("dismissed", "AbortError");
  });

  expect(await shareDestination(target, { clipboard: clipboard(writeText), share })).toBe(
    "cancelled",
  );
  expect(writeText).not.toHaveBeenCalled();
});

test("falls back to copying when sharing fails, and reports when neither works", async () => {
  const share = vi.fn(async () => {
    throw new DOMException("blocked", "NotAllowedError");
  });

  expect(await shareDestination(target, { clipboard: clipboard(), share })).toBe("copied");
  expect(
    await shareDestination(target, {
      clipboard: clipboard(
        vi.fn(async () => {
          throw new Error("denied");
        }),
      ),
    }),
  ).toBe("failed");
  expect(
    await shareDestination(target, { canShare: () => false, clipboard: clipboard(), share }),
  ).toBe("copied");
});
