"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { assistantResponseSchema } from "@/lib/product-assistant";
import type { z } from "zod";
type Answer = z.infer<typeof assistantResponseSchema>;
export function ProductAssistant({ voiceEnabled }: { voiceEnabled: boolean }) {
  const [question, setQuestion] = useState("");
  const [orderId, setOrderId] = useState("");
  const [consent, setConsent] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const voiceAllowed = useRef(false);
  const voiceSequence = useRef(0);
  const transcription = useRef<AbortController | null>(null);
  function discardVoice() {
    voiceAllowed.current = false;
    voiceSequence.current++;
    transcription.current?.abort();
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
  }
  function changeConsent(kind: "assistant" | "voice", checked: boolean) {
    if (kind === "assistant") setConsent(checked);
    else setVoiceConsent(checked);
    // Update before stopping the recorder: onstop can run before effects.
    const allowed =
      kind === "assistant" ? checked && voiceConsent : consent && checked;
    voiceAllowed.current = allowed;
    if (!allowed) {
      discardVoice();
      setRecording(false);
      setVoiceBusy(false);
    }
  }
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      discardVoice();
      window.speechSynthesis?.cancel();
    };
  }, []);
  async function ask(mode: "knowledge" | "order") {
    setBusy(true);
    setMessage("");
    setAnswer(null);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "knowledge"
            ? { mode, question, consent }
            : { mode, orderId },
        ),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error?.message ?? "The assistant is unavailable.");
        return;
      }
      const parsed = assistantResponseSchema.safeParse(data);
      if (!parsed.success) throw new Error();
      setAnswer(parsed.data);
    } catch {
      setMessage(
        "The assistant could not answer. Please try again or contact support.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function startRecording() {
    if (!voiceAllowed.current || busy || voiceBusy || recording) return;
    const sequence = ++voiceSequence.current;
    const current = () =>
      !disposed.current &&
      voiceAllowed.current &&
      voiceSequence.current === sequence;
    setMessage("");
    setVoiceBusy(true);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined" ||
        !MediaRecorder.isTypeSupported("audio/webm")
      ) {
        setMessage(
          "Voice recording is unavailable in this browser. Please type your question.",
        );
        return;
      }
      const captured = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!current()) {
        captured.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = captured;
      const r = new MediaRecorder(captured, { mimeType: "audio/webm" });
      recorder.current = r;
      const parts: BlobPart[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) parts.push(e.data);
      };
      r.onstop = async () => {
        captured.getTracks().forEach((t) => t.stop());
        if (!current()) return;
        if (timer.current) clearTimeout(timer.current);
        setRecording(false);
        setVoiceBusy(true);
        const controller = new AbortController();
        transcription.current = controller;
        try {
          const response = await fetch("/api/assistant/voice", {
            method: "POST",
            headers: {
              "Content-Type": "audio/webm",
              "X-Riway-Voice-Consent": "yes",
            },
            body: new Blob(parts, { type: "audio/webm" }),
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20000),
            ]),
          });
          const data = await response.json();
          if (!current() || controller.signal.aborted) return;
          if (!response.ok)
            throw new Error(
              data.error?.message ?? "Voice assistance unavailable.",
            );
          setQuestion(data.text);
          setMessage(
            "Review the transcription, then select Ask about products.",
          );
        } catch (error) {
          if (!current()) return;
          setMessage(
            error instanceof Error
              ? error.message
              : "Transcription failed. Type your question.",
          );
        } finally {
          if (current()) setVoiceBusy(false);
          if (transcription.current === controller)
            transcription.current = null;
        }
      };
      r.start();
      setRecording(true);
      timer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 20000);
    } catch {
      if (!current()) return;
      stream.current?.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setMessage(
        "Microphone access was not granted. Please type your question.",
      );
    } finally {
      if (current()) setVoiceBusy(false);
    }
  }
  function speak() {
    if (!answer || !window.speechSynthesis) return;
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.localService && v.lang.startsWith("en"));
    if (!voice) {
      setMessage(
        "No on-device English voice is available. You can read the answer below.",
      );
      return;
    }
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(
      [answer.message, ...answer.sources.map((s) => s.text)].join("\n"),
    );
    speech.voice = voice;
    window.speechSynthesis.speak(speech);
  }
  return (
    <div className="stack">
      <div className="notice">
        This assistant provides RIWAY-approved product information and private
        order status. It cannot diagnose, give medical advice or recommend
        treatment. Use RIWAY support for personal assistance. No conversation
        history is saved by this website.
      </div>
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          void ask("knowledge");
        }}
        aria-busy={busy}
      >
        <h3>Ask about products</h3>
        <label>
          Question
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            minLength={3}
            maxLength={600}
            required
          />
        </label>
        <p className="small muted">
          Do not include health information, contact details, payment details or
          order numbers here. The response-selection provider receives only
          matching public terms and approved reference passages. Private order
          details use the separate form below.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => changeConsent("assistant", e.target.checked)}
            required
          />
          I agree to use the product assistant under the privacy notice.
        </label>
        <button
          className="button"
          disabled={busy || voiceBusy || recording || !consent}
        >
          Ask about products
        </button>
      </form>
      {voiceEnabled && (
        <div className="panel stack">
          <h3>Voice assistance</h3>
          <p>
            A recording of up to 20 seconds is sent to the configured OpenAI
            transcription service. Review the transcription before sending your
            question. This website does not save the recording. Provider
            retention controls are described in the privacy notice. Do not
            include personal or health information.
          </p>
          <p>
            Uncheck either consent to stop recording and cancel a pending
            transcription request. Audio already received by the provider is
            subject to its approved retention controls.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={voiceConsent}
              onChange={(e) => changeConsent("voice", e.target.checked)}
            />
            I consent to sending this recording for transcription.
          </label>
          <button
            className="button button-outline"
            disabled={busy || voiceBusy || !voiceConsent || !consent}
            onClick={() => {
              if (recording) recorder.current?.stop();
              else void startRecording();
            }}
          >
            {recording ? "Stop recording" : "Record question"}
          </button>
        </div>
      )}
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          void ask("order");
        }}
        aria-busy={busy}
      >
        <h3>Check your order</h3>
        <label>
          Order reference
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            required
            pattern="[0-9a-fA-F-]{36}"
            maxLength={36}
          />
        </label>
        <p>
          Order status comes directly from your signed-in account and is not
          sent to an AI provider.
        </p>
        <button
          className="button button-outline"
          disabled={busy || voiceBusy || recording}
        >
          Check order
        </button>
      </form>
      <p role="status" aria-live="polite">
        {busy || voiceBusy ? "Checking…" : message}
      </p>
      {answer && (
        <section className="panel stack" aria-label="Assistant answer">
          <p>{answer.message}</p>
          {answer.sources.map((s) => (
            <article key={s.id}>
              <h3>{s.title}</h3>
              <p className="content-body">{s.text}</p>
              <Link href={s.url}>Open source</Link>
            </article>
          ))}
          <div className="admin-actions">
            <button className="button button-outline" onClick={speak}>
              Read answer aloud
            </button>
            <button
              className="button button-outline"
              onClick={() => window.speechSynthesis?.cancel()}
            >
              Stop reading
            </button>
          </div>
        </section>
      )}
      <Link className="button button-outline" href="/support">
        Talk to RIWAY support
      </Link>
      <Link href="/legal/privacy">Privacy notice</Link>
    </div>
  );
}
