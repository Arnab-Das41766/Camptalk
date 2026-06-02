import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
import { initDB } from "./db";
import { handleMessage } from "./bot";
import { startScheduler } from "./scheduler";

dotenv.config();

const logger = pino({ level: "silent" });
let schedulerStarted = false;
let isReconnecting = false;
let currentSock: ReturnType<typeof makeWASocket> | null = null;

// Returns the correct JID to send messages to the owner.
// When sending to yourself in Baileys you MUST use sock.user.id
// (e.g. "919304832942:12@s.whatsapp.net") — NOT the bare number JID.
// Using the bare number JID causes WhatsApp to silently drop the message.
function getOwnerJid(): string {
  if (currentSock?.user?.id) {
    return currentSock.user.id;
  }
  // Fallback: bare JID (works for receiving, not for self-send)
  return process.env.OWNER_PHONE! + "@s.whatsapp.net";
}

async function sendMessage(to: string, msg: string): Promise<void> {
  if (!currentSock) {
    console.error("❌ No active socket");
    return;
  }
  try {
    // If the destination is the owner, always use the authenticated user JID
    // so WhatsApp delivers it as a "Note to self" / message to yourself.
    const ownerPhone = process.env.OWNER_PHONE!;
    const isToOwner =
      to.includes(ownerPhone) || to === getOwnerJid();

    const destination = isToOwner ? getOwnerJid() : to;

    await new Promise(r => setTimeout(r, 300));
    await currentSock.sendMessage(destination, { text: msg });
    console.log(`✅ Reply sent to ${destination}`);
  } catch (err) {
    console.error("❌ Send failed:", err);
  }
}

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ["CampTalk", "Chrome", "1.0.0"],
    keepAliveIntervalMs: 30000,
    syncFullHistory: false,
  });

  currentSock = sock;
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 Scan this QR code with WhatsApp → Linked Devices → Link a Device:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      currentSock = null;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`🔄 Reconnecting in 5s... (reason: ${statusCode})`);

      if (shouldReconnect && !isReconnecting) {
        isReconnecting = true;
        setTimeout(async () => {
          isReconnecting = false;
          await connect();
        }, 5000);
      } else if (!shouldReconnect) {
        console.log("❌ Logged out. Delete auth_info folder and restart.");
        process.exit(1);
      }
    }

    if (connection === "open") {
      currentSock = sock;
      isReconnecting = false;
      console.log("✅ CampTalk connected to WhatsApp!");
      console.log(`ℹ️  Bot JID: ${sock.user?.id}`);

      if (!schedulerStarted) {
        schedulerStarted = true;
        startScheduler(sendMessage);
        console.log("⏱️  Scheduler started");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message) continue;
      const from = msg.key.remoteJid!;
      if (from === "status@broadcast") continue;
      if (from.endsWith("@lid")) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.ephemeralMessage?.message?.conversation ||
        "";

      if (!text) continue;

      console.log(`📨 "${text}" from ${from}`);

      try {
        await handleMessage(from, text, sendMessage);
      } catch (err) {
        console.error("❌ Error:", err);
      }
    }
  });
}

async function main() {
  await initDB();
  console.log("🚀 Starting CampTalk...");
  await connect();
}

main().catch(console.error);