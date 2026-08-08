DROP POLICY IF EXISTS "Reports are viewable by everyone" ON public.reports;
REVOKE SELECT ON public.reports FROM anon;
CREATE POLICY "Authenticated users can view reports" ON public.reports FOR SELECT TO authenticated USING (true);