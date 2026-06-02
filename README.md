<div align="center">

# 🤖 CampTalk

**A personal WhatsApp reminder bot powered by AI**

Set reminders in plain English. Get notified right in WhatsApp.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Groq](https://img.shields.io/badge/Groq-LLaMA_3.3-F55036?style=flat-square)](https://groq.com/)
[![Turso](https://img.shields.io/badge/Turso-SQLite_Cloud-4FF8D2?style=flat-square)](https://turso.tech/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

<img src="https://i.imgur.com/placeholder.png" width="320" alt="CampTalk Demo"/>

</div>

---

## ✨ What it does

Just message yourself on WhatsApp in plain English — CampTalk understands you and fires a reminder at exactly the right time.

```
You:  remind me to call the doctor in 3 minutes
Bot:  ✅ Got it! Reminder #7 set:
      call doctor
      ⏰ 03 Jun 2026, 04:15 am
      Send LIST to see all reminders.

...3 minutes later...

Bot:  ⏰ Reminder: call doctor
```

---

## 🧠 How it works

```
Your WhatsApp
     │
     ▼
Baileys (WA Web API)
     │
     ▼
Message Handler
     │
     ├─── Natural language? ──▶ Groq (LLaMA 3.3) ──▶ Parsed time + task
     │                                                        │
     │                                                        ▼
     └─── Command (LIST/DELETE/HELP)              Turso (SQLite Cloud)
                    │                                        │
                    ▼                                        ▼
              Direct reply                        node-cron checks every minute
                                                           │
                                                           ▼
                                                  WhatsApp notification 🔔
```

---

## 🚀 Quick Start

### 1. Clone & install

```bash
git clone https://github.com/yourusername/camptalk.git
cd camptalk
npm install
```

### 2. Get your API keys

<details>
<summary><b>🔑 Groq API Key (free)</b></summary>

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up and go to **API Keys**
3. Click **Create API Key** → copy it

</details>

<details>
<summary><b>🗄️ Turso Database (free)</b></summary>

1. Sign up at [turso.tech](https://turso.tech)
2. Install the CLI: `npm install -g @turso/cli`
3. Login: `turso auth login`
4. Create a database: `turso db create camptalk-db`
5. Get URL: `turso db show camptalk-db` → copy the **URL**
6. Get token: `turso db tokens create camptalk-db` → copy the **token**

</details>

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
OWNER_PHONE=91XXXXXXXXXX        # Your number with country code, no + or spaces
GROQ_API_KEY=gsk_...            # From Groq console
TURSO_DATABASE_URL=libsql://... # From turso db show
TURSO_AUTH_TOKEN=...            # From turso db tokens create
```

> ⚠️ **OWNER_PHONE format:** Country code + number, no symbols. India example: `919304832942`

### 4. Run locally

```bash
npm run dev
```

Scan the QR code that appears in terminal with:
**WhatsApp → ⋮ Menu → Linked Devices → Link a Device**

You'll see:
```
✅ CampTalk connected to WhatsApp!
ℹ️  Bot JID: 91XXXXXXXXXX:XX@s.whatsapp.net
⏱️  Scheduler started
```

Now message yourself on WhatsApp and it just works. 🎉

---

## 💬 Commands

| Message | What happens |
|---|---|
| `remind me to [task] at [time]` | Set a reminder using natural language |
| `remind me to [task] in [X] minutes/hours` | Set a relative reminder |
| `LIST` | See all your pending reminders |
| `DELETE 2` | Delete reminder number 2 |
| `HELP` | Show command reference |

### 🗣️ Natural language examples

```
remind me to drink water in 30 minutes
remind me to call mom tonight at 9pm
remind me to submit the report tomorrow at 10am
gym tomorrow morning
meeting prep at 5pm
remind me to take medicine in 2 hours and 30 minutes
```

---

## ☁️ Deploy to Koyeb (free, always-on)

> Koyeb's free tier keeps your bot running 24/7 with no sleep.

### 1. Push to GitHub

```bash
git add .
git commit -m "initial commit"
git push origin main
```

### 2. Deploy

1. Go to [koyeb.com](https://koyeb.com) → **Create Service** → **GitHub**
2. Select your repo
3. Set **Run command:** `npm start`
4. Add all environment variables from your `.env`
5. Click **Deploy**

### 3. Scan QR on first deploy

Open the **Koyeb logs** and scan the QR code that appears.

> **Note:** The `auth_info/` folder lives in ephemeral storage on Koyeb. If the service restarts, you'll need to re-scan the QR once. Sessions typically last several weeks.

---

## 🗂️ Project Structure

```
camptalk/
├── src/
│   ├── index.ts       # Entry point, WhatsApp connection & message routing
│   ├── bot.ts         # Command handler (LIST, DELETE, HELP, NLP reminders)
│   ├── groq.ts        # LLaMA 3.3 NLP parser — extracts task & time
│   ├── db.ts          # Turso (SQLite) — store, list, delete, fire reminders
│   └── scheduler.ts   # node-cron job — checks due reminders every minute
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── Procfile           # For Koyeb/Heroku: web: npm start
```

---

## 🛠️ Tech Stack

| Tool | Purpose |
|---|---|
| [Baileys](https://github.com/WhiskeySockets/Baileys) | WhatsApp Web API (no official API needed) |
| [Groq + LLaMA 3.3](https://groq.com/) | Ultra-fast NLP to parse reminder intent |
| [Turso](https://turso.tech/) | Serverless SQLite — stores all reminders |
| [node-cron](https://github.com/node-cron/node-cron) | Fires reminders every minute |
| [TypeScript](https://www.typescriptlang.org/) | Type safety throughout |
| [Koyeb](https://koyeb.com/) | Free always-on hosting |

---

## 🔒 Privacy & Security

- **Only your number** can interact with the bot — all other senders are silently ignored
- Your WhatsApp session (`auth_info/`) is **gitignored** and never pushed to GitHub
- `.env` is **gitignored** — your keys stay local
- The bot only responds to the `OWNER_PHONE` set in your environment

---

## 🐛 Troubleshooting

**Bot connected but messages not appearing in terminal**
→ Make sure you're messaging from your phone, not WhatsApp Web/Desktop (known Baileys limitation for self-chat)

**`Bad MAC` errors in logs**
→ Harmless — Baileys failing to decrypt old cached messages. Doesn't affect functionality.

**Reminders not firing**
→ Check that `remind_at` in your Turso DB looks like `2026-06-03 10:30:00` (no T, no Z). If it has a Z, run:
```sql
UPDATE reminders SET remind_at = REPLACE(REPLACE(remind_at, 'T', ' '), 'Z', '') WHERE remind_at LIKE '%T%';
```

**Bot logged out after Koyeb restart**
→ Delete `auth_info/` and re-scan the QR from the Koyeb logs.

---

## 📄 License

MIT — do whatever you want with it.

---

<div align="center">
  Built with ☕ and too many reminders to drink water
</div>