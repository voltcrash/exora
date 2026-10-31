# Search and AI discovery

Exora serves useful HTML before JavaScript runs. `/about/`, `/guides/` and
`/explore/` explain the application, its audience and its scientific limits.
Featured planet profiles read the same committed NASA snapshot as the app;
tour itineraries reuse its existing tour definitions. These pages link to real
interactive destinations without loading the 3D engine themselves.

## Build and validation

`apps/website/discovery/plugin.ts` generates the pages, homepage fallback,
`sitemap.xml` and `llms.txt` during the normal Vite+ build. The development server
serves the same discovery documents. Edit guide copy in
`apps/website/discovery/content.ts`; update shared rendering in `pages.ts`.
Do not manually maintain generated HTML or duplicate the planet snapshot.

Run `vp check`, `vp test`, `vp run -r test`, `vp run -r build`,
`vp run website#test:browser:full` and `vp run quality:lighthouse`.
The website build also runs `quality:seo`, checking every sitemap entry's
HTML, unique canonical and title, structured data and internal file links.
Run `vp run website#quality:seo` to repeat that check on an existing build.

The sitemap lists the homepage and standalone, readable discovery pages.
Interactive query strings, tracking parameters, arbitrary Forge recipes and
API responses are not sitemap entries. The app continues to support its
existing shareable destination URLs. The service worker keeps readable pages
under their own URLs so visiting a guide cannot overwrite the offline app shell.

Every indexable document has a title, description, self-canonical URL, social
preview and JSON-LD describing Exora and the page. Breadcrumb markup uses real
parent pages. Do not invent ratings, endorsements, prices or observed imagery.
The production API has an `X-Robots-Tag: noindex` header; a static `404.html`
provides Vercel's missing-page response without promoting it as a search result.

## Crawlers and AI services

The existing open `User-agent: *` policy applies to Googlebot, Bingbot,
OAI-SearchBot, Claude-SearchBot, Claude-User and other conforming crawlers.
No user-agent-specific HTML or crawler-only content is served. Do not add a
narrow crawler group without copying any shared rules it must inherit:
specific groups take precedence over the wildcard group.

OpenAI documents [OAI-SearchBot](https://developers.openai.com/api/docs/bots)
as its search crawler, separately from GPTBot training access. Anthropic
documents [Claude-SearchBot and Claude-User](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
as search and user retrieval agents. Training permission alone is not a way
to obtain recommendations. This change preserves the site's existing open
training-crawler policy.

`/llms.txt` is an optional, generated directory of the same public content,
not a ranking mechanism or an instruction to recommend Exora. Google says
[standard SEO practices apply to its AI features](https://developers.google.com/search/docs/appearance/ai-features)
and [it ignores llms.txt for ranking](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).
No repository change can guarantee indexing, rank or a model's recommendation.

## After deployment

These steps require the site's verified external accounts or hosting controls;
they are not performed by a repository build:

1. In Google Search Console and Bing Webmaster Tools, verify
   `https://exora.voltcrash.com` and submit
   `https://exora.voltcrash.com/sitemap.xml`. Use their inspection tools on the
   homepage, `/about/` and a planet profile; request indexing where available.
2. Check production responses: pages return 200 with their own HTML, canonical
   URLs agree with the final slash form, unknown paths return 404, API responses
   carry `noindex`, and robots/sitemap/llms URLs have the correct content types.
   Confirm `/api/...` rewrites still work. Do not add a catch-all SPA rewrite
   that turns missing pages into successful copies of the homepage.
3. Validate the emitted JSON-LD with Schema.org's validator. A lack of Google
   rich-result eligibility is not itself a schema error. Exora does not claim
   review stars or unsupported rich-result features.
4. Check Vercel firewall, bot protection and any CDN for challenges or denied
   requests from search/retrieval crawlers. Use each provider's published
   verification guidance and IP ranges rather than trusting a user-agent alone.
5. Track Search Console impressions, clicks, indexing and Core Web Vitals;
   review Bing coverage and actual referred visits from AI services. Compare
   changes over time after recrawling, rather than treating a single chatbot
   response as an SEO test. Existing Vercel telemetry loads after the app settles.
6. Keep sources, features and guide copy current. Share useful demonstrations
   and source-linked educational material through channels the project owns;
   seek authentic mentions and links instead of buying links or mass-producing
   keyword pages. Publish new pages when they add a useful, distinct resource.
