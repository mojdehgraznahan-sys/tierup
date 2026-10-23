"use client";

import { useEffect, useRef, useState } from "react";
import { uploadTranscriptClipAction } from "@/app/(app)/sessions/actions";
import { Button } from "@/components/ui/primitives";

/** Clips are sent every 30 s; each is a complete audio file (a new recorder per clip). */
const CLIP_MS = 30_000;

function pickMimeType(): string | undefined {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
}

type Status = "idle" | "recording" | "stopped" | "error";

/**
 * Records this device's microphone in 30-second clips and uploads each for transcription. Only the
 * text is kept. Stops when the person stops it, leaves the page, or the session window closes.
 */
export function MicRecorder({ sessionId, closesAt, hint }: { sessionId: string; closesAt: string; hint: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopping = useRef(false);
  const uploads = useRef(Promise.resolve());

  const upload = (clip: Blob, startedAt: number) => {
    uploads.current = uploads.current.then(async () => {
      const form = new FormData();
      form.set("clip", clip);
      form.set("startedAt", String(startedAt));
      try {
        const result = await uploadTranscriptClipAction(sessionId, form);
        if (result.ok) setSent((n) => n + 1);
        else {
          setError(result.error);
          stop();
        }
      } catch {
        setError("A clip didn't upload. Check your connection; recording continues.");
      }
    });
  };

  const recordClip = () => {
    if (stopping.current || !stream.current) return;
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    const startedAt = Date.now();
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      if (chunks.length) upload(new Blob(chunks, { type: rec.mimeType }), startedAt);
      recordClip();
    };
    recorder.current = rec;
    rec.start();
    timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), CLIP_MS);
  };

  const stop = () => {
    stopping.current = true;
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setStatus((s) => (s === "recording" ? "stopped" : s));
  };

  const start = async () => {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("TierUp couldn't use your microphone. Allow microphone access for this site and try again.");
      setStatus("error");
      return;
    }
    stopping.current = false;
    setStatus("recording");
    recordClip();
  };

  // Stop at the end of the session window, on leaving the page, and warn before closing mid-recording.
  useEffect(() => {
    const untilClose = new Date(closesAt).getTime() - Date.now();
    const closeTimer = setTimeout(stop, Math.max(0, untilClose));
    return () => {
      clearTimeout(closeTimer);
      stop();
    };
  }, [closesAt]);
  useEffect(() => {
    if (status !== "recording") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  return (
    <div className="flex flex-col gap-2">
      {status === "recording" ? (
        <>
          <span className="flex items-center gap-2 text-sm font-semibold" role="status">
            <span className="inline-block size-2.5 animate-pulse rounded-full bg-accent-2-600" aria-hidden />
            Transcribing · keep this page open
          </span>
          <span className="muted text-xs">
            {sent} clip{sent === 1 ? "" : "s"} sent. Only the text is kept, never the audio.
          </span>
          <Button className="self-start text-[13px]" onClick={stop}>
            Stop transcribing
          </Button>
        </>
      ) : (
        <>
          <span className="muted text-[13px]">{status === "stopped" ? "Transcribing stopped. You can start again." : hint}</span>
          <Button variant="primary" className="self-start text-[13px]" onClick={start}>
            {status === "stopped" ? "Resume transcribing" : "Start transcribing"}
          </Button>
        </>
      )}
      {error && (
        <span role="alert" className="text-xs text-accent-2-800">
          {error}
        </span>
      )}
    </div>
  );
}
