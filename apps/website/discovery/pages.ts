import type { ExoplanetProfile } from "@exora/contracts";
import { SITE_ORIGIN } from "../src/canonical-url.ts";
import { SITE_DESCRIPTION, SITE_TITLE } from "../src/document-title.ts";
import { NOTABLE_PLANET_NAMES } from "../src/search-discovery.ts";
import { TOURS, tourStepSearch } from "../src/tours.ts";
import { GUIDES } from "./content.ts";

export interface DiscoveryPage {
  path: string;
  title: string;
  description: string;
  body: string;
  type: "AboutPage" | "CollectionPage" | "WebPage";
  parent?: { path: string; title: string };
}

export const escapeHtml = (value: string): string =>
  value.replaceAll(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });

const link = (path: string, label: string): string =>
  `<a href="${escapeHtml(path)}">${escapeHtml(label)}</a>`;
const paragraph = (text: string): string => `<p>${escapeHtml(text)}</p>`;
const list = (items: readonly string[]): string =>
  `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
const heading = (text: string): string => `<h2>${escapeHtml(text)}</h2>`;
const image = `<figure><img src="/og-image.jpg" width="1200" height="630" alt="Procedural illustration of an alien world in Exora; not observed imagery" fetchpriority="high"><figcaption>A simulated world in Exora. Appearance is inferred, not photographed.</figcaption></figure>`;

export const planetPath = (planet: Pick<ExoplanetProfile, "id">): string =>
  `/explore/planets/${planet.id}/`;

export const applicationSchema = (): Record<string, unknown> => ({
  "@type": "WebApplication",
  "@id": `${SITE_ORIGIN}/#application`,
  name: "Exora",
  url: `${SITE_ORIGIN}/`,
  description: SITE_DESCRIPTION,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web browser",
  browserRequirements: "JavaScript and WebGL for interactive 3D; AR requires a supported device.",
  screenshot: `${SITE_ORIGIN}/og-image.jpg`,
  featureList: [
    "NASA Exoplanet Archive planet exploration",
    "SIMBAD star search",
    "Solar System and black hole visualizations",
    "Guided astronomy tours",
    "Augmented reality on supported devices",
  ],
});

export const renderHead = (page: DiscoveryPage): string => {
  const title = page.path === "/" ? SITE_TITLE : `${page.title} · Exora`;
  const url = `${SITE_ORIGIN}${page.path}`;
  const crumbs = [
    { path: "/", title: "Exora" },
    ...(page.parent ? [page.parent] : []),
    ...(page.path === "/" ? [] : [{ path: page.path, title: page.title }]),
  ];
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        name: "Exora",
        url: `${SITE_ORIGIN}/`,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
      },
      applicationSchema(),
      {
        "@type": page.type,
        "@id": `${url}#page`,
        url,
        name: title,
        description: page.description,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        about: { "@id": `${SITE_ORIGIN}/#application` },
        ...(page.path === "/" ? {} : { breadcrumb: { "@id": `${url}#breadcrumb` } }),
      },
      ...(page.path === "/"
        ? []
        : [
            {
              "@type": "BreadcrumbList",
              "@id": `${url}#breadcrumb`,
              itemListElement: crumbs.map((crumb, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: crumb.title,
                item: `${SITE_ORIGIN}${crumb.path}`,
              })),
            },
          ]),
    ],
  };
  return `<title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}">
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
    <link rel="canonical" href="${escapeHtml(url)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Exora">
    <meta property="og:locale" content="en_US">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(page.description)}">
    <meta property="og:url" content="${escapeHtml(url)}">
    <meta property="og:image" content="${SITE_ORIGIN}/og-image.jpg">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="A procedurally illustrated alien world in Exora">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(page.description)}">
    <meta name="twitter:image" content="${SITE_ORIGIN}/og-image.jpg">
    <meta name="twitter:image:alt" content="A procedurally illustrated alien world in Exora">
    <script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>`;
};

