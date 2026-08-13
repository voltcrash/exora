BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS exoplanets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  host_star text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('gas-giant', 'ice-giant', 'rocky', 'unknown')),
  radius_jupiter double precision,
  mass_jupiter double precision,
  radius_earth double precision,
  mass_earth double precision,
  equilibrium_temperature_kelvin double precision,
  orbital_period_days double precision,
  semi_major_axis_au double precision,
  distance_parsecs double precision,
  discovery_year integer,
  discovery_method text NOT NULL,
  host_spectral_type text,
  source_archive text NOT NULL DEFAULT 'NASA Exoplanet Archive',
  source_table text NOT NULL DEFAULT 'pscomppars',
  retrieved_on date NOT NULL,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exoplanets_name_trgm_idx
  ON exoplanets USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS exoplanets_kind_idx ON exoplanets (kind);
CREATE INDEX IF NOT EXISTS exoplanets_host_star_idx ON exoplanets (host_star);

CREATE TABLE IF NOT EXISTS catalog_sync_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  fetched_count integer NOT NULL,
  upserted_count integer NOT NULL,
  removed_count integer NOT NULL,
  source_archive text NOT NULL DEFAULT 'NASA Exoplanet Archive'
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version)
VALUES ('0001_exoplanet_catalog')
ON CONFLICT (version) DO NOTHING;

COMMIT;
