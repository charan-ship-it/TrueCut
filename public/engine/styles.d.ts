export const FONTS: Record<string, { files: any[]; kind: string }>;
export const DIRECTIONS: Record<string, any>;
export const BACKGROUNDS: string[]; export const TRANSITIONS: string[]; export const CAPTIONS: string[]; export const GENRES: string[];
export function resolveStyle(style?: any, brandAccent?: string): any;
export function fontFaceCss(base: string): string;
export function weightFor(fam: string, want: number): number;
export function rgb(h: string): [number, number, number];
export function contrast(a: string, b: string): number;
