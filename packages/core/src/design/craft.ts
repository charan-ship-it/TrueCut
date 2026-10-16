// Design-first: Nick works like a designer, not a template picker.
//  1. DESIGN_PROCESS: understand the requirement and find the picture BEFORE choosing any building block.
//  2. DESIGN_CRAFT: the craft rules a senior motion designer applies (composition, type, colour, motion).
//  3. EXEMPLARS: two worked freehand drawings, so "bespoke" starts from a high bar.
//  4. critiqueDrawings(): Nick looks at stills of his own freehand drawings and repairs what a critic would flag.
// Sources for the craft guide: Anthropic frontend-design skill (design-lead stance, avoid generic output), LottieFiles motion-design skill
// (purpose first, motion personalities, durations, easing, choreography limits), Disney's 12 principles as adapted for UI, Material Design 3 easing.
// The review loop follows the vision-critic pattern of ReLook / ArtifactsBench: render at several times, score on a rubric, revise,
// and accept a revision only if it beats the previous score.
// Team references live in skills (Settings → Skills): a skill that applies to "Storyboard" / "Founder talks"
// is injected next to all of this, so pasted style notes shape the taste without a code change.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ROOT, config } from '@truecut/config';
import { resolveStyle, fontFaceCss } from '@truecut/engine/styles.js';
import { sanitizeMarkup, markupText } from '@truecut/engine/talk.js';
import { launchBrowser } from '../render/browser';
import { callTool } from '../system/claude';
import { slog, timed } from '../system/log';

export const DESIGN_PROCESS = `
HOW YOU DESIGN (do this for every moment, in this order, before you pick anything from a library)
1. Understand the need. Who is watching, what must they believe or do afterwards, what is the ONE idea of this moment, and what did the person actually ask for? Their words outrank every default and every template.
2. Find the picture. Ask: with the sound off, what image or motion makes this idea obvious in under two seconds? A metaphor, a diagram, a before/after, a thing being built, traced, split, counted or connected. Write that picture in one plain sentence ("idea"), specific to THIS company and THIS line, never generic.
3. Then decide how to build it. If a library block draws exactly that picture, use the block. If it only roughly fits, draw the picture yourself (freehand). Freehand is the default for the hook, the central explanation and the payoff; library blocks suit the literal jobs they were made for (a real screenshot, a real number, a spoken quote, the end card). Never choose a block because it exists, and never bend an idea to fit one.
4. Review it like a critic: one focal point, readable on a phone, motion that tells the story, nothing that could be mistaken for a template everyone has seen.
`;

