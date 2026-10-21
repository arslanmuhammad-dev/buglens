# LinkedIn launch draft — for review, not published

Status: hold publication until the real Vercel URL passes the hosted test checklist. Replace the link placeholder with the verified URL.

---

“It’s not working.”

That’s often where a bug report starts. Then comes the back-and-forth: Which page? Which browser? What did you click? Can you send a screenshot?

I built **BugLens** to make that conversation shorter.

It’s a website bug-reporting tool with a small embeddable widget and a developer dashboard. A report brings together:

• What happened, steps to reproduce, and expected behavior
• An optional screenshot with highlights and permanent redactions
• A recent timeline of failed requests, navigation, and JavaScript errors
• Browser and viewport details

Privacy was a core design decision: no keystrokes, input values, request bodies, or session replay. Reporters can review the sanitized payload and remove diagnostics or the screenshot before sending.

On the developer side, I added project origin controls, private screenshot access, search and filters, internal notes, and status history.

The demo is a fictional storefront with an intentionally broken checkout, so you can try the whole workflow yourself.

Built with TypeScript, Next.js, PostgreSQL/Prisma, Better Auth, and Vite, with unit, integration, and Chromium/mobile browser tests.

Try it: [VERIFIED VERCEL URL]
Source: https://github.com/arslanmuhammad-dev/buglens

I’d love feedback from developers: what information is most often missing from the bug reports you receive?

#WebDevelopment #TypeScript #NextJS #BuildInPublic #DeveloperTools

---

## Before publishing

- Replace the placeholder with the verified hosted URL.
- Attach a short recording: trigger the demo bug → submit report → open dashboard → resolve.
- Use only fake data and a disposable demo account in the recording.
- Do not claim that all bugs are eliminated or that unexecuted tests passed.
