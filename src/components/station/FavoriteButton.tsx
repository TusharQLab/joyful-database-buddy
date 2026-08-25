import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  addFavorite,
  favoriteIdsQueryOptions,
  favoriteStationsQueryOptions,
  removeFavorite,
} from "@/lib/favorites";

export function FavoriteButton({
  stationId,
  size = "sm",
  className,
}: {
  stationId: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: ids, isPending } = useQuery({
    ...favoriteIdsQueryOptions,
    enabled: Boolean(user),
  });

  const saved = Boolean(ids?.includes(stationId));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to save stations.");
      if (saved) await removeFavorite(stationId);
      else await addFavorite(stationId, user.id);
      return !saved;
    },
    onMutate: async () => {
      // Optimistic toggle so the button state flips immediately.
      await queryClient.cancelQueries({ queryKey: favoriteIdsQueryOptions.queryKey });
      const previous = queryClient.getQueryData<string[]>(favoriteIdsQueryOptions.queryKey);
      queryClient.setQueryData<string[]>(favoriteIdsQueryOptions.queryKey, (current) => {
        const list = current ?? [];
        return saved ? list.filter((id) => id !== stationId) : [...list, stationId];
      });
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(favoriteIdsQueryOptions.queryKey, context.previous);
      }
      toast.error(error instanceof Error ? error.message : "Couldn't update your saved stations.");
    },
    onSuccess: (nowSaved) => {
      toast.success(nowSaved ? "Saved to My Stations" : "Removed from My Stations");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoriteIdsQueryOptions.queryKey });
      queryClient.invalidateQueries({ queryKey: favoriteStationsQueryOptions.queryKey });
    },
  });

  const busy = mutation.isPending || (Boolean(user) && isPending);

  return (
    <Button
      type="button"
      variant={saved ? "default" : "outline"}
      size={size}
      className={className}
      disabled={busy || !user}
      aria-pressed={saved}
      aria-label={saved ? "Remove from My Stations" : "Save to My Stations"}
      onClick={() => mutation.mutate()}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Star className={`size-4 ${saved ? "fill-current" : ""}`} aria-hidden="true" />
      )}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
