'use client';
import { DIRECTIONS } from '@/public/engine/styles.js';
import { Swatch } from '@/components/cards';
export default function Directions() {
  return (
    <div className="home"><div className="section" style={{ paddingTop: 40 }}>
      <div className="sectionhd" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <h1 className="serif" style={{ fontSize: 44, fontWeight: 400 }}>Directions</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 620 }}>The raw material Nick directs with. Each one is a full visual and sonic identity: palette, type, background, transitions, captions and its own score. Nick chooses one per angle, or you can name one in the chat.</p>
      </div>
      <div className="vgrid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))' }}>
        {Object.entries(DIRECTIONS).map(([k, d]: any, i) => (
          <div key={k} className="vcard" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="frame" style={{ display: 'flex' }}><Swatch preset={k} big={44} style={{ flex: 1, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} /></div>
            <div><div className="row between"><span className="t">{d.label}</span><span className="tc xs">{d.music.genre} · {d.music.bpm} bpm</span></div><div className="s" style={{ marginTop: 3, lineHeight: 1.45 }}>{d.vibe}</div>
              <div className="row xs dim" style={{ marginTop: 6, gap: 6 }}>{d.fonts.display} · {d.background} · {d.transition} cuts</div></div>
          </div>
        ))}
      </div>
    </div></div>
  );
}
