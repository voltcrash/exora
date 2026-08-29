const { chromium } = require("playwright");

const profileName = process.env.LIGHTHOUSE_PROFILE === "mobile" ? "mobile" : "desktop";
const profile =
  profileName === "mobile"
    ? {
        settings: {
          formFactor: "mobile",
          screenEmulation: {
            deviceScaleFactor: 2.625,
            disabled: false,
            height: 823,
            mobile: true,
            width: 393,
          },
          throttling: {
            cpuSlowdownMultiplier: 4,
            downloadThroughputKbps: 1_638.4,
            requestLatencyMs: 150,
            rttMs: 150,
            throughputKbps: 1_638.4,
            uploadThroughputKbps: 750,
          },
          throttlingMethod: "simulate",
        },
        thresholds: { fcp: 4_000, lcp: 6_000 },
      }
    : {
        settings: { preset: "desktop", throttlingMethod: "provided" },
        thresholds: { fcp: 3_000, lcp: 5_000 },
      };

module.exports = {
  ci: {
    collect: {
      chromePath: chromium.executablePath(),
      numberOfRuns: 1,
      settings: {
        chromeFlags: "--headless=new --no-sandbox --enable-unsafe-swiftshader",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        ...profile.settings,
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
        "first-contentful-paint": ["error", { maxNumericValue: profile.thresholds.fcp }],
        "largest-contentful-paint": ["error", { maxNumericValue: profile.thresholds.lcp }],
        "total-blocking-time": ["warn", { maxNumericValue: 4000 }],
        "total-byte-weight": ["error", { maxNumericValue: 7_500_000 }],
        "unused-javascript": "warn",
      },
    },
    upload: { outputDir: `.lighthouseci/${profileName}`, target: "filesystem" },
  },
};
