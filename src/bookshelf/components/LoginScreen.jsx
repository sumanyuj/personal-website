import { useState } from 'react';
import { BooksIcon } from './icons.jsx';

/**
 * The way in. Sign-up is only offered when the server has a signup code
 * configured; otherwise the form is sign-in only and says so.
 */
export default function LoginScreen({ signupOpen, onSignIn, onSignUp }) {
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const registering = mode === 'signup';

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (registering) await onSignUp(username, password, code);
      else await onSignIn(username, password);
    } catch (cause) {
      setError(cause.message ?? 'Something went wrong');
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <form className="signin__card" onSubmit={submit}>
        <div className="signin__mark" aria-hidden="true">
          <BooksIcon size={40} />
        </div>
        <h1 className="signin__title">Bookshelf</h1>
        <p className="signin__blurb">
          {registering
            ? 'Create an account and your shelf follows you between devices.'
            : 'Sign in and your shelf is waiting, on whichever device you opened it.'}
        </p>

        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={registering ? 'new-password' : 'current-password'}
            required
          />
        </label>

        {registering && (
          <label className="field">
            <span>Signup code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              required
            />
          </label>
        )}

        {error && (
          <p className="signin__error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="cbtn signin__submit" disabled={busy}>
          {busy ? 'One moment…' : registering ? 'Create account' : 'Sign in'}
        </button>

        {signupOpen ? (
          <button
            type="button"
            className="signin__switch"
            onClick={() => {
              setMode(registering ? 'signin' : 'signup');
              setError(null);
            }}
          >
            {registering ? 'I already have an account' : 'Create an account'}
          </button>
        ) : (
          !registering && <p className="signin__note">Sign-ups are closed on this server.</p>
        )}
      </form>
    </div>
  );
}
