import { expect, test } from "vite-plus/test";
import { clearVrHandoff, consumeVrHandoff, requestVrHandoff } from "./xr-session.ts";

test("no handover is pending by default", () => {
  clearVrHandoff();
  expect(consumeVrHandoff()).toBe(false);
});

test("a requested handover is consumed exactly once", () => {
  clearVrHandoff();
  requestVrHandoff();
  expect(consumeVrHandoff()).toBe(true);
  expect(consumeVrHandoff()).toBe(false);
});

test("a stale handover is ignored", () => {
  clearVrHandoff();
  requestVrHandoff();
  const realNow = Date.now;
  Date.now = () => realNow() + 60_000;
  try {
    expect(consumeVrHandoff()).toBe(false);
  } finally {
    Date.now = realNow;
  }
});

test("clearing drops a pending handover", () => {
  requestVrHandoff();
  clearVrHandoff();
  expect(consumeVrHandoff()).toBe(false);
});
