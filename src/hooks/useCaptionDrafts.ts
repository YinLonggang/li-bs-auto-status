import { useEffect, useState } from 'react';
import { useRelatedDraftDirty } from './useRecordEditor';

export function useCaptionDrafts(entries: Array<[string, string]>) {
  const saved = Object.fromEntries(entries);
  const savedKey = JSON.stringify(saved);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const captionDrafts = Object.fromEntries(entries.map(([key, value]) => [key, edits[key] ?? value]));
  useRelatedDraftDirty(entries.some(([key, value]) => captionDrafts[key] !== value));

  useEffect(() => {
    const currentSaved = JSON.parse(savedKey) as Record<string, string>;
    setEdits(current => {
      const next = Object.fromEntries(Object.entries(current).filter(([key, value]) =>
        key in currentSaved && value !== currentSaved[key]
      ));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [savedKey]);

  const setCaption = (key: string, value: string) => setEdits(current => ({ ...current, [key]: value }));
  const acceptCaption = (key: string, value: string) => setEdits(current => {
    if (current[key] !== value) return current;
    const next = { ...current };
    delete next[key];
    return next;
  });
  return { captionDrafts, setCaption, acceptCaption };
}
