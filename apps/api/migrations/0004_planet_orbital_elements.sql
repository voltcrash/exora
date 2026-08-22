BEGIN;

-- The shape and tilt of each orbit, straight from pscomppars' pl_orbeccen / pl_orbincl.
-- With semi_major_axis_au and orbital_period_days already here, this is enough to draw a host
-- system as the set of orbits it actually is rather than as a list of sibling worlds.
--
-- Both are null far more often than they are not: a transit solution usually fixes neither, and
-- the archive leaves them empty rather than assuming a circle in a shared plane. So does this
-- column pair, and so does everything downstream — a renderer that needs a shape to draw anything
-- says out loud that it assumed one. Left null until the next catalog sync refills them.
ALTER TABLE exoplanets
  ADD COLUMN IF NOT EXISTS orbital_eccentricity double precision,
  ADD COLUMN IF NOT EXISTS orbital_inclination_degrees double precision;

INSERT INTO schema_migrations (version)
VALUES ('0004_planet_orbital_elements')
ON CONFLICT (version) DO NOTHING;

COMMIT;
