import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAttachmentPreview } from '../services/bsAutoStatusApi';
import type { Attachment } from '../types';

export type AttachmentPreviewState = {
  attachment: Attachment;
  loading: boolean;
  url?: string;
  blob?: Blob;
  error?: string;
};

export function useAttachmentPreview(resourceKey: string) {
  const [preview, setPreview] = useState<AttachmentPreviewState | null>(null);
  const request = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | undefined>(undefined);
  const dispose = useCallback(() => {
    request.current?.abort();
    request.current = null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = undefined;
  }, []);
  const closePreview = useCallback(() => { dispose(); setPreview(null); }, [dispose]);
  useEffect(() => { closePreview(); return dispose; }, [resourceKey, closePreview, dispose]);

  const openPreview = async (attachment: Attachment) => {
    if (!attachment.canPreview || !attachment.previewKind) return;
    dispose();
    const controller = new AbortController();
    request.current = controller;
    setPreview({ attachment, loading: true });
    try {
      const result = await fetchAttachmentPreview(attachment.id, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      const url = attachment.previewKind === 'image' ? URL.createObjectURL(result.blob) : undefined;
      objectUrl.current = url;
      setPreview({ attachment, url, blob: result.blob, loading: false });
    } catch (error) {
      if (controller.signal.aborted || request.current !== controller) return;
      setPreview({ attachment, loading: false, error: error instanceof Error ? error.message : '附件预览加载失败。' });
    }
  };
  return { preview, openPreview, closePreview };
}
