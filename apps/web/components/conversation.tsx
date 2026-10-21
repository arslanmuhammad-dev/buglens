"use client";
import { useCallback, useEffect, useRef, useState } from "react";
type Message = {
  id: string;
  authorRole: string;
  authorName: string;
  body: string;
  createdAt: string;
};
export function Conversation({
  reportId,
  token,
  active = true,
}: {
  reportId: string;
  token?: string;
  active?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const pending = useRef(false);
  const loadVersion = useRef(0);
  const morePending = useRef(false);
  const retry = useRef<{ body: string; clientId: string } | null>(null);
  const prefix = token ? `/api/track/${reportId}` : `/api/reports/${reportId}`;
  const request = useCallback(
    async (suffix: string, method = "GET", data?: unknown) => {
      const response = await fetch(prefix + suffix, {
        method,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Could not load conversation");
      return result;
    },
    [prefix, token],
  );
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const data = await request("/messages");
      if (version !== loadVersion.current) return;
      setMessages(data.messages);
      setCursor(data.nextCursor);
      setError("");
    } catch (e) {
      if (version === loadVersion.current) setError((e as Error).message);
    }
  }, [request]);
  useEffect(() => {
    void load();
    return () => {
      loadVersion.current++;
    };
  }, [load]);

  return (
    <section className="card conversation" aria-label="Customer conversation">
      <div className="section-heading">
        <h3>Customer conversation</h3>
        <button className="link" onClick={() => void load()}>
          Refresh conversation
        </button>
      </div>
      <p>
        {token
          ? "Reply directly to the project’s developers. Save this private link to return."
          : "Replies here are visible to the reporter. Keep technical secrets in internal notes."}
      </p>
      <p className="muted">
        Email delivery is not enabled. Updates appear here when you refresh.
      </p>
      {!messages.length && <p>No replies yet.</p>}
      <ol className="messages">
        {messages.map((m) => (
          <li
            key={m.id}
            className={
              m.authorRole === "DEVELOPER"
                ? "developer-message"
                : "reporter-message"
            }
          >
            <div>
              <strong>{m.authorName}</strong> ·{" "}
              {m.authorRole === "DEVELOPER" ? "Developer" : "Reporter"}
              <small>{new Date(m.createdAt).toLocaleString()}</small>
            </div>
            <p className="plain">{m.body}</p>
          </li>
        ))}
      </ol>
      {cursor && (
        <button
          className="secondary"
          onClick={async () => {
            if (morePending.current) return;
            morePending.current = true;
            const version = loadVersion.current;
            try {
              const data = await request(
                "/messages?cursor=" + encodeURIComponent(cursor),
              );
              if (version !== loadVersion.current) return;
              setMessages((current) => [
                ...new Map(
                  [...current, ...data.messages].map((m: Message) => [m.id, m]),
                ).values(),
              ]);
              setCursor(data.nextCursor);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              morePending.current = false;
            }
          }}
        >
          Load more replies
        </button>
      )}
      <p role="alert" className="error">
        {error}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending.current || !active) return;
          pending.current = true;
          setBusy(true);
          setError("");
          const input =
            retry.current?.body === body
              ? retry.current
              : { body, clientId: crypto.randomUUID() };
          retry.current = input;
          try {
            await request("/messages", "POST", input);
            setBody("");
            retry.current = null;
            await load();
          } catch (e) {
            setError(
              (e as Error).message +
                ". Your reply is preserved; retry when ready.",
            );
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <label>
          Public reply
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            minLength={1}
            maxLength={4000}
            disabled={busy || !active}
          />
        </label>
        <button className="primary" disabled={busy || !active}>
          {busy ? "Sending…" : "Send public reply"}
        </button>
      </form>
      {!active && (
        <p>
          Tracking access is unavailable. The customer cannot read new replies.
        </p>
      )}
    </section>
  );
}
