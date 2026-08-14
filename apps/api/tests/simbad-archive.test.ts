import { expect, test } from "vite-plus/test";
import { normalizeSimbadStar, SimbadStarRepository } from "../src/simbad-archive.ts";

const metadata = [
  "matched_id",
  "main_id",
  "otype",
  "otype_txt",
  "ra",
  "dec",
  "plx_value",
  "pmra",
  "pmdec",
  "rvz_radvel",
  "sp_type",
  "V",
  "G",
].map((name) => ({ name }));

const siriusRow = [
  "NAME Sirius",
  "* alf CMa",
  "SB*",
  "Spectroscopic binary",
  101.287,
  -16.716,
  379.21,
  -546.01,
  -1223.07,
  -5.5,
  "A0mA1Va",
  -1.46,
  null,
];

test("normalizes SIMBAD measurements and derives distance", () => {
  const star = normalizeSimbadStar(
    Object.fromEntries(metadata.map(({ name }, index) => [name, siriusRow[index]])),
    "2026-08-14",
  );

  expect(star).toMatchObject({
    catalogName: "* alf CMa",
    id: "alf-cma",
    kind: "binary",
    name: "Sirius",
    observation: {
      distanceParsecs: 1000 / 379.21,
      spectralType: "A0mA1Va",
      visualMagnitude: -1.46,
    },
  });
});

test("uses exact alias matching and caches repeated searches", async () => {
  let requests = 0;
  let requestedUrl = "";
  const repository = new SimbadStarRepository({
    now: () => Date.parse("2026-08-14T00:00:00Z"),
    fetcher: async (input) => {
      requests += 1;
      requestedUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return Response.json({ metadata, data: [siriusRow] });
    },
  });

  const first = await repository.search("sirius", 12);
  const second = await repository.search("sirius", 12);
  const adql = new URL(requestedUrl).searchParams.get("query");

  expect(first.value[0]?.name).toBe("Sirius");
  expect(second.cached).toBe(true);
  expect(requests).toBe(1);
  expect(adql).toContain("i.id='NAME Sirius'");
  expect(adql).not.toContain("like");
});
