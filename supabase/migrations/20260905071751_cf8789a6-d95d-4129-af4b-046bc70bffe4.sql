-- 1. Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'driver');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Station ownership: one station per manager
CREATE TABLE public.station_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  approved boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX station_managers_station_id_idx ON public.station_managers(station_id);

GRANT SELECT ON public.station_managers TO authenticated;
GRANT ALL ON public.station_managers TO service_role;
ALTER TABLE public.station_managers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_station_managers_updated_at
  BEFORE UPDATE ON public.station_managers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.manages_station(_user_id uuid, _station_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.station_managers
    WHERE user_id = _user_id
      AND station_id = _station_id
      AND approved = true
  )
$$;

CREATE POLICY "Managers can view their own assignment"
  ON public.station_managers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage station assignments"
  ON public.station_managers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Future confidence-engine data
CREATE TABLE public.station_confidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL UNIQUE REFERENCES public.stations(id) ON DELETE CASCADE,
  confidence_score numeric(5,2) NOT NULL DEFAULT 0,
  report_count integer NOT NULL DEFAULT 0,
  agreement_rate numeric(5,2),
  last_report_at timestamptz,
  last_calculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.station_confidence TO authenticated;
GRANT SELECT ON public.station_confidence TO anon;
GRANT ALL ON public.station_confidence TO service_role;
ALTER TABLE public.station_confidence ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_station_confidence_updated_at
  BEFORE UPDATE ON public.station_confidence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Station confidence is viewable by everyone"
  ON public.station_confidence FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can manage station confidence"
  ON public.station_confidence FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Managers may edit only their own station (existing public read policy untouched)
GRANT UPDATE ON public.stations TO authenticated;

CREATE POLICY "Managers can update their assigned station"
  ON public.stations FOR UPDATE TO authenticated
  USING (public.manages_station(auth.uid(), id))
  WITH CHECK (public.manages_station(auth.uid(), id));
