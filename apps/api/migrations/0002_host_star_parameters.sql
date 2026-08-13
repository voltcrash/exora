BEGIN;

ALTER TABLE exoplanets
  ADD COLUMN IF NOT EXISTS host_temperature_kelvin double precision,
  ADD COLUMN IF NOT EXISTS host_radius_solar double precision,
  ADD COLUMN IF NOT EXISTS host_mass_solar double precision,
  ADD COLUMN IF NOT EXISTS host_luminosity_log_solar double precision;

INSERT INTO schema_migrations (version)
VALUES ('0002_host_star_parameters')
ON CONFLICT (version) DO NOTHING;

COMMIT;
