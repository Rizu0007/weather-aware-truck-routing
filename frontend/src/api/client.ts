import type { ApiErrorBody } from "@/types/api";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
// A plan takes ~5-10 s; ~40 s if Django is retrying a slow provider.
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRY_AFTER_S = 60;

export type ApiErrorKind =
  | "validation" // 400: fix the input
  | "no_route" // 422: places not connected by road
  | "beyond_forecast" // 422: departure too far ahead
  | "busy" // 429 (our rate limit) or 503 (a provider's): wait, then retry
  | "provider" // 502: a routing/weather/places service failed
  | "network" // no response at all
  | "timeout"
  | "server"; // anything else, including non-JSON proxy pages

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, or 0 when no response arrived. */
  readonly status: number;
  readonly extra: Record<string, unknown>;
  /** Seconds to wait before retrying ("busy" only). */
  readonly retryAfterS: number | undefined;

  constructor(
    kind: ApiErrorKind,
    message: string,
    status = 0,
    extra: Record<string, unknown> = {},
    retryAfterS?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.extra = extra;
    this.retryAfterS = retryAfterS;
  }

  /** First message per field, from a 400 body: { origin: "This field is required." }. */
  get fieldErrors(): Record<string, string> {
    const fields = this.extra.fields;
    if (typeof fields !== "object" || fields === null) return {};
    return Object.fromEntries(
      Object.entries(fields).map(([field, value]) => [field, firstMessage(value)]),
    );
  }

  /** ISO time from a "beyond_forecast" error: the latest departure that still works. */
  get latestDeparture(): string | undefined {
    const value = this.extra.latest_departure;
    return typeof value === "string" ? value : undefined;
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function request<T>(
  path: string,
  { method = "GET", body, signal, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause; // cancelled by the caller (e.g. a newer search)
    if (timeout.aborted) {
      throw new ApiError("timeout", "The server took too long to answer. Please try again.");
    }
    throw new ApiError("network", "Can't reach the server. Check your connection and try again.");
  }

  const data: unknown = await response.json().catch(() => undefined);
  if (response.ok && data !== undefined) return data as T;
  throw toApiError(response, data);
}

function toApiError(response: Response, data: unknown): ApiError {
  const { status } = response;
  if (!isErrorBody(data)) {
    // A proxy or platform page (e.g. a 504 from the host), not our API.
    return new ApiError(
      "server",
      "The server is unavailable right now. Please try again shortly.",
      status,
    );
  }
  const { message, extra } = data;
  switch (true) {
    case status === 400:
      return new ApiError("validation", message, status, extra);
    case status === 422:
      return new ApiError(
        "latest_departure" in extra ? "beyond_forecast" : "no_route",
        message,
        status,
        extra,
      );
    case status === 429 || status === 503:
      return new ApiError("busy", message, status, extra, retryAfter(response, extra));
    case status === 502:
      return new ApiError("provider", message, status, extra);
    default:
      return new ApiError("server", message, status, extra);
  }
}

function retryAfter(response: Response, extra: Record<string, unknown>): number {
  const fromBody = extra.retry_after;
  if (typeof fromBody === "number") return fromBody;
  const fromHeader = Number(response.headers.get("Retry-After")); // DRF's throttle sets it
  return Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : DEFAULT_RETRY_AFTER_S;
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApiErrorBody).message === "string" &&
    typeof (value as ApiErrorBody).extra === "object"
  );
}

function firstMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstMessage(value[0]);
  // Nested serializer errors, e.g. { origin: { lat: ["..."] } }.
  if (typeof value === "object" && value !== null) {
    return firstMessage(Object.values(value)[0]);
  }
  return "Invalid value.";
}
