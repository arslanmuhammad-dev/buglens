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
  let active = true;
  const safely = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* Diagnostics cannot change host behavior. */
    }
  };
  const record = (data: object) =>
    safely(() => {
      if (active) {
        buffer.push({ time: Date.now(), ...data });
        onUpdate();
      }
    });
  const add = (type: string, fn: EventListener) =>
    safely(() => {
      const safe: EventListener = (e) => safely(() => fn(e));
      window.addEventListener(type, safe, true);
      cleanups.push(() => window.removeEventListener(type, safe, true));
    });
  add("click", (e) => {
    const path = e.composedPath();
    if (
      path.includes(host) ||
      path.some(
        (el) =>
          el instanceof Element &&
          el.matches("[data-buglens-ignore],[data-buglens-private]"),
      )
    )
      return;
    const target = path.find((el) => el instanceof Element) as
      Element | undefined;
    if (
      !target ||
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
  for (const method of ["pushState", "replaceState"] as const)
    safely(() => {
      const original = history[method];
      const wrapped: typeof original = function (this: History, ...args) {
        const result = original.apply(this, args);
        safely(navigation);
        return result;
      };
      history[method] = wrapped;
      cleanups.push(() => {
        if (history[method] === wrapped) history[method] = original;
      });
    });
  safely(() => {
    const original = window.fetch;
    const wrapped: typeof fetch = async function (this: Window, input, init) {
      let meta: { url: string; method: string; start: number } | undefined;
      safely(() => {
        const raw =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const url = new URL(raw, location.href).href;
        if (!internalRequest(url, endpoint))
          meta = {
            url: sanitizeUrl(url),
            method: (
              init?.method || (input instanceof Request ? input.method : "GET")
            ).slice(0, 10),
            start: performance.now(),
          };
      });
      try {
        const response = await original.call(this, input, init);
        if (meta && !response.ok)
          record({
            type: "request",
            url: meta.url,
            method: meta.method,
            status: response.status,
            duration: Math.round(performance.now() - meta.start),
          });
        return response;
      } catch (error) {
        if (meta)
          record({
            type: "request",
            url: meta.url,
            method: meta.method,
            status: 0,
            duration: Math.round(performance.now() - meta.start),
          });
        throw error;
      }
    };
    window.fetch = wrapped;
    cleanups.push(() => {
      if (window.fetch === wrapped) window.fetch = original;
    });
  });
  const meta = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
  const listeners = new Map<XMLHttpRequest, () => void>();
  safely(() => {
    const original = XMLHttpRequest.prototype.open;
    const wrapped = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      async = true,
      username?: string | null,
      password?: string | null,
    ) {
      const result = original.call(
        this,
        method,
        url,
        async,
        username,
        password,
      );
      safely(() => {
        const old = listeners.get(this);
        if (old) {
          this.removeEventListener("loadend", old);
          listeners.delete(this);
        }
        meta.set(this, {
          method: method.slice(0, 10),
          url: new URL(String(url), location.href).href,
        });
      });
      return result;
    };
    XMLHttpRequest.prototype.open = wrapped as typeof original;
    cleanups.push(() => {
      if (XMLHttpRequest.prototype.open === wrapped)
        XMLHttpRequest.prototype.open = original;
    });
  });
  safely(() => {
    const original = XMLHttpRequest.prototype.send;
    const wrapped = function (
      this: XMLHttpRequest,
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      safely(() => {
        const data = meta.get(this),
          start = performance.now();
        if (
          data &&
          !internalRequest(data.url, endpoint) &&
          listeners.size < 80 &&
          !listeners.has(this)
        ) {
          const done = () =>
            safely(() => {
              this.removeEventListener("loadend", done);
              listeners.delete(this);
              if (this.status === 0 || this.status >= 400)
                record({
                  type: "request",
                  url: sanitizeUrl(data.url),
                  method: data.method,
                  status: this.status,
                  duration: Math.round(performance.now() - start),
                });
            });
          listeners.set(this, done);
          this.addEventListener("loadend", done);
        }
      });
      try {
        return original.call(this, body);
      } catch (error) {
        safely(() => {
          const done = listeners.get(this);
          if (done) this.removeEventListener("loadend", done);
          listeners.delete(this);
        });
        throw error;
      }
    };
    XMLHttpRequest.prototype.send = wrapped;
    cleanups.push(() => {
      if (XMLHttpRequest.prototype.send === wrapped)
        XMLHttpRequest.prototype.send = original;
    });
  });
  cleanups.push(() => {
    for (const [xhr, fn] of listeners) xhr.removeEventListener("loadend", fn);
    listeners.clear();
  });
  safely(navigation);
  return {
    buffer,
    destroy() {
      if (!active) return;
      active = false;
      for (const fn of cleanups.reverse()) safely(fn);
      cleanups.length = 0;
    },
  };
}
