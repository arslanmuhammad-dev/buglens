"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Conversation } from "../../../components/conversation";
type Report = {
  id: string;
  title: string;
  description: string;
  status: string;
  project: { name: string };
  history: { id: string; status: string; createdAt: string }[];
};
export default function TrackReport() {
  const { id } = useParams<{ id: string }>();
  const [token, setToken] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    const secret = location.hash.slice(1);
    setToken(secret);
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) {
      setError(
        "This link is incomplete. Open the full private link saved after your report.",
      );
      return;
    }
    let cancelled = false;
    fetch("/api/track/" + encodeURIComponent(id), {
      cache: "no-store",
      headers: { Authorization: "Bearer " + secret },
    })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            "This tracking link has expired, was revoked, or is invalid.",
          );
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  async function refresh(reopen = false) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const headers = {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      };
      if (reopen) {
        const response = await fetch(`/api/track/${id}/reopen`, {
          method: "POST",
          headers,
          body: "{}",
        });
        if (!response.ok) throw Error("Could not reopen report. Please retry.");
      }
      const response = await fetch("/api/track/" + id, {
        headers,
        cache: "no-store",
      });
      if (!response.ok)
        throw Error("Tracking access unavailable. Please check your link.");
      setReport(await response.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  return (
    <main className="tracking-page">
      <a className="brand" href="/">
        ◉ BugLens
      </a>
      <p className="eyebrow">YOUR PRIVATE REPORT</p>
      <p role="alert" className="error">
        {error}
      </p>
      {report ? (
        <>
          <div className="page-heading">
            <div>
              <h1>{report.title}</h1>
              <p>{report.project.name}</p>
            </div>
            <span className={"pill " + report.status.toLowerCase()}>
              {report.status.replaceAll("_", " ")}
            </span>
          </div>
          <section className="card">
            <h3>Your report</h3>
            <p className="plain">{report.description}</p>
            <p>
              Keep this link private. Anyone with the full link can read and
              reply to this conversation. Access expires after 90 days and can
              be revoked by the project owner.
            </p>
            <button
              disabled={busy}
              className="secondary"
              onClick={() => void refresh()}
            >
              Refresh report status
            </button>
            {report.status === "RESOLVED" && (
              <button
                disabled={busy}
                className="secondary"
                onClick={() => void refresh(true)}
              >
                Still happening? Reopen report
              </button>
            )}
          </section>
          <Conversation key={id} reportId={id} token={token} />
          <section className="card">
            <h3>Status updates</h3>
            {report.history.map((h) => (
              <p key={h.id}>
                {h.status.replaceAll("_", " ")} ·{" "}
                {new Date(h.createdAt).toLocaleString()}
              </p>
            ))}
          </section>
        </>
      ) : (
        !error && <p role="status">Opening your report…</p>
      )}
    </main>
  );
}
