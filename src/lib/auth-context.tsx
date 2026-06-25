import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/lib/i18n";

const SUPPORTED_LANGS = ["es", "en", "fr", "de", "it", "pt", "ja", "zh"];

export type AppRole = "administrador" | "dueno_proceso" | "participante" | "auditor";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  language: string;
  updateLanguage: (lng: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [language, setLanguage] = useState(() => i18n.language);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (uid: string | null) => {
    if (!uid) { setRoles([]); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  };

  const loadProfileLang = async (uid: string | null) => {
    if (!uid) return;
    const { data } = await supabase.from("profiles").select("language").eq("id", uid).single();
    const lang = (data?.language as string) || "es";
    if (SUPPORTED_LANGS.includes(lang) && lang !== i18n.language) {
      await i18n.changeLanguage(lang);
    }
    setLanguage(lang);
  };

  const updateLanguage = async (lng: string) => {
    const uid = user?.id;
    if (!uid || !SUPPORTED_LANGS.includes(lng)) return;
    await i18n.changeLanguage(lng);
    setLanguage(lng);
    try { window.localStorage.setItem("i18nextLng", lng); } catch { /* noop */ }
    await supabase.from("profiles").update({ language: lng }).eq("id", uid);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setTimeout(() => { void loadRoles(sess?.user?.id ?? null); }, 0);
      setTimeout(() => { void loadProfileLang(sess?.user?.id ?? null); }, 10);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      void loadRoles(data.session?.user?.id ?? null);
      void loadProfileLang(data.session?.user?.id ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    user, session, roles, loading,
    canEdit: roles.includes("administrador") || roles.includes("dueno_proceso"),
    isAdmin: roles.includes("administrador"),
    language,
    updateLanguage,
    signOut: async () => { await supabase.auth.signOut(); },
    refreshRoles: async () => loadRoles(user?.id ?? null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
