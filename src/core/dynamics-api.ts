import type { DynamicsContext } from './types';

export class DynamicsApiError extends Error {
  constructor(message: string, public status = 0, public detail?: unknown) { super(message); }
}

/** Request options: fetch's, plus a time limit (default 45 s; long FetchXML runs pass more). */
export type ApiRequest = RequestInit & { timeoutMs?: number };

const DEFAULT_TIMEOUT = 45_000;
const THROTTLE_ATTEMPTS = 3;

/** Waits ms, rejecting at once when the signal aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
    const stop = () => { clearTimeout(timer); reject(abortError()); };
    signal?.addEventListener('abort', stop, { once: true });
  });
}

/** AbortSignal.any (Chromium 116+), with a fallback for older engines. */
export function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const signal of signals) { if (signal.aborted) { controller.abort(); break; } signal.addEventListener('abort', () => controller.abort(), { once: true }); }
  return controller.signal;
}

const abortError = () => Object.assign(new DynamicsApiError('The request was cancelled.', 0), { name: 'AbortError' });

/** Retry-After as delta-seconds or an HTTP date, kept between 0.5 s and 60 s (2 s when absent or unreadable). */
export function retryAfterMs(header: string | null, now = Date.now()): number {
  const seconds = Number(header); const date = header ? Date.parse(header) : NaN;
  const ms = header && Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(date) ? date - now : 2000;
  return Math.min(60_000, Math.max(500, ms));
}

export class DynamicsApi {
  private defaultSignal?: AbortSignal;
  // Shared by every withSignal() view (Object.create keeps this object): all callers back off together after a 429,
  // so Audit History's parallel lanes don't keep hitting a throttled server.
  private readonly throttle = { until: 0 };
  constructor(private context: () => Promise<DynamicsContext>) {}

  /** The same client with every request also tied to `signal` (an action run: aborted when the page navigates). */
  withSignal(signal: AbortSignal): DynamicsApi {
    const scoped = Object.create(this) as DynamicsApi; scoped.defaultSignal = signal; return scoped;
  }

  async request<T = unknown>(path: string, options: ApiRequest = {}): Promise<T> {
    const ctx = await this.context();
    if (!ctx.clientUrl) throw new DynamicsApiError('A supported Dynamics context was not found.');
    const url = /^https?:/i.test(path) ? path : `${ctx.clientUrl}/api/data/v9.2/${path.replace(/^\//, '')}`;
    const { timeoutMs = DEFAULT_TIMEOUT, ...init } = options;
    const method = (init.method ?? 'GET').toUpperCase();
    const callers = [init.signal, this.defaultSignal].filter((signal): signal is AbortSignal => Boolean(signal));
    const cancelled = callers.length > 1 ? anySignal(callers) : callers[0];
    for (let attempt = 1; ; attempt++) {
      if (cancelled?.aborted) throw abortError();
      const wait = this.throttle.until - Date.now(); if (wait > 0) await sleep(wait, cancelled);
      // A timer the tests can drive (fake timers), covering the response body as well as the headers.
      const timeout = new AbortController(); const timer = setTimeout(() => timeout.abort(), timeoutMs);
      const signal = cancelled ? anySignal([cancelled, timeout.signal]) : timeout.signal;
      let response: Response, text: string;
      try {
        response = await fetch(url, { credentials: 'same-origin', ...init, signal, headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...(init.headers ?? {}) } });
        text = response.status === 204 ? '' : await response.text();
      } catch (error) {
        if (cancelled?.aborted) throw abortError();
        if (timeout.signal.aborted) throw new DynamicsApiError('Dataverse did not respond in time.', 408);
        throw new DynamicsApiError(`Dataverse request failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally { clearTimeout(timer); }
      if (response.status === 429 && attempt < THROTTLE_ATTEMPTS) {
        this.throttle.until = Math.max(this.throttle.until, Date.now() + retryAfterMs(response.headers.get('Retry-After')) * attempt);
        continue;
      }
      if ([502, 503, 504].includes(response.status) && attempt === 1 && (method === 'GET' || method === 'HEAD')) { await sleep(1000, cancelled); continue; }
      let data: unknown = undefined;
      if (text) { try { data = JSON.parse(text); } catch { data = text; } }
      if (!response.ok) {
        const record = data && typeof data === 'object' ? data as Record<string, unknown> : undefined;
        const nested = record?.error as Record<string, unknown> | undefined;
        const message = typeof nested?.message === 'string' ? nested.message
          : response.status === 429 ? 'Dataverse is busy (too many requests). Try again in a minute.'
            : response.status === 414 || (response.status === 404 && typeof data === 'string' && url.length > 8000) ? 'The request is too long for Dataverse.'
              : `Dataverse request failed (${response.status}).`;
        throw new DynamicsApiError(message, response.status, data);
      }
      return data as T;
    }
  }

  get<T = unknown>(path: string, annotations = false, options: ApiRequest = {}): Promise<T> {
    return this.request<T>(path, { ...options, headers: { ...(annotations ? { Prefer: 'odata.include-annotations="*"' } : {}), ...(options.headers ?? {}) } });
  }
}
