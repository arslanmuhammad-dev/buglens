"use client";
import { useEffect, useState, useRef } from "react";
export default function JoinProject() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    fetch("/api/auth/get-session")
      .then((r) => {
        if (!r.ok) throw Error("Could not check session. Reload to retry.");
        return r.json();
      })
      .then((s) => {
        setEmail(s?.user?.email || null);
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="tracking-page">
      <a className="brand" href="/">
        ◉ BugLens
      </a>
      <section className="card">
        <span className="eyebrow">PROJECT INVITATION</span>
        <h1>Build clarity together.</h1>
        <p>
          This invitation grants developer access: view reports and screenshots,
          reply to customers, update triage, and manage internal notes. Only the
          owner can manage the project, team, or delete reports.
        </p>
        <p>
          Keep this invitation private. It expires after seven days and is valid
          once.
        </p>
        <p className="error" role="alert">
          {error}
        </p>
        {success ? (
          <>
            <p role="status">You joined {success}.</p>
            <a className="primary" href="/">
              Open workspace
            </a>
          </>
        ) : !ready ? (
          <p>Checking your session…</p>
        ) : email ? (
          <>
            <p>Signed in as {email}. This must match the invited email.</p>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (pending.current) return;
                pending.current = true;
                setBusy(true);
                setError("");
                try {
                  const r = await fetch("/api/invitations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: location.hash.slice(1) }),
                  });
                  const data = await r.json();
                  if (!r.ok)
                    throw Error(data.error || "Could not accept invitation");
                  setSuccess(data.name);
                  history.replaceState(null, "", "/join");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  pending.current = false;
                  setBusy(false);
                }
              }}
            >
              Accept developer invitation
            </button>
            <p>
              <a href="/" target="_blank" rel="noreferrer">
                Switch account in another tab
              </a>
              , then reload this page.
            </p>
          </>
        ) : (
          <>
            <p>
              Sign in or create an account using the email invited by the owner.
              Return here afterward.
            </p>
            <a className="primary" href="/" target="_blank" rel="noreferrer">
              Sign in / create account
            </a>
            <button className="secondary" onClick={() => location.reload()}>
              I’ve signed in — continue
            </button>
          </>
        )}
      </section>
    </main>
  );
}
