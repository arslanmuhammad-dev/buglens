import {
  BoundedBuffer,
  internalRequest,
  sanitizeUrl,
  safeMessage,
} from "@buglens/core";
export function collect(
  endpoint: string,
  host: HTMLElement,
  onUpdate: () => void = () => {},
) {
  const buffer = new BoundedBuffer();
  const cleanups: (() => void)[] = [];
  const add = (type: string, fn: EventListener) => {
    window.addEventListener(type, fn, true);
    cleanups.push(() => window.removeEventListener(type, fn, true));
  };
  const record = (data: object) => {
    try {
      buffer.push({ time: Date.now(), ...data });
      onUpdate();
    } catch {
      /* Collection must never affect host. */
    }
  };
  add("click", (e) => {
    const target = e.target;
    if (
      !(target instanceof Element) ||
      e.composedPath().includes(host) ||
      target.closest("[data-buglens-ignore],[data-buglens-private]")
    )
      return;
    record({
      type: "click",
      tag: target.tagName.toLowerCase(),
      role: (target.getAttribute("role") || "").slice(0, 40),
    });
  });
  add("error", (e) =>
    record({
      type: "error",
      message: safeMessage((e as ErrorEvent).message || "Script error"),
    }),
  );
  add("unhandledrejection", (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    record({
      type: "rejection",
      message: safeMessage(
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection",
      ),
    });
  });
  const navigation = () =>
    record({ type: "navigation", url: sanitizeUrl(location.href) });
  add("popstate", navigation);
  add("hashchange", navigation);
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    const wrapped: typeof original = function (this: History, ...args) {
      const result = original.apply(this, args);
      navigation();
      return result;
    };
    history[method] = wrapped;
    cleanups.push(() => {
      if (history[method] === wrapped) history[method] = original;
    });
  }
  const originalFetch = window.fetch;
  const wrappedFetch: typeof fetch = async function (
    this: Window,
    input,
    init,
  ) {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const ignored = internalRequest(raw, endpoint);
    const start = performance.now();
    try {
      const response = await originalFetch.call(this, input, init);
      if (!ignored && !response.ok)
        record({
          type: "request",
          url: sanitizeUrl(raw, location.href),
          method: (
            init?.method || (input instanceof Request ? input.method : "GET")
          ).slice(0, 10),
          status: response.status,
          duration: Math.round(performance.now() - start),
        });
      return response;
    } catch (e) {
      if (!ignored)
        record({
          type: "request",
          url: sanitizeUrl(raw, location.href),
          method: (init?.method || "GET").slice(0, 10),
          status: 0,
          duration: Math.round(performance.now() - start),
        });
      throw e;
    }
  };
  window.fetch = wrappedFetch;
  cleanups.push(() => {
    if (window.fetch === wrappedFetch) window.fetch = originalFetch;
  });
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  const meta = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
  const listeners = new Map<XMLHttpRequest, () => void>();
  const wrappedOpen = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async = true,
    username?: string | null,
    password?: string | null,
  ) {
    meta.set(this, { method: method.slice(0, 10), url: String(url) });
    return open.call(this, method, url, async, username, password);
  };
  const wrappedSend = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const data = meta.get(this),
      start = performance.now();
    if (data && !internalRequest(data.url, endpoint)) {
      const done = () => {
        this.removeEventListener("loadend", done);
        listeners.delete(this);
        if (this.status === 0 || this.status >= 400)
          record({
            type: "request",
            url: sanitizeUrl(data.url, location.href),
            method: data.method,
            status: this.status,
            duration: Math.round(performance.now() - start),
          });
      };
      listeners.set(this, done);
      this.addEventListener("loadend", done);
    }
    return send.call(this, body);
  };
  XMLHttpRequest.prototype.open = wrappedOpen as typeof open;
  XMLHttpRequest.prototype.send = wrappedSend;
  cleanups.push(() => {
    if (XMLHttpRequest.prototype.open === wrappedOpen)
      XMLHttpRequest.prototype.open = open;
    if (XMLHttpRequest.prototype.send === wrappedSend)
      XMLHttpRequest.prototype.send = send;
    for (const [xhr, fn] of listeners) xhr.removeEventListener("loadend", fn);
    listeners.clear();
  });
  navigation();
  return {
    buffer,
    destroy: () =>
      cleanups.reverse().forEach((fn) => {
        try {
          fn();
        } catch {}
      }),
  };
}
