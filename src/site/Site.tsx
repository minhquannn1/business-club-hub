import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Instagram, Mail, MapPin, Users } from 'lucide-react';
import { useStore } from '../lib/store';
import { usePublicData } from './usePublic';
import { fmtDate, fmtRange, initials, todayISO } from '../lib/format';
import { DEFAULT_SITE } from '../lib/constants';
import type { PublicProject } from '../lib/types';
import { EmptyArt, LogoMark, Pictograms, toneFor } from '../components/Art';
import { Polaroid } from './Polaroid';
import { CurlyArrow, Sparkle, Squiggle, Star } from './Doodles';
import { GALLERY, HERO_PHOTOS, PHOTOS } from './photos';
import '@fontsource/caveat/latin-600.css';
import '../styles/site.css';

function useTitle(t: string) {
  useEffect(() => {
    document.title = t;
  }, [t]);
}

function SiteHeader({ onDark = false }: { onDark?: boolean }) {
  const { site, access } = useStore();
  return (
    <header className={`site-header ${onDark ? 'on-dark' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="site-wrap site-header-row">
        <Link to="/" className="wordmark" aria-label={`${site.clubName} home`}>
          <LogoMark size={42} />
          <span className="wordmark-name">{site.shortName || site.clubName}</span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          <a href="/#do">What we do</a>
          <a href="/#events">Events</a>
          <a href="/#done">Photos</a>
          <a href="/#team">Team</a>
          <a href="/#join">Join</a>
          <Link to="/app" className="btn btn-sm nav-cta">
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
        <div className="footer-brand">
          <LogoMark size={30} />
          <div>
            <strong>{site.clubName}</strong>
            <div className="small">{[site.school, site.year].filter(Boolean).join(', ')}</div>
          </div>
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

function TicketCard({ p }: { p: PublicProject }) {
  return (
    <Link to={`/p/${p.id}`} className="ticket" style={{ ['--c' as string]: p.color }}>
      <span className="ticket-stub">
        {p.startDate ? (
          <>
            <span className="ticket-month">{fmtDate(p.startDate, 'MMM')}</span>
            <span className="ticket-day">{fmtDate(p.startDate, 'd')}</span>
            <span className="ticket-dow">{fmtDate(p.startDate, 'EEE')}</span>
          </>
        ) : (
          <span className="ticket-tba">Date soon</span>
        )}
      </span>
      <span className="ticket-body">
        <span className="ticket-kind">{p.kind === 'event' ? 'Event' : 'Project'}</span>
        <span className="ticket-title">{p.title}</span>
        {p.blurb && <span className="ticket-blurb">{p.blurb}</span>}
        <span className="ticket-meta">
          {p.startDate && p.endDate && p.endDate !== p.startDate && (
            <span>
              <CalendarDays size={14} aria-hidden="true" /> {fmtRange(p.startDate, p.endDate)}
            </span>
          )}
          {p.location && (
            <span>
              <MapPin size={14} aria-hidden="true" /> {p.location}
            </span>
          )}
        </span>
      </span>
      <ArrowUpRight className="ticket-go" size={20} aria-hidden="true" />
    </Link>
  );
}

function Avatar({ name, photo, size = 64 }: { name: string; photo?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="site-avatar" style={{ width: size, height: size, ['--t' as string]: toneFor(name) }}>
      {photo && !broken ? <img src={photo} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <span>{initials(name)}</span>}
    </span>
  );
}

function MarkedTitle({ text }: { text: string }) {
  const words = text.trim().split(/\s+/);
  if (words.length < 3) return <>{text}</>;
  const n = words.length > 4 ? 2 : 1;
  return (
    <>
      {words.slice(0, -n).join(' ')}{' '}
      <span className="marked">
        {words.slice(-n).join(' ')}
        <Squiggle />
      </span>
    </>
  );
}

export function SiteHome() {
  const { site } = useStore();
  const { projects, team, loaded } = usePublicData();
  useTitle(site.clubName);
  const today = todayISO();
  const upcoming = useMemo(() => projects.filter((p) => isUpcoming(p, today)).sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999')), [projects, today]);
  const past = useMemo(() => projects.filter((p) => !isUpcoming(p, today)).sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || '')), [projects, today]);
  const next = upcoming.find((p) => p.startDate) ?? upcoming[0];
  const activities = site.activities?.length ? site.activities : DEFAULT_SITE.activities;
  const school = site.school || DEFAULT_SITE.school;
  const kicker = school ? `A student-run ${school} club` : 'A student-run high school club';
  const insta = site.instagram?.replace(/^@/, '');

  return (
    <div className="site">
      <SiteHeader />
      <section className="hero" aria-labelledby="hero-title">
        <div className="site-wrap hero-grid">
          <div className="hero-copy">
            <p className="hero-kicker">
              <Sparkle />
              {kicker}
            </p>
            <h1 id="hero-title" className="display hero-title">
              <MarkedTitle text={site.tagline} />
            </h1>
            <p className="hero-lead">{site.about.split(/(?<=\.)\s/)[0]}</p>
            <div className="hero-actions">
              <a href="#join" className="btn btn-blue">
                Join the club <ArrowRight size={17} className="btn-arrow" aria-hidden="true" />
              </a>
              <a href="#events" className="btn btn-outline">
                See what's on
              </a>
            </div>
          </div>

          <div className="collage">
            <Polaroid photo={HERO_PHOTOS[0]} tilt={-4} eager className="c-main">
              <span className="hand note-us" aria-hidden="true">
                we made this!
                <CurlyArrow />
              </span>
            </Polaroid>
            <Polaroid photo={HERO_PHOTOS[1]} tilt={5} small className="c-side" />
            <Polaroid photo={HERO_PHOTOS[2]} tilt={-2} small className="c-low" />
            <Star className="c-star" />
            {next && (
              <Link to={`/p/${next.id}`} className="sticky-note">
                <span className="hand">next up!</span>
                <strong>{next.title}</strong>
                {next.startDate && <span>{fmtDate(next.startDate, 'EEE d MMM')}</span>}
              </Link>
            )}
          </div>
        </div>
      </section>

      <main id="main">
        <section id="do" className="site-section">
          <div className="site-wrap">
            <div className="section-head">
              <h2 className="section-title display">What we do</h2>
              <p className="section-sub">{site.mission}</p>
            </div>
            <ul className="do-grid">
              {activities.map((a, i) => {
                const Icon = Pictograms[a.icon] ?? Pictograms.pitch;
                return (
                  <li key={i} className="do-card" style={{ ['--r' as string]: `${[-1.2, 0.8, -0.6, 1.1][i % 4]}deg` }}>
                    <Icon size={56} />
                    <h3>{a.title}</h3>
                    <p>{a.text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section id="events" className="site-section events">
          <div className="site-wrap">
            <div className="section-head">
              <h2 className="section-title display">
                Coming up
                <Sparkle className="title-doodle" />
              </h2>
            </div>
            {!loaded ? (
              <div className="ticket-skeleton" aria-label="Loading events" />
            ) : upcoming.length === 0 ? (
              <div className="events-empty">
                <EmptyArt.ticket />
                <div>
                  <strong>The next event is being planned</strong>
                  <p className="muted">
                    {insta ? (
                      <>
                        Follow{' '}
                        <a href={`https://instagram.com/${insta}`} target="_blank" rel="noreferrer">
                          @{insta}
                        </a>{' '}
                        to hear first.
                      </>
                    ) : (
                      'Check back soon, or ask anyone on the team.'
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="tickets">
                {upcoming.map((p) => (
                  <TicketCard key={p.id} p={p} />
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="done" className="site-section done">
          <div className="site-wrap">
            <div className="section-head">
              <h2 className="section-title display">Things we've done</h2>
              <p className="section-sub">Booths, fairs and school days. We plan them, stock them, sell at them and count the money after.</p>
            </div>
            <div className="scrapbook">
              {GALLERY.map((ph, i) => (
                <Polaroid key={ph.src} photo={ph} small tilt={[-2, 1.6, -1, 2.2, -1.8, 1.2, -0.8][i % 7]} tape={i % 2 === 0} />
              ))}
            </div>

            {past.length > 0 && (
              <>
                <h3 className="subsection-title">Project write-ups</h3>
                <div className="past-grid">
                  {past.map((p) => (
                    <Link key={p.id} to={`/p/${p.id}`} className="past-card" style={{ ['--c' as string]: p.color }}>
                      <span className="past-date">{fmtRange(p.startDate, p.endDate)}</span>
                      <strong>{p.title}</strong>
                      <span className="past-blurb">{p.blurb}</span>
                      {!!p.attendance && (
                        <span className="past-att">
                          <Users size={14} aria-hidden="true" /> {p.attendance.toLocaleString('en-US')} came
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="site-section paths" aria-labelledby="paths-title">
          <div className="site-wrap">
            <h2 id="paths-title" className="sr-only">
              Get involved
            </h2>
            <div className="paths-grid">
              <article className="path-card path-students">
                <svg className="path-art" viewBox="0 0 120 80" aria-hidden="true">
                  <circle cx="34" cy="30" r="12" className="pa-head" />
                  <path d="M12 74a22 22 0 0 1 44 0" className="pa-body" />
                  <circle cx="82" cy="26" r="10" className="pa-head pa-soft" />
                  <path d="M64 70a18 18 0 0 1 36 0" className="pa-body pa-soft" />
                  <path d="M96 10l6 6 12-12" className="pa-tick" />
                </svg>
                <h3 className="display">For students</h3>
                <p>{site.joinText}</p>
                <a className="path-link" href="#join">
                  How to join <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </article>
              <article className="path-card path-partners">
                <svg className="path-art" viewBox="0 0 120 80" aria-hidden="true">
                  <rect x="8" y="22" width="46" height="46" rx="10" className="pa-box" />
                  <rect x="66" y="22" width="46" height="46" rx="10" className="pa-box pa-soft" />
                  <path d="M40 45h40M70 37l10 8-10 8" className="pa-arrow" />
                </svg>
                <h3 className="display">Teachers &amp; businesses</h3>
                <p>{site.partnerText}</p>
                {site.contactEmail ? (
                  <a className="path-link" href={`mailto:${site.contactEmail}?subject=${encodeURIComponent('Working with ' + site.clubName)}`}>
                    Work with us <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                ) : (
                  <a className="path-link" href="#join">
                    Get in touch <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                )}
              </article>
            </div>
          </div>
        </section>

        <section id="about" className="site-section about dark-band">
          <div className="site-wrap about-grid">
            <h2 className="about-label">About us</h2>
            <div>
              <blockquote className="about-quote display">{site.mission}</blockquote>
              <p className="about-copy">{site.about}</p>
            </div>
          </div>
        </section>

        <section id="team" className="site-section team">
          <div className="site-wrap">
            <div className="section-head">
              <h2 className="section-title display">Meet the team</h2>
              <p className="section-sub">The students who run the club this year. Say hi if you see us around school.</p>
            </div>
            <div className="team-top">
              <Polaroid photo={PHOTOS.team} tilt={-1.5} className="team-photo">
                <span className="hand note-us" aria-hidden="true">
                  that's us!
                  <CurlyArrow />
                </span>
              </Polaroid>
              <div className="team-note">
                <span className="tape" aria-hidden="true" />
                <p className="hand team-note-title">roll call</p>
                {team.length > 0 ? (
                  <ul className="roll">
                    {team.slice(0, 8).map((m) => (
                      <li key={m.id}>
                        <strong>{m.name}</strong>
                        {m.title && <span>{m.title}</span>}
                      </li>
                    ))}
                    {team.length > 8 && <li className="roll-more">and {team.length - 8} more below</li>}
                  </ul>
                ) : (
                  <p className="team-note-copy">Proper profiles are on the way. Until then, look for us behind the booth table.</p>
                )}
                <a href="#join" className="team-note-cta">
                  Want to join us? <ArrowRight size={16} aria-hidden="true" />
                </a>
              </div>
            </div>
            {team.length > 0 && (
              <ul className="team-grid">
                {team.map((m, i) => (
                  <li key={m.id} className="team-card" style={{ ['--r' as string]: `${[-1.5, 1, -0.5, 1.6][i % 4]}deg` }}>
                    <Avatar name={m.name} photo={m.photoURL} size={320} />
                    <div className="team-info">
                      <strong>{m.name}</strong>
                      <span className="team-role">{[m.title, m.team].filter(Boolean).join(', ')}</span>
                      {m.bio && <p className="team-bio">{m.bio}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section id="join" className="join">
          <div className="site-wrap join-grid">
            <div>
              <h2 className="display join-title">Have an idea? Bring it to the club.</h2>
              <p className="join-copy">{site.joinText}</p>
              <span className="hand join-note" aria-hidden="true">
                come say hi
                <CurlyArrow />
              </span>
              <div className="join-actions">
                {site.joinLink && (
                  <a className="btn btn-light" href={site.joinLink} target="_blank" rel="noreferrer">
                    Sign up to join
                  </a>
                )}
                {site.contactEmail && (
                  <a className="btn btn-on-dark" href={`mailto:${site.contactEmail}`}>
                    <Mail aria-hidden="true" /> Email us
                  </a>
                )}
                {insta && (
                  <a className="btn btn-on-dark" href={`https://instagram.com/${insta}`} target="_blank" rel="noreferrer">
                    <Instagram aria-hidden="true" /> Instagram
                  </a>
                )}
                {!site.joinLink && !site.contactEmail && !insta && (
                  <Link className="btn btn-light" to="/app">
                    Already a member? Sign in
                  </Link>
                )}
              </div>
            </div>
            <div className="join-photo">
              <Polaroid photo={PHOTOS.members} small tilt={4} />
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
      <main id="main" className="site-section">
        <div className="site-wrap project-page">
          <Link to="/#events" className="back-link">
            <ArrowLeft size={16} aria-hidden="true" /> All events
          </Link>
          {!loaded ? (
            <div className="ticket-skeleton" aria-label="Loading" />
          ) : !p ? (
            <div className="events-empty">
              <EmptyArt.ticket />
              <div>
                <strong>This page isn't public</strong>
                <p className="muted">It may have been taken down, or the link is wrong.</p>
              </div>
            </div>
          ) : (
            <article className="project-article" style={{ ['--c' as string]: p.color }}>
              <span className="ticket-kind">{p.kind === 'event' ? 'Event' : 'Project'}</span>
              <h1 className="display project-title">{p.title}</h1>
              {p.blurb && <p className="project-lead">{p.blurb}</p>}
              <ul className="project-facts">
                <li>
                  <CalendarDays size={16} aria-hidden="true" /> {fmtRange(p.startDate, p.endDate)}
                </li>
                {p.location && (
                  <li>
                    <MapPin size={16} aria-hidden="true" /> {p.location}
                  </li>
                )}
                {!!p.attendance && (
                  <li>
                    <Users size={16} aria-hidden="true" /> {p.attendance.toLocaleString('en-US')} came
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
