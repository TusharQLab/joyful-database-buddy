
-- STATIONS
CREATE TABLE public.stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  city text,
  fuel_types text[] NOT NULL DEFAULT '{}',
  open_time time,
  close_time time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stations TO anon;
GRANT SELECT ON public.stations TO authenticated;
GRANT ALL ON public.stations TO service_role;

ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stations are viewable by everyone"
  ON public.stations FOR SELECT
  USING (true);

-- LIVE STATUS
CREATE TABLE public.live_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL UNIQUE REFERENCES public.stations(id) ON DELETE CASCADE,
  cng_available boolean NOT NULL DEFAULT false,
  petrol_available boolean NOT NULL DEFAULT false,
  diesel_available boolean NOT NULL DEFAULT false,
  queue_minutes integer,
  power_status boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.live_status TO anon;
GRANT SELECT ON public.live_status TO authenticated;
GRANT ALL ON public.live_status TO service_role;

ALTER TABLE public.live_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live status is viewable by everyone"
  ON public.live_status FOR SELECT
  USING (true);

-- REPORTS
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_station_created ON public.reports (station_id, created_at DESC);

GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT SELECT ON public.reports TO anon;
GRANT ALL ON public.reports TO service_role;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports are viewable by everyone"
  ON public.reports FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own reports"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- FAVORITES
CREATE TABLE public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, station_id)
);

GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own favorites"
  ON public.favorites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add their own favorites"
  ON public.favorites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own favorites"
  ON public.favorites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_stations_updated_at
  BEFORE UPDATE ON public.stations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ensure every station has a live_status row
CREATE OR REPLACE FUNCTION public.create_live_status_for_station()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.live_status (station_id)
  VALUES (NEW.id)
  ON CONFLICT (station_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_live_status_after_station_insert
  AFTER INSERT ON public.stations
  FOR EACH ROW EXECUTE FUNCTION public.create_live_status_for_station();

-- Recalculate live_status from the latest report for that station
CREATE OR REPLACE FUNCTION public.recalculate_live_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest RECORD;
  v_cng boolean;
  v_petrol boolean;
  v_diesel boolean;
  v_queue integer;
  v_power boolean;
BEGIN
  SELECT r.status, r.created_at
    INTO latest
  FROM public.reports r
  WHERE r.station_id = NEW.station_id
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT 1;

  IF latest IS NULL THEN
    RETURN NEW;
  END IF;

  -- Simple placeholder mapping; refine later.
  IF latest.status = 'available' THEN
    v_cng := true; v_petrol := true; v_diesel := true; v_queue := 0; v_power := true;
  ELSIF latest.status = 'queue' THEN
    v_cng := true; v_petrol := true; v_diesel := true; v_queue := 15; v_power := true;
  ELSIF latest.status = 'closed' THEN
    v_cng := false; v_petrol := false; v_diesel := false; v_queue := NULL; v_power := true;
  ELSE
    v_cng := false; v_petrol := false; v_diesel := false; v_queue := NULL; v_power := true;
  END IF;

  INSERT INTO public.live_status (
    station_id, cng_available, petrol_available, diesel_available,
    queue_minutes, power_status, updated_at
  )
  VALUES (NEW.station_id, v_cng, v_petrol, v_diesel, v_queue, v_power, now())
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

CREATE TRIGGER recalculate_live_status_after_report
  AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_live_status();
