import html2canvas from "html2canvas";
import { sanitizeUrl, payloadSchema } from "@buglens/core";
import { collect } from "./diagnostics";
const script = document.currentScript as HTMLScriptElement | null;
export function mount(key: string, base: string) {
  const host = document.createElement("div");
  host.id = "buglens-widget-root";
  host.setAttribute("data-buglens-ignore", "");
  document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  const endpoint = new URL("/api/ingest", base).href;
  const diagnostics = collect(endpoint, host, () => {
    queueMicrotask(() => {
      if (host.isConnected && !backdrop.hidden) preview();
    });
  });
  root.innerHTML = `<style>
:host{all:initial;font-family:Inter,system-ui,sans-serif;color:#192123;font-size:14px}*{box-sizing:border-box}button,input,textarea,select{font:inherit}button{cursor:pointer;border:0;border-radius:9px;padding:11px 15px;background:#eaf1ef;color:#173d35}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #48b99a;outline-offset:2px}.launch{position:fixed;bottom:24px;right:24px;z-index:2147483646;background:#153e34;color:white;box-shadow:0 6px 26px #0003}.backdrop{position:fixed;inset:0;background:#102e2966;z-index:2147483647;display:flex;justify-content:flex-end;padding:18px}.panel{background:#fff;width:470px;max-width:100%;padding:25px;overflow:auto;border-radius:16px;box-shadow:0 20px 80px #0003}h2{font-size:23px;margin:5px 0}p{line-height:1.6;color:#65716d}label{display:block;margin:15px 0 6px;font-weight:600}input:not([type=checkbox]),textarea{width:100%;padding:11px;border:1px solid #d5ded9;border-radius:8px;background:#fcfdfc}textarea{min-height:65px;resize:vertical}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.primary{background:#163f34;color:#fff}.close{float:right}pre{white-space:pre-wrap;word-break:break-word;background:#f2f5f3;padding:12px;max-height:220px;overflow:auto;font:11px monospace}canvas{max-width:100%;height:auto;border:1px solid #b4c8bf;touch-action:none} .status{padding:10px 0;color:#9e3929}[hidden]{display:none!important}small{color:#65716d}</style><button class="launch" aria-label="Report a problem">◉ &nbsp; Report a problem</button><div class="backdrop" hidden><section class="panel" role="dialog" aria-modal="true" aria-labelledby="bl-title"><button class="close" aria-label="Close report">✕</button><small>BUGLENS · FEEDBACK WITH CONTEXT</small><h2 id="bl-title">What went wrong?</h2><p>Tell us what happened. We’ll include the useful details, with your permission.</p><form><label for="title">Title *</label><input id="title" required maxlength="160" placeholder="e.g. Checkout won’t complete"><label for="description">Description *</label><textarea id="description" required maxlength="4000"></textarea><label for="steps">Steps to reproduce</label><textarea id="steps" maxlength="4000"></textarea><label for="expected">Expected behavior</label><textarea id="expected" maxlength="4000"></textarea><fieldset><legend>Stay in touch (optional)</legend><label for="reporter-name">Your name</label><input id="reporter-name" maxlength="100" autocomplete="name"><label for="reporter-email">Your email</label><input id="reporter-email" type="email" maxlength="254" autocomplete="email"><small>Your name appears in the report conversation. Your email is shared only with this project’s team. Enter either only if you want to share it. Email delivery is not enabled. Save your private tracking link after sending to see replies.</small></fieldset><label><input id="diagnostics" type="checkbox" checked> Include sanitized diagnostics</label><div class="row"><button type="button" id="capture">Capture screenshot</button><button type="button" id="remove" hidden>Remove screenshot</button></div><p><small>Capture is optional. Inputs and marked private areas are masked. Draw a highlight or an opaque redaction below.</small></p><div id="editor" hidden><div class="row"><label for="tool">Annotation</label><select id="tool"><option value="highlight">Highlight</option><option value="redact">Redact</option></select></div><canvas aria-label="Screenshot annotation canvas" tabindex="0"></canvas><small>Drag to mark an area, or enter pixel coordinates below. Redactions are burned into the image.</small><div class="row"><label>X<input id="ax" type="number" min="0" value="20"></label><label>Y<input id="ay" type="number" min="0" value="20"></label><label>Width<input id="aw" type="number" min="1" value="100"></label><label>Height<input id="ah" type="number" min="1" value="60"></label><button type="button" id="apply-annotation">Apply annotation</button></div></div><details><summary>Preview exact report payload</summary><pre id="preview"></pre></details><div class="status" role="status" aria-live="polite"></div><p id="tracking-result" hidden></p><button class="primary" type="submit">Send report ↗</button></form></section></div>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
    root.querySelector<T>(s)!;
  const backdrop = $(".backdrop");
  const launch = $(".launch");
  const form = $<HTMLFormElement>("form");
  const status = $(".status");
  const canvas = $<HTMLCanvasElement>("canvas");
  let screenshot: string | null = null;
  let start: { x: number; y: number } | null = null;
  let pending = false;
  let capturing = false;
  let destroyed = false;
  let submissionId = crypto.randomUUID();
  const makeToken = () =>
    btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  let trackingToken = makeToken();
  let reviewPayload: ReturnType<typeof payload> | null = null;
  function payload() {
    const value = (id: string) => $<HTMLInputElement>("#" + id).value;
    return {
      submissionId,
      trackingToken,
      ...(value("reporter-name").trim()
        ? { reporterName: value("reporter-name").trim() }
        : {}),
      ...(value("reporter-email").trim()
        ? { reporterEmail: value("reporter-email").trim() }
        : {}),
      projectKey: key,
      title: value("title"),
      description: value("description"),
      steps: value("steps"),
      expected: value("expected"),
      pageUrl: sanitizeUrl(location.href),
      browser: /Firefox/.test(navigator.userAgent)
        ? "Firefox"
        : /Edg/.test(navigator.userAgent)
          ? "Edge"
          : /Chrome/.test(navigator.userAgent)
            ? "Chrome"
            : /Safari/.test(navigator.userAgent)
              ? "Safari"
              : "Other",
      viewport: `${innerWidth}x${innerHeight}`,
      events: $<HTMLInputElement>("#diagnostics").checked
        ? diagnostics.buffer.snapshot()
        : [],
      screenshot,
    };
  }
  function preview() {
    if (destroyed) return;
    reviewPayload = payload();
    $("#preview").textContent = JSON.stringify(reviewPayload, null, 2);
  }
  function clearScreenshot() {
    screenshot = null;
    start = null;
    canvas.width = canvas.height = 0;
    $("#editor").hidden = true;
    $("#remove").hidden = true;
    $("#capture").textContent = "Capture screenshot";
    for (const input of root.querySelectorAll<HTMLInputElement>(
      '#editor input[type="number"]',
    ))
      input.value = input.defaultValue;
  }
  function close() {
    if (pending) return;
    backdrop.hidden = true;
    launch.focus();
  }
  launch.onclick = () => {
    backdrop.hidden = false;
    status.textContent = "";
    preview();
    $("#title").focus();
  };
  $(".close").onclick = close;
  root.addEventListener("keydown", (event) => {
    const e = event as KeyboardEvent;
    if (backdrop.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "Tab") {
      const focusable = [
        ...root.querySelectorAll<HTMLElement>(
          "button,input,textarea,select,summary,canvas,a",
        ),
      ].filter(
        (el) =>
          el.getClientRects().length &&
          !el.hasAttribute("disabled") &&
          el !== launch,
      );
      const first = focusable[0],
        last = focusable.at(-1);
      if (e.shiftKey && root.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && root.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  form.oninput = preview;
  $("details").addEventListener("toggle", preview);
  $("#capture").onclick = async () => {
    if (pending || capturing || destroyed) return;
    capturing = true;
    const button = $<HTMLButtonElement>("#capture");
    $<HTMLButtonElement>("button[type=submit]").disabled = true;
    button.disabled = true;
    status.textContent = "Capturing…";
    host.style.visibility = "hidden";
    try {
      const privateRects = [
        ...document.querySelectorAll<HTMLElement>(
          "input,textarea,select,[contenteditable],[data-buglens-private],[data-buglens-private] *",
        ),
      ].map((el) => el.getBoundingClientRect());
      const captured = await html2canvas(document.body, {
        scale: Math.min(1, 1200 / innerWidth),
        useCORS: true,
        logging: false,
        windowWidth: innerWidth,
        windowHeight: innerHeight,
        width: innerWidth,
        height: innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        x: window.scrollX,
        y: window.scrollY,
        ignoreElements: (el) => el === host,
        onclone: (doc) => {
          for (const el of doc.querySelectorAll<HTMLElement>(
            "input,textarea,select,[contenteditable],[data-buglens-private]",
          )) {
            const bounds = el.getBoundingClientRect();
            el.style.setProperty("width", bounds.width + "px", "important");
            el.style.setProperty("height", bounds.height + "px", "important");
            el.style.setProperty("box-sizing", "border-box", "important");
            el.style.setProperty("background", "#263c35", "important");
            el.style.setProperty("background-image", "none", "important");
            el.style.setProperty("font-size", "0", "important");
            if (el.tagName === "INPUT") {
              el.removeAttribute("src");
              (el as HTMLInputElement).placeholder = "";
            }
            el.style.setProperty("color", "transparent", "important");
            el.style.setProperty("text-shadow", "none", "important");
            if (el.tagName === "INPUT")
              (el as HTMLInputElement | HTMLTextAreaElement).value = "";
            else if (el.tagName === "TEXTAREA")
              (el as HTMLInputElement | HTMLTextAreaElement).value = "";
            else el.replaceChildren();
            el.style.setProperty("opacity", "1", "important");
          }
        },
      });
      if (destroyed) return;
      canvas.width = captured.width;
      canvas.height = captured.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(captured, 0, 0);
      context.fillStyle = "#263c35";
      const scale = canvas.width / innerWidth;
      for (const rect of privateRects)
        context.fillRect(
          Math.floor(rect.left * scale),
          Math.floor(rect.top * scale),
          Math.ceil(rect.width * scale) + 1,
          Math.ceil(rect.height * scale) + 1,
        );
      screenshot = canvas.toDataURL("image/png");
      $("#editor").hidden = false;
      $("#remove").hidden = false;
      button.textContent = "Retake screenshot";
      status.textContent = "Screenshot ready. Review before sending.";
      preview();
    } catch {
      status.textContent =
        "Screenshot capture failed. You can still send this report.";
    } finally {
      host.style.visibility = "";
      button.disabled = false;
      capturing = false;
      $<HTMLButtonElement>("button[type=submit]").disabled = pending;
    }
  };
  $("#remove").onclick = () => {
    clearScreenshot();
    status.textContent =
      "Screenshot removed. You can send the report without an image.";
    preview();
  };
  $("#apply-annotation").onclick = () => {
    const number = (id: string) =>
      Math.max(
        0,
        Math.min(10000, Number($<HTMLInputElement>("#" + id).value) || 0),
      );
    const ctx = canvas.getContext("2d")!;
    const x = number("ax"),
      y = number("ay"),
      w = number("aw"),
      h = number("ah");
    if ($<HTMLSelectElement>("#tool").value === "redact") {
      ctx.fillStyle = "#000";
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.strokeStyle = "#e7a12b";
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);
    }
    screenshot = canvas.toDataURL("image/png");
    preview();
  };
  canvas.onpointercancel = () => {
    start = null;
  };
  const point = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };
  canvas.onpointerdown = (e) => {
    start = point(e);
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointerup = (e) => {
    if (!start) return;
    const end = point(e),
      ctx = canvas.getContext("2d")!;
    const x = Math.min(start.x, end.x),
      y = Math.min(start.y, end.y),
      w = Math.abs(start.x - end.x),
      h = Math.abs(start.y - end.y);
    if ($<HTMLSelectElement>("#tool").value === "redact") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.strokeStyle = "#e7a12b";
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);
    }
    start = null;
    screenshot = canvas.toDataURL("image/png");
    preview();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (pending || capturing || destroyed || !form.reportValidity()) return;
    preview();
    if (!payloadSchema.safeParse(reviewPayload).success) {
      status.textContent =
        "Please check the report fields or remove an oversized screenshot.";
      return;
    }
    pending = true;
    const submit = $<HTMLButtonElement>("button[type=submit]");
    const controls = [
      ...form.querySelectorAll<
        | HTMLInputElement
        | HTMLButtonElement
        | HTMLSelectElement
        | HTMLTextAreaElement
      >("input,textarea,select,button"),
    ];
    for (const control of controls) control.disabled = true;
    submit.disabled = true;
    status.textContent = "Sending report…";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewPayload),
      });
      const result = await res.json();
      if (!res.ok || typeof result.id !== "string") throw Error();
      status.textContent = "Report sent. Thank you for helping us improve!";
      const tracking = $("#tracking-result");
      const link = document.createElement("a");
      link.href =
        new URL("/track/" + encodeURIComponent(result.id), base).href +
        "#" +
        trackingToken;
      link.textContent = "Open your private report conversation ↗";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      tracking.replaceChildren(
        "Save this link to see status updates and reply. Anyone with this link can access the conversation. Expires in 90 days. ",
        link,
      );
      tracking.hidden = false;
      form.reset();
      submissionId = crypto.randomUUID();
      trackingToken = makeToken();
      clearScreenshot();
      preview();
    } catch {
      status.textContent =
        "Could not send report. Your details are saved here. Please retry.";
    } finally {
      pending = false;
      for (const control of controls) control.disabled = false;
      submit.disabled = false;
    }
  };
  return {
    destroy() {
      destroyed = true;
      diagnostics.destroy();
      host.remove();
    },
  };
}
if (
  script?.dataset.projectKey &&
  !document.getElementById("buglens-widget-root")
) {
  try {
    const widget = mount(script.dataset.projectKey, script.src);
    document
      .getElementById("buglens-widget-root")
      ?.addEventListener("buglens:destroy", () => widget.destroy(), {
        once: true,
      });
  } catch {
    /* Never break the host. */
  }
}
