import { eq } from "drizzle-orm";
import { db, rawEvents } from "@/lib/db";
import { getCurrentUser } from "@/lib/users";

/** "Esto es tuyo": descarga todos tus raw_events en JSON. */
export async function GET() {
  const user = await getCurrentUser();
  const rows = db.select().from(rawEvents).where(eq(rawEvents.userId, user.id)).all();
  const events = rows.map(({ json, ...rest }) => ({ ...rest, data: JSON.parse(json) as unknown }));
  return new Response(JSON.stringify({ user: user.id, exportedAt: new Date().toISOString(), events }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="build101-${user.id}.json"`,
    },
  });
}
