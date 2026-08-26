import type { StarProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import { nasaAliasCandidates, NasaSystemAliasRepository } from "../src/nasa-system-aliases.ts";

const proxima = {
  aliases: ["TIC 388857263", "GJ 551", "* alf Cen C", "NAME Proxima Cen", "NAME Proxima Centauri"],
  catalogName: "NAME Proxima Centauri",
  id: "name-proxima-centauri",
  name: "Proxima Centauri",
} as unknown as StarProfile;

test("keeps canonical and reliable SIMBAD names ahead of incidental identifiers", () => {
  expect(nasaAliasCandidates(proxima)).toEqual([
    "Proxima Centauri",
    "TIC 388857263",
    "GJ 551",
    "Proxima Cen",
    "alf Cen C",
  ]);
});

test("resolves a SIMBAD full name to NASA's default host name and caches it", async () => {
  const requests: string[] = [];
  const repository = new NasaSystemAliasRepository({
    now: () => Date.parse("2026-08-26T00:00:00Z"),
    fetcher: async (input) => {
      const url = new URL(input as URL);
      requests.push(url.searchParams.get("objname") ?? "");
      return Response.json({
        manifest: {
          lookup_status: "OK",
          requested_name: "Proxima Centauri",
          resolved_name: "Proxima Cen",
        },
      });
    },
  });

  const first = await repository.resolveHost(proxima);
  const second = await repository.resolveHost(proxima);

  expect(first).toEqual({ cached: false, value: "Proxima Cen" });
  expect(second).toEqual({ cached: true, value: "Proxima Cen" });
  expect(requests).toEqual(["Proxima Centauri"]);
});

test("falls through unrecognized SIMBAD names to a NASA-recognized catalog alias", async () => {
  const requests: string[] = [];
  const repository = new NasaSystemAliasRepository({
    fetcher: async (input) => {
      const requestedName = new URL(input as URL).searchParams.get("objname") ?? "";
      requests.push(requestedName);
      return Response.json(
        requestedName === "GJ 551"
          ? { manifest: { lookup_status: "OK", resolved_name: "Proxima Cen" } }
          : { manifest: { lookup_status: "System Not Found" } },
      );
    },
  });

  expect((await repository.resolveHost(proxima)).value).toBe("Proxima Cen");
  expect(requests).toEqual(["Proxima Centauri", "TIC 388857263", "GJ 551"]);
});
