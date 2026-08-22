BEGIN;

-- Where the host system sits on the sky, in ICRS degrees, straight from pscomppars' ra/dec.
-- Together with distance_parsecs this fixes the system's actual position in the galaxy, which is
-- what the renderer needs in order to draw the real sky as seen from a world orbiting there
-- rather than a generated one. Left null until the next catalog sync refills them.
ALTER TABLE exoplanets
  ADD COLUMN IF NOT EXISTS right_ascension_degrees double precision,
  ADD COLUMN IF NOT EXISTS declination_degrees double precision;

INSERT INTO schema_migrations (version)
VALUES ('0003_planet_sky_position')
ON CONFLICT (version) DO NOTHING;

COMMIT;
