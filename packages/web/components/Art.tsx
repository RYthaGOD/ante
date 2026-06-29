"use client";

import React, { useState } from "react";

// Bespoke flat-illustration card art (one motif per market). Light/cream shapes
// with soft shadows and a few accent tones so they read on any gradient header.
// No emoji — these are real vector illustrations.

const W = "#f7f8fb";
const W2 = "#dfe3ec";
const INK = "#11151f";
const GOLD = "#ffd24a";
const GOLD2 = "#f0a52e";

const Defs = () => (
  <defs>
    <linearGradient id="lite" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ffffff" />
      <stop offset="1" stopColor="#d8dce6" />
    </linearGradient>
    <linearGradient id="goldg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ffe48a" />
      <stop offset="1" stopColor="#e89a22" />
    </linearGradient>
    <radialGradient id="ballg" cx="0.4" cy="0.32" r="0.85">
      <stop offset="0" stopColor="#ffffff" />
      <stop offset="1" stopColor="#cfd4df" />
    </radialGradient>
  </defs>
);

const Shadow = ({ cy = 132, rx = 38 }: { cy?: number; rx?: number }) => (
  <ellipse cx="80" cy={cy} rx={rx} ry="7" fill="rgba(0,0,0,0.28)" />
);

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg viewBox="0 0 160 160" className="card-illus" xmlns="http://www.w3.org/2000/svg">
    <Defs />
    {children}
  </svg>
);

const Ball = () => (
  <Frame>
    <Shadow rx={34} />
    <circle cx="80" cy="72" r="46" fill="url(#ballg)" />
    <polygon points="80,56 96,68 90,86 70,86 64,68" fill={INK} />
    <g stroke={INK} strokeWidth="5" strokeLinecap="round">
      <line x1="80" y1="56" x2="80" y2="30" />
      <line x1="96" y1="68" x2="121" y2="60" />
      <line x1="90" y1="86" x2="104" y2="107" />
      <line x1="70" y1="86" x2="56" y2="107" />
      <line x1="64" y1="68" x2="39" y2="60" />
    </g>
    <g fill={INK}>
      <polygon points="80,26 88,33 84,44 76,44 72,33" />
      <polygon points="124,55 132,64 126,74 116,70 117,60" />
      <polygon points="108,110 116,118 108,126 99,120 101,110" />
      <polygon points="52,110 60,110 61,120 52,126 44,118" />
      <polygon points="36,55 43,60 44,70 34,74 28,64" />
    </g>
    <circle cx="80" cy="72" r="46" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="2" />
  </Frame>
);

const Net = () => (
  <Frame>
    <Shadow rx={44} cy={134} />
    {/* net mesh */}
    <g stroke="rgba(255,255,255,.5)" strokeWidth="1.5">
      {Array.from({ length: 7 }).map((_, i) => (
        <line key={"v" + i} x1={30 + i * 17} y1="40" x2={30 + i * 17} y2="112" />
      ))}
      {Array.from({ length: 5 }).map((_, i) => (
        <line key={"h" + i} x1="28" y1={44 + i * 17} x2="132" y2={44 + i * 17} />
      ))}
    </g>
    {/* goal frame */}
    <g fill="none" stroke="url(#lite)" strokeWidth="9" strokeLinejoin="round">
      <path d="M28 112 V40 H132 V112" />
    </g>
    <rect x="22" y="108" width="116" height="9" rx="4" fill="url(#lite)" />
    {/* ball in corner */}
    <circle cx="108" cy="92" r="16" fill="url(#ballg)" />
    <polygon points="108,84 114,89 112,97 104,97 102,89" fill={INK} />
    <g stroke="rgba(255,255,255,.85)" strokeWidth="3" strokeLinecap="round">
      <line x1="56" y1="116" x2="44" y2="128" />
      <line x1="70" y1="116" x2="60" y2="130" />
    </g>
  </Frame>
);