export const DESIGN_CRAFT = `
CRAFT GUIDE (distilled from published practice: Anthropic's frontend-design skill, the LottieFiles motion-design skill, Disney's principles of animation as adapted for UI, and Material Design 3 motion)
PURPOSE AND POINT OF VIEW
- Decide what the motion is FOR before choosing values: guide attention, express the brand, or choreograph several elements into one story. Every moving thing must earn its place.
- Act as a design lead with a point of view, not a template filler. Let the subject's own world (its industry, materials, vocabulary, the person's words) drive the visuals; make deliberate, opinionated choices. Open each scene with the most characteristic element of the subject.
- Avoid the defaults that make work look machine-made: a big number with a small label and a gradient accent unless it truly is the best option, predictable component patterns, stock gradients on everything, a different style every scene, and clichés (light bulbs, rockets, floating gears, bar charts with invented data).
COMPOSITION AND TYPE
- One idea and one focal point per scene, at most ~7 elements. The focal element is 2-3× its neighbours and the only thing in the accent colour; the rest is ink, muted or line. Squint test: it must still read.
- Type carries personality: one family, or two clearly distinct; a clear scale with intentional weights; short, sentence-case, huge. At 1080 wide, labels are at least 30px (26px in a 900-wide drawing) and headlines 90px+; at most two sizes per drawing; 70px margins; lines under ~25 characters.
- Use a real grid, align edges, leave generous empty space, and prefer asymmetry and overlap to a centred stack of boxes when the idea allows. Group related things; separate unrelated things with space, not borders.
- Colour comes from the theme variables only (never hard-coded hexes) so the piece follows the company's brand. Roles: background, ink, one accent, one muted.
MOTION (pick ONE personality for the whole video from the brand's feel, then keep it)
- Playful: 150-300ms, ease-out-back, 10-20% overshoot. Premium: 350-600ms, cubic-bezier(.4,0,.2,1), no overshoot. Corporate: 200-400ms, cubic-bezier(.2,0,0,1), 0-3% overshoot. Energetic: 100-250ms, ease-out-expo, 15-30% overshoot. In video nobody is waiting on an interface, so use the upper half of the range, and dramatic reveals may run 600-1200ms.
- One signature easing for about 80% of the animation. Entrances decelerate (ease-out), exits accelerate (ease-in), things moving across the screen ease-in-out; never linear for spatial motion. Entrances run 30-50% longer than exits.
- Three layers: primary (the main action), secondary (supporting detail such as a shadow, label or icon that follows) and ambient (a slow background drift). Add anticipation (a small dip before a move) and follow-through (a settle) to the key move only.
- Choreography: stagger 50-100ms (dramatic 100-200ms), total stagger under ~500ms per group; with three or more elements never move more than a third at once; use the fewest properties (one is direct, two is polished, three or more is busy); never fade alone for something important, pair it with position or scale; nothing travels more than a third of the frame without an intermediate keyframe.
- Motion tells cause and effect: draw a line to show connection (stroke-dashoffset), grow a thing to show importance, split to show division, converge to show combination. Build in the order the voice says it, land everything by ~70% of the scene, then HOLD still so it can be read.
TRUTH
- Numbers, names and claims drawn must come from the approved facts or the speaker's words. Shapes may be generic; labels may not.
`;
export const DESIGN_PLAYBOOK = `
FORMAT, HOOK AND PACING PLAYBOOK (from published template catalogues and ad-hook research: Hera's video templates, Segwise's hook study, B2W's explainer guide)
1. Pick the format first, then everything else follows. Social ad 6-20s; app or UI demo 12-30s (phone mockups, callouts); product launch 20-45s; SaaS explainer 30-60s (problem, then solution, then outcome); animated infographic 15-40s (the data is the hero, one number per beat); data report 30-75s; sales follow-up 20-45s (recap, objection, proof, next step); onboarding 30-75s (one step per beat); event promo 10-30s (speaker, date, countdown, call to action). Say which you chose in the brief.
2. Open with ONE hook, chosen on purpose: mistake callout (name the error the viewer makes), pain-point callout, surprising fact or number, mystery (hold back one detail), mini story (setup, conflict, resolution in three quick beats), quick demo (the result in the first seconds), head-to-head, price shock, bold claim, or a pattern interrupt (an unexpected visual change). A hook is one idea in two to three seconds; a viewer decides within about 1.7 seconds. Use a hook only if the sources support it; a claim you cannot source is not a hook.
3. Show the payoff early, then spend the middle proving it. If the video drags, it drags between seconds 5 and 15: give that stretch a new picture every beat, never the same layout twice in a row.
4. Design for sound off. The whole point must read from the picture and the on-screen words alone: bold type, one idea per frame, captions that never cover the focal point.
5. Scene kinds worth drawing (pick the one that explains the line): problem-to-solution contrast (the frustration, then the relief); a screencast or UI with callouts that point at the real thing; a metaphor scene (a simple object standing for the idea, such as a gate, a funnel or a scale); a data or diagram scene that changes as the line is spoken (the numbers or nodes appear on the words that name them); a labelled product or process view; kinetic typography on the one phrase that matters.
6. Story spine: problem, solution, outcome, always from the viewer's benefit. Pair every visual with the line being spoken; add credibility with real data, a real screenshot or a real quote, never with decoration.
7. Reusable overlay pieces, drawn in the brand's own language, not copied from a pack: lower thirds, quote cards, callouts, chapter markers and metric labels.
8. Before you finish a drawing, score it yourself on the rubric the reviewer will use: focus, legibility, motion, story, brand, each 1 to 10, and redraw anything below 8 before you hand it in.
`;


