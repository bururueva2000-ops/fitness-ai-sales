import { z } from "zod";
import { SYSTEM_PROMPT } from "./system-prompt";
import { PRODUCT_INFO } from "./product";
import { GREETING } from "./chat-shared";
const message = z.object({ role: z.enum(["user", "model"]), text: z.string().trim().min(1).max(4000) }).strict();
export const requestSchema = z.object({ messages: z.array(message).min(2).max(100) }).strict().superRefine(({ messages }, ctx) => {
  if (messages[0].role !== "model" || messages[0].text !== GREETING || messages.at(-1)?.role !== "user" || messages.some((m, i) => m.role !== (i % 2 ? "user" : "model"))) ctx.addIssue({ code: "custom", message: "Invalid conversation order" });
});
const answerSchema = z.object({ text: z.string().trim().min(1).max(4000), offerPurchase: z.boolean() });
export class ChatError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function generateReply(messages: z.infer<typeof message>[], key: string, model = "gemini-3.6-flash", fetcher: typeof fetch = fetch) {
  if (!key || key === "your_api_key_here") throw new ChatError(503, "Консультант пока недоступен. Попробуй вернуться немного позже.");
  let response: Response;
  try {
    response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })), generationConfig: { temperature: 0.55, maxOutputTokens: 1800, ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}), responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { text: { type: "STRING" }, offerPurchase: { type: "BOOLEAN" } }, required: ["text", "offerPurchase"] } } }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new ChatError(504, "Ответ занимает больше времени, чем обычно. Попробуй ещё раз.");
    throw new ChatError(502, "Не удалось связаться с консультантом. Попробуй ещё раз чуть позже.");
  }
  if (response.status === 429) throw new ChatError(429, "Сейчас много обращений. Подожди немного и попробуй ещё раз.");
  if (!response.ok) throw new ChatError(502, "Консультант временно недоступен. Попробуй ещё раз чуть позже.");
  try {
    const data = z.object({ candidates: z.array(z.object({ finishReason: z.string(), content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional() })).optional() }).parse(await response.json()); const candidate = data.candidates?.[0];
    if (candidate?.finishReason !== "STOP" || !candidate.content) throw new Error("Incomplete or blocked answer");
    const result = answerSchema.parse(JSON.parse(candidate.content.parts.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("")));
    // Purchase URL is always trusted configuration, never model-generated.
    const text = result.text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/gi, "").trim();
    if (!text) throw new Error("Empty answer");
    const purchase = new URL(PRODUCT_INFO.PURCHASE_URL); if (purchase.protocol !== "https:") throw new Error("Invalid purchase URL");
    return { text, ...(result.offerPurchase ? { purchaseUrl: purchase.href } : {}) };
  } catch { throw new ChatError(502, "Не удалось получить полный ответ. Попробуй ещё раз."); }
}

