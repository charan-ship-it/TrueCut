export interface GrabUser { email?: string; name?: string; userId?: string }

interface GrabQueue { q: unknown[][]; identify: (...args: unknown[]) => void; reset?: () => void }
declare global { interface Window { Grab?: GrabQueue } }

export function grabScriptUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_GRAB_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.NEXT_PUBLIC_GRAB_KEY || "").trim();
  if (!base || !key) return null; // both halves or nothing
  return `${base}/widget.js?key=${encodeURIComponent(key)}`;
}

// Grab's queue shim: calls made before the async script loads are replayed on load.
function ensureQueue(): GrabQueue | null {
  if (typeof window === "undefined") return null;
  if (!window.Grab) {
    window.Grab = { q: [], identify(...args: unknown[]) { this.q.push(["identify", ...args]); } };
  }
  return window.Grab;
}

export function identifyGrabUser(user: GrabUser): void {
  if (!(user.email || user.userId)) return;
  ensureQueue()?.identify(user);
}

export function resetGrab(): void {
  if (typeof window === "undefined") return;
  const grab = window.Grab;
  if (grab && typeof grab.reset === "function") { grab.reset(); return; }
  ensureQueue()?.q.push(["reset"]);
}
