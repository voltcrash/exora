export interface DiscoverySection {
  heading: string;
  paragraphs: readonly string[];
}

export interface DiscoveryGuide {
  slug: string;
  title: string;
  description: string;
  sections: readonly DiscoverySection[];
  destinations: readonly { kind: string; name: string }[];
}

export const GUIDES: readonly DiscoveryGuide[] = [
  {
    slug: "exoplanets",
    title: "Explore exoplanets in 3D with NASA catalog data",
    description:
      "Find planets beyond the Solar System in Exora, compare their measured properties and explore procedural worlds grounded in the NASA Exoplanet Archive.",
    sections: [
      {
        heading: "Find a planet beyond the Solar System",
        paragraphs: [
          "Exoplanets are planets orbiting stars other than the Sun. Exora lets you search confirmed planets by name, browse discovery collections or compare the population in an interactive exoplanet atlas. Open Explore, choose Exoplanets and search for a world such as TRAPPIST-1 e or Kepler-22 b.",
          "The planet catalog is a bundled snapshot of the NASA Exoplanet Archive, refreshed weekly by the repository's catalog workflow. The application can also query the archive for newer discoveries. After the first visit, the cached snapshot supports offline search and browsing.",
        ],
      },
      {
        heading: "Compare evidence, then explore a world",
        paragraphs: [
          "Read the inspector to compare radius, mass, orbital period, host star and discovery method where the archive supplies them. Exora marks estimated radii and minimum masses rather than presenting them as direct measurements. Missing catalog fields remain unknown.",
          "The Signal tab illustrates how a planet can be detected through a transit or stellar velocity wobble. The system diorama shows its neighboring confirmed planets with the display's scale compression explained. For a wider comparison, the Atlas plots planet period against radius or mass and marks the Solar System as a reference.",
        ],
      },
      {
        heading: "Does an Earth-like planet mean it is habitable?",
        paragraphs: [
          "No. Similar size or a location in a star's habitable zone does not establish an atmosphere, surface water or life. Exora's inferred terrain, clouds and oceans are procedural illustrations of possible conditions, not photographs or evidence of habitability.",
          "Use Exora for visual exploration and to understand the catalog's evidence. Consult the linked archive and research for scientific conclusions, especially when comparing equilibrium temperatures, estimated properties or claims about life.",
        ],
      },
    ],
    destinations: [
      { kind: "planet", name: "TRAPPIST-1 e" },
      { kind: "planet", name: "Kepler-22 b" },
      { kind: "planet", name: "Proxima Cen b" },
      { kind: "system", name: "TRAPPIST-1" },
    ],
  },
  {
    slug: "solar-system",
    title: "Explore the Solar System, moons and distant regions",
    description:
      "Visit Solar System planets, moons, the asteroid belt and the heliopause in Exora's interactive 3D astronomy explorer, with NASA and JPL source context.",
    sections: [
      {
        heading: "Start close to home",
        paragraphs: [
          "Open Explore and choose Solar System to visit the planets, principal moons and regions between them. Travel from Earth to the Moon, compare rocky Mars with gas giant Jupiter or inspect Saturn's rings. Every destination can be bookmarked and shared.",
          "Solar System worlds use mission-informed surface recipes rather than applying the same terrain everywhere. The app explains the difference between measured properties, physics-derived quantities and the visual choices needed to make a world explorable.",
        ],
      },
      {
        heading: "Visit the spaces between worlds",
        paragraphs: [
          "The Main Asteroid Belt, Jupiter Trojan Clouds and Kuiper Belt communicate the structure of populations. Their rendered points are statistical samples, not claims about the positions of individual catalogued objects.",
          "Explore the heliosphere, termination shock and heliopause to understand the Sun's interaction with interstellar space. The distant Oort Cloud is modeled and inferred; its depiction is not an observed map. The region inspector discloses the evidence and scale used by each view.",
        ],
      },
      {
        heading: "Follow a guided astronomy tour",
        paragraphs: [
          "Choose Guided Tours in Explore for a narrated sequence of real destinations. Home to the edge begins on Earth and travels beyond the heliopause to nearby stars, exoplanets and the Milky Way's central black hole. Each stop includes a short explanation and an ordinary shareable destination link.",
        ],
      },
    ],
    destinations: [
      { kind: "planet", name: "Earth" },
      { kind: "planet", name: "Moon" },
      { kind: "planet", name: "Saturn" },
      { kind: "region", name: "Heliopause" },
    ],
  },
  {
    slug: "stars-and-black-holes",
    title: "Explore stars and black holes in an astronomy app",
    description:
      "Search SIMBAD stars and visit black hole visualizations in Exora. Learn how stellar properties and scientific sources inform the interactive views.",
    sections: [
      {
        heading: "Search for a real star",
        paragraphs: [
          "Open Explore and select Stars to search identifiers through SIMBAD or browse stellar collections. Start with Sirius, Betelgeuse or Proxima Centauri. The inspector brings together the star's catalog properties and source context, while the visualization illustrates a photosphere, starspots and corona.",
          "The Hertzsprung–Russell diagram places a star using its measured temperature, magnitude and distance when those data are available. A system view links a host star to its confirmed planets so that a stellar reading becomes a place you can explore.",
        ],
      },
      {
        heading: "Visit a black hole visualization",
        paragraphs: [
          "Exora includes black hole destinations such as Sagittarius A* and M87*, with source information drawn from NASA, the Event Horizon Telescope and ESA where applicable. Select Black Holes in Explore or search a destination by name.",
          "The real-time scene is a scientific visualization, not an observation or a replacement for a telescope image. Its lensing and accretion appearance illustrate a model; the inspector is where to check the evidence and uncertainties for the object itself.",
        ],
      },
    ],
    destinations: [
      { kind: "star", name: "Sirius" },
      { kind: "star", name: "Proxima Centauri" },
      { kind: "blackHole", name: "Sagittarius A*" },
      { kind: "blackHole", name: "M87*" },
    ],
  },
  {
    slug: "ar-and-controls",
    title: "Use Exora in your browser and augmented reality",
    description:
      "Learn Exora's search shortcuts, 3D navigation, guided tours, offline behavior and augmented reality requirements on supported devices.",
    sections: [
      {
        heading: "What do I need to run Exora?",
        paragraphs: [
          "Exora is a browser-based 3D astronomy application. The interactive scenes need JavaScript and WebGL, and performance depends on your device's graphics hardware. The guides and planet profiles on this site can be read without either. You can begin exploring without creating an account.",
          "Use a desktop browser to orbit a world or open Exora on a phone to explore with touch controls. On phones, the bottom sheet holds the destination's name and readings; drag or tap it open to inspect the evidence.",
        ],
      },
      {
        heading: "Find your next destination",
        paragraphs: [
          "Press /, Command+K on Mac or Control+K elsewhere to open Go anywhere. Search for a planet, star, host system, region, black hole or tour. Explore opens the catalog collections, Atlas, Guided Tours and World Forge. Press H to hide or restore the interface.",
          "World Forge creates seeded procedural planets, stars and black holes. These are custom creations, separate from catalogued discoveries. Sharing a Forge link shares a reproducible recipe, not a newly discovered astronomical object.",
        ],
      },
      {
        heading: "Can I view planets in augmented reality?",
        paragraphs: [
          "The View in AR control appears when Exora detects a supported immersive path. Android devices can use compatible WebXR browsers. The iPhone path uses Variant Launch when it is configured for the deployment. AR support varies by browser, device and deployment; it is not available everywhere.",
          "After an initial online visit, Exora's service worker caches the application shell and downloaded assets. Previously cached catalog answers can be used when the network fails. Destinations and media you have not loaded may still require an internet connection.",
        ],
      },
    ],
    destinations: [{ kind: "planet", name: "Earth" }],
  },
  {
    slug: "data-and-methods",
    title: "Exora's data sources and scientific limits",
    description:
      "Understand Exora's NASA Exoplanet Archive, SIMBAD and NASA/JPL sources, measured versus derived properties, procedural imagery and uncertainty disclosures.",
    sections: [
      {
        heading: "Where does Exora's astronomy data come from?",
        paragraphs: [
          "Confirmed exoplanet properties come from the NASA Exoplanet Archive's composite planet table, pscomppars. The repository stores a dated snapshot and refreshes it weekly. The interactive app can also request archive data. Stellar identifier resolution and stellar properties use SIMBAD; Solar System destinations carry NASA/JPL and mission source context.",
          "Read the source and retrieval information in the inspector. An archive snapshot is not a promise of real-time completeness. If an upstream service is unavailable, Exora can show a cached response and labels that state.",
        ],
      },
      {
        heading: "Measured, derived and inferred mean different things",
        paragraphs: [
          "Measured values are reported catalog properties. Derived values apply a physical model to catalog inputs. Inferred appearance supplies a plausible visual interpretation where observations do not resolve a world. An estimated radius is not a measured transit radius, and a radial-velocity minimum mass is not necessarily the true mass.",
          "The same catalog row generates the same versioned world recipe. This makes procedural scenes reproducible, but does not make their terrain or atmosphere observed fact. Missing measurements remain unknown instead of being filled with plausible numbers.",
        ],
      },
      {
        heading: "What should I use Exora for?",
        paragraphs: [
          "Exora is useful for astronomy enthusiasts exploring planets and stars, learners comparing catalog properties, and people looking for interactive astronomy tours or supported AR views. Educators can use its source disclosures to discuss the difference between evidence and a model.",
          "It is a visual exploration tool, not a telescope, an authoritative observing ephemeris or evidence for extraterrestrial life. System dioramas compress orbital distances and body sizes to fit a view, and explain those scale choices. Follow the original datasets and research when making scientific claims.",
        ],
      },
    ],
    destinations: [{ kind: "planet", name: "TRAPPIST-1 e" }],
  },
];
