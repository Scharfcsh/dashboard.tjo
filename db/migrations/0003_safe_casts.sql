-- Casts that return NULL instead of failing a whole job on one bad property value.
CREATE OR REPLACE FUNCTION try_int(v text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN v::numeric::integer;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION try_timestamptz(v text) RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN v::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$$;
