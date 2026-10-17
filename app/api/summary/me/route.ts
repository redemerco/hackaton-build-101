import { getCross } from "@/lib/cross";
import { streamSummary } from "@/lib/summary";
import { buildMePrompt } from "@/lib/summary-me";
import { getToday } from "@/lib/today";
import { getCurrentUser } from "@/lib/users";

// POST /api/summary/me → resumen daily de Yo en streaming (con caché si la IA se cae).
export async function POST() {
  const user = await getCurrentUser();
  const cross = getCross(user.id);
  const { system, prompt } = buildMePrompt(user.id, getToday(user.id, new Date(), cross.series), cross);
  return streamSummary({ userId: user.id, kind: "me", system, prompt });
}
