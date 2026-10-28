import { consumeLimit } from "./rate-limit";
import nodemailer from "nodemailer";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { db } from "./db";
const mailSchema = z
  .object({
    to: z.string().email().max(254),
    subject: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^\r\n]+$/),
    text: z.string().max(20000),
  })
  .strict();
export type Mail = z.infer<typeof mailSchema>;
function key() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw Error("A strong auth secret is required for encrypted email storage");
  return createHash("sha256")
    .update("buglens-mail-v1\0" + secret)
    .digest();
}
export function seal(value: unknown) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}
export function unseal(value: string): unknown {
  const [version, nonce, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !nonce || !tag || !ciphertext)
    throw Error("Invalid encrypted email");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(nonce, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
export function mailEnabled() {
  if (process.env.EMAIL_PROVIDER === "gmail")
    return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  return process.env.EMAIL_PROVIDER === "mailpit" && !process.env.VERCEL;
}
export async function enqueueMail(input: {
  kind: string;
  dedupeKey: string;
  mail: Mail;
  expiresAt: Date;
  userId?: string;
  reportId?: string;
}) {
  const { mail, ...data } = input;
  const content = seal(mailSchema.parse(mail));
  return db.emailJob.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},
    create: { ...data, content },
  });
}
export async function sendMail(mail: Mail, id: string) {
  if (!mailEnabled()) throw Error("MAIL_NOT_CONFIGURED");
  if (process.env.EMAIL_PROVIDER === "gmail") {
    const result = await gmailTransport().sendMail({
      from: { name: "BugLens", address: process.env.GMAIL_USER! },
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      messageId: `<${id}@buglens.local>`,
    });
    if (!result.accepted.length) throw Error("MAIL_PROVIDER_REJECTED");
    return String(result.messageId).slice(0, 100);
  }
  const endpoint = new URL(process.env.MAILPIT_URL || "http://127.0.0.1:8025");
  if (
    endpoint.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password
  )
    throw Error("MAILPIT_REQUIRES_LOOPBACK");
  const result = await fetch(new URL("/api/v1/send", endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      From: { Email: "buglens@example.test", Name: "BugLens" },
      To: [{ Email: mail.to }],
      Subject: mail.subject,
      Text: mail.text,
      Headers: { "Message-ID": `<${id}@buglens.local>` },
    }),
  });
  if (!result.ok) throw Error("MAIL_PROVIDER_" + result.status);
  const data = await result.json();
  return String(data.ID || data.id || id).slice(0, 100);
}
export async function drainMailQueue(limit = 10) {
  if (!mailEnabled()) return { sent: 0, failed: 0, configured: false };
  const now = new Date();
  await db.emailJob.updateMany({
    where: {
      expiresAt: { lte: now },
      state: { in: ["PENDING", "SENDING", "FAILED"] },
    },
    data: {
      state: "CANCELLED",
      content: null,
      leaseUntil: null,
      lastError: "EXPIRED",
    },
  });
  const jobs = await db.emailJob.findMany({
    where: {
      expiresAt: { gt: now },
      nextAt: { lte: now },
      OR: [
        { state: "PENDING" },
        { state: "SENDING", leaseUntil: { lte: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 20),
  });
  let sent = 0,
    failed = 0;
  for (const job of jobs) {
    const claim = await db.emailJob.updateMany({
      where: {
        id: job.id,
        OR: [
          { state: "PENDING" },
          { state: "SENDING", leaseUntil: { lte: now } },
        ],
      },
      data: {
        state: "SENDING",
        leaseUntil: new Date(Date.now() + 60000),
        attempts: { increment: 1 },
      },
    });
    if (!claim.count) continue;
    try {
      if (!job.content) throw Error("EMPTY_CONTENT");
      if (
        process.env.EMAIL_PROVIDER === "gmail" &&
        !(await consumeLimit("email:daily", 400, 86400000))
      )
        throw Error("MAIL_DAILY_LIMIT");
      const providerId = await sendMail(
        mailSchema.parse(unseal(job.content)),
        job.id,
      );
      await db.emailJob.update({
        where: { id: job.id },
        data: {
          state: "SENT",
          sentAt: new Date(),
          providerId,
          content: null,
          leaseUntil: null,
          lastError: null,
        },
      });
      sent++;
    } catch (e) {
      const code =
        e instanceof Error &&
        /^(MAIL_PROVIDER_\d+|MAIL_NOT_CONFIGURED|MAIL_DAILY_LIMIT|MAILPIT_REQUIRES_LOOPBACK)$/.test(
          e.message,
        )
          ? e.message
          : "DELIVERY_FAILED";
      await db.emailJob.update({
        where: { id: job.id },
        data: {
          state: job.attempts >= 4 ? "FAILED" : "PENDING",
          leaseUntil: null,
          nextAt: new Date(
            Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts),
          ),
          lastError: code,
        },
      });
      failed++;
    }
  }
  return { sent, failed, configured: true };
}

export function gmailTransport() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD)
    throw Error("MAIL_NOT_CONFIGURED");
  const user = z.string().email().max(254).parse(process.env.GMAIL_USER);
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, "") },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
}
