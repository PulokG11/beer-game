import type { CSSProperties } from 'react';
import type { Role, GameMode } from '../lib/types';

// Original artwork, inspired by lager-label colours (gold, bottle green, label red, coastal blue).
// No brand's logo or trademark is reproduced.

// ─── Logo ─────────────────────────────────────────────────────────────────────

const CAP_POINTS = Array.from({ length: 40 }, (_, i) => {
  const a = (Math.PI * 2 * i) / 40 - Math.PI / 2;
  const r = i % 2 === 0 ? 31 : 27.5;
  return `${(32 + r * Math.cos(a)).toFixed(2)},${(32 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

/** Crown-cap emblem with a foaming mug. */
export function CapEmblem({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Beer Game emblem">
      <polygon points={CAP_POINTS} fill="#fcc02a" stroke="#b06a08" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="23.5" fill="#0a4f35" stroke="#ffd24d" strokeWidth="1.6" />
      {/* mug */}
      <path d="M40 27h3.2a3.3 3.3 0 0 1 0 8H40" fill="none" stroke="#fcc02a" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="21" y="25" width="19" height="19" rx="3.2" fill="#fcc02a" />
      <rect x="24" y="29" width="3" height="11" rx="1.5" fill="#fff3c4" opacity=".85" />
      <g fill="#fffdf5">
        <circle cx="25.5" cy="23.5" r="4" /><circle cx="31" cy="21.5" r="4.6" /><circle cx="36.4" cy="23.5" r="4" />
      </g>
    </svg>
  );
}

/** Emblem + wordmark. `tone="light"` for dark backgrounds. */
export function Logo({ size = 40, tone = 'dark', className = '' }: { size?: number; tone?: 'dark' | 'light'; className?: string }) {
  const main = tone === 'light' ? 'text-foam' : 'text-lager-900';
  const sub  = tone === 'light' ? 'text-gold-300' : 'text-label-600';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <CapEmblem size={size} />
      <span className="leading-none">
        <span className={`block text-[10px] font-bold tracking-[0.35em] ${sub}`}>THE</span>
        <span className={`block font-display tracking-wide ${main}`} style={{ fontSize: size * 0.62 }}>BEER GAME</span>
      </span>
    </span>
  );
}

// ─── Hero illustrations ───────────────────────────────────────────────────────

const bubbleDots: Array<{ x: number; y: number; r: number; d: number }> = [
  { x: 42, y: 176, r: 2.6, d: 0 }, { x: 60, y: 182, r: 3.2, d: 0.9 }, { x: 76, y: 174, r: 2.2, d: 1.7 },
  { x: 52, y: 186, r: 2, d: 2.3 }, { x: 68, y: 170, r: 2.8, d: 0.4 }, { x: 36, y: 168, r: 2, d: 1.2 },
];

/** Pilsner glass with rising bubbles. */
export function BeerGlass({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 200" className={className} role="img" aria-label="Glass of golden lager">
      <defs>
        <linearGradient id="bg-liquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd24d" /><stop offset="1" stopColor="#f0a60e" />
        </linearGradient>
        <clipPath id="bg-clip"><path d="M22 34 H98 L89 184 Q88 192 80 192 H40 Q32 192 31 184 Z" /></clipPath>
      </defs>
      <path d="M22 34 H98 L89 184 Q88 192 80 192 H40 Q32 192 31 184 Z" fill="url(#bg-liquid)" />
      <g clipPath="url(#bg-clip)">
        {bubbleDots.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={b.r} fill="#fffdf5" opacity=".8"
            className="animate-rise" style={{ animationDelay: `${b.d}s`, transformBox: 'fill-box', transformOrigin: 'center' } as CSSProperties} />
        ))}
      </g>
      <rect x="29" y="52" width="6" height="118" rx="3" fill="#fff" opacity=".35" />
      <path d="M22 34 H98 L89 184 Q88 192 80 192 H40 Q32 192 31 184 Z" fill="none" stroke="#fff3c4" strokeWidth="3" strokeLinejoin="round" />
      {/* foam */}
      <path d="M16 38 Q12 16 34 18 Q42 4 62 10 Q80 2 92 16 Q112 16 104 38 Z" fill="#fffdf5" stroke="#ffe58a" strokeWidth="2" />
      <circle cx="40" cy="24" r="4" fill="#fff3c4" /><circle cx="72" cy="20" r="5" fill="#fff3c4" /><circle cx="90" cy="30" r="3" fill="#fff3c4" />
    </svg>
  );
}

/** Long-neck green bottle with a gold label. */
export function Bottle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 70 220" className={className} role="img" aria-label="Green lager bottle">
      <defs>
        <linearGradient id="bt-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0a4f35" /><stop offset=".35" stopColor="#1f9a63" /><stop offset="1" stopColor="#08402c" />
        </linearGradient>
      </defs>
      <rect x="27" y="3" width="16" height="10" rx="2.5" fill="#fcc02a" stroke="#b06a08" strokeWidth="1" />
      <path d="M30 13 H40 V60 C40 82 58 88 58 116 V200 Q58 212 46 212 H24 Q12 212 12 200 V116 C12 88 30 82 30 60 Z" fill="url(#bt-glass)" />
      <path d="M20 118 V196" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".22" />
      <rect x="13" y="128" width="44" height="56" rx="4" fill="#fffdf5" stroke="#fcc02a" strokeWidth="2" />
      <rect x="13" y="136" width="44" height="9" fill="#c8102e" />
      <text x="35" y="168" textAnchor="middle" fontSize="15" fill="#0a4f35" style={{ fontFamily: 'var(--font-display), Impact, sans-serif', letterSpacing: '1px' }}>LAGER</text>
      <text x="35" y="179" textAnchor="middle" fontSize="6" fontWeight="700" fill="#b06a08" letterSpacing="1.5">SINCE 1964</text>
    </svg>
  );
}

/** Lime wedge, for a coastal-lager touch. */
export function Lime({ className = '' }: { className?: string }) {
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 8;
    return <line key={i} x1="40" y1="40" x2={40 + 27 * Math.cos(a)} y2={40 + 27 * Math.sin(a)} stroke="#effaf3" strokeWidth="2.2" strokeLinecap="round" />;
  });
  return (
    <svg viewBox="0 0 80 80" className={className} role="img" aria-label="Lime wedge">
      <circle cx="40" cy="40" r="37" fill="#1f9a63" />
      <circle cx="40" cy="40" r="32" fill="#e4f6a3" />
      <circle cx="40" cy="40" r="28" fill="#c5e86a" />
      {spokes}
      <circle cx="40" cy="40" r="4" fill="#effaf3" />
    </svg>
  );
}

/** Hop cone. */
export function Hop({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 64" className={className} aria-hidden="true">
      <path d="M24 2c0 6-4 8-4 12" fill="none" stroke="#0b6340" strokeWidth="2" strokeLinecap="round" />
      <g fill="#1f9a63" stroke="#0b6340" strokeWidth="1.4">
        <path d="M24 14c-10 2-16 10-14 20 3 12 10 26 14 28 4-2 11-16 14-28 2-10-4-18-14-20z" />
      </g>
      <g fill="none" stroke="#b0e5c7" strokeWidth="1.4" strokeLinecap="round">
        <path d="M16 26c5 3 11 3 16 0" /><path d="M14 36c6 4 14 4 20 0" /><path d="M18 46c4 3 8 3 12 0" /><path d="M24 14v46" />
      </g>
    </svg>
  );
}

// ─── Role icons ───────────────────────────────────────────────────────────────

/** Duotone supply-chain icons. Colour comes from `currentColor`. */
export function RoleIcon({ role, className = 'h-6 w-6' }: { role: Role; className?: string }) {
  const common = { viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className, role: 'img' as const };
  switch (role) {
    case 'manufacturer':
      return (
        <svg {...common} aria-label="Brewery">
          <path d="M3 28h26" />
          <rect x="5" y="14" width="9" height="14" rx="1.5" fill="currentColor" fillOpacity=".18" />
          <path d="M5 14c0-5 9-5 9 0" />
          <rect x="18" y="10" width="9" height="18" rx="1.5" fill="currentColor" fillOpacity=".18" />
          <path d="M18 10c0-5 9-5 9 0" />
          <path d="M14 22h4" /><path d="M22.5 3v3" />
        </svg>
      );
    case 'distributor':
      return (
        <svg {...common} aria-label="Distribution truck">
          <rect x="2" y="9" width="17" height="13" rx="1.5" fill="currentColor" fillOpacity=".18" />
          <path d="M19 13h6l4 4.5V22H19z" />
          <circle cx="8" cy="24" r="2.7" fill="#fffdf5" /><circle cx="23.5" cy="24" r="2.7" fill="#fffdf5" />
          <path d="M6 14h8" />
        </svg>
      );
    case 'wholesaler':
      return (
        <svg {...common} aria-label="Warehouse">
          <path d="M3 13 16 5l13 8v15H3z" fill="currentColor" fillOpacity=".18" />
          <rect x="10.5" y="16" width="11" height="12" />
          <path d="M10.5 20h11M10.5 24h11" />
        </svg>
      );
    case 'retailer':
      return (
        <svg {...common} aria-label="Bar and shop">
          <path d="M4 12 6 5h20l2 7z" fill="currentColor" fillOpacity=".18" />
          <path d="M4 12c0 2.2 2.4 2.2 2.4 0 0 2.2 2.4 2.2 2.4 0 0 2.2 2.4 2.2 2.4 0 0 2.2 2.4 2.2 2.4 0 0 2.2 2.4 2.2 2.4 0 0 2.2 2.4 2.2 2.4 0" />
          <rect x="6" y="14" width="20" height="14" />
          <rect x="13" y="19" width="6" height="9" />
        </svg>
      );
  }
}

// ─── Mode & player icons ──────────────────────────────────────────────────────

export function ModeIcon({ mode, className = 'h-7 w-7' }: { mode: GameMode; className?: string }) {
  const common = { viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className, 'aria-hidden': true };
  return mode === 'champions' ? (
    <svg {...common}>
      <path d="M9 5h14v7a7 7 0 0 1-14 0z" fill="currentColor" fillOpacity=".2" />
      <path d="M9 8H5v2a4 4 0 0 0 4 4M23 8h4v2a4 4 0 0 1-4 4M16 19v5M11 28h10M13 24h6" />
    </svg>
  ) : (
    <svg {...common}>
      <path d="M18 3 7 18h8l-2 11 12-17h-8z" fill="currentColor" fillOpacity=".2" />
    </svg>
  );
}

export function BotIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-label="AI bot" role="img">
      <rect x="4" y="8" width="16" height="11" rx="3" fill="currentColor" fillOpacity=".15" />
      <path d="M12 8V4M9 4h6" /><circle cx="9" cy="13" r="1.4" fill="currentColor" /><circle cx="15" cy="13" r="1.4" fill="currentColor" />
      <path d="M9.5 16.5h5" />
    </svg>
  );
}

export function PersonIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-label="Player" role="img">
      <circle cx="12" cy="8" r="3.6" fill="currentColor" fillOpacity=".15" /><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6" />
    </svg>
  );
}

/** Bubbles drifting up inside a container (decorative). */
export function Bubbles({ count = 10 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const size = 6 + ((i * 7) % 12);
        return (
          <span key={i} className="bubble" style={{
            width: size, height: size, left: `${(i * 97) % 100}%`, bottom: -20,
            animationDelay: `${(i * 0.7) % 5}s`, animationDuration: `${4 + (i % 4)}s`,
          }} />
        );
      })}
    </div>
  );
}

// ─── KPI icons ────────────────────────────────────────────────────────────────

const kpi = { viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export function CoinIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg {...kpi} className={className}>
      <circle cx="16" cy="16" r="11" fill="currentColor" fillOpacity=".18" /><path d="M19.5 12.2c-.8-1-2-1.5-3.5-1.5-2 0-3.4.9-3.4 2.4 0 3.3 7 1.6 7 5.2 0 1.6-1.5 2.6-3.6 2.6-1.6 0-2.9-.6-3.8-1.7M16 8.5v2.2m0 10.6v2.2" />
    </svg>
  );
}

export function BoxIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg {...kpi} className={className}>
      <path d="M4 10 16 4l12 6v13l-12 6-12-6z" fill="currentColor" fillOpacity=".18" /><path d="M4 10l12 6 12-6M16 16v13" />
    </svg>
  );
}

export function ChartIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg {...kpi} className={className}>
      <path d="M4 27h24M6 22l6-7 5 4 9-12" /><circle cx="26" cy="7" r="2" fill="currentColor" />
    </svg>
  );
}
