// TrueCut — creative directions. A direction is a complete visual + sonic identity:
// palette, typefaces, background, HUD, captions, transitions, card style and music.
// The AI picks one per video and remixes it (brand accent, theme, music, transition),
// so no two videos share the same look and sound.

export const FONTS = {
  Geist: { files: [[400, 'Geist-Regular'], [500, 'Geist-Medium'], [600, 'Geist-SemiBold'], [700, 'Geist-Bold']], kind: 'grotesk' },
  Inter: { files: [[100, 'inter-variable', 900]], kind: 'grotesk' },
  'JetBrains Mono': { files: [[100, 'jetbrains-mono-variable', 900]], kind: 'mono' },
  'Instrument Serif': { files: [[400, 'instrument-serif-latin-400-normal'], [400, 'instrument-serif-latin-400-italic', 0, 'italic']], kind: 'serif' },
  'Playfair Display': { files: [[700, 'playfair-display-latin-700-normal'], [900, 'playfair-display-latin-900-normal'], [700, 'playfair-display-latin-700-italic', 0, 'italic']], kind: 'serif' },
  Fraunces: { files: [[700, 'fraunces-latin-700-normal'], [900, 'fraunces-latin-900-normal']], kind: 'serif' },
  Anton: { files: [[400, 'anton-latin-400-normal']], kind: 'condensed' },
  'Archivo Black': { files: [[400, 'archivo-black-latin-400-normal']], kind: 'heavy' },
  'Space Grotesk': { files: [[500, 'space-grotesk-latin-500-normal'], [700, 'space-grotesk-latin-700-normal']], kind: 'grotesk' },
  'Bricolage Grotesque': { files: [[600, 'bricolage-grotesque-latin-600-normal'], [800, 'bricolage-grotesque-latin-800-normal']], kind: 'grotesk' },
  Syne: { files: [[700, 'syne-latin-700-normal'], [800, 'syne-latin-800-normal']], kind: 'display' },
  Unbounded: { files: [[700, 'unbounded-latin-700-normal']], kind: 'display' },
  'IBM Plex Mono': { files: [[500, 'ibm-plex-mono-latin-500-normal']], kind: 'mono' },
  VT323: { files: [[400, 'vt323-latin-400-normal']], kind: 'pixel' },
  'DM Sans': { files: [[500, 'dm-sans-latin-500-normal'], [700, 'dm-sans-latin-700-normal']], kind: 'grotesk' },
  'Space Mono': { files: [[400, 'space-mono-latin-400-normal']], kind: 'mono' },
  'Bowlby One': { files: [[400, 'bowlby-one-latin-400-normal']], kind: 'heavy' },
  'IBM Plex Sans Condensed': { files: [[700, 'ibm-plex-sans-condensed-latin-700-normal']], kind: 'condensed' },
  'IBM Plex Sans': { files: [[500, 'ibm-plex-sans-latin-500-normal'], [700, 'ibm-plex-sans-latin-700-normal']], kind: 'grotesk' },
  Manrope: { files: [[700, 'manrope-latin-700-normal']], kind: 'grotesk' },
};

export function fontFaceCss(base) {
  let css = '';
  for (const [fam, f] of Object.entries(FONTS)) for (const [w, file, wmax, style] of f.files)
    css += `@font-face{font-family:'${fam}';src:url(${base}${file}.woff2) format('woff2');font-weight:${wmax ? `${w} ${wmax}` : w};font-style:${style || 'normal'};font-display:block}\n`;
  return css;
}
/** Heaviest available weight ≤ want (or the lightest one) — avoids faux-bold. */
export function weightFor(fam, want) {
  const f = FONTS[fam]; if (!f) return want;
  const ws = f.files.filter((x) => !x[3]).flatMap(([w, , wmax]) => (wmax ? [Math.min(want, wmax)] : [w]));
  const ok = ws.filter((w) => w <= want); return ok.length ? Math.max(...ok) : Math.min(...ws);
}

