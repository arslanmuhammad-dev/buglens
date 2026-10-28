"use client";
import { useEffect, useRef, useState } from "react";
export default function ResetPassword() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    const value = location.hash.slice(1);
    if (/^[A-Za-z0-9_-]{20,100}$/.test(value)) setToken(value);
    else
      setError("This reset link is incomplete or invalid. Request a new link.");
  }, []);
  return (
    <main className="tracking-page">
      <a href="/" className="brand">
        ◉ BugLens
      </a>
      <section className="card">
        <span className="eyebrow">SECURE PASSWORD RESET</span>
        <h1>Choose a new password.</h1>
        {done ? (
          <div role="status">
            <h3>Password updated</h3>
            <p>
              Your previous sessions have been signed out. Sign in with your new
              password.
            </p>
            <a className="primary" href="/">
              Sign in
            </a>
          </div>
        ) : (
          <>
            <p>
              Use at least 10 characters. This link works only once and expires
              after 30 minutes.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (pending.current) return;
                if (password !== confirm) {
                  setError("Passwords must match.");
                  return;
                }
                pending.current = true;
                setBusy(true);
                setError("");
                try {
                  const r = await fetch("/api/auth/reset-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token, newPassword: password }),
                  });
                  const data = await r.json();
                  if (!r.ok)
                    throw Error(
                      data.code === "INVALID_TOKEN"
                        ? "This link has expired or was already used. Request a new link."
                        : data.message ||
                            "Could not reset password. Please retry.",
                    );
                  setDone(true);
                  setToken("");
                  setPassword("");
                  setConfirm("");
                  history.replaceState(null, "", "/reset-password");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  pending.current = false;
                  setBusy(false);
                }
              }}
            >
              <label>
                New password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  disabled={busy || !token}
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  disabled={busy || !token}
                />
              </label>
              <p className="error" role="alert">
                {error}
              </p>
              <button disabled={busy || !token} className="primary">
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
            <p>
              <a href="/forgot-password">Request a new reset link</a>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
