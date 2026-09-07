ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'driver';

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_source_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_source_check CHECK (source IN ('driver','manager'));

UPDATE public.reports SET source = 'driver' WHERE source IS NULL OR source NOT IN ('driver','manager');

DROP POLICY IF EXISTS "Users can insert their own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can update their own recent reports" ON public.reports;

CREATE POLICY "Drivers can insert their own reports"
ON public.reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND source = 'driver');

CREATE POLICY "Drivers can update their own recent reports"
ON public.reports FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND source = 'driver' AND created_at > (now() - '00:10:00'::interval))
WITH CHECK (auth.uid() = user_id AND source = 'driver');

CREATE POLICY "Managers can insert reports for their station"
ON public.reports FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND source = 'manager'
  AND public.manages_station(auth.uid(), station_id)
);

CREATE POLICY "Managers can update their own station reports"
ON public.reports FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  AND source = 'manager'
  AND public.manages_station(auth.uid(), station_id)
)
WITH CHECK (
  auth.uid() = user_id
  AND source = 'manager'
  AND public.manages_station(auth.uid(), station_id)
);

CREATE OR REPLACE FUNCTION public.recalculate_live_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  latest RECORD;
  v_fuel boolean;
  v_queue integer;
BEGIN
  -- Manager reports are stored as source data only; they never drive live_status.
  IF NEW.source <> 'driver' THEN
    RETURN NEW;
  END IF;

  SELECT r.*
    INTO latest
  FROM public.reports r
  WHERE r.station_id = NEW.station_id
    AND r.source = 'driver'
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT 1;

  IF latest IS NULL THEN
    RETURN NEW;
  END IF;

  v_fuel := latest.power_status AND latest.fuel_status <> 'unavailable';

  v_queue := COALESCE(
    latest.queue_minutes,
    CASE latest.queue_status
      WHEN 'none' THEN 0
      WHEN 'low' THEN 8
      WHEN 'moderate' THEN 22
      WHEN 'heavy' THEN 40
      ELSE NULL
    END
  );

  IF NOT latest.power_status THEN
    v_queue := NULL;
  END IF;

  INSERT INTO public.live_status (
    station_id, cng_available, petrol_available, diesel_available,
    queue_minutes, power_status, updated_at
  )
  VALUES (NEW.station_id, v_fuel, v_fuel, v_fuel, v_queue, latest.power_status, now())
  ON CONFLICT (station_id) DO UPDATE SET
    cng_available = EXCLUDED.cng_available,
    petrol_available = EXCLUDED.petrol_available,
    diesel_available = EXCLUDED.diesel_available,
    queue_minutes = EXCLUDED.queue_minutes,
    power_status = EXCLUDED.power_status,
    updated_at = now();

  RETURN NEW;
END;
$function$;