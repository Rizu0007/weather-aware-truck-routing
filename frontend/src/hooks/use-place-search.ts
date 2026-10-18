import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";

import { ApiError } from "@/api/client";
import { searchPlaces } from "@/api/endpoints";
import { queryKeys } from "@/api/query-keys";
import { MIN_PLACE_QUERY } from "@/constants/limits";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Place } from "@/types/api";

const DEBOUNCE_MS = 300;
const DAY = 24 * 60 * 60_000;

export interface PlaceSearch {
  /** False until the query is long enough to search. */
  active: boolean;
  places: Place[];
  /** Waiting for typing to pause, or for the server. */
  searching: boolean;
  error: string | null;
}

export function usePlaceSearch(query: string): PlaceSearch {
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const ready = debounced.length >= MIN_PLACE_QUERY;

  const search = useQuery({
    queryKey: queryKeys.places(debounced),
    // A newer query aborts the older request through `signal`.
    queryFn: ready ? ({ signal }) => searchPlaces(debounced, signal) : skipToken,
    staleTime: DAY,
    placeholderData: keepPreviousData, // keep showing results while the next ones load
  });

  const active = trimmed.length >= MIN_PLACE_QUERY;
  return {
    active,
    places: active ? (search.data ?? []) : [],
    searching: active && (trimmed !== debounced || search.isFetching),
    error: active && search.error ? errorMessage(search.error) : null,
  };
}

function errorMessage(error: Error): string {
  return error instanceof ApiError ? error.message : "Search failed. Please try again.";
}
