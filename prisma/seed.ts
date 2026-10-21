import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
const db = new PrismaClient();
async function seed() {
  const id = "demo-user";
  await db.user.upsert({
    where: { id },
    update: {},
    create: {
      id,
      name: "Alex Morgan",
      email: "demo@buglens.local",
      emailVerified: true,
      accounts: {
        create: {
          id: "demo-account",
          accountId: id,
          providerId: "credential",
          password: await hashPassword("BugLens-demo-2026"),
        },
      },
    },
  });
  const project = await db.project.upsert({
    where: { key: "buglens-demo-public" },
    update: {},
    create: {
      id: "demo-project",
      key: "buglens-demo-public",
      name: "Form & Field",
      ownerId: id,
      origins: ["http://127.0.0.1:3000", "http://localhost:3000"],
    },
  });
  const titles = [
    "Checkout fails when placing an order",
    "Product image is missing on mobile",
    "Cart total doesn’t update after removing item",
    "Wishlist confirmation could be clearer",
    "Shipping options fail to load",
    "Product page crashes on inventory lookup",
    "Menu closes before selecting a category",
    "Discount code displays the wrong message",
    "Order confirmation link is broken",
    "Quantity selector resets unexpectedly",
  ];
  for (let i = 0; i < titles.length; i++) {
    await db.report.upsert({
      where: { id: `demo-report-${i}` },
      update: {},
      create: {
        id: `demo-report-${i}`,
        title: titles[i],
        description:
          "A fictional report for the BugLens portfolio demo. The action does not complete as expected.",
        steps:
          "1. Open the storefront\n2. Select the Sol table lamp\n3. Click Place order",
        expected: "The action should complete and show a confirmation.",
        projectId: project.id,
        status: i === 3 ? "RESOLVED" : i === 1 ? "IN_PROGRESS" : "OPEN",
        severity: i % 3 === 0 ? "HIGH" : i % 3 === 1 ? "MEDIUM" : "LOW",
        pageUrl: "http://127.0.0.1:3000/demo",
        browser: i % 2 ? "Safari" : "Chrome",
        viewport: "1440x900",
        createdAt: new Date(Date.UTC(2026, 9, 21, 10, i)),
        events: {
          create: [
            {
              order: 0,
              data: {
                type: "navigation",
                time: 1792576800000,
                url: "http://127.0.0.1:3000/demo",
              },
            },
            {
              order: 1,
              data: {
                type: "request",
                time: 1792576801000,
                url: "http://127.0.0.1:3000/api/demo-order",
                method: "POST",
                status: 503,
                duration: 42,
              },
            },
          ],
        },
        history: {
          create: {
            status: i === 3 ? "RESOLVED" : i === 1 ? "IN_PROGRESS" : "OPEN",
          },
        },
      },
    });
  }
}
seed().finally(() => db.$disconnect());