export const homepage: DiscoveryPage = {
  path: "/",
  title: "Exora — explore the universe in 3D",
  description: SITE_DESCRIPTION,
  type: "WebPage",
  body:
    paragraph(SITE_DESCRIPTION) +
    paragraph(
      "Exora is a browser-based astronomy app for curious explorers, learners and educators. Search confirmed exoplanets, compare catalog readings, visit Solar System worlds and follow guided tours. No account is required to start exploring.",
    ) +
    paragraph(
      "The interactive explorer is loading. It requires JavaScript and WebGL. You can read the guides and planet profiles below without JavaScript.",
    ) +
    list([
      link("/about/", "About Exora and its astronomy features"),
      link("/explore/", "Planet profiles and guided tours"),
      link("/guides/", "Astronomy guides and getting started"),
      link("/guides/data-and-methods/", "Data sources and scientific limits"),
    ]) +
    paragraph(
      "Planet data comes from the NASA Exoplanet Archive and stellar searches use SIMBAD. Exora's rendered worlds are procedural interpretations, not observed images; measured, derived and inferred properties are distinguished in the interface.",
    ),
};

const guideLinks = (): string[] =>
  GUIDES.map(
    (guide) => `${link(`/guides/${guide.slug}/`, guide.title)} — ${escapeHtml(guide.description)}`,
  );

