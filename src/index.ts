import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
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

// ── Anti-loop: track message IDs the bot itself sends ────────────────
const sentMessageIds = new Set<string>();

// ── Dedup: prevent double-processing when both "notify" and "append" fire ──
const processedMessageIds = new Set<string>();
const PROCESSED_TTL_MS = 60_000; // forget after 1 minute

function getOwnerJid(): string {
  if (currentSock?.user?.id) {
    return currentSock.user.id;
  }
  return process.env.OWNER_PHONE! + "@s.whatsapp.net";
}

async function sendMessage(to: string, msg: string): Promise<void> {
  if (!currentSock) {
    console.error("⚠️  No active socket — cannot send");
    return;
  }
  try {
    const ownerPhone = process.env.OWNER_PHONE!;
    const isToOwner = to.includes(ownerPhone) || to === getOwnerJid();
    const destination = isToOwner ? getOwnerJid() : to;

    // Small delay so the reply doesn't race with the incoming message
    await new Promise((r) => setTimeout(r, 300));
    const result = await currentSock.sendMessage(destination, { text: msg });

    if (result?.key?.id) {
      sentMessageIds.add(result.key.id);
      // Clean up after 30s — no message takes that long to echo back
      setTimeout(() => sentMessageIds.delete(result.key.id!), 30_000);
    }

    console.log(`📤 Reply sent to ${destination}`);
  } catch (err) {
    console.error("❌ Send failed:", err);
  }
}

// ── Extract text from any message wrapper type ───────────────────────
function extractText(msg: proto.IMessage | null | undefined): string {
  if (!msg) return "";

  // Direct conversation
  if (msg.conversation) return msg.conversation;

  // Extended text (replies, links, etc.)
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;

  // Ephemeral (disappearing messages)
  if (msg.ephemeralMessage?.message) {
    return extractText(msg.ephemeralMessage.message);
  }

  // View-once
  if (msg.viewOnceMessage?.message) {
    return extractText(msg.viewOnceMessage.message);
  }
  if (msg.viewOnceMessageV2?.message) {
    return extractText(msg.viewOnceMessageV2.message);
  }

  // Document with caption
  if (msg.documentWithCaptionMessage?.message) {
    return extractText(msg.documentWithCaptionMessage.message);
  }

  // Image/video/document captions
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.documentMessage?.caption) return msg.documentMessage.caption;

  // Template / button responses
  if (msg.templateButtonReplyMessage?.selectedDisplayText) {
    return msg.templateButtonReplyMessage.selectedDisplayText;
  }
  if (msg.buttonsResponseMessage?.selectedDisplayText) {
    return msg.buttonsResponseMessage.selectedDisplayText;
  }
  if (msg.listResponseMessage?.title) {
    return msg.listResponseMessage.title;
  }

  return "";
}

// ── Core message handler — called from every event listener ──────────
async function processMessage(msg: proto.IWebMessageInfo, source: string): Promise<void> {
  const msgId = msg.key.id;

  // No message content at all
  if (!msg.message) {
    return;
  }

  const from = msg.key.remoteJid ?? "";

  // Skip status broadcasts and LID messages
  if (from === "status@broadcast") return;
  if (from.endsWith("@lid")) return;

  // Skip bot's own replies (anti-loop)
  if (msgId && sentMessageIds.has(msgId)) {
    console.log(`🔁 Skipped own reply (id: ${msgId?.slice(-6)}) [${source}]`);
    return;
  }

  // Dedup: skip if we already processed this message from another event
  if (msgId && processedMessageIds.has(msgId)) {
    console.log(`♻️  Dedup skip (id: ${msgId?.slice(-6)}) [${source}]`);
    return;
  }

  // Extract text
  const text = extractText(msg.message);
  if (!text) return;

  // Mark as processed
  if (msgId) {
    processedMessageIds.add(msgId);
    setTimeout(() => processedMessageIds.delete(msgId!), PROCESSED_TTL_MS);
  }

  console.log(
    `📩 [${source}] Message: "${text}" from ${from} (fromMe: ${msg.key.fromMe}, id: ${msgId?.slice(-6)})`
  );

  try {
    await handleMessage(from, text, sendMessage);
  } catch (err) {
    console.error("❌ Error handling message:", err);
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
    keepAliveIntervalMs: 30_000,
    syncFullHistory: false,
  });

  currentSock = sock;
  sock.ev.on("creds.update", saveCreds);

  // ── Connection lifecycle ───────────────────────────────────────────
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(
        "\nScan this QR code with WhatsApp -> Linked Devices -> Link a Device:\n"
      );
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      currentSock = null;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Reconnecting in 5s... (reason: ${statusCode})`);

      if (shouldReconnect && !isReconnecting) {
        isReconnecting = true;
        setTimeout(async () => {
          isReconnecting = false;
          await connect();
        }, 5000);
      } else if (!shouldReconnect) {
        console.log("Logged out. Delete auth_info folder and restart.");
        process.exit(1);
      }
    }

    if (connection === "open") {
      currentSock = sock;
      isReconnecting = false;
      console.log("CampTalk connected to WhatsApp!");
      console.log(`Bot JID: ${sock.user?.id}`);

      if (!schedulerStarted) {
        schedulerStarted = true;
        startScheduler(sendMessage);
        console.log("Scheduler started");
      }
    }
  });

  // ── Primary: messages.upsert — accept BOTH "notify" and "append" ───
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;

    console.log(
      `📬 messages.upsert [${type}]: ${messages.length} message(s)`
    );

    for (const msg of messages) {
      await processMessage(msg, `upsert/${type}`);
    }
  });

  // ── Fallback: messages.update — catches edits and delayed deliveries ─
  sock.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      // Only care if there's an actual message payload attached
      if (!update.update?.message) continue;

      // Build a minimal WebMessageInfo to feed into processMessage
      const fakeMsg: proto.IWebMessageInfo = {
        key: update.key,
        message: update.update.message,
      };

      await processMessage(fakeMsg, "messages.update");
    }
  });
}

async function main() {
  await initDB();
  console.log("Starting CampTalk...");
  await connect();
}

main().catch(console.error);