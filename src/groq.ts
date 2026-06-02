import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export interface ParsedReminder {
  task: string;
  remind_at: string;
  valid: boolean;
  error?: string;
}

export async function parseReminderIntent(
  message: string
): Promise<ParsedReminder> {
  const now = new Date();
  const utcString = now.toISOString();

  // Calculate IST time explicitly — never let Groq guess the date
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);

  // IST date components
  const istYear = istNow.getUTCFullYear();
  const istMonth = String(istNow.getUTCMonth() + 1).padStart(2, "0");
  const istDay = String(istNow.getUTCDate()).padStart(2, "0");
  const istHour = String(istNow.getUTCHours()).padStart(2, "0");
  const istMin = String(istNow.getUTCMinutes()).padStart(2, "0");

  // Tomorrow in IST
  const istTomorrow = new Date(istNow.getTime() + 86400000);
  const istTomYear = istTomorrow.getUTCFullYear();
  const istTomMonth = String(istTomorrow.getUTCMonth() + 1).padStart(2, "0");
  const istTomDay = String(istTomorrow.getUTCDate()).padStart(2, "0");

  const istDateStr = `${istYear}-${istMonth}-${istDay}`;
  const istTomStr = `${istTomYear}-${istTomMonth}-${istTomDay}`;
  const istTimeStr = `${istHour}:${istMin}`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a smart reminder assistant that understands natural, casual human language.

CURRENT TIME (already calculated for you — do NOT recompute):
- UTC now: ${utcString}
- IST now: ${istDateStr} ${istTimeStr} (this is the user's local time)
- TODAY in IST = ${istDateStr}
- TOMORROW in IST = ${istTomStr}

Your job: extract the reminder TASK and TARGET TIME, then output JSON.

OUTPUT FORMAT - reply ONLY with JSON, no markdown, no explanation:
{"task":"concise action phrase","remind_at":"2026-06-03T10:30:00.000Z","valid":true}

If NOT a reminder:
{"task":"","remind_at":"","valid":false,"error":"not a reminder"}

HOW TO CALCULATE remind_at:
1. Figure out the target date and time in IST
2. Subtract 5 hours 30 minutes to convert to UTC
3. Output as ISO 8601 ending in Z

EXAMPLE (current IST is ${istDateStr} ${istTimeStr}):
- "today at 4:39am" = ${istDateStr} 04:39 IST = subtract 5:30 = target UTC datetime
- "tomorrow at 9am" = ${istTomStr} 09:00 IST = subtract 5:30 = target UTC datetime

TASK RULES:
- Core action only, under 8 words
- Remove: "remind me to", "don't forget to", "make sure to"
- Human phrasing: "call mom" not "make phone call to mother"

TIME RULES — user speaks in IST:

CLOCK TIMES (specific time of day):
- "at 4 39", "4:39 in the morning", "at 4 39 am" = 04:39 IST
- "at 9am" = 09:00 IST
- "at 9pm", "9 at night" = 21:00 IST
- "noon" = 12:00 IST
- "midnight" = 00:00 IST
- "morning" (no time) = 08:00 IST
- "afternoon" (no time) = 14:00 IST
- "evening" (no time) = 18:00 IST
- "night" (no time) = 21:00 IST

RELATIVE TIMES (duration from now):
- "in 5 minutes" = UTC now + 5 min
- "in 2 hours" = UTC now + 2 hours
- "in half an hour" = UTC now + 30 min
- "in 2 hours and 30 minutes" = UTC now + 2h30m
- "in an hour" = UTC now + 1 hour

DAY WORDS:
- "today" = ${istDateStr}
- "tomorrow" = ${istTomStr}
- "tonight" = ${istDateStr} evening
- "day after tomorrow" = add 2 days to ${istDateStr}

NO TIME GIVEN:
- "tomorrow" alone = ${istTomStr} 09:00 IST
- "today" alone = next round hour in IST
- No day, no time = UTC now + 1 hour

CRITICAL RULES:
- "today at X" ALWAYS uses date ${istDateStr} — never use tomorrow's date for "today"
- If "today at X" and X is already past in IST, still use ${istDateStr} (fire immediately)
- Never shift the date forward just because the time has passed`,
      },
      { role: "user", content: message },
    ],
    temperature: 0.1,
    max_tokens: 200,
  });

  try {
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as ParsedReminder;
    if (parsed.valid) {
      const diffMins = Math.round((new Date(parsed.remind_at).getTime() - Date.now()) / 60000);
      console.log(`Parsed time: ${parsed.remind_at} (${diffMins > 0 ? "+" + diffMins : diffMins} mins from now)`);
    }
    return parsed;
  } catch {
    return { task: "", remind_at: "", valid: false, error: "parse failed" };
  }
}