const planetPage = (planet: ExoplanetProfile): DiscoveryPage => {
  const observation = planet.observation;
  const value = (number: number | null, unit: string): string =>
    number === null ? "Not reported" : `${number} ${unit}`.trim();
  const facts: [string, string][] = [
    ["Host star", planet.hostStar],
    ["Discovery method", observation.discoveryMethod],
    ["Discovery year", value(observation.discoveryYear, "")],
    ["Orbital period", value(observation.orbitalPeriodDays, "days")],
    ["Orbital semi-major axis", value(observation.semiMajorAxisAu, "AU")],
    ["Radius", value(observation.radiusEarth, "Earth radii")],
    ["Radius provenance", observation.radiusProvenance ?? "Not reported"],
    ["Mass", value(observation.massEarth, "Earth masses")],
    ["Mass provenance", observation.massProvenance ?? "Not reported"],
    [
      "Equilibrium temperature (model-dependent)",
      value(observation.equilibriumTemperatureKelvin, "K"),
    ],
    ["Distance", value(observation.distanceParsecs, "parsecs")],
  ];
  const archiveUrl = `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(planet.name)}`;
  return {
    path: planetPath(planet),
    title: `${planet.name}: catalog facts and 3D exploration`,
    description: `Explore ${planet.name}, a confirmed exoplanet orbiting ${planet.hostStar}. Read NASA archive properties, their limitations and open the world in Exora's 3D explorer.`,
    type: "WebPage",
    parent: { path: "/explore/", title: "Explore" },
    body:
      paragraph(
        `${planet.name} is a confirmed exoplanet orbiting ${planet.hostStar}. Its discovery is catalogued using the ${observation.discoveryMethod} method${observation.discoveryYear === null ? "." : ` in ${observation.discoveryYear}.`} Exora pairs its catalog properties with a reproducible procedural visualization.`,
      ) +
      `<p class="launch">${link(`/?planet=${encodeURIComponent(planet.name)}`, `Explore ${planet.name} in 3D`)}</p>` +
      heading("Properties from the NASA Exoplanet Archive") +
      `<dl>${facts.map(([label, fact]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(fact)}</dd>`).join("")}</dl>` +
      `<p>Source: ${link(archiveUrl, `${planet.name} at the NASA Exoplanet Archive`)}; composite planet table (pscomppars), snapshot retrieved <time datetime="${planet.source.retrievedOn}">${planet.source.retrievedOn}</time>. Archive values can change as research improves.</p>` +
      heading("What these numbers can tell you") +
      paragraph(
        "The orbital period describes the length of a year on this world. Radius and mass compare it with Earth, but their provenance matters: a minimum mass is a lower bound, and an estimated radius is not a direct measurement. Not reported means the snapshot does not provide that value. An equilibrium temperature is model-dependent and is not a measured surface temperature.",
      ) +
      heading("What will I see in Exora?") +
      paragraph(
        "The interactive view lets you orbit a simulated world and inspect its data. Terrain, clouds, oceans and colors are inferred visual choices, not a telescope image or a confirmed map. A potentially temperate orbit or an Earth-sized radius does not establish surface water, habitability or life.",
      ) +
      list([
        link(
          `/?system=${encodeURIComponent(planet.hostStar)}`,
          `Open the ${planet.hostStar} system diorama`,
        ),
        link("/guides/exoplanets/", "How to explore and compare exoplanets"),
        link("/guides/data-and-methods/", "How Exora separates measurements and inference"),
        link("/explore/", "More planets and astronomy tours"),
      ]),
  };
};

export const buildPages = (planets: readonly ExoplanetProfile[]): DiscoveryPage[] => {
  const featured = planets.filter((planet) => NOTABLE_PLANET_NAMES.includes(planet.name));
  const planetPages = featured.map(planetPage);
  const tourPages: DiscoveryPage[] = TOURS.map((tour) => ({
    path: `/explore/tours/${tour.id}/`,
    title: `${tour.title}: a guided astronomy tour`,
    description: tour.summary,
    type: "WebPage",
    parent: { path: "/explore/", title: "Explore" },
    body:
      paragraph(tour.summary) +
      paragraph(
        "Follow this itinerary in Exora's 3D explorer. Each stop has a shareable link; you can pause, go back or leave the tour at any destination. The scenes are scientific visualizations, with measured properties and inferred appearance identified in the app.",
      ) +
      `<p class="launch">${link(`/${tourStepSearch(tour, 0)}`, "Start this guided tour")}</p>` +
      `<ol>${tour.steps.map((step, index) => `<li><h2>${link(`/${tourStepSearch(tour, index)}`, step.name)}</h2>${paragraph(step.caption)}</li>`).join("")}</ol>` +
      list([
        link("/explore/", "More planet profiles and tours"),
        link("/guides/data-and-methods/", "Understand the data and visualizations"),
      ]),
  }));
  return [
    {
      path: "/about/",
      title: "About Exora, the 3D astronomy explorer",
      description: SITE_DESCRIPTION,
      type: "AboutPage",
      body:
        paragraph(
          "Exora turns catalogued astronomy into interactive places to explore. It is a browser-based 3D astronomy app for astronomy enthusiasts, learners and educators who want to investigate real planets and stars, compare their properties and understand the evidence behind a visualization.",
        ) +
        image +
        heading("What can I do with Exora?") +
        list([
          "Search confirmed exoplanets backed by the NASA Exoplanet Archive and compare them in an interactive atlas.",
          "Visit Solar System planets, moons and distant regions with NASA/JPL and mission source context.",
          "Search SIMBAD stars, inspect black hole visualizations and follow narrated astronomy tours.",
          "Explore host systems as dioramas, inspect discovery signals and compare measured planet properties.",
          "Build reproducible custom worlds in World Forge, or use AR on supported devices.",
        ]) +
        heading("What makes the visualizations trustworthy?") +
        paragraph(
          "Exora distinguishes measured catalog properties, quantities derived from physics and inferred appearance. Its procedural scenes are not photographs of exoplanets. Unreported values stay unknown, and the interface labels estimates, minimum masses and scale compression.",
        ) +
        heading("How do I get started?") +
        paragraph(
          "No account is required to begin. Open the explorer, choose Explore to browse a collection, or press / to search a destination by name. JavaScript and WebGL are required for 3D; the guides and profiles here are readable without them. AR requires a supported device and browser.",
        ) +
        `<p class="launch">${link("/", "Open Exora's 3D explorer")}</p>` +
        list(guideLinks()) +
        heading("Sources and project") +
        list([
          link("https://exoplanetarchive.ipac.caltech.edu/", "NASA Exoplanet Archive"),
          link("https://simbad.cds.unistra.fr/simbad/", "SIMBAD, operated by CDS"),
          link("https://science.nasa.gov/solar-system/", "NASA Solar System science"),
          link("https://ssd.jpl.nasa.gov/", "JPL Solar System Dynamics"),
          link("https://github.com/voltcrash/exora", "Exora source code on GitHub"),
        ]),
    },
    {
      path: "/guides/",
      title: "Astronomy guides and getting started with Exora",
      description:
        "Learn to explore exoplanets, Solar System worlds, stars and black holes in Exora, understand its scientific sources and use supported AR features.",
      type: "CollectionPage",
      body:
        paragraph(
          "Choose a guide to start exploring, learn the controls or understand what a visualization can and cannot tell you.",
        ) +
        list(guideLinks()) +
        `<p>${link("/explore/", "Browse planet profiles and guided tours")}</p>`,
    },
    ...GUIDES.map((guide): DiscoveryPage => ({
      path: `/guides/${guide.slug}/`,
      title: guide.title,
      description: guide.description,
      type: "WebPage",
      parent: { path: "/guides/", title: "Guides" },
      body:
        paragraph(guide.description) +
        guide.sections
          .map((section) => heading(section.heading) + section.paragraphs.map(paragraph).join(""))
          .join("") +
        heading("Try these destinations") +
        list(
          guide.destinations.map(({ kind, name }) =>
            link(`/?${kind}=${encodeURIComponent(name)}`, `Explore ${name}`),
          ),
        ) +
        `<p>${link("/explore/", "Read planet profiles and tour itineraries")}</p>` +
        `<p>${link("/about/", "About Exora and its sources")}</p>`,
    })),
    {
      path: "/explore/",
      title: "Exoplanet profiles and guided astronomy tours",
      description:
        "Browse source-linked exoplanet facts and astronomy tour itineraries, then visit the planets, stars and systems in Exora's interactive 3D explorer.",
      type: "CollectionPage",
      body:
        paragraph(
          "Start with a confirmed exoplanet or a guided journey. Planet profiles use the same NASA archive snapshot as the app, preserve unknown values and label property provenance. All the profiles and itineraries can be read without JavaScript.",
        ) +
        heading("Confirmed exoplanets") +
        list(planetPages.map((page) => link(page.path, page.title))) +
        heading("Guided astronomy tours") +
        list(
          tourPages.map(
            (page) => `${link(page.path, page.title)} — ${escapeHtml(page.description)}`,
          ),
        ) +
        `<p>${link("/guides/data-and-methods/", "Read about sources and scientific limitations")}</p>`,
    },
    ...planetPages,
    ...tourPages,
  ];
};

export const renderBody = (page: DiscoveryPage): string =>
  `<div class="discovery"><a class="skip" href="#main">Skip to content</a>
  <header><a class="brand" href="/">Exora</a><nav aria-label="Main">${link("/about/", "About")}${link("/explore/", "Explore")}${link("/guides/", "Guides")}</nav></header>
  <main id="main"><p class="eyebrow">Astronomy, with the evidence in view</p><h1>${escapeHtml(page.title)}</h1>${page.body}</main>
  <footer>${link("/", "Launch the 3D explorer")}${link("/guides/data-and-methods/", "Sources and methods")}${link("https://github.com/voltcrash/exora", "GitHub")}<p>Visualizations are simulated. Catalog measurements, derived quantities and inferred appearance are distinguished.</p></footer></div>`;

export const renderDocument = (page: DiscoveryPage): string =>
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${renderHead(page)}<meta name="theme-color" content="#080b12"><link rel="icon" href="/exora-orbit.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="/discovery.css"></head><body>${renderBody(page)}</body></html>`;

export const buildSitemap = (pages: readonly DiscoveryPage[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[homepage, ...pages].map((page) => `  <url><loc>${escapeHtml(`${SITE_ORIGIN}${page.path}`)}</loc></url>`).join("\n")}\n</urlset>\n`;

export const buildLlmsText = (pages: readonly DiscoveryPage[]): string =>
  `# Exora\n\n> ${SITE_DESCRIPTION}\n\nExora is a browser-based astronomy explorer. No account is required to begin. Interactive 3D requires JavaScript and WebGL. AR is device-dependent.\n\nPlanet measurements come from the NASA Exoplanet Archive; stellar queries use SIMBAD. Visualizations are procedural interpretations, not observed images or evidence of habitability. Missing catalog values remain unknown. Read the sources and methods guide for limitations.\n\n## Guides and profiles\n\n${pages.map((page) => `- [${page.title}](${SITE_ORIGIN}${page.path}): ${page.description}`).join("\n")}\n`;
