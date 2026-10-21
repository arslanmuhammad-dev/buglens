"use client";
import { useCallback, useEffect, useState, useRef } from "react";
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch("/api/" + path, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Operation failed");
  return result;
}
type Notifications = {
  unread: number;
  items: {
    id: string;
    readAt: string | null;
    kind: string;
    createdAt: string;
    report: { id: string; title: string };
  }[];
};
export function NotificationInbox({
  openReport,
}: {
  openReport: (id: string) => void;
}) {
  const [data, setData] = useState<Notifications>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setData(await request("notifications"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const update = async () => {
      if (document.hidden) return;
      try {
        const data = await request("notifications");
        if (!cancelled) setData(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void update();
    const timer = setInterval(() => void update(), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="notification-inbox">
      <button
        className="secondary"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) void refresh();
        }}
      >
        Notifications {data.unread > 0 && <b>({data.unread})</b>}
      </button>
      {open && (
        <section
          className="card notification-panel"
          aria-label="Workspace notifications"
        >
          <h3>Workspace notifications</h3>
          <p className="muted">
            New reports and customer replies. Latest 50 updates.
          </p>
          <p className="error" role="alert">
            {error}
          </p>
          <div className="row">
            <button className="link" onClick={() => void refresh()}>
              Refresh notifications
            </button>
            <button
              className="link"
              onClick={async () => {
                try {
                  await request("notifications", "PATCH", {});
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Mark all read
            </button>
          </div>
          {!data.items.length && <p>You’re all caught up.</p>}
          <ul>
            {data.items.map((item) => (
              <li key={item.id}>
                <button
                  className="link"
                  onClick={async () => {
                    try {
                      await request("notifications", "PATCH", { id: item.id });
                      await refresh();
                      setOpen(false);
                      openReport(item.report.id);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {!item.readAt && "● "}
                  {item.report.title}
                  <small>
                    {item.kind.toLowerCase().replaceAll("_", " ")} ·{" "}
                    {new Date(item.createdAt).toLocaleString()}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
type Team = {
  members: { id: string; user: { name: string; email: string } }[];
  invites: { id: string; email: string; expiresAt: string }[];
};
export function TeamSettings({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<Team>({ members: [], invites: [] });
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const refresh = async () => setTeam(await request("teams/" + projectId));
  async function mutate(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="team-settings">
      <button
        className="link"
        aria-expanded={open}
        onClick={async () => {
          setOpen(!open);
          if (!open) {
            try {
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            }
          }
        }}
      >
        Manage project team
      </button>
      {open && (
        <section aria-label="Project team">
          <h3>Project team</h3>
          <p>
            Invite developers to view reports, update triage, write internal
            notes, and reply to customers. Only you can change settings, manage
            access, or delete reports.
          </p>
          <p className="error" role="alert">
            {error}
          </p>
          {team.members.map((m) => (
            <p key={m.id}>
              {m.user.name} · {m.user.email} · Developer{" "}
              <button
                className="link"
                disabled={busy}
                onClick={() =>
                  void mutate(() =>
                    request(
                      `teams/${projectId}/members?id=${encodeURIComponent(m.id)}`,
                      "DELETE",
                    ),
                  )
                }
              >
                Remove developer
              </button>
            </p>
          ))}
          {team.invites.map((i) => (
            <p key={i.id}>
              Pending: {i.email}{" "}
              <button
                className="link"
                disabled={busy}
                onClick={() =>
                  void mutate(async () => {
                    await request(
                      `teams/${projectId}/invites?id=${encodeURIComponent(i.id)}`,
                      "DELETE",
                    );
                    setLink("");
                  })
                }
              >
                Revoke invitation
              </button>
            </p>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const email = new FormData(form).get("inviteEmail");
              await mutate(async () => {
                const result = await request(
                  `teams/${projectId}/invites`,
                  "POST",
                  { email },
                );
                setLink(result.link);
                form.reset();
              });
            }}
          >
            <label>
              Developer email
              <input
                name="inviteEmail"
                type="email"
                maxLength={254}
                required
                disabled={busy}
              />
            </label>
            <button className="secondary" disabled={busy}>
              Create invitation link
            </button>
          </form>
          {link && (
            <div className="invite-result">
              <label>
                Private invitation link
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                className="link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                  } catch {
                    setError("Copy the invitation link from the field above.");
                  }
                }}
              >
                Copy invitation link
              </button>
              <p>
                Share privately with the invited developer. Email is not sent
                automatically. Link expires in seven days and works once.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
