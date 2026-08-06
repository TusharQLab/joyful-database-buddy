
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS fuel_status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS queue_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS queue_minutes integer,
  ADD COLUMN IF NOT EXISTS power_status boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.reports
  ADD CONSTRAINT reports_fuel_status_check CHECK (fuel_status IN ('available','limited','unavailable')),
  ADD CONSTRAINT reports_queue_status_check CHECK (queue_status IN ('none','low','moderate','heavy')),
  ADD CONSTRAINT reports_queue_minutes_check CHECK (queue_minutes IS NULL OR (queue_minutes >= 0 AND queue_minutes <= 120)),
  ADD CONSTRAINT reports_comment_check CHECK (comment IS NULL OR char_length(comment) <= 150);

CREATE INDEX IF NOT EXISTS reports_station_created_idx ON public.reports (station_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_user_station_created_idx ON public.reports (user_id, station_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT SELECT ON public.reports TO anon;
GRANT ALL ON public.reports TO service_role;

DROP POLICY IF EXISTS "Users can update their own recent reports" ON public.reports;
CREATE POLICY "Users can update their own recent reports"
ON public.reports FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND created_at > now() - interval '10 minutes')
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_report_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_reports_updated_at ON public.reports;
CREATE TRIGGER set_reports_updated_at
BEFORE UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.set_report_updated_at();

CREATE OR REPLACE FUNCTION public.recalculate_live_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest RECORD;
  v_fuel boolean;
  v_queue integer;
BEGIN
  SELECT r.*
    INTO latest
  FROM public.reports r
  WHERE r.station_id = NEW.station_id
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
$$;

DROP TRIGGER IF EXISTS recalculate_live_status_after_report ON public.reports;
CREATE TRIGGER recalculate_live_status_after_report
AFTER INSERT OR UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.recalculate_live_status();
