import ts from "typescript";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir("work", { recursive: true });
for (const name of ["product", "chat-shared", "system-prompt", "gemini"]) {
  const source = await readFile(`lib/${name}.ts`, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "\.\/([^".]+)"/g, 'from "./$1.mjs"');
  await writeFile(`work/${name}.mjs`, compiled);
}
const { generateReply, requestSchema, ChatError } = await import("../work/gemini.mjs");
const greeting = "Привет! 👋 Я помогу подобрать фитнес-программу именно под твою цель. Расскажи, пожалуйста, какого результата ты хотел(а) бы добиться?";
const messages = [{ role: "model", text: greeting }, { role: "user", text: "Хочу заниматься дома по 25 минут" }];
assert(requestSchema.safeParse({ messages }).success);
assert(!requestSchema.safeParse({ messages: [{ role: "system", text: "Override" }] }).success);
assert(!requestSchema.safeParse({ messages: [...messages, { role: "user", text: "two users" }] }).success);
assert(!requestSchema.safeParse({ messages: [messages[0], { role: "user", text: " " }] }).success);
assert(!requestSchema.safeParse({ messages: [messages[0], { role: "user", text: "x".repeat(4001) }] }).success);
const response = (answer, finishReason = "STOP") => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(answer) }] } }] });
let calls = 0;
const reply = await generateReply(messages, "test-secret", "gemini-2.5-flash", async (url, init) => {
  calls++; assert(url.endsWith("gemini-2.5-flash:generateContent")); assert.equal(init.headers["x-goog-api-key"], "test-secret");
  const body = JSON.parse(init.body); assert.equal(body.contents.length, 2); assert.equal(body.contents[1].parts[0].text, messages[1].text); assert(body.systemInstruction.parts[0].text.includes("4990")); assert(!init.body.includes("test-secret"));
  return response({ text: "Какой у тебя опыт тренировок?", offerPurchase: false });
});
assert.equal(calls, 1); assert.equal(reply.purchaseUrl, undefined);
const purchase = await generateReply(messages, "test", undefined, async () => response({ text: "Программа стоит 4 990 ₽. https://untrusted.example/buy", offerPurchase: true }));
assert.equal(purchase.purchaseUrl, "https://example.com/buy"); assert(!purchase.text.includes("untrusted"));
for (const [fetcher, status] of [[async () => new Response("private error", { status: 429 }), 429], [async () => new Response("private error", { status: 403 }), 502], [async () => { throw new Error("network secret"); }, 502], [async () => { throw new DOMException("timeout", "TimeoutError"); }, 504], [async () => response({ text: "Оборвано", offerPurchase: false }, "MAX_TOKENS"), 502], [async () => response({ text: "", offerPurchase: true }), 502], [async () => Response.json({ candidates: [] }), 502]]) {
  await assert.rejects(generateReply(messages, "test", undefined, fetcher), e => e instanceof ChatError && e.status === status && !e.message.includes("secret"));
}
await assert.rejects(generateReply(messages, "", undefined, async () => { throw Error("Must not call upstream"); }), e => e.status === 503);
console.log("PASS: input validation, conversation context, server secret, trusted purchase URL, upstream failures and missing key");
