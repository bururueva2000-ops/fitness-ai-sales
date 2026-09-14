"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, RotateCcw, Send, Sparkles, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GREETING } from "@/lib/chat-shared";
type Message = { role: "user" | "model"; text: string; purchaseUrl?: string };
const initial: Message[] = [{ role: "model", text: GREETING }];
export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Message[] | null>(null);
  const pending = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy, error]);
  useEffect(() => () => pending.current?.abort(), []);
  async function submit(text: string, retry?: Message[]) {
    if (pending.current || (!text.trim() && !retry)) return;
    const next: Message[] = retry ?? [...messages, { role: "user", text: text.trim() }];
    const controller = new AbortController(); pending.current = controller;
    setMessages(next); setInput(""); setError(""); setFailed(null); setBusy(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.map(({ role, text }) => ({ role, text })) }), signal: controller.signal });
      const data = await response.json() as { error?: string; text?: string; purchaseUrl?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось получить ответ. Попробуй ещё раз.");
      if (typeof data.text !== "string" || !data.text.trim()) throw new Error("Ответ не пришёл. Попробуй ещё раз.");
      if (pending.current !== controller) return;
      setMessages([...next, { role: "model", text: data.text, purchaseUrl: data.purchaseUrl }]);
    } catch (e) {
      if (pending.current !== controller || controller.signal.aborted) return;
      setError(e instanceof TypeError ? "Не удалось связаться с консультантом. Проверь подключение и попробуй ещё раз." : e instanceof Error ? e.message : "Не удалось получить ответ."); setFailed(next);
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(false); field.current?.focus(); }
    }
  }
  function reset() { pending.current?.abort(); pending.current = null; setMessages(initial); setInput(""); setBusy(false); setError(""); setFailed(null); field.current?.focus(); }
  const readState = useRef(() => ({ messages, busy })); readState.current = () => ({ messages, busy });
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try { Promise.resolve(context.registerTool({ name: "read_fitness_conversation", description: "Прочитать текущий фитнес-диалог и состояние ожидания ответа.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: (input: unknown) => { if (!input || typeof input !== "object" || Object.keys(input).length) throw new Error("Expected an empty object"); return readState.current(); } }, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional browser API. */ }
    return () => lifecycle.abort();
  }, []);
  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="/" aria-label="AI-фитнес консультант — главная"><span className="brand-icon"><Activity size={23} strokeWidth={2.3} /></span><span>форма<span className="brand-period">.</span></span></a><span className="header-note">Движение начинается с тебя</span></header>
    <main className="workspace"><div className="page-heading"><div><p className="eyebrow">ТВОЙ ПЕРВЫЙ ШАГ</p><h1>AI-фитнес консультант</h1><p className="subtitle">Найдём подход к тренировкам, который впишется в твою жизнь.</p></div><span className="heading-icon" aria-hidden="true"><Sparkles size={27} /></span></div>
      <section className="chat" aria-label="Чат с фитнес-консультантом">
        <div className="chat-header"><div className="consultant"><span className="avatar"><Sparkles size={20} /></span><div><h2>Твой фитнес-консультант</h2><p>Помогу разобраться и выбрать</p></div></div><Button variant="ghost" className="reset-button" onClick={reset}><RotateCcw size={16} /><span>Начать заново</span></Button></div>
        <div className="conversation" role="log" aria-live="polite" aria-relevant="additions" aria-label="История сообщений" aria-busy={busy}>
          <p className="date-label">Начало твоей истории</p>
          {messages.map((message, i) => <div key={i} className={`message-row ${message.role}`}>{message.role === "model" && <span className="message-avatar" aria-hidden="true"><Sparkles size={16} /></span>}<div className="message-content"><span className="message-author">{message.role === "user" ? "Ты" : "Консультант"}</span><div className="bubble"><p>{message.text}</p>{message.purchaseUrl && <a className="purchase-link" href={message.purchaseUrl} target="_blank" rel="noopener noreferrer">Перейти к покупке <ArrowUpRight size={17} /></a>}</div></div></div>)}
          {busy && <div className="typing" role="status"><span /><span /><span /><span className="typing-label">Консультант печатает</span></div>}
          {error && <div className="chat-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => failed && submit("", failed)}>Повторить</Button></div>}<div ref={bottom} />
        </div>
        <form className="composer" onSubmit={e => { e.preventDefault(); void submit(input); }}><label className="sr-only" htmlFor="message">Твоё сообщение</label><div className="input-row"><Textarea id="message" ref={field} value={input} onChange={e => setInput(e.target.value)} placeholder="Расскажи, к чему хочешь прийти…" maxLength={4000} rows={2} disabled={busy || !!failed} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(input); } }} /><Button type="submit" aria-label="Отправить" className="send-button" disabled={busy || !!failed || !input.trim()}><span>Отправить</span><Send size={17} /></Button></div><div className="composer-note"><span>В твоём темпе. Без давления.</span><span className="keyboard-tip">Enter — отправить</span></div></form>
      </section><p className="footer-note">Маленькие шаги. Твоя большая перемена.</p>
    </main>
  </div>;
}