/** Two worked freehand drawings: the bar for "bespoke". The first for 1080-square ad scenes, the second for 900×700 talk beats. */
export const EXEMPLARS = `
WORKED EXAMPLES of freehand drawings (study the craft, do not copy the subject):
Example A, ad scene, voice: "Every claim traces back to its source." Idea: a claim on the left is pulled by a drawn line to the exact line of the source document on the right, which highlights.
<svg viewBox='0 0 1080 1080'><style>
@keyframes rise{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:none}}
@keyframes draw{from{stroke-dashoffset:520}to{stroke-dashoffset:0}}
@keyframes lit{from{opacity:0}to{opacity:1}}
.r{animation:rise .6s cubic-bezier(.2,.8,.2,1) both}.d{stroke-dasharray:520;animation:draw .8s cubic-bezier(.4,0,.2,1) both}.l{animation:lit .4s ease-out both}
text{font-family:var(--fb);fill:var(--cr)}</style>
<g class='r' style='animation-delay:.1s'><rect x='80' y='420' width='330' height='170' rx='26' fill='var(--card)' stroke='var(--ln)' stroke-width='3'/><text x='120' y='520' font-size='46' font-weight='700'>The claim</text></g>
<path class='d' d='M410 505 C 560 505 560 640 690 640' fill='none' stroke='var(--a)' stroke-width='7' stroke-linecap='round' style='animation-delay:.7s'/>
<g class='r' style='animation-delay:.3s'><rect x='690' y='300' width='320' height='460' rx='26' fill='var(--card)' stroke='var(--ln)' stroke-width='3'/>
<rect x='722' y='350' width='220' height='14' rx='7' fill='var(--ln)'/><rect x='722' y='390' width='256' height='14' rx='7' fill='var(--ln)'/><rect x='722' y='430' width='190' height='14' rx='7' fill='var(--ln)'/>
<rect class='l' x='712' y='606' width='276' height='64' rx='14' fill='var(--a)' opacity='.18' style='animation-delay:1.4s'/><rect x='722' y='628' width='240' height='14' rx='7' fill='var(--a)' class='l' style='animation-delay:1.4s'/></g>
<text class='r' x='540' y='900' font-size='52' font-weight='700' text-anchor='middle' style='animation-delay:1.6s'>Source on every frame</text></svg>
Example B, talk beat, speaker: "everything we knew lived in three people's heads". Idea: three people with a glowing thought each, then the thoughts drain into a single shared page.
<svg viewBox='0 0 900 700'><style>
@keyframes pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
@keyframes flow{from{transform:translate(0,0);opacity:1}to{transform:translate(var(--dx),230px);opacity:0}}
@keyframes page{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
g.p{transform-box:fill-box;transform-origin:center;animation:pop .5s cubic-bezier(.2,1.3,.4,1) both}.f{animation:flow .9s ease-in both}.pg{animation:page .6s ease-out both}</style>
<g class='p' style='animation-delay:.1s'><circle cx='170' cy='200' r='56' fill='var(--card)' stroke='var(--ink)' stroke-width='5'/><circle cx='170' cy='200' r='16' fill='var(--a)'/></g>
<g class='p' style='animation-delay:.25s'><circle cx='450' cy='200' r='56' fill='var(--card)' stroke='var(--ink)' stroke-width='5'/><circle cx='450' cy='200' r='16' fill='var(--a)'/></g>
<g class='p' style='animation-delay:.4s'><circle cx='730' cy='200' r='56' fill='var(--card)' stroke='var(--ink)' stroke-width='5'/><circle cx='730' cy='200' r='16' fill='var(--a)'/></g>
<circle class='f' cx='170' cy='270' r='12' fill='var(--a)' style='--dx:280px;animation-delay:1.1s'/><circle class='f' cx='450' cy='270' r='12' fill='var(--a)' style='--dx:0px;animation-delay:1.25s'/><circle class='f' cx='730' cy='270' r='12' fill='var(--a)' style='--dx:-280px;animation-delay:1.4s'/>
<g class='pg' style='animation-delay:1.9s'><rect x='300' y='470' width='300' height='170' rx='20' fill='var(--card)' stroke='var(--ln)' stroke-width='4'/><rect x='336' y='510' width='160' height='14' rx='7' fill='var(--a)'/><rect x='336' y='548' width='228' height='14' rx='7' fill='var(--ln)'/><rect x='336' y='586' width='190' height='14' rx='7' fill='var(--ln)'/></g></svg>
`;

// ───────────────────────── look at your own drawing ─────────────────────────
type Draw = { id: string; html: string; w: number; h: number; says: string; idea?: string };

