import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { vi } from "vitest";

/** A JSON Response, as the API would send it. */
export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

/** Replace fetch for one test; unmatched paths answer 404 so mistakes are loud. */
export function mockFetch(routes: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.split("?")[0];
    if (!(path in routes)) return jsonResponse({ message: `No mock for ${path}`, extra: {} }, 404);
    const route = routes[path];
    if (typeof route === "function") return (route as Handler)(url, init);
    return route instanceof Response ? route.clone() : jsonResponse(route);
  });
}

/** A fresh QueryClient per test (no retries, no shared cache) and its provider. */
export function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}