const Pennants = () => (
  <Frame>
    <Shadow rx={40} />
    {/* poles */}
    <g stroke="url(#lite)" strokeWidth="6" strokeLinecap="round">
      <line x1="58" y1="34" x2="74" y2="120" />
      <line x1="102" y1="34" x2="86" y2="120" />
    </g>
    {/* left pennant */}
    <path d="M60 40 L104 52 L66 70 Z" fill={W} />
    <path d="M60 40 L104 52 L84 57 L62 50 Z" fill={W2} />
    {/* right pennant */}
    <path d="M100 40 L56 52 L94 70 Z" fill={GOLD} />
    <path d="M100 40 L56 52 L76 57 L98 50 Z" fill={GOLD2} />
    <text x="80" y="104" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="22" fill="url(#lite)">VS</text>
  </Frame>
);

const Shield = () => (
  <Frame>
    <Shadow rx={32} />
    <path d="M80 28 L118 42 V78 C118 102 100 116 80 124 C60 116 42 102 42 78 V42 Z" fill="url(#lite)" />
    <path d="M80 28 L118 42 V78 C118 102 100 116 80 124 V28 Z" fill="#c9cedb" opacity=".55" />
    <path d="M64 74 l11 12 22 -26" fill="none" stroke="#1c8f54" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
  </Frame>
);

const Stadium = () => (
  <Frame>
    <Shadow rx={46} cy={132} />
    {/* floodlights */}
    <g>
      <line x1="40" y1="92" x2="34" y2="44" stroke="url(#lite)" strokeWidth="5" strokeLinecap="round" />
      <line x1="120" y1="92" x2="126" y2="44" stroke="url(#lite)" strokeWidth="5" strokeLinecap="round" />
      <rect x="22" y="34" width="24" height="13" rx="3" fill={GOLD} />
      <rect x="114" y="34" width="24" height="13" rx="3" fill={GOLD} />
      <path d="M22 47 L10 70 L58 70 L46 47 Z" fill={GOLD} opacity=".22" />
      <path d="M138 47 L150 70 L102 70 L114 47 Z" fill={GOLD} opacity=".22" />
    </g>
    {/* bowl */}
    <ellipse cx="80" cy="104" rx="58" ry="24" fill="url(#lite)" />
    <ellipse cx="80" cy="100" rx="40" ry="16" fill="#3aa55f" />
    <line x1="80" y1="86" x2="80" y2="114" stroke="rgba(255,255,255,.85)" strokeWidth="2" />
    <circle cx="80" cy="100" r="7" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="2" />
  </Frame>
);

const Fireworks = () => (
  <Frame>
    <Shadow rx={30} />
    <g stroke={GOLD} strokeWidth="4" strokeLinecap="round">
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * Math.PI) / 6;
        const x1 = 80 + Math.cos(a) * 16, y1 = 70 + Math.sin(a) * 16;
        const x2 = 80 + Math.cos(a) * 42, y2 = 70 + Math.sin(a) * 42;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
    </g>
    <g fill="#ffffff">
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * Math.PI) / 6;
        return <circle key={i} cx={80 + Math.cos(a) * 48} cy={70 + Math.sin(a) * 48} r="3.2" />;
      })}
    </g>
    <circle cx="80" cy="70" r="9" fill="#fff" />
    <circle cx="40" cy="36" r="3" fill={W} />
    <circle cx="122" cy="40" r="3" fill={W} />
    <circle cx="120" cy="108" r="3" fill={W} />
  </Frame>
);

const Burst = () => (
  <Frame>
    <Shadow rx={30} />
    <polygon
      points="80,22 92,58 128,46 104,76 130,104 94,98 80,132 66,98 30,104 56,76 32,46 68,58"
      fill="url(#lite)"
    />
    <polygon points="80,46 88,70 112,66 95,84 100,108 80,96 60,108 65,84 48,66 72,70" fill={GOLD} />
    <text x="80" y="86" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="17" fill={INK}>UPSET</text>
  </Frame>
);

