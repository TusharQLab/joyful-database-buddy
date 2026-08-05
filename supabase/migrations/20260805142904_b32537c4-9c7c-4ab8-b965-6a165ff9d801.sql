
-- Reusable demo simulator: nudges ~15% of stations per call so changes look natural.
CREATE OR REPLACE FUNCTION public.simulate_station_activity(p_fraction double precision DEFAULT 0.15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH picked AS (
    SELECT station_id
    FROM public.live_status
    WHERE random() < greatest(0.01, least(1.0, p_fraction))
  ), upd AS (
    UPDATE public.live_status ls
    SET
      -- power rarely toggles (mostly ON)
      power_status = CASE WHEN random() < 0.05 THEN NOT ls.power_status ELSE ls.power_status END,
      -- availability flips occasionally
      cng_available = CASE WHEN random() < 0.20 THEN NOT ls.cng_available ELSE ls.cng_available END,
      petrol_available = CASE WHEN random() < 0.10 THEN NOT ls.petrol_available ELSE ls.petrol_available END,
      diesel_available = CASE WHEN random() < 0.10 THEN NOT ls.diesel_available ELSE ls.diesel_available END,
      -- queue drifts up/down instead of jumping randomly
      queue_minutes = greatest(0, least(45,
        coalesce(ls.queue_minutes, 5) + (floor(random() * 13) - 6)::int
      )),
      updated_at = now()
    FROM picked p
    WHERE ls.station_id = p.station_id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  -- keep data coherent: no fuel available while power is off
  UPDATE public.live_status
  SET cng_available = false, petrol_available = false, diesel_available = false, queue_minutes = NULL
  WHERE power_status = false
    AND (cng_available OR petrol_available OR diesel_available OR queue_minutes IS NOT NULL);

  RETURN v_count;
END;
$$;

-- Reset helper for development: puts every station back to a believable baseline.
CREATE OR REPLACE FUNCTION public.reset_demo_live_status()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH upd AS (
    UPDATE public.live_status ls
    SET
      power_status = (random() > 0.06),
      cng_available = (random() > 0.30),
      petrol_available = (random() > 0.08),
      diesel_available = (random() > 0.12),
      queue_minutes = floor(random() * 46)::int,
      updated_at = now() - (floor(random() * 90) || ' minutes')::interval
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  UPDATE public.live_status
  SET cng_available = false, petrol_available = false, diesel_available = false, queue_minutes = NULL
  WHERE power_status = false;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.simulate_station_activity(double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_demo_live_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_station_activity(double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_demo_live_status() TO service_role;
