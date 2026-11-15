'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { withBase } from '../../lib/config';
import { useGameId } from '../../lib/useGameId';
import { subscribeToGame, getGame, expressStart } from '../../lib/api';
import { Game, ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, type Role } from '../../lib/types';
import { Card, Badge, Spinner, Button } from '../../components/ui';
import { Logo, RoleIcon, BotIcon, PersonIcon, ModeIcon, Bubbles } from '../../components/Brand';
import TutorialModal from '../../components/TutorialModal';

const STORAGE_KEYS = ['beergame_player_id', 'beergame_game_id', 'beergame_role',
  'beergame_team_name', 'beergame_team_number', 'beergame_email', 'beergame_mode'];

function LobbyPageInner() {
  const gameId = useGameId();
  const router = useRouter();

  const [game,    setGame]    = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [now,     setNow]     = useState(() => Date.now());

  const [myRole,       setMyRole]       = useState('');
  const [myPlayerId,   setMyPlayerId]   = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  const [starting,     setStarting]     = useState(false);
  const [error,        setError]        = useState('');

  useEffect(() => {
    setMyRole(localStorage.getItem('beergame_role') ?? '');
    setMyPlayerId(localStorage.getItem('beergame_player_id') ?? '');

    getGame(gameId).then(g => { setGame(g); setLoading(false); });

    return subscribeToGame(gameId, g => {
      setGame(g);
      if (g?.state?.phase === 'ordering' || g?.state?.phase === 'onboarding') {
        router.push(`/game?id=${gameId}`);
      }
    });
  }, [gameId, router]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  async function handleExpressStart() {
    if (starting) return;
    setStarting(true);
    setError('');
    try {
      await expressStart(gameId, myPlayerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start. Please try again.');
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8 text-gold-500" />
      </div>
    );
  }

  if (!game) {
    if (typeof window !== 'undefined') STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Logo size={56} />
        <h2 className="font-display text-3xl tracking-wide text-lager-900">Session expired</h2>
        <p className="text-ink-600 max-w-xs">
          This game no longer exists. It may have been reset, or you followed an old link.
        </p>
        <a href={withBase('/')} className="mt-2 inline-flex items-center rounded-xl bg-gold-400 px-6 py-2.5 font-bold text-lager-950 shadow-sm hover:bg-gold-300">
          Start fresh →
        </a>
      </div>
    );
  }

  const express   = game.config?.mode === 'express';
  const players   = game.players ?? {};
  const humans    = Object.values(players).filter(p => !p.isBot);
  const humanCount = humans.length;
  const botCount  = 4 - humanCount;
  const deadline  = game.state.lobbyDeadline ?? null;
  const secsLeft  = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const teamName  = humans[0]?.teamName ?? '';

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto flex flex-col gap-5 py-6">

        <div className="flex justify-center"><Logo size={44} /></div>

        <div className="text-center">
          <span className="chip"><ModeIcon mode={express ? 'express' : 'champions'} className="h-4 w-4" />{express ? 'Express Mode' : 'Champions Mode'}</span>
          <h1 className="mt-2 text-4xl text-lager-900">
            {express ? 'Pour yourself in — we start soon' : 'Waiting for your facilitator'}
          </h1>
          <p className="text-sm text-ink-600 mt-1">
            {teamName && <>Team <span className="font-semibold text-ink-800">{teamName}</span> · </>}
            Code <span className="font-mono text-ink-800">{game.code}</span>
          </p>
        </div>

        {/* Your assignment */}
        <Card className="p-4 border-l-4 border-l-gold-400">
          <p className="text-xs text-gold-700 font-bold uppercase tracking-wider mb-1">Your role</p>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-lager-800 text-gold-300">
              {myRole ? <RoleIcon role={myRole as Role} className="h-8 w-8" /> : null}
            </span>
            <div>
              <p className="text-xl font-bold text-lager-900">{ROLE_LABELS[myRole as Role] ?? myRole}</p>
              <p className="text-sm text-ink-600">{ROLE_DESCRIPTIONS[myRole as Role]}</p>
            </div>
          </div>
        </Card>

        {/* Team roster */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-ink-800">Team members</p>
            <Badge color={humanCount === 4 ? 'green' : 'yellow'}>{humanCount}/4 players</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ROLES.map(role => {
              const player = Object.values(players).find(p => p.role === role && !p.isBot);
              const isMe   = player?.id === myPlayerId;
              return (
                <div key={role} className={`flex items-center gap-3 rounded-xl p-3 border-2 ${
                  isMe ? 'border-gold-300 bg-gold-50'
                  : player ? 'border-lager-200 bg-lager-50'
                  : express ? 'border-dashed border-coast-200 bg-coast-50/50' : 'border-dashed border-ink-200 bg-foam'}`}>
                  <RoleIcon role={role} className="h-7 w-7 text-lager-700 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-600">{ROLE_LABELS[role]}</p>
                    <p className="text-sm font-semibold text-ink-900 truncate flex items-center gap-1">
                      {player ? <><PersonIcon className="h-4 w-4 text-lager-600" />{player.name}</>
                        : express ? <><BotIcon className="h-4 w-4 text-coast-600" /><span className="text-coast-700">AI bot</span></>
                        : <span className="text-ink-400 font-medium">Waiting…</span>}
                      {isMe && <span className="ml-1 text-xs font-bold text-gold-700">(you)</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {express ? (
          <Card className="p-5">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-bold text-ink-900">
                  {secsLeft !== null ? `Starting automatically in ${secsLeft}s` : 'Starting…'}
                </p>
                <p className="text-sm text-ink-600 mt-1">
                  {botCount === 0
                    ? 'Your team is full: all four roles are played by people.'
                    : `${botCount} empty ${botCount === 1 ? 'role is' : 'roles are'} taken by AI bot${botCount === 1 ? '' : 's'} when the game starts. Teammates can still join until then.`}
                </p>
              </div>
              {error && <p className="text-sm text-label-600">{error}</p>}
              {starting ? (
                <div className="flex items-center gap-3 rounded-xl bg-gold-50 border border-gold-200 px-4 py-3">
                  <Spinner className="w-5 h-5 text-gold-600 shrink-0" />
                  <span className="text-sm font-semibold text-gold-800">Starting game…</span>
                </div>
              ) : (
                <Button variant="gold" size="lg" className="w-full" onClick={handleExpressStart}>
                  ▶ Start now{botCount ? ` with ${botCount} AI bot${botCount === 1 ? '' : 's'}` : ''}
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card className="p-5 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-ink-700">
              <Spinner className="w-4 h-4 text-gold-600" />
              {humanCount < 4
                ? `Waiting for ${4 - humanCount} more player${4 - humanCount === 1 ? '' : 's'} to join…`
                : 'Your team is complete. Waiting for the facilitator to start the game…'}
            </div>
            <p className="text-xs text-ink-500 mt-2">
              In Champions Mode the game starts only when all 4 players have joined and the facilitator starts it.
            </p>
          </Card>
        )}

        {/* Tutorial */}
        <button
          onClick={() => setShowTutorial(true)}
          className="relative w-full overflow-hidden rounded-2xl border-2 border-gold-400 bg-gradient-to-br from-lager-800 to-lager-950 transition-all hover:brightness-110 group"
        >
          <Bubbles count={8} />
          <div className="relative flex flex-col items-center justify-center gap-3 py-8 px-6">
            <div className="w-14 h-14 rounded-full bg-gold-400/20 border-2 border-gold-300/60 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-gold-200 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
            <div className="text-center">
              <p className="font-display text-2xl tracking-wide text-gold-200">Watch the tutorial</p>
              <p className="text-gold-100/70 text-sm mt-0.5">How the Beer Distribution Game works (~1 min)</p>
            </div>
          </div>
        </button>

        {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
      </div>
    </main>
  );
}

export default function LobbyPage() {
  return <Suspense fallback={null}><LobbyPageInner /></Suspense>;
}
