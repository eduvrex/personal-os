"use client";

import { useEffect, useRef, useState } from "react";

import { MicIcon } from "@/components/icons";
import { emitRefresh, sendJSON } from "@/lib/api";
import type { CaptureRoute } from "@/lib/types";

interface CaptureResponse {
  routedTo: CaptureRoute;
  label: string;
  captureId?: string;
  /** Voice captures echo back the transcription. */
  text?: string;
  itemCount?: number;
}

interface Toast {
  message: string;
  error?: boolean;
  /** Present when the capture can be re-routed. */
  captureId?: string;
  route?: CaptureRoute;
}

const ROUTE_CHIPS: { route: CaptureRoute; label: string }[] = [
  { route: "task", label: "Task" },
  { route: "event", label: "Calendar" },
  { route: "journal", label: "Journal" },
  { route: "note", label: "Note" },
  { route: "personal", label: "Private" },
  { route: "plan", label: "Plan" },
  { route: "reading", label: "Reading" },
  { route: "application", label: "Application" },
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/**
 * Floating capture bar: type (or hold the mic and talk) — the server
 * classifies and routes it, and the toast lets you re-route with one tap.
 */
export function CaptureBar() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  function flash(next: Toast, ms = next.captureId ? 8000 : 3200) {
    setToast(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), ms);
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (tick.current) clearInterval(tick.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function showResult(res: CaptureResponse) {
    const spoken = res.text ? ` — “${res.text.length > 90 ? `${res.text.slice(0, 90)}…` : res.text}”` : "";
    flash({
      message: `Captured → ${res.label}${spoken}`,
      captureId: res.itemCount === 1 ? res.captureId : undefined,
      route: res.routedTo,
    });
    emitRefresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const res = await sendJSON<CaptureResponse>("/api/capture", "POST", {
        text: value,
      });
      setText("");
      showResult(res);
    } catch (err) {
      flash({ message: err instanceof Error ? err.message : "Capture failed", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function reroute(captureId: string, route: CaptureRoute) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await sendJSON<CaptureResponse>(
        `/api/captures/${captureId}`,
        "PATCH",
        { route },
      );
      flash({ message: `Moved → ${res.label}`, captureId, route: res.routedTo });
      emitRefresh();
    } catch (err) {
      flash({ message: err instanceof Error ? err.message : "Couldn't move it", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function uploadRecording(blob: Blob, mime: string) {
    setBusy(true);
    flash({ message: "Transcribing…" }, 60_000);
    try {
      const form = new FormData();
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      form.append("audio", blob, `capture.${ext}`);
      const res = await fetch("/api/capture/voice", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as
        | (CaptureResponse & { error?: string })
        | null;
      if (!res.ok || !data) throw new Error(data?.error ?? "Voice capture failed");
      showResult(data);
    } catch (err) {
      flash({ message: err instanceof Error ? err.message : "Voice capture failed", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (busy) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      flash({ message: "Voice capture isn't supported in this browser.", error: true });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (tick.current) clearInterval(tick.current);
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) void uploadRecording(blob, rec.mimeType || "audio/webm");
      };
      recorder.current = rec;
      rec.start();
      setElapsed(0);
      tick.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setRecording(true);
    } catch {
      flash({ message: "Microphone unavailable — check permissions.", error: true });
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {toast ? (
        <div
          className={`pointer-events-auto flex flex-wrap items-center gap-2 rounded-[3px] border px-4 py-2 text-sm text-ink-4 shadow-[var(--shadow-float)] backdrop-blur-xl ${
            toast.error ? "border-danger/30 bg-ink-1/90" : "border-ember/20 bg-ink-1/90"
          }`}
        >
          <span>{toast.message}</span>
          {toast.captureId ? (
            <span className="flex items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-ink-3">move:</span>
              {ROUTE_CHIPS.filter((c) => c.route !== toast.route).map((c) => (
                <button
                  key={c.route}
                  type="button"
                  disabled={busy}
                  onClick={() => reroute(toast.captureId!, c.route)}
                  className="rounded-[2px] border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-xs text-ink-3 transition-colors hover:border-ember/40 hover:text-ember disabled:opacity-50"
                >
                  {c.label}
                </button>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={submit}
        className="pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-none border border-white/[0.08] bg-ink-1/80 px-3 py-2.5 shadow-[var(--shadow-float)] backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={toggleRecording}
          disabled={busy && !recording}
          aria-label={recording ? "Stop recording" : "Record a voice capture"}
          title={recording ? "Stop & transcribe" : "Record a voice capture"}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] transition-all disabled:opacity-50 ${
            recording
              ? "animate-pulse bg-danger/20 text-danger shadow-[0_0_16px_-2px_var(--color-danger)]"
              : "bg-ember/15 text-ember hover:bg-ember/25"
          }`}
        >
          <MicIcon className="text-[18px]" />
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            recording
              ? `Recording… ${elapsed}s — tap the mic to finish`
              : "Capture anything — type or tap the mic…"
          }
          disabled={busy || recording}
          className="w-full bg-transparent text-sm text-ink-4 placeholder:text-ink-3 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || recording}
          className="shrink-0 rounded-[3px] bg-ember/15 px-3 py-1.5 text-xs font-semibold text-ember transition-colors hover:bg-ember/25 disabled:opacity-50"
        >
          ⏎ send
        </button>
      </form>
    </div>
  );
}
