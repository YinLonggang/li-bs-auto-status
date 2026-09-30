import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attachment } from '../types';

export type AttachmentDownloadHandler = (attachment: Attachment, signal?: AbortSignal) => Promise<void>;

export function useAttachmentDownload(resourceKey: string, canDownload: boolean, onDownload?: AttachmentDownloadHandler) {
  const [downloadingId, setDownloadingId] = useState<string | number | null>(null);
  const [downloadError, setDownloadError] = useState('');
  const request = useRef<AbortController | null>(null);
  const dispose = useCallback(() => {
    request.current?.abort();
    request.current = null;
  }, []);
  const cancelDownload = useCallback(() => {
    dispose();
    setDownloadingId(null);
  }, [dispose]);
  useEffect(() => {
    cancelDownload();
    setDownloadError('');
    return dispose;
  }, [resourceKey, canDownload, cancelDownload, dispose]);

  const download = async (attachment: Attachment) => {
    if (!canDownload || !onDownload || attachment.canDownload === false) {
      setDownloadError('当前账号没有附件下载权限。');
      return;
    }
    dispose();
    const controller = new AbortController();
    request.current = controller;
    setDownloadingId(attachment.id);
    setDownloadError('');
    try {
      await onDownload(attachment, controller.signal);
    } catch (error) {
      if (controller.signal.aborted || request.current !== controller) return;
      setDownloadError(error instanceof Error ? error.message : '附件下载失败。');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setDownloadingId(null);
      }
    }
  };
  return { downloadingId, downloadError, download, cancelDownload };
}
