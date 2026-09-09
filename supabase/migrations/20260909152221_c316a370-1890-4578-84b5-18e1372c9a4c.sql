DROP TRIGGER IF EXISTS recalculate_live_status_after_report ON public.reports;

CREATE OR REPLACE FUNCTION public.recompute_status_after_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_station_status(NEW.station_id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_status_after_report() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER recompute_status_after_report
AFTER INSERT OR UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.recompute_status_after_report();