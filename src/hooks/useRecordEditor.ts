import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';

type RegisterRelatedDraft = (key: string, dirty: boolean) => void;
export const RelatedDraftContext = createContext<RegisterRelatedDraft | null>(null);

export function useRelatedDraftDirty(dirty: boolean) {
  const register = useContext(RelatedDraftContext);
  const key = useId();
  useEffect(() => { register?.(key, dirty); }, [register, key, dirty]);
  useEffect(() => () => register?.(key, false), [register, key]);
}

const NAVIGATION_EVENT = 'auto-status-before-navigation';

export function allowEditorNavigation() {
  return window.dispatchEvent(new Event(NAVIGATION_EVENT, { cancelable: true }));
}

export function useRecordEditor<T extends { id: string | number }, D>(
  toDraft: (record: T | null) => D,
  retrieve: (id: string | number, signal?: AbortSignal) => Promise<T>,
  saving: boolean
) {
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [record, setRecord] = useState<T | null>(null);
  const [draft, setDraft] = useState<D>(() => toDraft(null));
  const [baseline, setBaseline] = useState(() => JSON.stringify(toDraft(null)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestedId, setRequestedId] = useState<string | number>();
  const requestRef = useRef<AbortController | null>(null);
  const toDraftRef = useRef(toDraft);
  toDraftRef.current = toDraft;
  const [relatedDrafts, setRelatedDrafts] = useState<Record<string, boolean>>({});
  const registerRelatedDraft = useCallback<RegisterRelatedDraft>((key, value) => {
    setRelatedDrafts(current => {
      if (!!current[key] === value) return current;
      const next = { ...current };
      if (value) next[key] = true;
      else delete next[key];
      return next;
    });
  }, []);
  const relatedDirty = open && Object.values(relatedDrafts).some(Boolean);
  const dirty = open && (JSON.stringify(draft) !== baseline || relatedDirty);
  const confirmLeave = () => !saving && (!dirty || window.confirm('有未保存的修改（含附件说明），确认放弃并离开？'));
  const guardRef = useRef(confirmLeave);
  guardRef.current = confirmLeave;

  useEffect(() => {
    const guard = (event: Event) => { if (!guardRef.current()) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty || saving) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener(NAVIGATION_EVENT, guard);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener(NAVIGATION_EVENT, guard);
      window.removeEventListener('beforeunload', unload);
    };
  }, [dirty, saving]);
  useEffect(() => () => requestRef.current?.abort(), []);

  const accept = (next: T, savedDraft?: D) => {
    setRecord(next);
    if (savedDraft !== undefined) {
      setDraft(savedDraft);
      setBaseline(JSON.stringify(savedDraft));
    }
  };
  const openRecord = async (id?: string | number) => {
    if (!confirmLeave()) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRequestedId(id);
    setSessionKey(current => current + 1);
    setRelatedDrafts({});
    setRecord(null);
    setError('');
    const empty = toDraftRef.current(null);
    setDraft(empty);
    setBaseline(JSON.stringify(empty));
    setOpen(true);
    setLoading(id !== undefined);
    if (id === undefined) return;
    try {
      const next = await retrieve(id, controller.signal);
      if (controller.signal.aborted) return;
      accept(next, toDraftRef.current(next));
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '详情加载失败。');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };
  const refresh = async (target = record) => {
    if (!target) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const next = await retrieve(target.id, controller.signal);
      if (!controller.signal.aborted) setRecord(next);
      // Refresh related assets without replacing unsaved form fields.
    } catch (err) {
      if (!controller.signal.aborted) throw err;
    }
  };
  const close = () => {
    if (!confirmLeave()) return;
    requestRef.current?.abort();
    setOpen(false);
  };
  const removed = () => {
    requestRef.current?.abort();
    setRecord(null);
    setOpen(false);
  };
  return { open, sessionKey, record, draft, setDraft, dirty, relatedDirty, registerRelatedDraft, loading, error, openRecord, retry: () => openRecord(requestedId), accept, refresh, close, removed };
}
