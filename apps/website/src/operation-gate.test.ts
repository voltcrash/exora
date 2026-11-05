import { expect, test } from "vite-plus/test";
import { createOperationGate } from "./operation-gate.ts";

test("only the newest live operation can commit its result", () => {
  const gate = createOperationGate();
  const first = gate.start();
  const second = gate.start();
  expect(first()).toBe(false);
  expect(second()).toBe(true);
  gate.cancel();
  expect(second()).toBe(false);
});