function serveEngine() {
  const root = path.join(ROOT, 'packages', 'engine', 'src');
  const srv = http.createServer((req, res) => {
    const f = path.resolve(root, decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, ''));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  return new Promise<{ base: string; close: () => void }>((r) => srv.listen(0, '127.0.0.1', () => r({ base: `http://127.0.0.1:${(srv.address() as any).port}`, close: () => srv.close() })));
}

type Session = { base: string; browser: Awaited<ReturnType<typeof launchBrowser>>; close: () => Promise<void> };
/** One engine server and one browser, shared by every drawing in a review (launching Chromium per drawing was most of the time). */
async function openSession(): Promise<Session> {
  const srv = await serveEngine(); const browser = await launchBrowser();
  return { base: srv.base, browser, close: async () => { await browser.close().catch(() => {}); srv.close(); } };
}

async function stillsWith(sess: Session, style: any, accent: string | undefined, it: Draw, times: number[]): Promise<Buffer[]> {
  const S = resolveStyle(style || {}, accent); const P = S.palette;
  const page = await sess.browser.newPage({ viewport: { width: it.w, height: it.h } });
  try {
    const html = sanitizeMarkup(it.html);
    await page.setContent(`<!doctype html><style>${fontFaceCss(sess.base + '/fonts/')}
html,body{margin:0;width:${it.w}px;height:${it.h}px;overflow:hidden}
body{--a:${P.accent};--a2:${P.accent2};--cr:${P.ink};--ink:${P.ink};--mu:${P.muted};--bg:${P.bg};--bg2:${P.bg2};--card:${P.card};--ln:${P.line};--ai:${S.accentInk};--fb:'${S.fonts.body}',sans-serif;--fd:'${S.fonts.display}',serif;--fm:'${S.fonts.mono}',monospace;background:var(--bg);color:var(--cr);font-family:var(--fb)}
svg{position:absolute;left:0;top:0;width:100%;height:100%}</style><div id=b style="position:absolute;inset:0">${html}</div>`);
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    const out: Buffer[] = [];
    for (const t of times) {
      await page.evaluate((t) => { document.getAnimations().forEach((a) => { a.pause(); try { a.currentTime = t * 1000; } catch {} }); }, t);
      out.push(await page.screenshot({ type: 'jpeg', quality: 80 }));
    }
    return out;
  } finally { await page.close().catch(() => {}); }
}

/** Stills of freehand drawings at t seconds (animations paused there), themed like the project. */
export async function drawingStills(style: any, accent: string | undefined, items: Draw[], times: number[]): Promise<Record<string, Buffer[]>> {
  const sess = await openSession(); const out: Record<string, Buffer[]> = {};
  try { for (const it of items) out[it.id] = await stillsWith(sess, style, accent, it, times); } finally { await sess.close(); }
  return out;
}

const RUBRIC = ['focus', 'legibility', 'motion', 'story', 'brand'] as const;
const JUDGE_TOOL = {
  name: 'record_review', description: 'Score the drawing on the rubric from the stills, list concrete problems, and (when asked) give the repaired drawing.',
  input_schema: { type: 'object', required: ['scores', 'problems'], properties: {
    scores: { type: 'object', required: [...RUBRIC], description: 'integers 1-10. focus = one clear focal point and hierarchy; legibility = type size, contrast, nothing clipped or overlapping; motion = builds in the order spoken, lands, then holds; story = the final frame shows the idea of the line; brand = uses theme colours and one consistent shape language, not generic', properties: Object.fromEntries(RUBRIC.map((k) => [k, { type: 'integer' }])) },
    problems: { type: 'array', items: { type: 'string' }, description: 'concrete problems seen in the stills (overlap, clipped or tiny text, weak focal point, empty or crowded areas, end state not showing the idea, off-brand colours)' },
    html: { type: 'string', description: 'only when asked to repair: the full repaired SVG/HTML under the same rules' },
  } },
};
const total = (sc: any) => RUBRIC.reduce((a, k) => a + Math.max(1, Math.min(10, Number(sc?.[k]) || 1)), 0) / RUBRIC.length;
const TIMES = [0.7, 1.7, 3.4];

async function judge(sess: Session, style: any, accent: string | undefined, brandText: string, it: Draw, html: string, repair: boolean) {
  const stills = await stillsWith(sess, style, accent, { ...it, html }, TIMES);
  // an empty or blank render counts as failed (zero), like ReLook's format constraint
  if (stills.length < TIMES.length || stills.every((b) => b.length < 2500)) return { score: 0, problems: ['the drawing did not render'], html: undefined as string | undefined };
  const content: any[] = [{ type: 'text', text: `What is said at this moment: "${it.says}"\nThe idea it should show: ${it.idea || '(not stated)'}\nStills at ${TIMES.join('s, ')}s (the last is the held end frame):` }];
  stills.forEach((b) => content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b.toString('base64') } }));
  content.push({ type: 'text', text: `Its markup:\n${html}\n\n${repair ? 'Score it, then repair every problem you list and return the full repaired drawing in html.' : 'Score it strictly. Do not return html.'}` });
  const out = await callTool<any>({
    model: config.creativeModel, maxTokens: repair ? 6000 : 1200, operation: 'design_review', what: 'Reviewing a drawing',
    system: `You are a strict senior motion-design critic scoring a freehand drawing from rendered stills. Judge only what you see. 8 means you would ship it.\n${DESIGN_CRAFT}\nA repaired drawing keeps the same meaning and real labels and obeys the same rules: viewBox ${it.w}×${it.h}, theme variables only, CSS keyframes, no scripts or external resources, under ~6000 characters.${brandText}`,
    tool: JUDGE_TOOL, content,
  });
  return { score: total(out?.scores), problems: (out?.problems || []) as string[], html: typeof out?.html === 'string' ? sanitizeMarkup(out.html) : undefined };
}

