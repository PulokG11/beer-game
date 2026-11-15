'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { withBase } from '../lib/config';
import {
  autoAssignPlayer, expressJoin, getExpressPlayerId, getGame, getSessionSettings, type ExpressRole,
} from '../lib/api';
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, type GameMode } from '../lib/types';
import { Button, Input, Spinner } from '../components/ui';
import { Logo, BeerGlass, Bottle, Lime, Hop, Bubbles, ModeIcon, RoleIcon, BotIcon } from '../components/Brand';

const STORAGE_KEYS = ['beergame_player_id', 'beergame_game_id', 'beergame_role',
  'beergame_team_name', 'beergame_team_number', 'beergame_email', 'beergame_mode'];
const clearStorage = () => STORAGE_KEYS.forEach(k => localStorage.removeItem(k));

type Step = 'mode' | GameMode;

export default function LandingPage() {
  const router = useRouter();
  const [step,    setStep]    = useState<Step>('mode');
  const [event,   setEvent]   = useState('Beer Game');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Champions
  const [email, setEmail] = useState('');
  // Express
  const [role, setRole] = useState<ExpressRole>('random');
  const [nickname, setNickname] = useState('');

  useEffect(() => {
    getSessionSettings().then(s => setEvent(s.eventName));

    // Resume an existing seat, after checking the game still exists.
    const gameId = localStorage.getItem('beergame_game_id');
    if (!gameId) return;
    getGame(gameId).then(g => {
      if (!g) clearStorage();
      else if (g.state?.phase === 'ended') router.replace(`/results?id=${gameId}`);
      else if (g.state?.phase === 'ordering' || g.state?.phase === 'summary') router.replace(`/game?id=${gameId}`);
      else router.replace(`/lobby?id=${gameId}`);
    });
  }, [router]);

  function seat(r: { playerId: string; gameId: string; role: string; teamName: string; teamNumber: number }, mode: GameMode, mail?: string) {
    localStorage.setItem('beergame_player_id',   r.playerId);
    localStorage.setItem('beergame_game_id',     r.gameId);
    localStorage.setItem('beergame_role',        r.role);
    localStorage.setItem('beergame_team_name',   r.teamName);
    localStorage.setItem('beergame_team_number', String(r.teamNumber));
    localStorage.setItem('beergame_mode',        mode);
    if (mail) localStorage.setItem('beergame_email', mail); else localStorage.removeItem('beergame_email');
    router.push(`/lobby?id=${r.gameId}`);
  }

  async function joinChampions(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) { setError('Please enter a valid email address.'); return; }
    setLoading(true); setError('');
    try { seat(await autoAssignPlayer(trimmed), 'champions', trimmed); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to join. Please try again.'); }
    finally { setLoading(false); }
  }

  async function joinExpress(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try { seat(await expressJoin(getExpressPlayerId(), role, nickname.trim()), 'express'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to join. Please try again.'); }
    finally { setLoading(false); }
  }

  const back = (
    <button onClick={() => { setStep('mode'); setError(''); }} className="mb-3 text-sm font-semibold text-ink-600 hover:text-lager-800">
      ← Choose a different mode
    </button>
  );

  return (
    <main className="min-h-screen">
      {/* Hero band */}
      <header className="relative overflow-hidden bg-gradient-to-b from-lager-950 via-lager-900 to-lager-800 text-foam">
        <Bubbles count={14} />
        <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-6 px-5 pb-20 pt-6">
          <div className="max-w-md">
            <Logo size={46} tone="light" />
            {event !== 'Beer Game' && <p className="mt-3 chip">{event}</p>}
            <h1 className="mt-6 text-6xl leading-[0.95] text-gold-300 sm:text-7xl">
              Beat the<br />Bullwhip.
            </h1>
            <p className="mt-4 max-w-sm text-base text-lager-100/90">
              Run a four-stage beer supply chain, from brewery to bar. Small swings in demand turn into huge swings upstream. Can your team keep the taps flowing?
            </p>
          </div>
          <div className="hidden shrink-0 items-end gap-2 sm:flex" aria-hidden="true">
            <Hop className="mb-2 h-16 w-12 animate-floaty" />
            <Bottle className="h-52 w-auto drop-shadow-xl" />
            <BeerGlass className="h-44 w-auto drop-shadow-xl" />
            <Lime className="mb-1 h-14 w-14 animate-floaty" />
          </div>
        </div>
        {/* foam edge */}
        <svg viewBox="0 0 1440 48" preserveAspectRatio="none" className="absolute bottom-[-1px] left-0 h-10 w-full" aria-hidden="true">
          <path d="M0 24c60 0 60-18 120-18s60 18 120 18 60-18 120-18 60 18 120 18 60-18 120-18 60 18 120 18 60-18 120-18 60 18 120 18 60-18 120-18 60 18 120 18 60-18 120-18 60 18 120 18V48H0z" fill="#fff8e6" />
        </svg>
      </header>

      <section className="mx-auto max-w-4xl px-4 pb-14 pt-5">
        {step === 'mode' && (
          <>
            <h2 className="mb-4 text-center text-4xl text-lager-900">Choose your game</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <ModeCard
                mode="champions" title="Champions Mode" tag="Facilitator-led"
                points={['Sign in with your email', 'Exactly 4 players per team', 'Starts when your facilitator says go']}
                cta="Play Champions" onClick={() => { setStep('champions'); setError(''); }}
              />
              <ModeCard
                mode="express" title="Express Mode" tag="Instant play"
                points={['No email, no facilitator', '1 to 4 players, AI bots fill the rest', 'Pick your role, or roll the dice']}
                cta="Play Express" onClick={() => { setStep('express'); setError(''); }}
              />
            </div>
          </>
        )}

        {step === 'champions' && (
          <div className="mx-auto max-w-sm">
            {back}
            <div className="label-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lager-800 text-gold-300"><ModeIcon mode="champions" /></span>
                <div>
                  <h2 className="text-3xl leading-none text-lager-900">Champions Mode</h2>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">Join your team</p>
                </div>
              </div>
              <form onSubmit={joinChampions} className="flex flex-col gap-4">
                <Input label="Your email" type="email" placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)} autoFocus autoComplete="email" />
                {error && <p className="-mt-2 text-sm text-label-600">{error}</p>}
                <Button type="submit" variant="gold" disabled={loading} size="lg" className="w-full">
                  {loading ? <><Spinner className="h-4 w-4" /> Joining…</> : 'Join my team →'}
                </Button>
              </form>
              <p className="mt-4 text-center text-xs text-ink-500">
                You&apos;re assigned a role automatically. The game starts once 4 players have joined and your facilitator starts it.
              </p>
            </div>
          </div>
        )}

        {step === 'express' && (
          <div className="mx-auto max-w-xl">
            {back}
            <div className="label-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lager-800 text-gold-300"><ModeIcon mode="express" /></span>
                <div>
                  <h2 className="text-3xl leading-none text-lager-900">Express Mode</h2>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">Pick a role and play</p>
                </div>
              </div>
              <form onSubmit={joinExpress} className="flex flex-col gap-5">
                <fieldset>
                  <legend className="mb-2 text-sm font-bold text-ink-800">Your role</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {ROLES.map(r => (
                      <RoleChoice key={r} selected={role === r} onClick={() => setRole(r)} label={ROLE_LABELS[r]} hint={ROLE_DESCRIPTIONS[r]}
                        icon={<RoleIcon role={r} className="h-7 w-7" />} />
                    ))}
                    <RoleChoice selected={role === 'random'} onClick={() => setRole('random')} label="Random" hint="Surprise me"
                      icon={<DiceIcon className="h-7 w-7" />} />
                  </div>
                </fieldset>
                <Input label="Nickname (optional)" placeholder="e.g. Thirsty Otter" maxLength={24} value={nickname}
                  onChange={e => setNickname(e.target.value)} autoComplete="off" />
                {error && <p className="-mt-2 text-sm text-label-600">{error}</p>}
                <Button type="submit" variant="gold" disabled={loading} size="lg" className="w-full">
                  {loading ? <><Spinner className="h-4 w-4" /> Pouring…</> : 'Pour me in →'}
                </Button>
              </form>
              <p className="mt-4 flex items-start justify-center gap-1.5 text-center text-xs text-ink-500">
                <BotIcon className="mt-px h-4 w-4 shrink-0 text-coast-600" />
                Play solo or with friends. Any roles nobody picks are played by AI bots. No email needed.
              </p>
            </div>
          </div>
        )}

        <p className="mt-10 text-center text-xs text-ink-500">
          Facilitator?{' '}
          <a href={withBase('/admin/')} className="font-semibold text-lager-800 underline hover:text-lager-600">Admin panel →</a>
        </p>
      </section>
    </main>
  );
}

