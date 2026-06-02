import { parseReminderIntent } from "./groq";
import { addReminder, listReminders, deleteReminder } from "./db";

function formatIST(utcString: string): string {
  // Handle both "YYYY-MM-DD HH:MM:SS" (SQLite) and ISO 8601 "...Z" formats
  const normalized = utcString.includes("T")
    ? utcString
    : utcString.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const HELP_TEXT = `*CampTalk Reminder Bot* 🤖

*Commands:*
• Just tell me naturally what to remind you about
  _e.g. "remind me to submit assignment tomorrow at 9am"_

• *LIST* — see all your pending reminders

• *DELETE 2* — delete reminder number 2

• *HELP* — show this message`;

function isOwner(from: string): boolean {
  const ownerPhone = process.env.OWNER_PHONE!;
  return from.includes(ownerPhone);
}

export async function handleMessage(
  from: string,
  text: string,
  sendMessage: (to: string, msg: string) => Promise<void>
): Promise<void> {

  console.log(`🔍 Checking owner: from=${from}, owner=${process.env.OWNER_PHONE}`);

  if (!isOwner(from)) {
    console.log(`⛔ Ignored non-owner: ${from}`);
    return;
  }

  console.log(`✅ Owner verified, processing: "${text}"`);

  const clean = text.trim();
  const upper = clean.toUpperCase();

  if (upper === "HELP") {
    await sendMessage(from, HELP_TEXT);
    return;
  }

  if (upper === "LIST") {
    const reminders = await listReminders(process.env.OWNER_PHONE!);
    if (reminders.length === 0) {
      await sendMessage(from, "📭 You have no pending reminders.");
      return;
    }
    const lines = reminders.map(
      (r, i) => `*${i + 1}.* ${r.task}\n    ⏰ ${formatIST(r.remind_at as string)}`
    );
    await sendMessage(from, `📋 *Your Reminders:*\n\n${lines.join("\n\n")}`);
    return;
  }

  if (upper.startsWith("DELETE ")) {
    const index = parseInt(clean.split(" ")[1]);
    if (isNaN(index)) {
      await sendMessage(from, "❌ Usage: DELETE followed by the reminder number\n_e.g. DELETE 2_");
      return;
    }
    const success = await deleteReminder(process.env.OWNER_PHONE!, index);
    await sendMessage(from, success ? `🗑️ Reminder #${index} deleted.` : `❌ No reminder at #${index}. Send LIST to check.`);
    return;
  }

  // NLP reminder parsing
  console.log(`🤖 Sending to Groq for parsing...`);
  const parsed = await parseReminderIntent(clean);
  console.log(`🤖 Groq response:`, JSON.stringify(parsed));

  if (!parsed.valid) {
    await sendMessage(
      from,
      `🤔 I didn't understand that. Try:\n_"remind me to call mom tomorrow at 6pm"_\n\nSend *HELP* for all commands.`
    );
    return;
  }

  const id = await addReminder(process.env.OWNER_PHONE!, parsed.task, parsed.remind_at);
  console.log(`💾 Saved reminder #${id}`);

  await sendMessage(
    from,
    `✅ Got it! Reminder #${id} set:\n\n*${parsed.task}*\n⏰ ${formatIST(parsed.remind_at)}\n\nSend *LIST* to see all reminders.`
  );
}