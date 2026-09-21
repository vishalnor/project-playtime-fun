import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { AppBackground, Eyebrow, Panel } from "@/components/glass";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Lumen Exams" },
      { name: "description", content: "Sign in to create and manage your online MCQ exams." },
      { property: "og:title", content: "Sign in · Lumen Exams" },
      { property: "og:description", content: "Sign in to create and manage your online MCQ exams." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your inbox if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <AppBackground>
      <div className="mx-auto max-w-md pt-10">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="glass grid size-10 place-items-center rounded-2xl">
            <span className="size-3.5 rounded-full bg-linear-to-br from-brand to-violet" />
          </div>
          <div>
            <p className="font-display text-[15px] leading-none font-bold text-ink">Lumen</p>
            <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-slate-400 uppercase">
              Exams
            </p>
          </div>
        </div>

        <Panel elevated>
          <Eyebrow>{mode === "signin" ? "Welcome back" : "Get started"}</Eyebrow>
          <h1 className="mt-1 font-display text-[22px] font-bold text-ink">
            {mode === "signin" ? "Sign in to your console" : "Create your exam console"}
          </h1>

          <form className="mt-5 flex flex-col gap-2.5" onSubmit={submit}>
            {mode === "signup" && (
              <input
                className="rounded-2xl bg-white/70 px-4 py-3 text-sm text-ink ring-1 ring-white/70 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <input
              className="rounded-2xl bg-white/70 px-4 py-3 text-sm text-ink ring-1 ring-white/70 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="rounded-2xl bg-white/70 px-4 py-3 text-sm text-ink ring-1 ring-white/70 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button
              disabled={busy}
              className="mt-1 rounded-2xl bg-linear-to-br from-brand to-violet py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            type="button"
            onClick={google}
            className="mt-2.5 w-full rounded-2xl bg-white/70 py-3 text-sm font-semibold text-ink ring-1 ring-white/70"
          >
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-[12px] font-semibold text-brand"
          >
            {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
          </button>
        </Panel>
      </div>
    </AppBackground>
  );
}
