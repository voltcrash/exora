# Catalog refresh operations

## Production design

The complete NASA catalog synchronization must not run in the deployed API function. The function
has a 30-second maximum duration, while the archive request used by `db:sync` alone has a 60-second
timeout. Normalization and the transactional, batched PostgreSQL write happen after that request, so
raising or consuming the whole function duration would still leave no reliable completion margin.

Production uses a two-stage scheduled path instead:

1. Vercel Cron sends a daily `GET /api/internal/catalog-refresh` request. Vercel supplies
   `Authorization: Bearer <CRON_SECRET>`; the route rejects the request unless the configured secret
   is present and matches.
2. The route does no catalog work. It sends a `catalog-refresh` repository-dispatch event to the
   `voltcrash/exora` GitHub repository and returns `202 Accepted` after GitHub accepts the event.
3. The GitHub Actions catalog-refresh workflow checks out the default branch, installs the locked
   Vite+ workspace, applies migrations, and runs `vp run db:sync` on a runner whose lifetime is not
   coupled to an HTTP request.

Configure these production secrets:

- Vercel `CRON_SECRET`: a random value of at least 16 characters. It authenticates Vercel's inbound
  cron request.
- Vercel `CATALOG_SYNC_GITHUB_TOKEN`: a fine-grained GitHub token able to create repository-dispatch
  events for `voltcrash/exora`. It authenticates the short outbound dispatch request.
- GitHub Actions `CATALOG_DATABASE_URL`: the pooled production PostgreSQL connection string used by
  migrations and synchronization. It never passes through the public API function.

The endpoint is intentionally absent from the public OpenAPI document. Its response is `no-store`,
and authentication failures do not reveal whether either server-side secret is missing or wrong.

## Consistency and concurrency

The existing catalog safety properties remain the write boundary:

- A normalized payload below the minimum catalog size is rejected before a transaction starts.
- All batches, stale-row deletion, and the successful-run record share one PostgreSQL transaction.
  A fetch, validation, batch, delete, or run-log failure leaves the previously published catalog
  unchanged.
- `ON CONFLICT (id) DO UPDATE` makes repeated deliveries idempotent. `last_seen_at` uses `GREATEST`
  so a delayed run cannot move a record's observation time backwards.
- A transaction-scoped PostgreSQL advisory lock serializes overlapping workers. Only NASA rows not
  observed by the completed run are removed; rows belonging to other archives are not candidates.

## Failure and retry behavior

The trigger fails with a non-2xx response when GitHub does not accept the dispatch. Vercel records
that failed cron invocation; an operator can retry from the GitHub Actions **Catalog refresh**
workflow with `workflow_dispatch` after correcting credentials or an upstream incident.

The worker retries the complete synchronization up to three times with increasing delays. This is
safe because an unsuccessful database attempt rolls back and a repeated successful attempt is an
idempotent upsert. The workflow has a bounded timeout and does not cancel a running refresh when a
duplicate dispatch arrives. PostgreSQL serialization remains the final concurrency guard.

NASA failures before the transaction preserve the old catalog. Database failures during any batch,
stale-row deletion, or run logging roll back the transaction and preserve the old catalog. A
minimum-size refusal is treated as a hard upstream-data warning: retries may recover from a
transient partial response, but no undersized result is published.

## Rollback and recovery

Application rollback is a normal deployment rollback because the schema change for this design is
additive-free. Pausing or removing the Vercel cron stops new dispatches without affecting reads.
Disabling the GitHub workflow stops workers already queued; a transaction already in progress is
allowed to finish or is rolled back by PostgreSQL if its connection is terminated.

The sync does not retain row history, so reverting a successfully published NASA snapshot requires
restoring the database from the provider's point-in-time backup. Prefer correcting the worker and
running it again: the next complete archive snapshot restores changed rows and removes records that
are genuinely stale. Confirm recovery through the workflow result and the newest
`catalog_sync_runs` row before re-enabling the schedule.

## Cache behavior

Public API data uses separate cache policies for browsers and shared CDNs. Browsers receive a short
`Cache-Control: public, max-age=...` lifetime so navigation does not pin an old catalog for hours.
`CDN-Cache-Control` gives Vercel and any downstream shared cache the longer freshness,
`stale-while-revalidate`, and `stale-if-error` windows appropriate to each data source. Internal
scheduled responses and errors use `no-store`.
