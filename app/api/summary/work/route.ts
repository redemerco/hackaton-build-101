import { streamSummary } from "@/lib/summary";
import { buildWorkPrompt } from "@/lib/summary-work";
import { getCurrentUser } from "@/lib/users";

// POST /api/summary/work → resumen daily de trabajo en streaming (con caché si la IA se cae).
export async function POST() {
  const user = await getCurrentUser();
  const { system, prompt } = buildWorkPrompt(user.id);
  return streamSummary({ userId: user.id, kind: "work", system, prompt });
}
