import { useEffect, useRef, useState, type FormEvent } from "react";
import { Headset, MessageCircle, Send, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSupportMessagesQueryKey,
  useGetSupportMessages,
  useSendSupportMessage,
} from "@workspace/api-client-react";
import { errMsg } from "@/lib/probet";

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = useGetSupportMessages({
    query: {
      enabled: open,
      refetchInterval: 5000,
      refetchIntervalInBackground: false,
    },
  });
  const sendMessage = useSendSupportMessage();

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [open, messages.data]);

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sendMessage.isPending) return;
    setSendError("");
    sendMessage.mutate({ data: { content } }, {
      onSuccess: () => {
        setDraft("");
        void queryClient.invalidateQueries({ queryKey: getGetSupportMessagesQueryKey() });
      },
      onError: (error) => setSendError(errMsg(error)),
    });
  }

  return (
    <>
      {open && (
        <section
          className="fixed bottom-20 right-4 z-50 flex h-[min(70vh,34rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-3xl border border-primary/30 bg-[hsl(224_62%_12%)] shadow-2xl"
          aria-label="Private support conversation"
          data-testid="card-support-inbox"
        >
          <header className="flex items-center justify-between border-b border-border bg-background/40 p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Headset className="h-5 w-5" /></span>
              <div>
                <h2 className="font-display font-extrabold">Support Team</h2>
                <p className="text-xs text-muted-foreground">Private conversation</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" aria-label="Close support" data-testid="button-close-support">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" data-testid="list-support-messages">
            {messages.isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading your conversation…</p>
            ) : messages.error ? (
              <div className="rounded-xl border border-loss/30 bg-loss/10 p-3 text-sm text-loss" role="alert">
                <p>{errMsg(messages.error)}</p>
                <button type="button" onClick={() => messages.refetch()} className="mt-2 underline">Try again</button>
              </div>
            ) : messages.data?.length ? messages.data.map((message) => (
              <div key={message.id} className={`flex ${message.senderRole === "user" ? "justify-end" : "justify-start"}`}>
                <article className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm ${message.senderRole === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-secondary/70"}`}>
                  <p className="mb-1 text-[10px] font-bold uppercase opacity-70">{message.senderRole === "user" ? "You" : "Support Team"}</p>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <time className="mt-1 block text-right text-[10px] opacity-70">{formatMessageTime(message.createdAt)}</time>
                </article>
              </div>
            )) : (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <MessageCircle className="mx-auto h-9 w-9 text-primary" />
                  <p className="mt-3 font-bold">How can we help?</p>
                  <p className="mt-1 text-xs text-muted-foreground">Send a private message to the support team.</p>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={send} className="border-t border-border bg-background/40 p-3">
            {sendError && <p className="mb-2 text-xs text-loss" role="alert">{sendError}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={2000}
                rows={2}
                placeholder="Write to support…"
                className="min-h-11 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                aria-label="Message to support"
                data-testid="input-support-message"
              />
              <button type="submit" disabled={!draft.trim() || sendMessage.isPending} className="btn-blue grid h-11 w-11 shrink-0 place-items-center rounded-xl disabled:opacity-50" aria-label="Send support message" data-testid="button-send-support-message">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-4 z-50 flex items-center gap-2 rounded-full border border-primary/40 bg-primary px-4 py-3 font-bold text-primary-foreground shadow-xl transition-transform hover:scale-105"
        aria-expanded={open}
        aria-label={open ? "Close support" : "Contact support team"}
        data-testid="button-open-support"
      >
        {open ? <X className="h-5 w-5" /> : <Headset className="h-5 w-5" />}
        <span>{open ? "Close" : "Support"}</span>
      </button>
    </>
  );
}
