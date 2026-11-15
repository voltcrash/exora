# Cloudflare Workers deployment

Exora deploys one `exora` Worker at <https://exora.voltcrash.com>. Workers Static Assets
serves the website, discovery pages, fonts, textures and service worker; only `/api/*`
starts the Hono Worker. Production uses the custom domain, with `workers.dev` and
version preview URLs disabled. No D1, KV, Queues or R2 binding is needed.

## Local development and validation

Use Node.js 26 LTS and Vite+:

```sh
vp install --frozen-lockfile
vp run dev
```

The local API server runs on Node and the website uses Vite's `/api` proxy. To test the
production build in the local Workers runtime instead:

```sh
vp run -r build
vp run deploy:check
vp run preview
```

Wrangler serves the Worker and static assets together at <http://127.0.0.1:8787>.
Check `/`, `/explore/`, `/api/health`, a planet API response, static security headers,
and an unknown path's 404. `vp run preview` never publishes to Cloudflare.

```sh
vp check
vp test
vp run -r test
vp run quality:assets
vp exec --filter website -- playwright install chromium
vp run website#test:browser:desktop
```

Wrangler is a workspace development dependency installed through Vite+ and recorded
in the lockfile. CI, local dry-runs and deployments use that same version.

## Account and GitHub configuration

The `voltcrash.com` zone must be active in the Cloudflare account hosting Exora.
Create a Cloudflare account API token restricted to that account and zone with:

| Scope   | Permission       | Access       |
| ------- | ---------------- | ------------ |
| Account | Workers Scripts  | Write / Edit |
| Account | Account Settings | Read         |
| Zone    | Zone             | Read         |
| Zone    | Workers Routes   | Write / Edit |

DNS Edit is needed only for a manual DNS cutover. Normal releases need no database
or object-storage permissions. Avoid IP restrictions for GitHub-hosted runners.
See Cloudflare's [account API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/)
and [permission reference](https://developers.cloudflare.com/fundamentals/api/reference/permissions/).

Configure the token as a secret in the existing `Production` GitHub environment and
the account ID as an Actions variable:

```sh
gh secret set CLOUDFLARE_API_TOKEN --env Production
gh variable set CLOUDFLARE_ACCOUNT_ID
```

Both inputs can also live in the `Production` environment. A repository-level token
secret is supported; an environment secret takes precedence. The account ID is read
from `vars.CLOUDFLARE_ACCOUNT_ID`, not from a secret. Missing inputs fail the release
before dependencies are installed. Do not commit credentials.

For iPhone AR, set `VITE_VARIANT_LAUNCH_KEY` as a repository or `Production` environment
variable and authorize `exora.voltcrash.com` in Variant Launch. It is a public build-time
project key, not a Worker secret. See [iPhone AR](iphone-ar.md).

For a manual deployment, provide `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in
the shell environment, then run `vp run deploy`. Prefer the GitHub release workflow
so successful Quality checks gate every production release.

## Continuous deployment

The [Quality workflow](../.github/workflows/quality.yml) checks pull requests and
pushes to `main`, including browser journeys and a Wrangler dry-run. Quality has no
Cloudflare deployment credentials.

The [Production deployment workflow](../.github/workflows/production-release.yml),
adapted from Onyx, runs after successful main-push Quality or a manual retry on `main`.
It checks out the exact validated commit and requires that commit's latest main-push
Quality run to have completed successfully. Pull request, fork, manual Quality, failed,
cancelled and still-running Quality runs cannot authorize a release.

Releases use the `Production` environment and run serially without cancelling an
active upload. The workflow builds all workspaces once, validates the bundle with
Wrangler's dry-run, and checks the latest `main` SHA immediately before deployment.
A superseded snapshot is skipped so delayed Quality cannot roll production back.
The release deploys that build without rebuilding. It creates no numbered GitHub
release and does not change the application version.

After fixing credentials or a transient release failure, retry without an empty commit:

```sh
gh workflow run production-release.yml --ref main
```

The retry still requires successful **push** Quality for that exact commit. If Quality
failed, rerun its main-push run first. The production summary links to the validated
Quality run or records that the snapshot was superseded. The `Production` environment
records deployment history.

## Moving the existing hostname

Keep `exora.voltcrash.com`: browser storage and offline caches belong to the origin.
Record the existing hosting and DNS configuration before cutover.

1. Verify the build in the local Workers runtime and configure the GitHub inputs above.
2. Record the old DNS record and last deployment. Remove an existing hosting CNAME for
   **only** `exora.voltcrash.com` before the Worker claims its custom domain. Leave other
   hostnames alone. Cloudflare cannot attach a Worker custom domain over a CNAME.
3. Run the production release. Wrangler's custom-domain declaration provisions the
   Worker DNS record and certificate. Restore the saved DNS record if cutover fails.
4. Verify HTTPS, readable discovery pages, `/api/health`, planet and star reads, security
   headers, the service worker and offline reload. Use the [search discovery checks](search-discovery.md#after-deployment)
   and the physical [iPhone AR smoke test](iphone-ar.md).
5. Disconnect the previous host's Git integration and domain association after Workers
   is verified. Keep the old deployment available until the cutover is stable.

`_headers` applies to static assets; Hono sets API headers itself. Keep `/api/*` routed
to the Worker and other requests routed to static assets. Do not add a general cache
rule that overrides the Worker's response caching policy.

## Operations

```sh
vp exec wrangler deployments list
vp exec wrangler versions list
vp exec wrangler tail
```

A code rollback uses `vp exec wrangler rollback <version-id>` with a previously verified
version. It does not restore DNS or the previous host; use the saved configuration for
that. See [API rate limiting and caching](api-rate-limiting-and-caching.md) for runtime
limits and [deployment security](deployment-security.md) for response policy.
