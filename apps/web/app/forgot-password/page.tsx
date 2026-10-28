"use client";
import { useRef, useState } from "react";
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  return (
    <main className="tracking-page">
      <a href="/" className="brand">
        ◉ BugLens
      </a>
      <section className="card">
        <span className="eyebrow">ACCOUNT RECOVERY</span>
        <h1>Get back to your workspace.</h1>
        <p>
          We’ll email a link that lets you choose a new password. The link
          expires in 30 minutes and works once.
        </p>
        {sent ? (
          <div role="status">
            <h3>Check your inbox</h3>
            <p>
              If an account matches that address, a reset email will be sent.
              Check spam too. Delivery may take a few minutes.
            </p>
            <button className="secondary" onClick={() => setSent(false)}>
              Try another address
            </button>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (pending.current) return;
              pending.current = true;
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/recovery", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });
                const data = await r.json();
                if (!r.ok)
                  throw Error(
                    data.error || "Could not request recovery. Please retry.",
                  );
                setSent(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                pending.current = false;
                setBusy(false);
              }
            }}
          >
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                autoComplete="email"
                disabled={busy}
              />
            </label>
            <p role="alert" className="error">
              {error}
            </p>
            <button className="primary" disabled={busy}>
              {busy ? "Requesting…" : "Send reset link"}
            </button>
          </form>
        )}
        <p>
          <a href="/">Back to sign in</a>
        </p>
      </section>
    </main>
  );
}
