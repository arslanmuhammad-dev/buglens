"use client";
import { useEffect, useState } from "react";
export default function Demo() {
  const [message, setMessage] = useState("");
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/widget.js";
    script.dataset.projectKey = "buglens-demo-public";
    script.defer = true;
    script.onload = () => setInteractive(true);
    script.onerror = () =>
      setMessage("Widget failed to load. Rebuild it with npm run build.");
    document.body.append(script);
    return () => {
      script.remove();
    };
  }, []);
  return (
    <main className="store">
      <nav className="store-nav">
        <a className="store-logo" href="/demo">
          form & field<span className="green">®</span>
        </a>
        <span className="muted">OBJECTS FOR SLOW LIVING</span>
        <a href="/">BugLens dashboard ↗</a>
      </nav>
      <div className="demo-banner">
        ◈ &nbsp; BugLens playground · A fictional store with intentional bugs.
        Fake data only. Try an action, then use “Report a problem”.
      </div>
      <section className="product">
        <div
          className="product-art"
          role="img"
          aria-label="Terracotta table lamp"
        >
          <div className="lamp">
            <div className="lamp-shade" />
            <div className="lamp-stem" />
            <div className="lamp-base" />
          </div>
          <span>THE EVERYDAY COLLECTION / 001</span>
        </div>
        <div>
          <span className="eyebrow">THOUGHTFULLY MADE. QUIETLY BEAUTIFUL.</span>
          <h1>The Sol table lamp</h1>
          <p className="price">
            $128.00 <span className="muted">USD</span>
          </p>
          <p>
            A little warmth for your favorite corner. Sculpted curves, a soft
            terracotta finish, and light that invites you to stay a little
            longer.
          </p>
          <p>● In stock · Free carbon-neutral shipping</p>
          <label>
            Demo email (masked in screenshots)
            <input
              aria-label="Demo email"
              defaultValue="private-reporter@example.test"
            />
          </label>
          <div
            data-buglens-private
            style={{
              padding: 12,
              border: "1px dashed #bbc8b0",
              borderRadius: 5,
            }}
          >
            Private area · Fake order #4242 · Always masked
          </div>
          <div className="store-actions">
            <button
              disabled={!interactive}
              className="primary"
              onClick={async () => {
                await fetch("/api/demo-order", { method: "POST" });
                setMessage(
                  "Intentional failure: order service unavailable (503). Report this problem ↘",
                );
              }}
            >
              Place order
            </button>
            <button
              disabled={!interactive}
              className="secondary"
              onClick={() =>
                setMessage("Saved to your wishlist. This action works!")
              }
            >
              ♡ Save item
            </button>
          </div>
          <div className="toast" role="status">
            {message}
          </div>
        </div>
      </section>
      <section className="scenario">
        <div>
          <h3>A bug you can see. Context you can use.</h3>
          <p>
            “Place order” returns 503. The button below triggers a controlled
            JavaScript error. “Save item” succeeds for comparison.
          </p>
        </div>
        <button
          disabled={!interactive}
          className="secondary"
          onClick={() => {
            setTimeout(() => {
              throw new Error(
                "Intentional demo error: product inventory unavailable",
              );
            }, 0);
            setMessage(
              "Controlled JavaScript error triggered. Open the diagnostics preview.",
            );
          }}
        >
          Trigger demo error ↗
        </button>
      </section>
      <footer>
        form & field is fictional. No payments, personal data, or real orders.{" "}
        <a className="link" href="/">
          Back to BugLens ↗
        </a>
      </footer>
    </main>
  );
}