const REPAIR_BELOW = 6; // a drawing at or above this is left alone even if it is short of SHIP: one repair round is only worth it for clear misses
const PARALLEL = 4;

/** Render each drawing at three moments and score it on the rubric. Drawings are scored together (one shared browser, up to PARALLEL at a time); only those that score below REPAIR_BELOW get a repair, and a repair is accepted only if its own render scores strictly higher (ReLook-style). A repair may not add words, so the fact guard sees the same labels. Never throws: a failed review keeps the original. */
export async function critiqueDrawings(style: any, accent: string | undefined, brandText: string, items: Draw[], log: (m: string) => void = () => {}): Promise<Record<string, string>> {
  const fixed: Record<string, string> = {};
  if (!config.anthropicKey || !items.length) return fixed;
  const t0 = Date.now(); let sess: Session | null = null;
  try {
    sess = await timed('design', 'browser.open', { drawings: items.length }, openSession);
    const S = sess;
    const review = async (it: Draw) => {
      const t = Date.now();
      try {
        const first = await timed('design', 'score', { id: it.id }, () => judge(S, style, accent, brandText, it, it.html, false));
        if (first.score >= REPAIR_BELOW) { slog('design', 'kept', { id: it.id, score: +first.score.toFixed(1), ms: Date.now() - t }); return; }
        // a repair needs the critic's markup: ask once for problems + a redraw, then render and score the redraw
        const rep = await timed('design', 'repair', { id: it.id, from: +first.score.toFixed(1) }, () => judge(S, style, accent, brandText, it, it.html, true));
        const cand = rep.html;
        if (!cand || !/<(svg|div)/i.test(cand) || markupText(cand).length > markupText(it.html).length + 80) { slog('design', 'repair.rejected', { id: it.id, why: !cand ? 'no markup' : 'added words or invalid' }); return; }
        const next = await timed('design', 'rescore', { id: it.id }, () => judge(S, style, accent, brandText, it, cand, false));
        if (next.score > first.score) {
          fixed[it.id] = cand;
          slog('design', 'repair.accepted', { id: it.id, from: +first.score.toFixed(1), to: +next.score.toFixed(1), ms: Date.now() - t });
          log(`Redrew a scene after review (${first.score.toFixed(1)} → ${next.score.toFixed(1)}): ${(first.problems || []).slice(0, 2).join('; ')}`);
        } else slog('design', 'repair.rejected', { id: it.id, why: 'not better', from: +first.score.toFixed(1), to: +next.score.toFixed(1) });
      } catch (e: any) { slog('design', 'review.failed', { id: it.id, error: e?.message || String(e) }); log('Drawing review skipped: ' + (e?.message || e)); }
    };
    const queue = [...items];
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => { for (let it = queue.shift(); it; it = queue.shift()) await review(it); }));
    slog('design', 'critique.done', { drawings: items.length, repaired: Object.keys(fixed).length, ms: Date.now() - t0 });
  } catch (e: any) { slog('design', 'critique.failed', { error: e?.message || String(e), ms: Date.now() - t0 }); }
  finally { await sess?.close(); }
  return fixed;
}
