CREATE TABLE public.status_confidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  data_type text NOT NULL CHECK (data_type IN ('fuel','power','queue_level','wait_time')),
  value text,
  numeric_value numeric,
  confidence numeric NOT NULL DEFAULT 0,
  report_count integer NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, data_type)
);

GRANT SELECT ON public.status_confidence TO anon;
GRANT SELECT ON public.status_confidence TO authenticated;
GRANT ALL ON public.status_confidence TO service_role;

ALTER TABLE public.status_confidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Status confidence is viewable by everyone"
  ON public.status_confidence FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins can manage status confidence"
  ON public.status_confidence FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_status_confidence_updated_at
  BEFORE UPDATE ON public.status_confidence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Freshness decay: 0-30m full, 30-60m 75%, 1-3h 50%, 3-6h 25%, older = expired.
CREATE OR REPLACE FUNCTION public.report_freshness(p_ts timestamptz)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_ts IS NULL THEN 0
    WHEN now() - p_ts <= interval '30 minutes' THEN 1.0
    WHEN now() - p_ts <= interval '60 minutes' THEN 0.75
    WHEN now() - p_ts <= interval '3 hours' THEN 0.5
    WHEN now() - p_ts <= interval '6 hours' THEN 0.25
    ELSE 0
  END::numeric
$$;

-- Newest non-expired report per (user, source) with its source + freshness weights.
CREATE OR REPLACE FUNCTION public.weighted_reports(p_station_id uuid)
RETURNS TABLE (
  user_id uuid,
  source text,
  fuel_status text,
  queue_status text,
  queue_minutes integer,
  power_status boolean,
  fresh numeric,
  w_avail numeric,
  w_queue numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT DISTINCT ON (r.user_id, r.source)
      r.user_id, r.source, r.fuel_status, r.queue_status, r.queue_minutes, r.power_status,
      GREATEST(r.created_at, COALESCE(r.updated_at, r.created_at)) AS at
    FROM public.reports r
    WHERE r.station_id = p_station_id
    ORDER BY r.user_id, r.source, GREATEST(r.created_at, COALESCE(r.updated_at, r.created_at)) DESC
  )
  SELECT l.user_id, l.source, l.fuel_status, l.queue_status, l.queue_minutes, l.power_status,
         public.report_freshness(l.at) AS fresh,
         CASE WHEN l.source = 'manager' THEN 0.9 ELSE 0.1 END::numeric AS w_avail,
         CASE WHEN l.source = 'manager' THEN 0.2 ELSE 0.8 END::numeric AS w_queue
  FROM latest l
  WHERE public.report_freshness(l.at) > 0
$$;

