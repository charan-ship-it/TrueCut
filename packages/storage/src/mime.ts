import path from 'node:path';
const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.srt': 'text/plain; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
};
export const mimeOf = (file: string) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
/** Large binary media is served by a signed link to the bucket; small text/json goes through the app. */
export const isMediaFile = (file: string) => /^(image|video|audio)\//.test(mimeOf(file)) && !file.endsWith('.svg');
