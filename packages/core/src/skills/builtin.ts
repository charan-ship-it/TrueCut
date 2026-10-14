// TrueCut's pre-built skills: proven ad and founder-content formats, written as skills a team can add in one
// click (Settings → Skills → Skill library) and then edit like their own. Added skills are copied into the
// workspace, so a later change here never silently rewrites what a team already tuned.
//
// They are formats, not facts: each one only shapes structure, wording and pacing, and every one must work
// inside the storyboard rules (real facts only, problem before product, ~2 words per second, end card last).
// Formats that need real footage (AI actors, product-in-hand b-roll) are written for what TrueCut renders
// today: motion graphics over the product's real screens, or the founder's own recording.

export type BuiltinSkill = { id: string; group: 'ads' | 'founder' | 'platform'; name: string; description: string; stages: string[]; body: string };

export const BUILTIN_GROUPS: Record<BuiltinSkill['group'], string> = {
  ads: 'Ad formats',
  founder: 'Founder talks',
  platform: 'Platforms',
};

const ADS = ['angles', 'storyboard'];
const TALK = ['talk'];

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  // ───────── ad formats ─────────
  {
    id: 'hook-first', group: 'ads', name: 'hook-first', stages: ADS,
    description: 'Use for any short paid social ad (15-30s) where the first two seconds decide whether anyone watches.',
    body: `# Hook first

The first spoken line and the first frame carry the ad.

- Line 1 names a specific problem or payoff the viewer has this week, in at most 7 words. No product name, no greeting, no "Introducing".
- Show something moving in frame 1: a kinetic or headline scene, or the strongest real number as a stat scene if the facts have one.
- Keep the promise early: by roughly second 4-10 the viewer must see the thing the hook promised (the product screen, the result, the "how").
- Prefer one of these hook shapes, whichever the facts support: a sharp question ("Still copying notes by hand?"), a contrast ("Pilots everywhere. Nothing in production."), a real number ("457 ideas, zero lost."), or a call-out of the audience ("Team leads, this one's for you.").
- Never open with a claim the facts can't back.`,
  },
  {
    id: 'problem-agitate-solve', group: 'ads', name: 'problem-agitate-solve', stages: ADS,
    description: 'Use when the product removes a clear, felt pain (wasted time, errors, cost) and the audience already knows the pain.',
    body: `# Problem → agitate → solve

Structure the ad in four movements:

1. **Problem** (1 scene): name the pain in the viewer's words.
2. **Agitate** (1-2 scenes): show what the pain costs: time, money, missed deals, stress. Use a real number from the facts if there is one; otherwise make it concrete with words, never with an invented figure.
3. **Solve** (2-4 scenes): reveal the product once, then show how it fixes exactly that pain using real screens (screen, card, document scenes).
4. **Close** (end card): one clear call to action.

Keep the agitate part short. One sharp line beats three gloomy ones.`,
  },
  {
    id: 'before-after', group: 'ads', name: 'before-after', stages: ADS,
    description: 'Use when the change the product makes is easy to show side by side: an old manual way versus the new way.',
    body: `# Before / after

- Build the middle of the ad around a compare scene: "Before" vs "With <product>", 3 short items each side, every item true per the facts.
- Before the compare: one hook line on the old way. After it: show the "after" for real on a screen or card scene, so it isn't just a claim.
- Spoken lines mirror each other ("Hours of edits." → "Drafted in minutes.") only when the facts support the "after" wording.
- Keep the "before" honest and recognisable. Don't exaggerate the old way.`,
  },
  {
    id: 'benefit-led-demo', group: 'ads', name: 'benefit-led-demo', stages: ADS,
    description: 'Use for product-led software ads where the product itself is the proof: show it working instead of describing it.',
    body: `# Benefit-led demo

- Open on the benefit, not the feature ("Every call becomes a brief.").
- Then 2-4 scenes that each show ONE real moment of the product: a screen zoom, a record, a document. One action per scene, narrated in plain words.
- Name features only as verbs the viewer does ("drop in a call", "pick an idea"), never as a feature list.
- End with one call to action that matches the demo ("Try it on your next call.").
- If there are no usable product screens in the visuals, say so in the brief and lean on cards and kinetic type instead of pretending.`,
  },
  {
    id: 'launch-announcement', group: 'ads', name: 'launch-announcement', stages: ADS,
    description: 'Use for a new product, a new feature or big news: the ad should feel like an announcement, high energy and dated "now".',
    body: `# Launch / announcement

- Open like news: a kinetic or headline scene with "New:", "Now live:" or "Today:" only if the facts say it is new or launching.
- Reveal the product or feature by scene 2, earlier than a normal ad: people came for the news.
- Show the one thing that is new on a real screen, then at most 2 quick proofs.
- End card: what to do now (try it, join the waitlist, read the post), matching the brief's call to action.
- Faster cuts and punchier lines than usual; no slow build-up.`,
  },
  {
    id: 'three-reasons', group: 'ads', name: 'three-reasons', stages: ADS,
    description: 'Use when there are several distinct, equally strong benefits and a numbered list will hold attention better than a story.',
    body: `# Three reasons (listicle)

- Hook: "3 reasons <audience> switch to <product>" or "3 things <product> does that <alternative> can't", only if the facts back each reason.
- One scene per reason, numbered on screen (list scene, or a card/screen scene with the number as kicker). Each reason gets one real artefact or fact.
- Order them weakest to strongest, so the best reason lands last, right before the end card.
- Exactly three. If the facts only support two strong reasons, make it two.`,
  },
  {
    id: 'objection-flip', group: 'ads', name: 'objection-flip', stages: ADS,
    description: 'Use for considered B2B purchases where buyers hesitate (too expensive, too hard to set up, we already have a tool) and the facts answer the doubt.',
    body: `# Objection flip

- Open by saying the objection out loud, the way a buyer would ("Another AI tool we'll never roll out?").
- Answer it with evidence from the facts: a real number, a real step, a real screen. The answer must be something the sources actually say.
- Then show the product in use for 1-2 scenes so the answer is visible, not just claimed.
- Close on a low-risk call to action (a demo, a trial, a short call).
- Never put words in a real competitor's or customer's mouth.`,
  },
  {
    id: 'creator-style-voice', group: 'ads', name: 'creator-style-voice', stages: ADS,
    description: 'Use for Reels/TikTok/Shorts ads that should sound like a creator talking to their phone (UGC style) instead of a polished narrator.',
    body: `# Creator-style voice (UGC feel)

Write the narration like one person talking to camera:

- First person and casual: "Okay, so I've been using…", "Here's the thing nobody tells you about…". Contractions, short sentences, one idea per line.
- Hook with a reaction or a confession, then "here's why" and show the product.
- On screen: the product's real screens with pill or outline captions, quick cuts, the Native direction if no other look was asked for.
- This is a voice style, not a testimonial: never claim the narrator is a real customer, never invent a person, a review or results. A real customer quote may be used only when it is in the facts and the brief allows it.`,
  },
  // ───────── founder talks ─────────
  {
    id: 'founder-origin-story', group: 'founder', name: 'founder-origin-story', stages: TALK,
    description: 'Use when a founder talks about why they started the company, the moment they saw the problem, or their own journey.',
    body: `# Founder origin story

Cut the talk into a story arc, keeping only the founder's real words:

1. **The moment** – open on the most specific, personal line (a place, a date, a frustration), even if it comes mid-talk.
2. **The problem** – what they saw that others didn't.
3. **The turn** – what they decided or built.
4. **Why it matters now** – the line that connects the story to the viewer.

Prefer concrete sentences over abstract mission talk. Drop the background and the thank-yous. Illustrations: people, places and before/after moments; keep them warm and simple.`,
  },
  {
    id: 'founder-hot-take', group: 'founder', name: 'founder-hot-take', stages: TALK,
    description: 'Use when the founder states a contrarian opinion or pushes back on common wisdom in their industry.',
    body: `# Founder hot take

- Open on the boldest version of the take, the exact sentence where the founder disagrees with the common view. It must be their words.
- Then keep the reason (1-2 beats) and one piece of evidence they give (an example, a number they say).
- End on the implication or the line that invites a reply. Short is better: a hot take works best at 20-40 seconds.
- Headlines name the claim in 1-3 words ("Pilots aren't progress"). Never sharpen a take into something the founder didn't say.`,
  },
  {
    id: 'founder-lesson-learned', group: 'founder', name: 'founder-lesson-learned', stages: TALK,
    description: 'Use when the founder explains a decision, a mistake or a lesson (pricing, hiring, product, fundraising).',
    body: `# Lesson learned

Arc: **what we believed → what happened → what we do now → the lesson**.

- Open on the mistake or the surprise; that is the hook ("We got pricing completely wrong.").
- Keep exactly one example or number the founder gives as proof.
- End on the lesson as one sentence the viewer can steal.
- Cut hedging and side stories. Illustrations: a simple before/after, a meter, a short list of what changed.`,
  },
  {
    id: 'build-in-public-update', group: 'founder', name: 'build-in-public-update', stages: TALK,
    description: 'Use for progress updates: what shipped, what is next, milestones, metrics shared openly, investor or team updates.',
    body: `# Build-in-public update

- Open on the headline result or milestone, said with the exact number the founder gives.
- Then: what shipped (1-2 beats), what they learned (1 beat), what's next (1 beat).
- Every number on screen must be one the founder says in the recording.
- Keep it under 45 seconds. Illustrations: counters, bars, a simple roadmap or checklist; label everything plainly.`,
  },
  {
    id: 'customer-insight-story', group: 'founder', name: 'customer-insight-story', stages: TALK,
    description: 'Use when the founder retells something a customer said or did that changed how they think about the product.',
    body: `# Customer insight story

Arc: **what the customer said → why it surprised us → what we changed → what it means for you**.

- Open on the customer's problem as the founder retells it.
- Do not show a customer's name, face or logo unless the founder says it and the brief confirms permission; otherwise say "a customer".
- The ending connects the insight to the viewer's own situation.`,
  },
  {
    id: 'podcast-to-short', group: 'founder', name: 'podcast-to-short', stages: TALK,
    description: 'Use when the source is a long podcast, interview or webinar and the goal is one stand-alone short clip.',
    body: `# Podcast / interview → short

- Find the single strongest self-contained idea; the short must make sense with no context.
- Open on its most quotable sentence, even if it comes after the setup; then add only the setup needed to understand it.
- Remove the host's questions unless one is needed as a cold open ("So why did it fail?").
- 30-45 seconds, one idea. If there are two great ideas, pick one; the other can be its own short.
- End on a complete thought, never mid-sentence.`,
  },
  {
    id: 'product-walkthrough', group: 'founder', name: 'product-walkthrough', stages: TALK,
    description: 'Use when the founder talks through their own product on screen, Loom-style, and the video should show the real product while they explain it.',
    body: `# Product walkthrough (Loom-style)

- The founder is the narrator; the product is the star. Prefer the bubble layout: the product's real screens fill the frame, the founder sits in a corner bubble.
- One beat per thing they show or say ("here's where you drop the call", "this is the brief it writes"). Illustrate each beat with the product's real screen (an image or window visual from the sources), never an invented UI.
- Open on what the viewer gets, in the founder's words. End on what to do next, only if they say it.
- Keep it tight: 30-60 seconds. Cut every "so", "um", "as you can see".`,
  },
  {
    id: 'myth-vs-reality', group: 'founder', name: 'myth-vs-reality', stages: TALK,
    description: 'Use when the founder corrects a common misunderstanding about their industry, product or category.',
    body: `# Myth vs reality

- Open on the myth, in the founder's words ("People think X").
- Then the turn: "but actually" and the reality, with the one proof they give (a number, an example).
- Visual: a compare scene (Myth / Reality) with items that are the founder's own phrases.
- End on what to do differently. Never turn a mild opinion into an absolute claim they didn't make.`,
  },
  {
    id: 'three-lessons-talk', group: 'founder', name: 'three-lessons-talk', stages: TALK,
    description: 'Use when the founder lists several lessons, tips or rules, and a numbered short will land better than a story.',
    body: `# Three lessons (numbered talk)

- Exactly the number of lessons the founder actually states (3 is ideal; keep at most 5).
- One beat per lesson, numbered on screen with a list or card visual whose titles are 2-4 words from their sentence.
- Open on the promise ("Three things I'd tell every first-time founder"), end on the strongest lesson.
- Keep each lesson to one sentence plus at most one example from the recording.`,
  },
  {
    id: 'what-nobody-tells-you', group: 'founder', name: 'what-nobody-tells-you', stages: TALK,
    description: 'Use for an insider-truth talk: something the founder learned the hard way that outsiders don\'t see.',
    body: `# What nobody tells you

- Hook: the insider truth as the first line, said by the founder (not paraphrased into clickbait).
- Then 1-2 beats of the real story behind it, one concrete detail each.
- Close with what they would do instead. 25-45 seconds.
- Headlines are plain statements, not teasers ("Hiring slow is a feature").`,
  },
  {
    id: 'investor-update-snapshot', group: 'founder', name: 'investor-update-snapshot', stages: TALK,
    description: 'Use for an investor, board or team update spoken to camera: traction, what shipped, what is next, what help is needed.',
    body: `# Investor / team update snapshot

Order: **headline number → what changed → what's next → the ask** (only if the founder makes one).

- Every number on screen is a number the founder says; label its unit and period exactly as they do.
- No hype adjectives the founder didn't use. Calm and specific beats excited.
- Visuals: stat, bars, a short checklist for next steps. 45-75 seconds.`,
  },
  {
    id: 'hiring-pitch', group: 'founder', name: 'hiring-pitch', stages: TALK,
    description: 'Use when the founder is recruiting: why join, what the team is building, who they want.',
    body: `# Hiring pitch

- Open on who they are looking for, in the founder's words ("We need an engineer who...").
- Then the mission in one sentence, the reason it's a good time to join, and what the person would own.
- Only claim perks, funding, team size or salary the founder states.
- End on how to apply, if said. Warm and direct; the clean layout works well.`,
  },
  {
    id: 'qa-answer', group: 'founder', name: 'qa-answer', stages: TALK,
    description: 'Use when the source answers a question (an AMA, a customer question, an interview prompt) and the short should open on that question.',
    body: `# Q&A answer

- Open with the question on screen as a quote card, worded as the asker or host said it (tightened but not changed in meaning).
- The founder's answer follows: lead with their direct answer sentence, then one reason, then one example.
- 30-45 seconds. Drop the host's lead-in and any "great question".`,
  },
  {
    id: 'behind-the-scenes', group: 'founder', name: 'behind-the-scenes', stages: TALK,
    description: 'Use for day-in-the-life, how-we-work or how-it-is-made talks that show the real process.',
    body: `# Behind the scenes

- Open on the most surprising real detail of how the work is done.
- Walk through 3-4 steps in order, one beat each, in the founder's words; a flow or checklist visual shows the steps.
- Personal and unpolished beats polished: keep natural pauses that show personality, cut dead air.
- No invented behind-the-scenes footage; use the founder's own recording and the product's real screens.`,
  },
  {
    id: 'vision-manifesto', group: 'founder', name: 'vision-manifesto', stages: TALK,
    description: 'Use when the founder states where the company or industry is heading and why it matters: the big-picture talk.',
    body: `# Vision / manifesto

- Build up to one sentence the viewer can repeat; make it the last line.
- Beats: where things are now → what's broken or changing → what we believe → what that makes possible.
- Big quote visuals of the founder's own lines; slow, confident pacing; 40-60 seconds.
- Never state market sizes, predictions with dates or growth numbers the founder didn't say.`,
  },
  {
    id: 'mistake-postmortem', group: 'founder', name: 'mistake-postmortem', stages: TALK,
    description: 'Use when the founder owns up to a failure or something that went wrong and what changed afterward.',
    body: `# Mistake post-mortem

Arc: **what we did → what went wrong → what it cost (only if they say) → what we do now**.

- Own it in the first sentence, in the founder's words, no softening.
- Keep one specific detail of the failure. End on the changed rule or habit.
- Tone: honest and calm, no jokes at the customer's expense. 30-50 seconds.`,
  },
  {
    id: 'x-vs-y-comparison', group: 'founder', name: 'x-vs-y-comparison', stages: TALK,
    description: 'Use when the founder compares two approaches, tools or ways of working and says which one wins and why.',
    body: `# X vs Y

- Open on the choice ("Build or buy?", "Hire or automate?").
- A compare visual with the founder's own criteria; 3 items each side at most, each something they actually said.
- Land on their verdict in one line, and when the other side wins.
- Never name or disparage a competitor unless the founder does, and then only repeat what they said.`,
  },
  {
    id: 'milestone-thank-you', group: 'founder', name: 'milestone-thank-you', stages: TALK,
    description: 'Use for a milestone or thank-you moment: first customers, a launch, a funding or anniversary note.',
    body: `# Milestone / thank-you

- Open on the milestone as a stat (the exact figure the founder says).
- Then who helped and what comes next, in their words; keep gratitude specific (names only if the founder says them).
- Warm, short (20-40 seconds), end on one forward-looking line.`,
  },
  {
    id: 'hook-then-proof', group: 'founder', name: 'hook-then-proof', stages: TALK,
    description: 'Use when the talk makes a strong claim and the recording contains the evidence: lead with the claim, then prove it.',
    body: `# Hook then proof

- First line: the boldest claim the founder makes, verbatim, even if it was said mid-talk.
- Next beats: the proof, as the founder gives it (a number, a story, a demo), one piece per beat.
- Last line: what it means for the viewer. If the recording has no proof for the claim, pick a different opening instead of keeping an unsupported claim.`,
  },
  // ───────── platforms ─────────
  {
    id: 'linkedin-b2b', group: 'platform', name: 'linkedin-b2b', stages: ['angles', 'storyboard', 'chat', 'talk'],
    description: 'Use for LinkedIn videos aimed at business buyers, team leads, managers or executives.',
    body: `# LinkedIn B2B

- Most viewers watch muted: every key line must also be readable on screen; captions on (clean or highlight).
- Tone: credible, specific, calm. No hype words ("revolutionary", "game-changing", "seamless"), no exclamation marks.
- Lead with the business outcome (time, risk, revenue, focus) before the feature.
- Prefer 4:5 for the feed; 30-45 seconds is the sweet spot for ads, up to 60s for founder talks.
- Call to action fits a B2B buyer: "Book a demo", "See it on your data", "Read the case study", per the brief.`,
  },
  {
    id: 'reels-tiktok-native', group: 'platform', name: 'reels-tiktok-native', stages: ['angles', 'storyboard', 'chat', 'talk'],
    description: 'Use for Instagram Reels, TikTok and YouTube Shorts, where the ad has to feel like a native post, not an ad.',
    body: `# Reels / TikTok / Shorts native

- 9:16, 15-30 seconds. Something must change on screen every 1-2 seconds.
- Hook in the first second with motion and a line that sounds like a person, not a brand.
- Big, bold captions (outline, pill or highlight); keep text away from the right edge and the bottom, where the app's buttons sit.
- The Native direction is the default look unless the brief asks for another.
- Soft call to action at the end ("Link in bio", "Try it free"), per the brief.`,
  },
];

export const builtinById = (id: string) => BUILTIN_SKILLS.find((s) => s.id === id) || null;
