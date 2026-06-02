import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export interface ParsedReminder {
  task: string;
  remind_at: string; // ISO 8601 UTC string
  valid: boolean;
  error?: string;
}

export async function parseReminderIntent(
  message: string
): Promise<ParsedReminder> {
  const now = new Date().toISOString();

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a reminder parser. Current UTC time: ${now}. User is in IST (UTC+5:30).

Extract the reminder task and datetime from user messages. Convert intended time to UTC.

Reply ONLY with valid JSON, no markdown, no explanation:
{"task":"short task description under 10 words","remind_at":"2024-01-15T10:30:00.000Z","valid":true}

If NOT a reminder request:
{"task":"","remind_at":"","valid":false,"error":"not a reminder"}

Rules:
- "tomorrow" = next calendar day in IST
- "tonight" = today evening IST  
- "in 2 hours" = 2 hours from now UTC
- remind_at must be ISO 8601 UTC ending in Z
- task must be concise, under 10 words`,
      },
      {
        role: "user",
        content: message,
      },
    ],
    temperature: 0.1,
    max_tokens: 150,
  });

  try {
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ParsedReminder;
  } catch {
    return { task: "", remind_at: "", valid: false, error: "parse failed" };
  }
}
