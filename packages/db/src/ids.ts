import { customAlphabet } from 'nanoid';
/** Short, URL-safe, lowercase ids (no look-alike characters). */
export const newId = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 10);
