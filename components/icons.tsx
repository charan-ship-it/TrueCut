// Inline icon set (1.6px strokes) — no icon dependency.
const P = (d: string | JSX.Element, s = 16) => (props: { size?: number; style?: any }) => (
  <svg width={props.size || s} height={props.size || s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={props.style}>{typeof d === 'string' ? <path d={d} /> : d}</svg>
);
export const I = {
  plus: P('M12 5v14M5 12h14'),
  search: P(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  home: P(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>),
  film: P(<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" /></>),
  palette: P(<><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.3-.9-.5-1.2-.3-.4-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.4-9-7.4Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7" r="1" /><circle cx="15.5" cy="7.5" r="1" /></>),
  side: P(<><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></>),
  clip: P('m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7L10.2 17a1.7 1.7 0 0 1-2.4-2.4L15.5 7'),
  arrowUp: P('M12 19V5M5 12l7-7 7 7'),
  arrowR: P('M5 12h14M13 6l6 6-6 6'),
  play: P(<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />),
  pause: P(<><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /></>),
  link: P(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L12 6.3" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  folder: P('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'),
  file: P(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /></>),
  note: P(<><path d="M4 5h16M4 10h16M4 15h10" /></>),
  check: P('M5 12.5 10 17.5 19 7'),
  x: P('M6 6l12 12M18 6 6 18'),
  sliders: P(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>),
  clock: P(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  frame: P(<><rect x="5" y="3" width="14" height="18" rx="2.5" /></>),
  wand: P(<><path d="m15 4 1 2.5L18.5 7.5 16 8.5 15 11l-1-2.5L11.5 7.5 14 6.5zM4 20l9-9" /></>),
  star: P('m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z'),
  sun: P(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  moon: P('M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z'),
  download: P('M12 4v12M6 11l6 6 6-6M5 20h14'),
  edit: P('M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z'),
  trash: P('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'),
  dots: P(<><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></>),
  spark: P('M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6'),
};
export function NickMark({ size = 28 }: { size?: number }) { return <span className="mark" style={{ width: size, height: size }}><i /></span>; }