export const BACKGROUNDS = ['grid', 'paper', 'horizon', 'modules', 'stripes', 'blueprint', 'smoke', 'scanlines', 'blobs', 'solid', 'dots', 'aurora', 'halftone', 'bento', 'scraps', 'ruled', 'sparkle', 'baseline', 'handheld'];
export const TRANSITIONS = ['zoom', 'wipe', 'iris', 'slide', 'glitch', 'cut', 'fade', 'blur', 'misregister', 'stopmotion', 'swipe'];
export const CAPTIONS = ['clean', 'box', 'karaoke', 'mono', 'pill', 'highlight', 'outline', 'typewriter', 'quiet', 'none'];
/** What each caption style looks like, for Nick and the UI. */
export const CAPTION_STYLES = {
  clean: 'Words brighten as they are spoken.', box: 'Solid ink bar behind the line.', karaoke: 'The spoken word lights up in the accent.', mono: 'Terminal-style mono text.',
  pill: 'Rounded accent pills (CapCut-style).', highlight: 'The spoken word gets an accent box and grows a little.', outline: 'Bold white words with a black outline that pop in one by one.',
  typewriter: 'Each word types itself out as it is spoken.', quiet: 'Small lowercase line, no motion. Calm and editorial.', none: 'No burned-in captions.',
};
export const GENRES = ['pulse', 'cinematic', 'lofi', 'synthwave', 'house', 'trap', 'piano', 'ambient', 'bright'];

