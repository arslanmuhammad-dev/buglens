import { drainMailQueue } from "../apps/web/lib/mail";
import { db } from "../apps/web/lib/db";
try {
  console.log(await drainMailQueue(20));
} finally {
  await db.$disconnect();
}
