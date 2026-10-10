import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useStore } from '../lib/store';
import { HeroChart, LogoMark } from '../components/Art';
import '../styles/app.css';
import '../styles/site.css';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14a6.6 6.6 0 0 1 0-4.1V7.1H2.1a11 11 0 0 0 0 9.8L5.8 14z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1L5.8 10c.9-2.7 3.3-4.6 6.2-4.6z" />
    </svg>
  );
}

export function Login() {
  const { access, signIn, signOut, user, error, site } = useStore();
  useEffect(() => {
    document.title = `Sign in | ${site.clubName}`;
  }, [site.clubName]);
  return (
    <div className="login">
      <aside className="login-art dark-band" aria-hidden="true">
        <div className="login-art-top">
          <LogoMark size={36} />
          <span>{site.shortName || site.clubName}</span>
        </div>
        <p className="display login-quote">{site.tagline}</p>
        <div className="login-chart">
          <HeroChart seed={11} />
        </div>
      </aside>
      <main className="login-main">
        <div className="login-card">
          <Link to="/" className="back-link">
            <ArrowLeft size={16} aria-hidden="true" /> Back to the website
          </Link>
          <h1 className="display login-title">Club workspace</h1>
          {access === 'loading' ? (
            <div className="spinner" aria-label="Checking your account…" />
          ) : access === 'noAccess' ? (
            <div className="login-body">
              <p>
                <strong>{user?.email}</strong> isn't on the member list yet.
              </p>
              <p className="muted">Ask someone on the exec team to add this email under Members, then sign in again. If you used another Google account for the club, switch to it.</p>
              <button className="btn" onClick={() => signOut()}>
                Use a different account
              </button>
            </div>
          ) : (
            <div className="login-body">
              <p className="muted">Projects, tasks, meetings and the club's money in one place. Sign in with the Google account the exec team added.</p>
              <button className="btn btn-primary google-btn" onClick={() => signIn()}>
                <span className="google-chip">
                  <GoogleMark />
                </span>
                Sign in with Google
              </button>
            </div>
          )}
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
