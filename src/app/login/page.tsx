"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ThemeToggle } from "@/components/ThemeToggle";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      // Only follow internal return paths.
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
      return;
    }

    const data = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    setError(data?.error ?? "Something went wrong.");
    setPending(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative flex w-full max-w-sm flex-col gap-5"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="section-label flex items-center gap-2">
          <span aria-hidden className="h-px w-10 bg-white/[0.15]" />
          The daily edition
          <span aria-hidden className="h-px w-10 bg-white/[0.15]" />
        </p>
        <h1 className="font-display text-6xl leading-[0.95] text-ink-4 sm:text-7xl">
          <span className="word-mask">
            <span className="word-rise">Personal</span>
          </span>
          <br />
          <span className="word-mask">
            <em className="word-rise italic text-ember" style={{ animationDelay: "140ms" }}>
              OS
            </em>
          </span>
          <span aria-hidden className="asterisk-spin ml-2 inline-block align-super text-2xl text-ember">✳</span>
        </h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-3">
          Enter the password to continue
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="section-label">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-none border-0 border-b border-white/[0.18] bg-transparent px-1 py-2 text-center text-lg tracking-[0.3em] text-ink-4 outline-none transition-colors duration-300 focus:border-ember focus-visible:outline-none"
        />
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="mx-auto rounded-none bg-ember px-10 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.25em] text-ink-0 shadow-[0_0_32px_-6px_var(--color-ember)] transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="glow absolute -inset-[10%]" />
        <div className="grain absolute inset-0" />
      </div>
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
