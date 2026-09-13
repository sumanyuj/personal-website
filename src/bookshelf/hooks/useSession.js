import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.js';

/**
 * Who is signed in.
 *
 * The session lives in an HttpOnly cookie, so the page cannot read it and has
 * to ask: one call on load tells us whether the browser still holds a valid
 * session, which is what makes returning to the site sign you straight back in.
 */
export default function useSession() {
  const [user, setUser] = useState(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((result) => {
        if (cancelled) return;
        setUser(result.user);
        setSignupOpen(Boolean(result.signupOpen));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username, password) => {
    const { user: signedIn } = await api.login(username, password);
    setUser(signedIn);
    return signedIn;
  }, []);

  const signUp = useCallback(async (username, password, code) => {
    const { user: created } = await api.register(username, password, code);
    setUser(created);
    return created;
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  return { user, checking, signupOpen, signIn, signUp, signOut };
}
