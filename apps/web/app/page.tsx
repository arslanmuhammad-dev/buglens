"use client";
import { useEffect, useState, useRef } from "react";
type Project = { id: string; name: string; key: string; origins: string[] };
type Report = {
  id: string;
  title: string;
  description: string;
  steps: string;
  expected: string;
  status: string;
  severity: string;
  pageUrl: string;
  browser: string;
  viewport: string;
  createdAt: string;
  project: Project;
  screenshot?: { id: string };
  events: { id: string; data: Record<string, unknown> }[];
  notes: { id: string; body: string }[];
  history: { id: string; status: string; createdAt: string }[];
};
async function api(path: string, method = "GET", data?: unknown) {
  const response = await fetch("/api/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json().catch(() => ({
    error: "The server returned an unexpected response. Please retry.",
  }));
  if (!response.ok)
    throw Error(
      typeof result.error === "string"
        ? result.error
        : result.error?.message || result.message || "Request failed",
    );
  return result;
}
const label = (s: string) => s.toLowerCase().replaceAll("_", " ");
export default function Dashboard() {
  const [user, setUser] = useState<{ name: string } | null>(null),
    [ready, setReady] = useState(false),
    [signup, setSignup] = useState(false),
    [error, setError] = useState(""),
    [projects, setProjects] = useState<Project[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [project, setProject] = useState(""),
    [status, setStatus] = useState(""),
    [severity, setSeverity] = useState(""),
    [tab, setTab] = useState("reports"),
    [selected, setSelected] = useState<Report | null>(null),
    [projectForm, setProjectForm] = useState(false),
    [editing, setEditing] = useState<Project | null>(null);
  const refreshVersion = useRef(0);
  const filters = useRef({
    page: 1,
    query: "",
    project: "",
    status: "",
    severity: "",
  });
  const selection = useRef<{ id: string | null; version: number }>({
    id: null,
    version: 0,
  });
  const actionPending = useRef(false);
  const [busy, setBusy] = useState(false);
  async function runAction(action: () => Promise<void>) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Operation failed. Please retry.",
      );
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    const { page, query, project, status, severity } = filters.current;
    const version = ++refreshVersion.current;
    try {
      const [ps, data] = await Promise.all([
        api("projects"),
        api(
          "reports?" +
            new URLSearchParams({
              page: String(page),
              q: query,
              project,
              status,
              severity,
            }),
        ),
      ]);
      if (version !== refreshVersion.current) return;
      const lastPage = Math.max(1, Math.ceil(data.total / 8));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setProjects(ps);
      setReports(data.reports);
      setTotal(data.total);
    } catch (e) {
      if (version === refreshVersion.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    fetch("/api/auth/get-session")
      .then((r) => {
        if (!r.ok) throw Error("Session unavailable");
        return r.json();
      })
      .then((s) => {
        setUser(s?.user || null);
        setReady(true);
      })
      .catch(() => {
        setError(
          "Could not connect. Check your connection and reload to retry.",
        );
        setReady(true);
      });
  }, []);
  useEffect(() => {
    filters.current = { page, query, project, status, severity };
    if (user) void refresh();
  }, [user, page, query, project, status, severity]);
  function leaveReport() {
    selection.current.id = null;
    selection.current.version++;
    setSelected(null);
  }
  async function detail(id: string, refreshOnly = false) {
    if (refreshOnly && selection.current.id !== id) return;
    selection.current.id = id;
    const version = ++selection.current.version;
    try {
      const report = await api("reports/" + id);
      if (version === selection.current.version) setSelected(report);
    } catch (e) {
      if (version === selection.current.version) setError((e as Error).message);
    }
  }
  async function change(data: object) {
    if (!selected) return;
    await runAction(async () => {
      await api("reports/" + selected.id, "PATCH", data);
      await detail(selected.id, true);
      await refresh();
    });
  }
  if (!ready)
    return <div className="loading">◉ &nbsp; Opening your workspace…</div>;
  if (!user)
    return (
      <main className="auth-shell">
        <div className="auth-story">
          <a className="brand" href="/">
            ◉ BugLens<span> / </span>
          </a>
          <span className="eyebrow">LESS BACK-AND-FORTH. MORE FIXES.</span>
          <h1>
            Every bug has <br />a story. <br />
            <em>See the whole thing.</em>
          </h1>
          <p>
            Turn “it’s not working” into a report you can actually work with.
            Screenshots, steps, and the technical context — together.
          </p>
          <div className="auth-example">
            <span className="pill">● OPEN</span>
            <h3>Checkout won’t complete</h3>
            <p>
              POST /api/demo-order <b>503</b>
              <br />
              Chrome · 1440 × 900 · just now
            </p>
            <div className="mini-line" />
            <small>Everything you need. Nothing you don’t.</small>
          </div>
          <a href="/demo" className="text-link">
            Explore the interactive demo ↗
          </a>
        </div>
        <section className="auth-form">
          <div>
            <span className="eyebrow">YOUR DEBUGGING WORKSPACE</span>
            <h2>{signup ? "Start seeing clearly." : "Welcome back."}</h2>
            <p>
              {signup
                ? "Create your private debugging workspace."
                : "Sign in to pick up where you left off."}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                await runAction(async () => {
                  const result = await api(
                    "auth/" + (signup ? "sign-up/email" : "sign-in/email"),
                    "POST",
                    {
                      email: data.get("email"),
                      password: data.get("password"),
                      name: data.get("name") || "Developer",
                    },
                  );
                  setUser(result.user);
                });
              }}
            >
              {signup && (
                <label>
                  Name
                  <input name="name" required autoComplete="name" />
                </label>
              )}
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@studio.dev"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete={signup ? "new-password" : "current-password"}
                  placeholder="At least 10 characters"
                />
              </label>
              <p className="error" role="alert">
                {error}
              </p>
              <button disabled={busy} className="primary wide">
                {signup ? "Create workspace" : "Sign in"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </form>
            <p>
              {signup ? "Already have an account?" : "New to BugLens?"}{" "}
              <button
                className="link"
                onClick={() => {
                  setSignup(!signup);
                  setError("");
                }}
              >
                {signup ? "Sign in" : "Create an account"}
              </button>
            </p>
            <div className="auth-foot">
              ⌁ &nbsp; Privacy-first by design. Built for better debugging.
            </div>
          </div>
        </section>
      </main>
    );
  return (
    <div className="workspace">
      <aside>
        <a className="brand" href="/">
          ◉ BugLens<span> / </span>
        </a>
        <div className="workspace-tag">
          <span className="avatar">{user.name[0]}</span>
          <div>
            {user.name}’s workspace<small>PERSONAL WORKSPACE</small>
          </div>
        </div>
        <small className="nav-label">WORKSPACE</small>
        <button
          className={tab === "reports" ? "nav active" : "nav"}
          onClick={() => {
            setTab("reports");
            leaveReport();
          }}
        >
          ▤ <span>Bug reports</span>
          <b>{total}</b>
        </button>
        <button
          className={tab === "projects" ? "nav active" : "nav"}
          onClick={() => {
            setTab("projects");
            leaveReport();
          }}
        >
          ▧ <span>Projects</span>
          <b>{projects.length}</b>
        </button>
        <small className="nav-label">EXPLORE</small>
        <a className="nav" href="/demo" target="_blank">
          ↗ <span>Demo storefront</span>
        </a>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            ◈<h4>Context, with care.</h4>
            <p>
              No keystrokes. No session replay. Just the details that matter.
            </p>
          </div>
          <button
            className="nav"
            onClick={async () => {
              await runAction(async () => {
                await api("auth/sign-out", "POST", {});
                refreshVersion.current++;
                leaveReport();
                setProjects([]);
                setReports([]);
                setTotal(0);
                setPage(1);
                setQuery("");
                setProject("");
                setStatus("");
                setSeverity("");
                setTab("reports");
                setProjectForm(false);
                setEditing(null);
                setUser(null);
              });
            }}
          >
            ↪ <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className="main">
        <header>
          <span>
            Workspace <span className="muted">/</span>{" "}
            {selected
              ? "Report details"
              : tab === "reports"
                ? "Bug reports"
                : "Projects"}
          </span>
          <div>
            <span className="live-dot" /> Private workspace{" "}
            <span className="avatar small-avatar">{user.name[0]}</span>
          </div>
        </header>
        <div className="content">
          <p className="error" role="alert">
            {error}
          </p>
          {selected ? (
            <>
              <button className="link" onClick={leaveReport}>
                ← All reports
              </button>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    REPORT · {selected.id.slice(-6).toUpperCase()}
                  </span>
                  <h1>{selected.title}</h1>
                  <p>
                    {selected.project.name} ·{" "}
                    {new Date(selected.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  disabled={busy}
                  className="danger"
                  onClick={async () => {
                    if (confirm("Delete this report and its screenshot?")) {
                      await runAction(async () => {
                        await api("reports/" + selected.id, "DELETE");
                        if (selection.current.id === selected.id) leaveReport();
                        await refresh();
                      });
                    }
                  }}
                >
                  Delete report
                </button>
              </div>
              <div className="detail-grid">
                <div>
                  <section className="card">
                    <h3>What happened</h3>
                    <p className="plain">{selected.description}</p>
                    <h3>Steps to reproduce</h3>
                    <p className="plain">
                      {selected.steps || "No steps provided."}
                    </p>
                    <h3>Expected behavior</h3>
                    <p className="plain">
                      {selected.expected || "Not specified."}
                    </p>
                  </section>
                  {selected.screenshot && (
                    <section className="card">
                      <h3>Screenshot</h3>
                      <img
                        className="screenshot"
                        alt="Reporter’s annotated screenshot"
                        src={"/api/reports/" + selected.id + "/screenshot"}
                      />
                    </section>
                  )}
                  <section className="card">
                    <h3>
                      Diagnostic timeline{" "}
                      <span className="muted">
                        {selected.events.length} events
                      </span>
                    </h3>
                    {selected.events.length ? (
                      selected.events.map((e) => (
                        <div className="event" key={e.id}>
                          <span className="event-dot" />
                          <div>
                            <b>{String(e.data.type)}</b>
                            <pre>{JSON.stringify(e.data, null, 2)}</pre>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>No diagnostics included.</p>
                    )}
                  </section>
                  <section className="card">
                    <h3>Internal notes</h3>
                    {selected.notes.map((n) => (
                      <div className="note" key={n.id}>
                        <p className="plain">{n.body}</p>
                        <button
                          className="link"
                          onClick={async () => {
                            await runAction(async () => {
                              await api(
                                `reports/${selected.id}/notes?note=${n.id}`,
                                "DELETE",
                              );
                              await detail(selected.id, true);
                            });
                          }}
                        >
                          Delete note
                        </button>
                      </div>
                    ))}
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const body = new FormData(form).get("body");
                        await runAction(async () => {
                          await api(`reports/${selected.id}/notes`, "POST", {
                            body,
                          });
                          form.reset();
                          await detail(selected.id, true);
                        });
                      }}
                    >
                      <label>
                        Note
                        <textarea
                          name="body"
                          required
                          maxLength={2000}
                          placeholder="Leave a note for your future self…"
                        />
                      </label>
                      <button disabled={busy} className="primary">
                        Add note
                      </button>
                    </form>
                  </section>
                </div>
                <div>
                  <section className="card">
                    <h3>Triage</h3>
                    <label>
                      Status
                      <select
                        disabled={busy}
                        aria-label="Report status"
                        value={selected.status}
                        onChange={(e) =>
                          void change({ status: e.target.value })
                        }
                      >
                        {["OPEN", "IN_PROGRESS", "RESOLVED"].map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Severity
                      <select
                        disabled={busy}
                        aria-label="Report severity"
                        value={selected.severity}
                        onChange={(e) =>
                          void change({ severity: e.target.value })
                        }
                      >
                        {["LOW", "MEDIUM", "HIGH"].map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>
                  <section className="card">
                    <h3>Environment</h3>
                    <dl>
                      <dt>Browser</dt>
                      <dd>{selected.browser}</dd>
                      <dt>Viewport</dt>
                      <dd>{selected.viewport}</dd>
                      <dt>Page</dt>
                      <dd className="break">{selected.pageUrl}</dd>
                    </dl>
                  </section>
                  <section className="card">
                    <h3>Status history</h3>
                    {selected.history.map((h) => (
                      <p key={h.id}>
                        <span className="pill">{label(h.status)}</span>
                        <small className="history-date">
                          {new Date(h.createdAt).toLocaleString()}
                        </small>
                      </p>
                    ))}
                  </section>
                </div>
              </div>
            </>
          ) : tab === "projects" ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">CONNECT YOUR WEBSITES</span>
                  <h1>
                    Your projects<span className="green">.</span>
                  </h1>
                  <p>A small snippet. A much clearer picture.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setEditing(null);
                    setProjectForm(true);
                  }}
                >
                  ＋ New project
                </button>
              </div>
              <div className="project-grid">
                {projects.map((p) => (
                  <section className="card" key={p.id}>
                    <span className="project-icon">▧</span>
                    <h2>{p.name}</h2>
                    <p>{p.origins.join(", ")}</p>
                    <button
                      className="link"
                      onClick={() => {
                        setEditing(p);
                        setProjectForm(true);
                      }}
                    >
                      Manage origins ↗
                    </button>
                    <h4>Install your widget</h4>
                    <pre className="snippet">{`<script src="${location.origin}/widget.js" data-project-key="${p.key}" defer></script>`}</pre>
                    <button
                      className="secondary"
                      onClick={() =>
                        void runAction(async () => {
                          await navigator.clipboard.writeText(
                            `<script src="${location.origin}/widget.js" data-project-key="${p.key}" defer></script>`,
                          );
                        })
                      }
                    >
                      Copy snippet
                    </button>
                  </section>
                ))}
              </div>
              {!projects.length && (
                <section className="empty card">
                  <h2>Give your first project a home.</h2>
                  <p>
                    Create a project to get your widget installation snippet.
                  </p>
                </section>
              )}
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">LESS GUESSWORK. FASTER FIXES.</span>
                  <h1>
                    The whole picture<span className="green">.</span>
                  </h1>
                  <p>
                    Every report, with the context you need to move forward.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setEditing(null);
                    setProjectForm(true);
                  }}
                >
                  ＋ New project
                </button>
              </div>
              <div className="stats">
                <div>
                  <span>Reports in this view</span>
                  <strong>{total.toString().padStart(2, "0")}</strong>
                  <small>Collected with context ↗</small>
                </div>
                <div>
                  <span>Connected projects</span>
                  <strong>{projects.length.toString().padStart(2, "0")}</strong>
                  <small>Your websites, in one place</small>
                </div>
                <div className="stat-feature">
                  <span className="orbit">◎</span>
                  <div>
                    <h3>
                      From “something broke”
                      <br />
                      to “I see it.”
                    </h3>
                    <p>Reproduce less. Resolve more.</p>
                  </div>
                </div>
              </div>
              <section className="report-section">
                <div className="section-heading">
                  <h2>
                    Bug reports <span className="count">{total}</span>
                  </h2>
                  <span className="muted">Your feedback inbox</span>
                </div>
                <div className="filters">
                  <input
                    aria-label="Search reports"
                    placeholder="⌕  Search report titles…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                  <select
                    aria-label="Filter project"
                    value={project}
                    onChange={(e) => {
                      setProject(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter status"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All statuses</option>
                    {["OPEN", "IN_PROGRESS", "RESOLVED"].map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter severity"
                    value={severity}
                    onChange={(e) => {
                      setSeverity(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All severities</option>
                    {["LOW", "MEDIUM", "HIGH"].map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>REPORT</th>
                        <th>PROJECT</th>
                        <th>STATUS</th>
                        <th>SEVERITY</th>
                        <th>REPORTED</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((r) => (
                        <tr key={r.id} onClick={() => void detail(r.id)}>
                          <td>
                            <button
                              className="report-title"
                              onClick={(e) => {
                                e.stopPropagation();
                                void detail(r.id);
                              }}
                            >
                              {r.title}
                            </button>
                            <small>
                              BL-{r.id.slice(-5).toUpperCase()} · {r.browser}
                            </small>
                          </td>
                          <td>
                            <span className="project-dot" />
                            {r.project.name}
                          </td>
                          <td>
                            <span className={"pill " + r.status.toLowerCase()}>
                              ● {label(r.status)}
                            </span>
                          </td>
                          <td>
                            <span
                              className={"severity " + r.severity.toLowerCase()}
                            >
                              ▥ {label(r.severity)}
                            </span>
                          </td>
                          <td>
                            {new Date(r.createdAt).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                          </td>
                          <td>↗</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!reports.length && (
                  <div className="empty">
                    <span className="empty-icon">◎</span>
                    <h3>A little clarity starts here.</h3>
                    <p>
                      Try the demo storefront, trigger a bug, and send your
                      first report.
                    </p>
                    <a className="secondary" href="/demo" target="_blank">
                      Open demo storefront ↗
                    </a>
                  </div>
                )}
                <footer className="pagination">
                  <span>
                    Showing {total ? Math.min((page - 1) * 8 + 1, total) : 0}–
                    {Math.min(page * 8, total)} of {total} reports
                  </span>
                  <div>
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      ← Previous
                    </button>
                    <span>{page}</span>
                    <button
                      disabled={page * 8 >= total}
                      onClick={() => setPage(page + 1)}
                    >
                      Next →
                    </button>
                  </div>
                </footer>
              </section>
              <div className="bottom-note">
                <span>◈</span> Useful context. Thoughtful privacy.{" "}
                <a href="/demo">See how it works ↗</a>
              </div>
            </>
          )}
          {projectForm && (
            <div className="modal">
              <section
                className="card"
                role="dialog"
                aria-modal="true"
                aria-label="Project settings"
              >
                <button
                  className="close link"
                  onClick={() => setProjectForm(false)}
                >
                  ✕ Close
                </button>
                <h2>{editing ? "Manage project" : "Create a project"}</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    await runAction(async () => {
                      await api(
                        "projects" + (editing ? "/" + editing.id : ""),
                        editing ? "PATCH" : "POST",
                        {
                          name: data.get("name"),
                          origins: String(data.get("origins"))
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      );
                      setProjectForm(false);
                      setTab("projects");
                      await refresh();
                    });
                  }}
                >
                  <label>
                    Project name
                    <input
                      name="name"
                      defaultValue={editing?.name}
                      required
                      maxLength={80}
                    />
                  </label>
                  <label>
                    Allowed origins (one per line)
                    <textarea
                      name="origins"
                      defaultValue={
                        editing?.origins.join("\n") || location.origin
                      }
                      required
                    />
                  </label>
                  <p>
                    Use exact origins, including port. Public project keys
                    identify your project; they are not secrets.
                  </p>
                  <p className="error" role="alert">
                    {error}
                  </p>
                  <button disabled={busy} className="primary">
                    {editing ? "Save project" : "Create project"}
                  </button>
                </form>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
