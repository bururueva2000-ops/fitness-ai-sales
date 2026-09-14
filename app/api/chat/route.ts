import { env } from "cloudflare:workers";
import { ChatError, generateReply, requestSchema } from "@/lib/gemini";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Запрос с другого сайта запрещён." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "Неверный формат сообщения." }, 415);
  try {
    const reader = request.body?.getReader(); if (!reader) return json({ error: "Пустое сообщение." }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 120000) { await reader.cancel(); return json({ error: "Диалог стал слишком длинным. Нажми «Начать заново»." }, 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
    let body: unknown; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: "Неверный формат сообщения." }, 400); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Не удалось прочитать диалог. Сообщение должно быть до 4 000 символов, диалог — до 50 ответов. Начни заново, если лимит достигнут." }, 400);
    const secrets = env as unknown as { GEMINI_API_KEY?: string; GEMINI_MODEL?: string };
    return json(await generateReply(parsed.data.messages, secrets.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? "", secrets.GEMINI_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-3.6-flash"));
  } catch (error) {
    if (error instanceof ChatError) return json({ error: error.message }, error.status);
    return json({ error: "Не удалось получить ответ. Попробуй ещё раз." }, 500);
  }
}
