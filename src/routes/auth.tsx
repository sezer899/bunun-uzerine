import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Giriş yap — Elzem Tasarım Atölyesi" },
      { name: "description", content: "Tasarımlarınızı kaydedip her cihazdan ulaşmak için giriş yapın." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          navigate({ to: "/" });
        } else {
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) throw signInErr;
          navigate({ to: "/" });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-stone-50 via-stone-100 to-stone-200 px-4 py-12">
      <div className="mx-auto max-w-sm rounded-2xl border border-stone-200 bg-white/90 p-6 shadow-sm backdrop-blur">
        <Link to="/" className="text-xs uppercase tracking-[0.25em] text-stone-500 hover:text-stone-900">
          ← Tasarıma dön
        </Link>
        <h1 className="mt-3 font-serif text-2xl tracking-tight">
          {mode === "signin" ? "Giriş Yap" : "Hesap Oluştur"}
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          Tasarımlarınız buluta kaydedilsin, her cihazdan ulaşın.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs text-stone-600">E-posta</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900"
            />
          </label>
          <label className="block">
            <span className="text-xs text-stone-600">Şifre (en az 6 karakter)</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900"
            />
          </label>

          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          {info && <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{info}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? "Lütfen bekleyin…" : mode === "signin" ? "Giriş yap" : "Hesap oluştur"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="mt-4 w-full text-center text-xs text-stone-600 underline-offset-4 hover:underline"
        >
          {mode === "signin" ? "Hesabın yok mu? Kayıt ol" : "Zaten hesabın var mı? Giriş yap"}
        </button>
      </div>
    </div>
  );
}
