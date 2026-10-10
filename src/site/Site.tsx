import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Instagram, Mail, MapPin, Users } from 'lucide-react';
import { useStore } from '../lib/store';
import { usePublicData } from './usePublic';
import { fmtDate, fmtRange, initials, todayISO } from '../lib/format';
import type { PublicProject } from '../lib/types';
import '../styles/site.css';

function useTitle(t: string) {
  useEffect(() => {
    document.title = t;
  }, [t]);
}

function SiteHeader() {
  const { site, access } = useStore();
  return (
    <header className="site-header">
      <div className="site-wrap site-header-row">
        <Link to="/" className="wordmark" aria-label={`${site.clubName} home`}>
          <span className="wordmark-mark" aria-hidden="true">
            {initials(site.shortName || site.clubName)}
          </span>
          <span className="wordmark-name">{site.shortName || site.clubName}</span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          <a href="/#projects">Projects</a>
          <a href="/#about">About</a>
          <a href="/#team">Team</a>
          <a href="/#join">Join</a>
          <Link to="/app" className="btn btn-sm">
            {access === 'ok' ? 'Open workspace' : 'Member sign in'}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  const { site } = useStore();
  return (
    <footer className="site-footer">
      <div className="site-wrap site-footer-row">
        <div>
          <strong>{site.clubName}</strong>
          {site.school && <span className="muted">, {site.school}</span>}
        </div>
        <div className="site-footer-links">
          {site.contactEmail && <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>}
          {site.instagram && (
            <a href={`https://instagram.com/${site.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">
              @{site.instagram.replace(/^@/, '')}
            </a>
          )}
          <Link to="/app">Member sign in</Link>
        </div>
      </div>
    </footer>
  );
}

function isUpcoming(p: PublicProject, today: string) {
  if (p.stage === 'done') return false;
  const end = p.endDate || p.startDate;
  return !end || end >= today;
}

function Ledger({ projects, teamCount }: { projects: PublicProject[]; teamCount: number }) {
  const { site } = useStore();
  const today = todayISO();
  const done = projects.filter((p) => p.stage === 'done').length;
  const reached = projects.reduce((s, p) => s + (p.attendance || 0), 0);
  const next = projects
    .filter((p) => isUpcoming(p, today) && p.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const lines: { label: string; value: string; to?: string }[] = [
    { label: 'Projects and events wrapped', value: String(done) },
    { label: 'Students who came along', value: reached ? reached.toLocaleString('en-US') : '0' },
    { label: 'People on the team', value: String(teamCount) },
  ];
  return (
    <aside className="ledger" aria-label="Club in numbers">
      <div className="ledger-head">
        <span>The club's books</span>
        <span className="faint">{site.year}</span>
      </div>
      <dl className="ledger-lines">
        {lines.map((l) => (
          <div key={l.label} className="ledger-line">
            <dt>{l.label}</dt>
            <dd className="num">{l.value}</dd>
          </div>
        ))}
      </dl>
      <div className="ledger-next">
        {next ? (
          <Link to={`/p/${next.id}`}>
            <span className="faint small">Next up</span>
            <strong>{next.title}</strong>
            <span className="small muted">{fmtRange(next.startDate, next.endDate)}</span>
          </Link>
        ) : (
          <div>
            <span className="faint small">Next up</span>
            <strong>Planning in progress</strong>
          </div>
        )}
      </div>
    </aside>
  );
}

export function SiteHome() {
  const { site } = useStore();
  const { projects, team, loaded } = usePublicData();
  useTitle(site.clubName);
  const today = todayISO();
  const upcoming = useMemo(
    () => projects.filter((p) => isUpcoming(p, today)).sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999')),
    [projects, today],
  );
  const past = useMemo(
    () => projects.filter((p) => !isUpcoming(p, today)).sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || '')),
    [projects, today],
  );

  return (
    <div className="site">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="site-wrap hero-grid">
            <div className="hero-copy">
              {site.school && <p className="hero-school">{site.school}</p>}
              <h1 className="display hero-title">{site.clubName}</h1>
              <p className="hero-tagline">{site.tagline}</p>
              <div className="hero-actions">
                <a href="#join" className="btn btn-primary">
                  Join the club
                </a>
                <a href="#projects" className="btn">
                  See our projects
                </a>
              </div>
            </div>
            <Ledger projects={projects} teamCount={team.length} />
          </div>
        </section>

        <section id="projects" className="site-section">
          <div className="site-wrap">
            <h2 className="section-title display">Coming up</h2>
            {!loaded ? (
              <div className="spinner" />
            ) : upcoming.length === 0 ? (
              <p className="muted section-empty">Nothing announced yet. The team is planning the next one; follow us to hear first.</p>
            ) : (
              <ol className="entries">
                {upcoming.map((p) => (
                  <li key={p.id}>
                    <Link to={`/p/${p.id}`} className="entry">
                      <span className="entry-date">
                        {p.startDate ? (
                          <>
                            <strong>{fmtDate(p.startDate, 'd')}</strong>
                            <span>{fmtDate(p.startDate, 'MMM')}</span>
                          </>
                        ) : (
                          <span>TBA</span>
                        )}
                      </span>
                      <span className="entry-main">
                        <span className="entry-title">{p.title}</span>
                        <span className="entry-blurb">{p.blurb}</span>
                      </span>
                      <span className="entry-meta">
                        <span className="chip chip-dot" style={{ color: p.color }}>
                          {p.kind === 'event' ? 'Event' : 'Project'}
                        </span>
                        {p.location && <span className="small muted">{p.location}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}

            {past.length > 0 && (
              <>
                <h3 className="subsection-title">What we've done</h3>
                <div className="past-grid">
                  {past.map((p) => (
                    <Link key={p.id} to={`/p/${p.id}`} className="past-card" style={{ ['--c' as string]: p.color }}>
                      <span className="small faint">{fmtRange(p.startDate, p.endDate)}</span>
                      <strong>{p.title}</strong>
                      <span className="small muted clamp-2">{p.blurb}</span>
                      {!!p.attendance && (
                        <span className="small past-att">
                          <Users size={14} /> {p.attendance.toLocaleString('en-US')} attended
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <section id="about" className="site-section about">
          <div className="site-wrap about-grid">
            <h2 className="section-title display">About us</h2>
            <div className="about-copy">
              <p className="lead prewrap">{site.about}</p>
              {site.mission && <p className="mission prewrap">{site.mission}</p>}
            </div>
          </div>
        </section>

        {team.length > 0 && (
          <section id="team" className="site-section">
            <div className="site-wrap">
              <h2 className="section-title display">The team</h2>
              <ul className="team-grid">
                {team.map((m) => (
                  <li key={m.id} className="team-card">
                    <span className="avatar" style={{ ['--s' as string]: '56px' }}>
                      {m.photoURL ? <img src={m.photoURL} alt="" referrerPolicy="no-referrer" /> : initials(m.name)}
                    </span>
                    <div>
                      <strong>{m.name}</strong>
                      <div className="small muted">{[m.title, m.team].filter(Boolean).join(', ')}</div>
                      {m.bio && <p className="small team-bio">{m.bio}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section id="join" className="site-section join">
          <div className="site-wrap join-grid">
            <div>
              <h2 className="section-title display">Join us</h2>
              <p className="lead prewrap">{site.joinText}</p>
            </div>
            <div className="join-actions">
              {site.joinLink && (
                <a className="btn btn-primary" href={site.joinLink} target="_blank" rel="noreferrer">
                  Sign up to join
                </a>
              )}
              {site.contactEmail && (
                <a className="btn" href={`mailto:${site.contactEmail}`}>
                  <Mail /> Email us
                </a>
              )}
              {site.instagram && (
                <a className="btn" href={`https://instagram.com/${site.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">
                  <Instagram /> Instagram
                </a>
              )}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

export function SiteProject() {
  const { id } = useParams();
  const { projects, loaded } = usePublicData();
  const { site } = useStore();
  const p = projects.find((x) => x.id === id);
  useTitle(p ? `${p.title} | ${site.clubName}` : site.clubName);
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-section">
        <div className="site-wrap project-page">
          <Link to="/#projects" className="back-link">
            <ArrowLeft size={16} /> All projects
          </Link>
          {!loaded ? (
            <div className="spinner" />
          ) : !p ? (
            <div className="project-missing">
              <h1 className="h1">This project isn't public</h1>
              <p className="muted">It may have been taken down, or the link is wrong.</p>
            </div>
          ) : (
            <article>
              <span className="chip chip-dot" style={{ color: p.color }}>
                {p.kind === 'event' ? 'Event' : 'Project'}
              </span>
              <h1 className="display project-title">{p.title}</h1>
              <p className="lead">{p.blurb}</p>
              <ul className="project-facts">
                <li>
                  <CalendarDays size={16} /> {fmtRange(p.startDate, p.endDate)}
                </li>
                {p.location && (
                  <li>
                    <MapPin size={16} /> {p.location}
                  </li>
                )}
                {!!p.attendance && (
                  <li>
                    <Users size={16} /> {p.attendance.toLocaleString('en-US')} attended
                  </li>
                )}
              </ul>
              {p.description && <div className="project-body prewrap">{p.description}</div>}
            </article>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