const Boot = () => (
  <Frame>
    <Shadow rx={42} cy={130} />
    <path
      d="M36 60 C36 54 42 52 50 53 L78 58 C92 60 104 66 120 78 C128 84 130 92 124 98 L52 98 C42 98 36 92 36 84 Z"
      fill="url(#goldg)"
    />
    <path d="M36 60 C50 64 64 66 80 67 C72 74 60 76 44 76 L36 76 Z" fill="#fff" opacity=".35" />
    {/* laces */}
    <g stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".85">
      <line x1="54" y1="62" x2="64" y2="70" />
      <line x1="64" y1="62" x2="54" y2="70" />
      <line x1="68" y1="64" x2="78" y2="72" />
      <line x1="78" y1="64" x2="68" y2="72" />
    </g>
    {/* sole + studs */}
    <rect x="44" y="98" width="84" height="9" rx="4" fill={INK} />
    <g fill={INK}>
      <circle cx="54" cy="112" r="4" />
      <circle cx="72" cy="112" r="4" />
      <circle cx="92" cy="112" r="4" />
      <circle cx="112" cy="112" r="4" />
    </g>
  </Frame>
);

const Trophy = () => (
  <Frame>
    <Shadow rx={34} />
    {/* handles */}
    <path d="M52 50 C34 50 34 78 56 80" fill="none" stroke="url(#goldg)" strokeWidth="7" />
    <path d="M108 50 C126 50 126 78 104 80" fill="none" stroke="url(#goldg)" strokeWidth="7" />
    {/* cup */}
    <path d="M50 40 H110 V58 C110 84 96 96 80 96 C64 96 50 84 50 58 Z" fill="url(#goldg)" />
    <path d="M50 40 H80 V96 C64 96 50 84 50 58 Z" fill="#fff" opacity=".18" />
    {/* stem + base */}
    <rect x="74" y="96" width="12" height="16" fill="#caa235" />
    <rect x="58" y="112" width="44" height="9" rx="3" fill="url(#goldg)" />
    <rect x="50" y="121" width="60" height="9" rx="3" fill="#caa235" />
    <path d="M70 56 l8 8 14 -16" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
  </Frame>
);

const Star = () => (
  <Frame>
    <Shadow rx={28} />
    {/* motion arc */}
    <path d="M30 116 C58 96 70 70 84 40" fill="none" stroke="url(#lite)" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" opacity=".7" />
    <polygon points="92,30 103,58 133,60 110,79 118,108 92,92 66,108 74,79 51,60 81,58" fill="url(#goldg)" />
    <polygon points="92,30 92,92 66,108 74,79 51,60 81,58" fill="#fff" opacity=".18" />
    <circle cx="40" cy="44" r="3.4" fill={W} />
    <circle cx="126" cy="100" r="3.4" fill={W} />
  </Frame>
);

const MAP: Record<string, React.FC> = {
  spain: Ball,
  goals: Net,
  france: Pennants,
  defense: Shield,
  usa: Stadium,
  fireworks: Fireworks,
  saudi: Burst,
  mbappe: Boot,
  conmebol: Trophy,
  debutant: Star,
  "samba-spectacle": Ball,
  "goal-frenzy": Net,
  "teutonic-triumph": Shield,
  "goal-fireworks": Fireworks,
  "golazo-king": Trophy,
};

export function Art({ kind }: { kind?: string }) {
  const C = (kind && MAP[kind]) || Ball;
  return <C />;
}

// Renders the generated illustration at public/art/<key>.(png|jpg) when present,
// with the vector Art always behind it as a graceful fallback (no flash, and it
// still looks finished before any images are dropped in).
export function ArtImage({ artKey }: { artKey?: string }) {
  const [err, setErr] = useState(false);
  return (
    <>
      <Art kind={artKey} />
      {artKey && !err && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="card-art-img"
          src={`/art/${artKey}.png`}
          alt=""
          onError={() => setErr(true)}
        />
      )}
    </>
  );
}
