import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";

/** Aborts obsolete reads and ignores responses from a previous resource key. */
export function useResource<T>(path: string | null, revision = 0) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const latest = useRef(0);
  const previousPath = useRef<string | null>(null);
  useEffect(() => {
    const generation = ++latest.current;
    if (!path) {
      setData(undefined);
      setLoading(false);
      setError(undefined);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    if (previousPath.current !== path) setData(undefined);
    previousPath.current = path;
    void api<T>(path, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    })
      .then((value) => {
        if (generation === latest.current) setData(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted && generation === latest.current)
          setError(errorMessage(cause));
      })
      .finally(() => {
        if (generation === latest.current) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision, retry]);
  const refresh = useCallback(() => setRetry((value) => value + 1), []);
  return { data, loading, error, refresh };
}

/** EventSource reconnects natively; reconnect always triggers a full refresh. */
export function useLiveRevision(enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const events = new EventSource("/api/events", { withCredentials: true });
    const refresh = () => setRevision((value) => value + 1);
    events.addEventListener("update", refresh);
    events.onopen = () => {
      setConnected(true);
      refresh();
    };
    events.onerror = () => setConnected(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const fallback = window.setInterval(refresh, 30_000);
    return () => {
      events.close();
      window.clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
  return {
    revision,
    connected,
    invalidate: () => setRevision((value) => value + 1),
  };
}
