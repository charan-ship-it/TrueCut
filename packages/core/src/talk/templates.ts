// Founder-talk templates: one-click presets that bundle a layout, a look, captions, music, a length and the
// team-skill formats that fit. A template is only a starting point: Nick can still change anything after it
// is applied (the layout, the cut, the captions, individual beats), and a talk with no template is edited
// freely by Nick as he sees fit.
//
// Templates never add footage or facts. Every template works from the founder's own recording and the product's
// real sources; layouts that show a screen use real screenshots or the motion toolkit, never invented people.

export type TalkTemplate = {
  id: string; name: string; tagline: string; group: 'Show the product' | 'Tell a story' | 'Share an opinion' | 'Update & ask' | 'Clip';
  layout: 'split' | 'overlay' | 'bubble' | 'pip' | 'framed' | 'clean';
  direction: string;            // look preset in DIRECTIONS
  captions: string;             // caption style
  music: string;
  length: number;               // seconds
  skills: string[];             // builtin skill ids
  note: string;                 // what Nick is told about the cut
};

export const TALK_TEMPLATES: TalkTemplate[] = [
  { id: 'loom-walkthrough', name: 'Loom walkthrough', tagline: 'Founder in a bubble, the real product on screen', group: 'Show the product', layout: 'bubble', direction: 'markup', captions: 'highlight', music: 'lofi', length: 45, skills: ['product-walkthrough', 'benefit-led-demo'], note: 'Treat this as a screen-share walkthrough. One beat per thing the founder shows or says; use the product\'s real screenshots (image/window visuals) wherever the sources have them.' },
  { id: 'demo-pip', name: 'Demo with face-cam', tagline: 'Product fills the frame, small founder window', group: 'Show the product', layout: 'pip', direction: 'chrome', captions: 'pill', music: 'ambient', length: 45, skills: ['product-walkthrough'], note: 'Product-first. Keep the founder\'s explanations short and put the product on screen for the whole beat.' },
  { id: 'launch-day', name: 'Launch day', tagline: 'High-energy founder announcement', group: 'Show the product', layout: 'overlay', direction: 'pop', captions: 'outline', music: 'bright', length: 30, skills: ['launch-announcement', 'hook-first'], note: 'It is a launch. Open on what is new, show it by beat 2, end on what to do now.' },
  { id: 'origin-story', name: 'Origin story', tagline: 'Why we started, in the founder\'s own words', group: 'Tell a story', layout: 'overlay', direction: 'cinematic', captions: 'clean', music: 'piano', length: 45, skills: ['founder-origin-story'], note: 'Story arc: the moment, the problem, the turn, why it matters now.' },
  { id: 'customer-story', name: 'Customer insight', tagline: 'What a customer taught us', group: 'Tell a story', layout: 'split', direction: 'editorial', captions: 'clean', music: 'ambient', length: 40, skills: ['customer-insight-story'], note: 'Do not show customer names or logos unless the founder says them.' },
  { id: 'behind-scenes', name: 'Behind the scenes', tagline: 'How the work really gets done', group: 'Tell a story', layout: 'clean', direction: 'native', captions: 'highlight', music: 'lofi', length: 40, skills: ['behind-the-scenes'], note: 'Keep the founder\'s natural personality and pauses; cut only dead air.' },
  { id: 'mistake', name: 'Mistake post-mortem', tagline: 'What went wrong and what changed', group: 'Tell a story', layout: 'framed', direction: 'ledger', captions: 'clean', music: 'ambient', length: 40, skills: ['mistake-postmortem', 'founder-lesson-learned'], note: 'Open by owning the mistake. End on the changed rule.' },
  { id: 'hot-take', name: 'Hot take', tagline: 'One bold opinion, fast', group: 'Share an opinion', layout: 'clean', direction: 'brutal', captions: 'outline', music: 'none', length: 30, skills: ['founder-hot-take', 'hook-then-proof'], note: 'Lead with the boldest sentence the founder says. Short and punchy.' },
  { id: 'myth-reality', name: 'Myth vs reality', tagline: 'Correct what everyone gets wrong', group: 'Share an opinion', layout: 'split', direction: 'swiss', captions: 'highlight', music: 'ambient', length: 35, skills: ['myth-vs-reality'], note: 'Use a compare visual with the founder\'s own phrases.' },
  { id: 'three-lessons', name: 'Three lessons', tagline: 'A numbered list of what we learned', group: 'Share an opinion', layout: 'split', direction: 'bento', captions: 'pill', music: 'lofi', length: 45, skills: ['three-lessons-talk'], note: 'Use exactly the lessons the founder states, numbered on screen.' },
  { id: 'x-vs-y', name: 'X vs Y', tagline: 'Which approach wins, and when', group: 'Share an opinion', layout: 'framed', direction: 'blueprint', captions: 'clean', music: 'ambient', length: 40, skills: ['x-vs-y-comparison'], note: 'Land on the founder\'s verdict; only repeat what they say about alternatives.' },
  { id: 'vision', name: 'Vision', tagline: 'Where this is going, and why it matters', group: 'Share an opinion', layout: 'clean', direction: 'cinematic', captions: 'clean', music: 'cinematic', length: 50, skills: ['vision-manifesto'], note: 'End on the one sentence the viewer will repeat.' },
  { id: 'build-in-public', name: 'Build in public', tagline: 'What shipped, what we learned, what\'s next', group: 'Update & ask', layout: 'split', direction: 'terminal', captions: 'highlight', music: 'lofi', length: 40, skills: ['build-in-public-update'], note: 'Every number on screen is one the founder says.' },
  { id: 'investor-update', name: 'Investor update', tagline: 'Calm, specific, numbers first', group: 'Update & ask', layout: 'framed', direction: 'ledger', captions: 'clean', music: 'ambient', length: 60, skills: ['investor-update-snapshot', 'linkedin-b2b'], note: 'Headline number first. No hype words.' },
  { id: 'hiring', name: 'We\'re hiring', tagline: 'Who we need and why to join', group: 'Update & ask', layout: 'clean', direction: 'native', captions: 'pill', music: 'bright', length: 35, skills: ['hiring-pitch'], note: 'Only claim perks, funding or team size the founder states.' },
  { id: 'milestone', name: 'Milestone', tagline: 'A number worth celebrating, and a thank-you', group: 'Update & ask', layout: 'overlay', direction: 'pop', captions: 'outline', music: 'bright', length: 25, skills: ['milestone-thank-you'], note: 'Open on the stat the founder says.' },
  { id: 'podcast-clip', name: 'Podcast clip', tagline: 'One self-contained idea from a long conversation', group: 'Clip', layout: 'framed', direction: 'editorial', captions: 'highlight', music: 'none', length: 40, skills: ['podcast-to-short'], note: 'Find the single strongest self-contained idea; open on its most quotable sentence.' },
  { id: 'qa-clip', name: 'Q&A answer', tagline: 'The question on screen, then the answer', group: 'Clip', layout: 'bubble', direction: 'markup', captions: 'highlight', music: 'none', length: 40, skills: ['qa-answer'], note: 'Open with the question as a quote card, then the direct answer.' },
  { id: 'audio-note', name: 'Audio-only', tagline: 'A voice note or podcast audio as a waveform video', group: 'Clip', layout: 'clean', direction: 'neon', captions: 'highlight', music: 'none', length: 40, skills: ['podcast-to-short'], note: 'Audio only: the video is a waveform with animated captions.' },
];

export const templateById = (id: string) => TALK_TEMPLATES.find((t) => t.id === id) || null;

/** Loose name match for the chat ("use the loom template", "hot take style"). */
export function templateFrom(text: string): TalkTemplate | null {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ');
  if (!/\b(template|style|format|preset|framework)\b/.test(t) && !/\btalk template\b/.test(t)) return null;
  const alias: Record<string, string> = { loom: 'loom-walkthrough', walkthrough: 'loom-walkthrough', demo: 'demo-pip', launch: 'launch-day', origin: 'origin-story', story: 'origin-story', customer: 'customer-story', behind: 'behind-scenes', mistake: 'mistake', postmortem: 'mistake', hot: 'hot-take', myth: 'myth-reality', lessons: 'three-lessons', versus: 'x-vs-y', vision: 'vision', manifesto: 'vision', public: 'build-in-public', investor: 'investor-update', hiring: 'hiring', milestone: 'milestone', podcast: 'podcast-clip', 'q a': 'qa-clip', qa: 'qa-clip', audio: 'audio-note' };
  for (const [k, id] of Object.entries(alias)) if (new RegExp(`\\b${k}\\b`).test(t)) return templateById(id);
  return TALK_TEMPLATES.find((x) => t.includes(x.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' '))) || null;
}
