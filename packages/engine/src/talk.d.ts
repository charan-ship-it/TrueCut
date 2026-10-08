export const TALK_LAYOUTS: string[];
export const PANEL: Record<string, number>;
export const TOOLKIT_KINDS: string[];
export const TOOLKIT_ICONS: string[];
export function speakerBox(format: string, lay?: string): { x: number; y: number; w: number; h: number };
export function talkLayout(comp: any): { duration: number; beats: any[]; cues: any[]; captions: any[] };
export function talkTimeline(comp: any): any;
export function mount(root: any, comp: any, opts?: any): any;
