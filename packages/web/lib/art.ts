// Maps an art key to a layered card-header gradient + emoji. Richer 3-stop
// gradients read as crafted "art" rather than a flat fill; the texture,
// spotlight and vignette are layered on in CSS (.card-art).
export const ART: Record<string, { grad: string; emoji: string }> = {
  spain: { grad: "linear-gradient(145deg,#7a0f1d,#c81e3a 52%,#f2b134)", emoji: "🐂" },
  goals: { grad: "linear-gradient(145deg,#ff512f,#b5179e 90%)", emoji: "⚽" },
  france: { grad: "linear-gradient(145deg,#0a2a6b,#1e4fa3 52%,#d33b4a)", emoji: "🐓" },
  defense: { grad: "linear-gradient(145deg,#1f2937,#3b4759 60%,#647088)", emoji: "🧱" },
  usa: { grad: "linear-gradient(145deg,#16224d,#2a3f8f 52%,#9c2436)", emoji: "🦅" },
  fireworks: { grad: "linear-gradient(145deg,#f7971e,#ffce4d 90%)", emoji: "🎆" },
  saudi: { grad: "linear-gradient(145deg,#06321c,#0a8a3f 60%,#0c5a34)", emoji: "💥" },
  mbappe: { grad: "linear-gradient(145deg,#0a1a3f,#1e3a8a 58%,#0b0b0f)", emoji: "👟" },
  conmebol: { grad: "linear-gradient(145deg,#065f46,#10b981 55%,#f5d20a)", emoji: "🏆" },
  debutant: { grad: "linear-gradient(145deg,#3a1c71,#5b46c9 50%,#26c6da)", emoji: "✨" },
  "samba-spectacle": { grad: "linear-gradient(145deg,#1a7a3c,#f5c518 60%,#0a3d8f)", emoji: "🦜" },
  "goal-frenzy": { grad: "linear-gradient(145deg,#2a6fd6,#7db9ff 55%,#c81e3a)", emoji: "⚡" },
  "teutonic-triumph": { grad: "linear-gradient(145deg,#161616,#9c1f2e 55%,#e0b32a)", emoji: "🛡️" },
  "goal-fireworks": { grad: "linear-gradient(145deg,#7a0f1d,#e0b32a 90%)", emoji: "🎇" },
  "golazo-king": { grad: "linear-gradient(145deg,#3a1c71,#a435c9 55%,#f5c518)", emoji: "👑" },
  default: { grad: "linear-gradient(145deg,#3a1c71,#8b3fb0 60%,#d76d77)", emoji: "🎴" },
};

export const artFor = (k?: string) => ART[k ?? "default"] ?? ART.default;
