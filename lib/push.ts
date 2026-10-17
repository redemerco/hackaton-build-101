import "server-only";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, pushSubscriptions } from "@/lib/db";
import type { UserId } from "@/lib/users";

export type PushPayload = { title: string; body: string; url?: string };
export type StoredSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

let configured = false;

function ensureVapid(): void {
  if (configured) return;
  const { NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!NEXT_PUBLIC_VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error("Faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en .env.local");
  }
  webpush.setVapidDetails(VAPID_SUBJECT ?? "mailto:build101@example.com", NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
}

export function isStoredSubscription(v: unknown): v is StoredSubscription {
  const s = v as StoredSubscription | null;
  return (
    typeof s?.endpoint === "string" &&
    s.endpoint.startsWith("https://") &&
    typeof s.keys?.p256dh === "string" &&
    typeof s.keys?.auth === "string"
  );
}

export async function saveSubscription(userId: UserId, sub: StoredSubscription): Promise<void> {
  const row = { endpoint: sub.endpoint, userId, json: JSON.stringify(sub), createdAt: new Date().toISOString() };
  db.insert(pushSubscriptions)
    .values(row)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, json: row.json } })
    .run();
}

/** Manda a todos los dispositivos suscritos del usuario. Borra las suscripciones vencidas (404/410). */
export async function sendPush(userId: UserId, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  ensureVapid();
  const subs = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).all();
  const results = await Promise.allSettled(
    subs.map((s) => webpush.sendNotification(JSON.parse(s.json), JSON.stringify(payload))),
  );

  let sent = 0;
  let removed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      sent++;
      return;
    }
    const status = (r.reason as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subs[i].endpoint)).run();
      removed++;
    } else {
      console.error("[push] envío falló", status, r.reason);
    }
  });
  return { sent, removed };
}