REVOKE ALL ON FUNCTION public.weighted_reports(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.weighted_reports(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.report_freshness(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_freshness(timestamptz) TO anon, authenticated, service_role;

-- Confidence engine: the ONLY writer of calculated live_status.
CREATE OR REPLACE FUNCTION public.recompute_station_status(p_station_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_avail numeric;
  v_total_queue numeric;
  v_fuel_value text; v_fuel_score numeric; v_fuel_n integer;
  v_power_value boolean; v_power_score numeric; v_power_n integer;
  v_queue_value text; v_queue_score numeric; v_queue_n integer;
  v_wait numeric; v_wait_n integer; v_wait_conf numeric;
  v_fuel_ok boolean;
  v_queue_minutes integer;
BEGIN
  SELECT COALESCE(SUM(fresh * w_avail), 0), COALESCE(SUM(fresh * w_queue), 0)
    INTO v_total_avail, v_total_queue
  FROM public.weighted_reports(p_station_id);

  IF COALESCE(v_total_avail, 0) = 0 AND COALESCE(v_total_queue, 0) = 0 THEN
    RETURN; -- no usable reports: leave existing live_status untouched
  END IF;

  SELECT fuel_status, SUM(fresh * w_avail), COUNT(*)
    INTO v_fuel_value, v_fuel_score, v_fuel_n
  FROM public.weighted_reports(p_station_id)
  GROUP BY fuel_status ORDER BY 2 DESC, 3 DESC LIMIT 1;

  SELECT power_status, SUM(fresh * w_avail), COUNT(*)
    INTO v_power_value, v_power_score, v_power_n
  FROM public.weighted_reports(p_station_id)
  GROUP BY power_status ORDER BY 2 DESC, 3 DESC LIMIT 1;

  SELECT queue_status, SUM(fresh * w_queue), COUNT(*)
    INTO v_queue_value, v_queue_score, v_queue_n
  FROM public.weighted_reports(p_station_id)
  WHERE queue_minutes IS NOT NULL
  GROUP BY queue_status ORDER BY 2 DESC, 3 DESC LIMIT 1;

  SELECT ROUND(SUM(fresh * w_queue * queue_minutes) / NULLIF(SUM(fresh * w_queue), 0)),
         COUNT(*), COALESCE(SUM(fresh * w_queue), 0) / NULLIF(v_total_queue, 0)
    INTO v_wait, v_wait_n, v_wait_conf
  FROM public.weighted_reports(p_station_id)
  WHERE queue_minutes IS NOT NULL;

  v_power_value := COALESCE(v_power_value, true);
  v_fuel_ok := v_power_value AND COALESCE(v_fuel_value, 'available') <> 'unavailable';
  v_queue_minutes := CASE WHEN v_power_value THEN v_wait::integer ELSE NULL END;

  INSERT INTO public.live_status (
    station_id, cng_available, petrol_available, diesel_available,
    queue_minutes, power_status, updated_at
  )
  VALUES (p_station_id, v_fuel_ok, v_fuel_ok, v_fuel_ok, v_queue_minutes, v_power_value, now())
  ON CONFLICT (station_id) DO UPDATE SET
    cng_available = EXCLUDED.cng_available,
    petrol_available = EXCLUDED.petrol_available,
    diesel_available = EXCLUDED.diesel_available,
    queue_minutes = EXCLUDED.queue_minutes,
    power_status = EXCLUDED.power_status,
    updated_at = now();

  INSERT INTO public.status_confidence (station_id, data_type, value, numeric_value, confidence, report_count, calculated_at)
  VALUES
    (p_station_id, 'fuel', v_fuel_value, NULL,
      COALESCE(v_fuel_score, 0) / NULLIF(v_total_avail, 0), COALESCE(v_fuel_n, 0), now()),
    (p_station_id, 'power', CASE WHEN v_power_value THEN 'on' ELSE 'off' END, NULL,
      COALESCE(v_power_score, 0) / NULLIF(v_total_avail, 0), COALESCE(v_power_n, 0), now()),
    (p_station_id, 'queue_level', v_queue_value, NULL,
      COALESCE(v_queue_score, 0) / NULLIF(v_total_queue, 0), COALESCE(v_queue_n, 0), now()),
    (p_station_id, 'wait_time', NULL, v_wait,
      COALESCE(v_wait_conf, 0), COALESCE(v_wait_n, 0), now())
  ON CONFLICT (station_id, data_type) DO UPDATE SET
    value = EXCLUDED.value,
    numeric_value = EXCLUDED.numeric_value,
    confidence = COALESCE(EXCLUDED.confidence, 0),
    report_count = EXCLUDED.report_count,
    calculated_at = EXCLUDED.calculated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_station_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_station_status(uuid) TO authenticated, service_role;

-- Reports stay source data; they only trigger the engine.
CREATE OR REPLACE FUNCTION public.recalculate_live_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_station_status(NEW.station_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_all_station_status()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_count integer := 0;
BEGIN
  FOR v_id IN SELECT DISTINCT station_id FROM public.reports LOOP
    PERFORM public.recompute_station_status(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_all_station_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_station_status() TO service_role;