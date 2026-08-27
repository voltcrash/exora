const { chromium } = require("playwright");

module.exports = {
  ci: {
    collect: {
      chromePath: chromium.executablePath(),
      numberOfRuns: 1,
      settings: {
        chromeFlags: "--headless=new --no-sandbox",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        preset: "desktop",
        throttlingMethod: "provided",
      },
      staticDistDir: "dist",
      url: ["/"],
    },
    assert: {
      assertions: {
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:performance": ["warn", { minScore: 0.85 }],
        "categories:seo": ["error", { minScore: 0.9 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "first-contentful-paint": ["error", { maxNumericValue: 3000 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 5000 }],
        // Software-rendered CI does not consistently produce TBT for a live WebGL animation loop.
        // FCP, LCP, CLS, transfer weight, and the non-performance categories remain hard gates.
        "total-blocking-time": ["warn", { maxNumericValue: 4000 }],
        "total-byte-weight": ["error", { maxNumericValue: 7_500_000 }],
        "unused-javascript": "warn",
      },
    },
    upload: { outputDir: ".lighthouseci", target: "filesystem" },
  },
};
