'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, uploadFiles } from './api';
import { toComposition, layoutOf } from '@truecut/shared/compose';
import { layout } from '@truecut/engine/timeline.js';
import type { Project } from '@truecut/shared/types';

export type Tab = 'sources' | 'facts' | 'brief' | 'story' | 'voice' | 'render';
export type Ctx = {
  p: Project; issues: { sceneId: string; level: 'error' | 'warn'; message: string }[]; jobs: any[];
  save: (patch: Partial<Project>, opts?: { now?: boolean }) => void;
  act: (path: string, body?: any) => Promise<any>;
  reload: () => Promise<void>;
  busy: (kind: string) => boolean;
  seek: (t: number) => void;
  lay: ReturnType<typeof layout>;
  go: (tab: Tab) => void;
};

/** Loads a project, keeps it fresh while Nick or a job is working, and batches edits into PATCHes. */
export function useProject(id: string) {
  const [data, setData] = useState<{ project: Project; issues: any[]; jobs: any[] } | null>(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const pending = useRef<Partial<Project>>({});
  const timer = useRef<any>(null);

  const reload = useCallback(async () => {
    try { const d = await api(`/api/projects/${id}`); if (Object.keys(pending.current).length) d.project = { ...d.project, ...pending.current }; setData(d); }
    catch (e: any) { setErr(e.message); }
  }, [id]);
  useEffect(() => { reload(); }, [reload]);

  const running = !!data && (data.project.agentBusy || data.jobs.some((j) => j.status === 'running' || j.status === 'queued'));
  useEffect(() => { const t = setInterval(reload, running ? 900 : 6000); return () => clearInterval(t); }, [running, reload]);

  const flush = useCallback(async () => {
    const patch = pending.current; pending.current = {};
    if (!Object.keys(patch).length) return;
    try { const d = await api(`/api/projects/${id}`, { method: 'PATCH', json: patch }); if (Object.keys(pending.current).length) d.project = { ...d.project, ...pending.current }; setData(d); } catch (e: any) { setToast(e.message); }
  }, [id]);
  const save = useCallback((patch: Partial<Project>, opts: { now?: boolean } = {}) => {
    pending.current = { ...pending.current, ...patch };
    setData((d) => (d ? { ...d, project: { ...d.project, ...patch } as Project } : d));
    clearTimeout(timer.current); timer.current = setTimeout(flush, opts.now ? 0 : 600);
  }, [flush]);
  const act = useCallback(async (path: string, body?: any) => {
    await flush();
    try { const r = await api(`/api/projects/${id}/${path}`, { json: body || {} }); await reload(); return r; }
    catch (e: any) { setToast(e.message); throw e; }
  }, [id, flush, reload]);
  const send = useCallback(async (action: any, files?: File[]) => {
    await flush();
    try {
      if (files?.length) { const atts = await uploadFiles(id, files); action = { ...action, attachments: [...(action.attachments || []), ...atts] }; }
      await api(`/api/projects/${id}/chat`, { json: { action } });
      await reload();
    } catch (e: any) { setToast(e.message); }
  }, [id, flush, reload]);

  const comp = useMemo(() => (data ? toComposition(data.project) : null), [data]);
  const lay = useMemo(() => (comp ? (layoutOf(comp as any) as ReturnType<typeof layout>) : null), [comp]);
  return { data, err, toast, setToast, reload, save, act, send, lay, comp, running };
}