function ModeCard({ mode, title, tag, points, cta, onClick }: {
  mode: GameMode; title: string; tag: string; points: string[]; cta: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="label-card group flex flex-col p-6 text-left transition-all hover:-translate-y-1 hover:shadow-glow focus:outline-none focus:ring-4 focus:ring-gold-300">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-lager-800 text-gold-300 transition-transform group-hover:scale-110">
          <ModeIcon mode={mode} className="h-7 w-7" />
        </span>
        <span className="chip">{tag}</span>
      </div>
      <h3 className="font-display text-4xl tracking-wide text-lager-900">{title}</h3>
      <ul className="mt-3 flex flex-1 flex-col gap-1.5 text-sm text-ink-700">
        {points.map(p => (
          <li key={p} className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-lager-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0z" clipRule="evenodd" /></svg>
            {p}
          </li>
        ))}
      </ul>
      <span className="mt-5 inline-flex items-center justify-center rounded-xl bg-gold-400 px-5 py-2.5 font-bold tracking-wide text-lager-950 shadow-sm group-hover:bg-gold-300">
        {cta} →
      </span>
    </button>
  );
}

function RoleChoice({ selected, onClick, label, hint, icon }: {
  selected: boolean; onClick: () => void; label: string; hint: string; icon: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-all focus:outline-none focus:ring-2 focus:ring-gold-400 ${
        selected ? 'border-lager-700 bg-lager-800 text-gold-200 shadow-glow' : 'border-gold-200 bg-foam text-lager-800 hover:border-gold-400 hover:bg-gold-50'}`}>
      {icon}
      <span className="text-sm font-bold">{label}</span>
      <span className={`text-[11px] leading-tight ${selected ? 'text-lager-100/80' : 'text-ink-500'}`}>{hint}</span>
    </button>
  );
}

function DiceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="4" y="4" width="24" height="24" rx="5" fill="currentColor" fillOpacity=".15" />
      <circle cx="11" cy="11" r="1.6" fill="currentColor" /><circle cx="21" cy="11" r="1.6" fill="currentColor" />
      <circle cx="16" cy="16" r="1.6" fill="currentColor" />
      <circle cx="11" cy="21" r="1.6" fill="currentColor" /><circle cx="21" cy="21" r="1.6" fill="currentColor" />
    </svg>
  );
}