export const DIRECTIONS = {
  signal: {
    brandable: true, label: 'Signal', vibe: 'Dark, technical, precise. HUD, grid floor, odometers, electronic pulse with a hard drop. Product-led SaaS.',
    theme: 'dark', palette: { bg: '#07080B', bg2: '#11131A', ink: '#F2EDE4', muted: '#8B909A', accent: '#F47920', accent2: '#FAB673', card: '#12141A', line: '#262A33' },
    fonts: { display: 'Geist', body: 'Inter', mono: 'JetBrains Mono' }, display: { weight: 700, case: 'none', tracking: -0.045, align: 'center' },
    background: 'grid', grain: 0.075, vignette: true, hud: 'tech', captions: 'clean', transition: 'zoom', card: { radius: 20, style: 'solid' }, letterbox: false,
    music: { genre: 'pulse', bpm: 120, key: 0 },
  },
  editorial: {
    brandable: true, label: 'Editorial', vibe: 'Warm paper, serif headlines, calm confidence. Thoughtful founders, consulting, B2B thought leadership.',
    theme: 'light', palette: { bg: '#F3EEE4', bg2: '#E8E0D0', ink: '#1C1915', muted: '#6E665A', accent: '#C2410C', accent2: '#1C1915', card: '#FBF8F2', line: '#D8CFBF' },
    fonts: { display: 'Instrument Serif', body: 'DM Sans', mono: 'IBM Plex Mono' }, display: { weight: 400, case: 'none', tracking: -0.02, align: 'left', italicAccent: true },
    background: 'paper', grain: 0.05, vignette: false, hud: 'minimal', captions: 'clean', transition: 'wipe', card: { radius: 6, style: 'outline' }, letterbox: false,
    music: { genre: 'piano', bpm: 76, key: 3 },
  },
  neon: {
    label: 'Neon Night', vibe: 'Synthwave horizon, magenta + cyan, glitch cuts, retro-futurist energy. Dev tools, gaming, bold consumer tech.',
    theme: 'dark', palette: { bg: '#0B0420', bg2: '#1C0A3D', ink: '#F7EEFF', muted: '#A99BC8', accent: '#FF2E88', accent2: '#22D3EE', card: '#160B33', line: '#3A2470' },
    fonts: { display: 'Unbounded', body: 'Space Grotesk', mono: 'VT323' }, display: { weight: 700, case: 'upper', tracking: -0.02, align: 'center' },
    background: 'horizon', grain: 0.06, vignette: true, hud: 'tech', captions: 'karaoke', transition: 'glitch', card: { radius: 16, style: 'glass' }, letterbox: false,
    music: { genre: 'synthwave', bpm: 100, key: 5 },
  },
  swiss: {
    brandable: true, label: 'Swiss', vibe: 'International typographic style: white, heavy grotesk, red, flush-left, hard slides. Design-savvy, clean, modern.',
    theme: 'light', palette: { bg: '#F4F4F0', bg2: '#E6E6E0', ink: '#111111', muted: '#666660', accent: '#E4002B', accent2: '#111111', card: '#FFFFFF', line: '#CFCFC8' },
    fonts: { display: 'Archivo Black', body: 'DM Sans', mono: 'IBM Plex Mono' }, display: { weight: 400, case: 'upper', tracking: -0.02, align: 'left' },
    background: 'modules', grain: 0, vignette: false, hud: 'minimal', captions: 'box', transition: 'slide', card: { radius: 0, style: 'outline' }, letterbox: false,
    music: { genre: 'house', bpm: 124, key: 7 },
  },
  brutal: {
    label: 'Brutal', vibe: 'Yellow and black, condensed all-caps that fills the frame, slam cuts, 808s. Loud launches, challengers, Gen-Z.',
    theme: 'light', palette: { bg: '#FFE500', bg2: '#FFD000', ink: '#0A0A0A', muted: '#3D3A10', accent: '#0A0A0A', accent2: '#FF3B00', card: '#FFFFFF', line: '#0A0A0A' },
    fonts: { display: 'Anton', body: 'Space Grotesk', mono: 'IBM Plex Mono' }, display: { weight: 400, case: 'upper', tracking: 0, align: 'center', scale: 1.15 },
    background: 'stripes', grain: 0.04, vignette: false, hud: 'none', captions: 'box', transition: 'cut', card: { radius: 0, style: 'heavy' }, letterbox: false,
    music: { genre: 'trap', bpm: 140, key: 2 },
  },
  blueprint: {
    label: 'Blueprint', vibe: 'Engineering drawing: deep blue, fine grid, mono labels, iris reveals, ambient pulse. Infra, APIs, data, security.',
    theme: 'dark', palette: { bg: '#0B2545', bg2: '#13315C', ink: '#EEF4ED', muted: '#8DA9C4', accent: '#7DD3FC', accent2: '#FDE68A', card: '#0F2D52', line: '#3E6A9A' },
    fonts: { display: 'Space Grotesk', body: 'Space Grotesk', mono: 'IBM Plex Mono' }, display: { weight: 700, case: 'none', tracking: -0.035, align: 'left' },
    background: 'blueprint', grain: 0.04, vignette: true, hud: 'tech', captions: 'mono', transition: 'iris', card: { radius: 4, style: 'outline' }, letterbox: false,
    music: { genre: 'ambient', bpm: 110, key: 9 },
  },
  cinematic: {
    label: 'Cinematic', vibe: 'Letterboxed, film grain, gold serif titles, slow pushes, strings and braams. Big-vision brand films, enterprise, finance.',
    theme: 'dark', palette: { bg: '#060606', bg2: '#121010', ink: '#EFE7DA', muted: '#9C9283', accent: '#D4A24C', accent2: '#EFE7DA', card: '#14110E', line: '#3A322A' },
    fonts: { display: 'Playfair Display', body: 'DM Sans', mono: 'IBM Plex Mono' }, display: { weight: 700, case: 'none', tracking: -0.02, align: 'center', italicAccent: true },
    background: 'smoke', grain: 0.12, vignette: true, hud: 'none', captions: 'clean', transition: 'fade', card: { radius: 10, style: 'solid' }, letterbox: true,
    music: { genre: 'cinematic', bpm: 90, key: 5 },
  },
  terminal: {
    label: 'Terminal', vibe: 'Green phosphor on black, pixel type, scanlines, glitch. Developer tools, CLIs, hacker energy.',
    theme: 'dark', palette: { bg: '#030A05', bg2: '#06140A', ink: '#B9FFC9', muted: '#4FA866', accent: '#39FF6A', accent2: '#FFD84D', card: '#05140A', line: '#1E5A30' },
    fonts: { display: 'VT323', body: 'IBM Plex Mono', mono: 'VT323' }, display: { weight: 400, case: 'upper', tracking: 0.02, align: 'left', scale: 1.25 },
    background: 'scanlines', grain: 0.08, vignette: true, hud: 'tech', captions: 'mono', transition: 'glitch', card: { radius: 0, style: 'outline' }, letterbox: false,
    music: { genre: 'ambient', bpm: 128, key: 0 },
  },
  pop: {
    label: 'Pastel Pop', vibe: 'Soft pastel blobs, chunky friendly grotesk, rounded cards, bouncy iris reveals, bright plucks. Consumer, SMB, creators.',
    theme: 'light', palette: { bg: '#FFF1E8', bg2: '#FFD9E4', ink: '#2A1840', muted: '#7A6A8C', accent: '#7C3AED', accent2: '#FB7185', card: '#FFFFFF', line: '#EBD9E8' },
    fonts: { display: 'Bricolage Grotesque', body: 'DM Sans', mono: 'IBM Plex Mono' }, display: { weight: 800, case: 'none', tracking: -0.04, align: 'center' },
    background: 'blobs', grain: 0.03, vignette: false, hud: 'none', captions: 'box', transition: 'iris', card: { radius: 28, style: 'soft' }, letterbox: false,
    music: { genre: 'bright', bpm: 112, key: 2 },
  },
  magazine: {
    brandable: true, label: 'Magazine', vibe: 'Black, heavy expressive serif, giant numerals, accent wipes, lo-fi groove. Culture, media, premium storytelling.',
    theme: 'dark', palette: { bg: '#111111', bg2: '#1B1B1B', ink: '#F6F1E7', muted: '#A09A8E', accent: '#FF5A1F', accent2: '#F6F1E7', card: '#1A1A1A', line: '#333333' },
    fonts: { display: 'Fraunces', body: 'DM Sans', mono: 'IBM Plex Mono' }, display: { weight: 900, case: 'none', tracking: -0.04, align: 'left' },
    background: 'dots', grain: 0.06, vignette: true, hud: 'minimal', captions: 'clean', transition: 'wipe', card: { radius: 12, style: 'solid' }, letterbox: false,
    music: { genre: 'lofi', bpm: 84, key: 4 },
  },
  aurora: {
    brandable: true, label: 'Aurora', vibe: 'Restrained dark gradient, soft colour fields drifting behind crisp type, blur-push cuts. AI infrastructure, dev tools, premium SaaS launches.',
    theme: 'dark', palette: { bg: '#07080D', bg2: '#10121B', ink: '#F4F5F8', muted: '#9AA0B4', accent: '#8B7CFF', accent2: '#3EE6C1', card: '#151826', line: '#262A3B' },
    fonts: { display: 'Inter', body: 'Inter', mono: 'JetBrains Mono' }, display: { weight: 700, case: 'none', tracking: -0.03, align: 'center' },
    background: 'aurora', grain: 0.05, vignette: true, hud: 'minimal', captions: 'clean', transition: 'blur', card: { radius: 18, style: 'glass' }, letterbox: false,
    music: { genre: 'ambient', bpm: 120, key: 7 },
  },
  riso: {
    brandable: true, label: 'Riso', vibe: 'Two-colour risograph zine: warm paper, halftone dots, fluoro pink and riso blue slightly out of register. Indie SaaS, creative tools, communities.',
    theme: 'light', palette: { bg: '#F4EFE4', bg2: '#E9E1CF', ink: '#1C1A33', muted: '#5E5A6E', accent: '#E2337F', accent2: '#0B6FB8', card: '#FFFBF2', line: '#CFC6B2' },
    fonts: { display: 'Bricolage Grotesque', body: 'DM Sans', mono: 'Space Mono' }, display: { weight: 800, case: 'none', tracking: -0.02, align: 'left' },
    background: 'halftone', grain: 0.09, vignette: false, hud: 'minimal', captions: 'box', transition: 'misregister', card: { radius: 4, style: 'outline' }, letterbox: false,
    music: { genre: 'lofi', bpm: 92, key: 5 },
  },
  bento: {
    brandable: true, label: 'Bento', vibe: 'Keynote-style feature grid: light, rounded tiles, quiet blue, calm confidence. Multi-feature launches and "what\'s new" roundups.',
    theme: 'light', palette: { bg: '#F5F5F7', bg2: '#E8E8ED', ink: '#1D1D1F', muted: '#6E6E73', accent: '#0066CC', accent2: '#D35400', card: '#FFFFFF', line: '#D2D2D7' },
    fonts: { display: 'Geist', body: 'Geist', mono: 'JetBrains Mono' }, display: { weight: 600, case: 'none', tracking: -0.025, align: 'left' },
    background: 'bento', grain: 0, vignette: false, hud: 'minimal', captions: 'clean', transition: 'blur', card: { radius: 28, style: 'soft' }, letterbox: false,
    music: { genre: 'bright', bpm: 110, key: 0 },
  },
  cutout: {
    label: 'Cutout', vibe: 'Collage on kraft paper: torn scraps, tape, chunky caps, stop-motion jitter. Consumer apps, founder stories, playful brands.',
    theme: 'light', palette: { bg: '#EADFCB', bg2: '#DCCDB2', ink: '#1F1A14', muted: '#5C5244', accent: '#D2401E', accent2: '#2457A6', card: '#FAF6EE', line: '#B9A98C' },
    fonts: { display: 'Bowlby One', body: 'DM Sans', mono: 'IBM Plex Mono' }, display: { weight: 400, case: 'upper', tracking: 0, align: 'center', bouncy: true, scale: 0.8 },
    background: 'scraps', grain: 0.07, vignette: false, hud: 'none', captions: 'box', transition: 'stopmotion', card: { radius: 2, style: 'heavy' }, letterbox: false,
    music: { genre: 'bright', bpm: 100, key: 4 },
  },
  markup: {
    brandable: true, label: 'Markup', vibe: 'Ruled paper with hand-drawn marker circles and underlines pointing at the real UI. Feature explainers, "here is how it works".',
    theme: 'light', palette: { bg: '#FBFBF7', bg2: '#F1F0E9', ink: '#15171C', muted: '#5D6270', accent: '#2B50E8', accent2: '#E8481C', card: '#FFFFFF', line: '#D9D8CF' },
    fonts: { display: 'Inter', body: 'Inter', mono: 'IBM Plex Mono' }, display: { weight: 800, case: 'none', tracking: -0.02, align: 'left' },
    background: 'ruled', grain: 0.03, vignette: false, hud: 'minimal', captions: 'clean', transition: 'wipe', card: { radius: 10, style: 'solid' }, letterbox: false, marker: true,
    music: { genre: 'bright', bpm: 105, key: 2 },
  },
  chrome: {
    label: 'Chrome', vibe: 'Y2K liquid metal: black, chrome-sheen caps, acid-lime accent, twinkling sparkles, glitch cuts. Consumer AI, creator and music tools, Gen-Z.',
    theme: 'dark', palette: { bg: '#09090D', bg2: '#14141B', ink: '#F2F3F7', muted: '#A3A6B4', accent: '#C8FF3D', accent2: '#7CC8FF', card: '#17171F', line: '#2A2A35' },
    fonts: { display: 'Unbounded', body: 'Manrope', mono: 'Space Mono' }, display: { weight: 700, case: 'upper', tracking: 0.01, align: 'center', chrome: true, scale: 0.8 },
    background: 'sparkle', grain: 0.06, vignette: true, hud: 'tech', captions: 'karaoke', transition: 'glitch', card: { radius: 22, style: 'glass' }, letterbox: false,
    music: { genre: 'synthwave', bpm: 140, key: 9 },
  },
  ledger: {
    brandable: true, label: 'Ledger', vibe: 'Data journalism: warm newsprint, condensed headlines, mono kickers, axis lines and big counted numbers with their source. ROI, benchmarks, proof.',
    theme: 'light', palette: { bg: '#F7F4EE', bg2: '#ECE7DD', ink: '#111418', muted: '#565B63', accent: '#0B7A6B', accent2: '#C2410C', card: '#FFFFFF', line: '#D6D0C4' },
    fonts: { display: 'IBM Plex Sans Condensed', body: 'IBM Plex Sans', mono: 'IBM Plex Mono' }, display: { weight: 700, case: 'none', tracking: -0.01, align: 'left' },
    background: 'baseline', grain: 0.03, vignette: false, hud: 'minimal', captions: 'mono', transition: 'slide', card: { radius: 2, style: 'outline' }, letterbox: false,
    music: { genre: 'house', bpm: 118, key: 6 },
  },
  native: {
    brandable: true, label: 'Native', vibe: 'Feels like a post, not an ad: white, system-like type, rounded cards, a phone-in-hand sway, swipe-up cuts and pill captions. Reels, TikTok, founder-voice ads.',
    theme: 'light', palette: { bg: '#FFFFFF', bg2: '#F2F2F7', ink: '#111111', muted: '#6C6C70', accent: '#0A6CFF', accent2: '#FF2D55', card: '#FFFFFF', line: '#E5E5EA' },
    fonts: { display: 'Inter', body: 'Inter', mono: 'JetBrains Mono' }, display: { weight: 700, case: 'none', tracking: 0, align: 'left' },
    background: 'handheld', grain: 0, vignette: false, hud: 'none', captions: 'pill', transition: 'swipe', card: { radius: 24, style: 'soft' }, letterbox: false, sway: true,
    music: { genre: 'lofi', bpm: 95, key: 1 },
  },
};

