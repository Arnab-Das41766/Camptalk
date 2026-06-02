import cron from "node-cron";
import { getDueReminders, markSent } from "./db";

export function startScheduler(
  sendMessage: (to: string, msg: string) => Promise<void>
): void {
  // Runs every minute
  cron.schedule("* * * * *", async () => {
    try {
      const due = await getDueReminders();
      for (const reminder of due) {
        // Pass the bare owner phone — index.ts sendMessage() will
        // resolve it to the correct self-JID (sock.user.id).
        const to = process.env.OWNER_PHONE! + "@s.whatsapp.net";
        await sendMessage(
          to,
          `⏰ *Reminder:* ${reminder.task}`
        );
        await markSent(Number(reminder.id));
        console.log(`✅ Sent reminder #${reminder.id}: ${reminder.task}`);
      }
    } catch (err) {
      console.error("Scheduler error:", err);
    }
  });

  console.log("⏱️  Scheduler started — checking every minute");
}