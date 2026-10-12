import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getManagerAccess } from "@/lib/manager.client";

/**
 * Keeps managers inside the manager area. Drivers are unaffected: the query
 * resolves with isManager=false and nothing happens.
 */
export function useManagerGuard() {
  const navigate = useNavigate();
  const fetchAccess = getManagerAccess;
  const { data } = useQuery({
    queryKey: ["manager-access"],
    queryFn: () => fetchAccess(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (data?.isManager) navigate({ to: "/manager", replace: true });
  }, [data?.isManager, navigate]);
}
