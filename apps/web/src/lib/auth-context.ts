import { createContext } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";

export interface AuthContextValue {
  /** `undefined` until the initial session check completes. */
  session: Session | null | undefined;
  user: User | null;
  /** `true` until the initial session check completes. */
  loading: boolean;
  signInAnonymously: () => Promise<{ error: AuthError | null }>;
  /** `session` is `null` on success when email confirmation is required. */
  signUpWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: AuthError | null; session: Session | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
