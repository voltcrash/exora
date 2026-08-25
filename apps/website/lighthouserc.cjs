const { chromium } = require("playwright");

module.exports = {
  ci: {
    collect: {
      chromePath: chromium.executablePath(),
      numberOfRuns: 1,
      settings: {
        chromeFlags: "--headless=new --no-sandbox",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      },
      staticDistDir: "dist",
      url: ["/"],
    },
    assert: {
      assertions: {
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:performance": ["error", { minScore: 0.25 }],
        "categories:seo": ["error", { minScore: 0.9 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "first-contentful-paint": ["error", { maxNumericValue: 7500 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 10_000 }],
        "total-blocking-time": ["error", { maxNumericValue: 4000 }],
        "total-byte-weight": ["error", { maxNumericValue: 1_500_000 }],
        "unused-javascript": "warn",
      },
    },
    upload: { outputDir: ".lighthouseci", target: "filesystem" },
  },
};
