import type { StarProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import { starSystemAliases } from "./star-identity.ts";

const proxima = {
  aliases: ["* alf Cen C", "Proxima Cen", "NAME Proxima Centauri", "GJ 551"],
  catalogName: "V* V645 Cen",
  name: "Proxima Centauri",
} as unknown as StarProfile;

test("bridges SIMBAD aliases to NASA host names without namespace markers", () => {
  expect(starSystemAliases(proxima)).toEqual([
    "Proxima Centauri",
    "alf Cen C",
    "Proxima Cen",
    "GJ 551",
    "V* V645 Cen",
  ]);
});

test("keeps an already-known NASA host spelling first", () => {
  expect(starSystemAliases(proxima, "Proxima Cen")[0]).toBe("Proxima Cen");
});
