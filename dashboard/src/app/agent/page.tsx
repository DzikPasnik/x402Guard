"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo } from "react";
import type { UIMessage } from "ai";

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-white text-black rounded-br-md"
            : "bg-white/10 text-white/90 border border-white/10 rounded-bl-md"
        }`}
      >
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool call indicator
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, { icon: string; loading: string; done: string }> = {
  check_proxy_health: { icon: "🔍", loading: "Checking proxy health...", done: "Proxy health checked" },
  list_agents: { icon: "📋", loading: "Listing agents...", done: "Agents loaded" },
  get_guardrail_rules: { icon: "🛡️", loading: "Loading guardrail rules...", done: "Guardrail rules loaded" },
  get_session_keys: { icon: "🔑", loading: "Loading session keys...", done: "Session keys loaded" },
  get_spend_summary: { icon: "💰", loading: "Calculating spend...", done: "Spend calculated" },
  simulate_payment: { icon: "💳", loading: "Simulating payment...", done: "Payment simulated" },
  get_audit_log: { icon: "📜", loading: "Querying audit log...", done: "Audit log loaded" },
};

function ToolCallIndicator({
  name,
  state,
}: {
  name: string;
  state: string;
}) {
  const label = TOOL_LABELS[name];
  const isDone = state === "output-available" || state === "output-error" || state === "output-denied";

  return (
    <div className="flex justify-start mb-2">
      <div
        className={`border rounded-xl px-3 py-2 text-xs flex items-center gap-2 transition-all ${
          isDone
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400/80"
            : "bg-white/5 border-white/10 text-white/50"
        }`}
      >
        {isDone ? (
          <span className="text-emerald-400">✓</span>
        ) : (
          <span className="animate-spin inline-block w-3 h-3 border border-white/30 border-t-white rounded-full" />
        )}
        {label
          ? `${label.icon} ${isDone ? label.done : label.loading}`
          : `⚙️ ${isDone ? `${name} done` : `Running ${name}...`}`}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggested prompts
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  {
    label: "🚀 Full Demo",
    prompt:
      "Show me a complete demo of x402Guard. Check the proxy, list agents, show their rules, simulate a payment, and show the audit log.",
  },
  {
    label: "🛡️ Guardrails",
    prompt:
      "List all agents and show me what guardrail rules are configured for each one.",
  },
  {
    label: "💳 Test Payment",
    prompt:
      "Pick an agent and try to simulate a payment of 0.50 USDC. Then try 5.00 USDC and see if it gets blocked.",
  },
  {
    label: "📊 Spend Report",
    prompt:
      "Give me a spending summary for all agents — how much they've spent today vs their daily limits.",
  },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AgentPage() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/agent" }),
    [],
  );

  const { messages, sendMessage, status } = useChat({ transport });

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = (text: string) => {
    if (!text.trim() || isLoading) return;
    setHasStarted(true);
    sendMessage({ text });
    setInput("");
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSend(input);
  };

  /** Extract plain text from a UIMessage's parts array. */
  const getMessageText = (msg: UIMessage): string =>
    (msg.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("")
      .trim();

  const renderMessage = (msg: UIMessage) => {
    if (msg.role === "user") {
      return (
        <MessageBubble
          key={msg.id}
          role="user"
          content={getMessageText(msg)}
        />
      );
    }

    if (msg.role === "assistant") {
      // Render parts in order to preserve the streaming feel
      return (
        <div key={msg.id}>
          {(msg.parts ?? []).map((part, i) => {
            if (part.type === "text" && part.text.trim()) {
              return (
                <MessageBubble
                  key={`text-${i}`}
                  role="assistant"
                  content={part.text}
                />
              );
            }

            // AI SDK v6: tool parts have type "tool-${toolName}" with state directly on part
            if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
              const toolName = part.type === "dynamic-tool"
                ? ((part as unknown as { toolName?: string }).toolName ?? "unknown")
                : part.type.slice(5); // remove "tool-" prefix
              const state = (part as unknown as { state: string }).state ?? "input-available";
              return (
                <ToolCallIndicator
                  key={`tool-${i}`}
                  name={toolName}
                  state={state}
                />
              );
            }

            return null;
          })}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#09090b]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-sm font-bold text-black">
              x
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm">
                x402Guard Agent
              </h1>
              <p className="text-white/40 text-xs">
                AI-powered DeFi security demo
              </p>
            </div>
          </div>
          <a
            href="/dashboard"
            className="text-white/40 hover:text-white/70 text-xs transition-colors"
          >
            ← Dashboard
          </a>
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {!hasStarted && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-2xl font-bold text-black">
                  x
                </div>
                <h2 className="text-white text-xl font-semibold mb-2">
                  x402Guard Agent Demo
                </h2>
                <p className="text-white/50 text-sm max-w-md">
                  Chat with an AI agent connected to the live x402Guard
                  production proxy. It can check guardrails, simulate
                  payments, and query audit logs.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => handleSend(s.prompt)}
                    className="text-left p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
                  >
                    <span className="text-sm text-white/70 group-hover:text-white transition-colors">
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(renderMessage)}

          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" />
                    <span
                      className="w-2 h-2 bg-white/40 rounded-full animate-bounce"
                      style={{ animationDelay: "0.15s" }}
                    />
                    <span
                      className="w-2 h-2 bg-white/40 rounded-full animate-bounce"
                      style={{ animationDelay: "0.3s" }}
                    />
                  </div>
                  <span className="text-white/30 text-xs">Agent is thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-white/10 bg-[#09090b]/80 backdrop-blur-sm sticky bottom-0">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <form onSubmit={onSubmit} className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the agent to demo x402Guard..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-white text-black rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Send
            </button>
          </form>
          <p className="text-white/20 text-xs mt-2 text-center">
            Connected to x402Guard production proxy • Base Sepolia testnet
          </p>
        </div>
      </div>
    </div>
  );
}