const hex = (h) => /^#[0-9a-f]{6}$/i.test(String(h || ''));
export function rgb(h) { const m = String(h).replace('#', ''); const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** Merge a direction preset with overrides (from the AI or the user) into concrete tokens. */
export function resolveStyle(style = {}, brandAccent) {
  const base = DIRECTIONS[style.preset] || DIRECTIONS.signal;
  const s = {
    ...base, ...style,
    palette: { ...base.palette, ...(style.palette || {}) },
    fonts: { ...base.fonts, ...(style.fonts || {}) },
    display: { ...base.display, ...(style.display || {}) },
    card: { ...base.card, ...(style.card || {}) },
    music: { ...base.music, ...(style.music || {}) },
  };
  s.preset = DIRECTIONS[style.preset] ? style.preset : 'signal';
  // brand accent wins unless the direction is monochrome by design (or it would be unreadable)
  const brandable = style.useBrandAccent ?? base.brandable ?? false;
  const acc = (style.palette && style.palette.accent) || (brandable && brandAccent);
  if (hex(acc) && contrast(acc, s.palette.bg) >= 2.2) s.palette.accent = acc;
  for (const k of Object.keys(s.palette)) if (!hex(s.palette[k])) s.palette[k] = base.palette[k];
  for (const k of ['display', 'body', 'mono']) if (!FONTS[s.fonts[k]]) s.fonts[k] = base.fonts[k];
  s.display.weight = weightFor(s.fonts.display, s.display.weight || 700);
  s.display.weight2 = weightFor(s.fonts.display, Math.min(600, s.display.weight));
  if (!BACKGROUNDS.includes(s.background)) s.background = base.background;
  if (!TRANSITIONS.includes(s.transition)) s.transition = base.transition;
  if (!CAPTIONS.includes(s.captions)) s.captions = base.captions;
  if (!GENRES.includes(s.music.genre)) s.music.genre = base.music.genre;
  s.music.bpm = Math.max(60, Math.min(160, Number(s.music.bpm) || base.music.bpm));
  s.dark = lum(s.palette.bg) < 0.3;
  s.accentInk = contrast('#FFFFFF', s.palette.accent) >= 2.6 ? '#FFFFFF' : '#111111';
  return s;
}
