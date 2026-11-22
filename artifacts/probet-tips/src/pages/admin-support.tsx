import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Headset, Send, UserRound } from "lucide-react";
import {
  getGetAdminSupportConversationsQueryKey,
  getGetAdminSupportMessagesQueryKey,
  useGetAdminSupportConversations,
  useGetAdminSupportMessages,
  useSendAdminSupportMessage,
} from "@workspace/api-client-react";
import type { SupportConversation, SupportMessage } from "@workspace/api-client-react";
import { ErrorCard, Sk } from "@/components/app-shell";
import { errMsg } from "@/lib/probet";

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MessageBubble({ message }: { message: SupportMessage }) {
  const fromUser = message.senderRole === "user";
  return (
    <div className={`flex ${fromUser ? "justify-start" : "justify-end"}`}>
      <article className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${fromUser ? "border border-border bg-secondary/70" : "bg-primary text-primary-foreground"}`}>
        <p className="mb-1 text-[10px] font-bold uppercase opacity-70">{fromUser ? "User" : "Support Team"}</p>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <time className="mt-1 block text-right text-[10px] opacity-70">{formatMessageTime(message.createdAt)}</time>
      </article>
    </div>
  );
}

export default function AdminSupportInbox() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversations = useGetAdminSupportConversations({
    query: { refetchInterval: 5000, refetchIntervalInBackground: false },
  });
  const messages = useGetAdminSupportMessages(selectedId ?? "", {
    query: {
      enabled: Boolean(selectedId),
      refetchInterval: 5000,
      refetchIntervalInBackground: false,
    },
  });
  const sendMessage = useSendAdminSupportMessage();
  const selected = conversations.data?.find((item) => item.accountId === selectedId);

  useEffect(() => {
    const items = conversations.data ?? [];
    if (!items.length) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((item) => item.accountId === selectedId)) {
      setSelectedId(items[0].accountId);
    }
  }, [conversations.data, selectedId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.data, selectedId]);

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!selectedId || !content || sendMessage.isPending) return;
    setSendError("");
    sendMessage.mutate({ accountId: selectedId, data: { content } }, {
      onSuccess: () => {
        setDraft("");
        void queryClient.invalidateQueries({ queryKey: getGetAdminSupportMessagesQueryKey(selectedId) });
        void queryClient.invalidateQueries({ queryKey: getGetAdminSupportConversationsQueryKey() });
      },
      onError: (error) => setSendError(errMsg(error)),
    });
  }

  return (
    <div className="grid min-h-[min(70vh,42rem)] gap-4 md:grid-cols-[minmax(250px,0.75fr)_minmax(0,1.5fr)]" data-testid="admin-support-inbox">
      <section className="glass min-h-64 overflow-hidden rounded-3xl">
        <div className="border-b border-border p-4">
          <h2 className="font-display text-lg font-extrabold">Support conversations</h2>
          <p className="mt-1 text-xs text-muted-foreground">Private messages from users.</p>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
          {conversations.isLoading ? <Sk className="h-20" />
            : conversations.error ? <ErrorCard message={errMsg(conversations.error)} onRetry={() => conversations.refetch()} />
              : (conversations.data ?? []).length === 0 ? <p className="rounded-xl bg-background/40 p-4 text-sm text-muted-foreground" data-testid="status-empty-support">No support messages yet.</p>
                : conversations.data?.map((conversation: SupportConversation) => (
                  <button
                    key={conversation.accountId}
                    type="button"
                    onClick={() => { setSelectedId(conversation.accountId); setSendError(""); }}
                    className={`w-full rounded-2xl border p-3 text-left transition-colors ${selectedId === conversation.accountId ? "border-primary bg-primary/10" : "border-border bg-background/30 hover:bg-secondary/60"}`}
                    data-testid={`button-support-conversation-${conversation.accountId}`}
                  >
                    <span className="flex items-start gap-2">
                      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <b className="truncate text-sm">{conversation.fullName}</b>
                          <time className="shrink-0 text-[10px] text-muted-foreground">{formatMessageTime(conversation.lastMessageAt)}</time>
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">@{conversation.username} · {conversation.email}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{conversation.lastMessageRole === "admin" ? "You: " : ""}{conversation.lastMessage}</span>
                      </span>
                    </span>
                  </button>
                ))}
        </div>
      </section>

      <section className="glass flex min-h-[26rem] flex-col overflow-hidden rounded-3xl">
        {selected ? (
          <>
            <header className="border-b border-border p-4">
              <h2 className="font-display font-extrabold">{selected.fullName}</h2>
              <p className="mt-1 text-xs text-muted-foreground">@{selected.username} · {selected.email}</p>
            </header>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" data-testid="admin-support-messages">
              {messages.isLoading ? <Sk className="h-24" />
                : messages.error ? <ErrorCard message={errMsg(messages.error)} onRetry={() => messages.refetch()} />
                  : messages.data?.map((message) => <MessageBubble key={message.id} message={message} />)}
            </div>
            <form onSubmit={send} className="border-t border-border p-3">
              {sendError && <p className="mb-2 text-xs text-loss" role="alert">{sendError}</p>}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={2000}
                  rows={2}
                  placeholder="Reply to this user…"
                  className="min-h-11 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  aria-label="Reply to support conversation"
                  data-testid="input-admin-support-reply"
                />
                <button type="submit" disabled={!draft.trim() || sendMessage.isPending} className="btn-blue grid h-11 w-11 shrink-0 place-items-center rounded-xl disabled:opacity-50" aria-label="Send support reply" data-testid="button-send-admin-support-reply">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <Headset className="mx-auto h-10 w-10 text-primary" />
              <h2 className="mt-3 font-display text-lg font-extrabold">Your support inbox</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">When users send a private message, their conversation will appear here.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
