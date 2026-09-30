const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/avif']);

export function attachmentPreviewKind(contentType = ''): 'image' | 'pdf' | null {
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (IMAGE_TYPES.has(type)) return 'image';
  return type === 'application/pdf' ? 'pdf' : null;
}

const signatureType = (bytes: Uint8Array) => {
  const starts = (...prefix: number[]) => prefix.every((value, index) => bytes[index] === value);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 24 && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52)) return 'png';
  if (bytes.length >= 4 && starts(0xff, 0xd8, 0xff)) return 'jpeg';
  if (bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'gif';
  if (bytes.length >= 16 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(ascii(12, 16))) return 'webp';
  if (bytes.length >= 26 && ascii(0, 2) === 'BM') return 'bmp';
  if (bytes.length >= 16 && ascii(4, 8) === 'ftyp') {
    const brands = [ascii(8, 12)];
    for (let offset = 16; offset < Math.min(bytes.length, 64); offset += 4) brands.push(ascii(offset, offset + 4));
    if (brands.some(brand => ['avif', 'avis'].includes(brand))) return 'avif';
  }
  if (/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(ascii(0, 9))) return 'pdf';
  if (starts(0x50, 0x4b, 3, 4) || starts(0x50, 0x4b, 5, 6) || starts(0x50, 0x4b, 7, 8)) return 'zip';
  if (starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return 'ole';
  if (starts(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return '7z';
  if (starts(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07)) return 'rar';
  if (starts(0x1f, 0x8b)) return 'gzip';
  return null;
};

const MIME_SIGNATURES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/bmp': 'bmp', 'image/avif': 'avif', 'application/pdf': 'pdf',
  'application/zip': 'zip', 'application/x-zip-compressed': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'zip',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'zip',
  'application/msword': 'ole', 'application/vnd.ms-excel': 'ole', 'application/vnd.ms-powerpoint': 'ole',
  'application/x-7z-compressed': '7z', 'application/vnd.rar': 'rar', 'application/x-rar-compressed': 'rar',
  'application/gzip': 'gzip', 'application/x-gzip': 'gzip'
};
const EXTENSION_SIGNATURES: Record<string, string> = {
  png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', webp: 'webp', bmp: 'bmp', avif: 'avif', pdf: 'pdf',
  zip: 'zip', docx: 'zip', xlsx: 'zip', pptx: 'zip', doc: 'ole', xls: 'ole', ppt: 'ole',
  '7z': '7z', rar: 'rar', gz: 'gzip'
};

export async function validateBinaryContent(blob: Blob, fileName = '', preview = false): Promise<void> {
  const type = blob.type.split(';')[0].trim().toLowerCase();
  const bytes = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
  const text = new TextDecoder().decode(bytes).replace(/^﻿/, '').trimStart();
  const html = /^(?:<!--[^]*?-->\s*)*(?:<!doctype\s+html|<html\b|<head\b|<body\b|<script\b)/i.test(text);
  const json = /^(?:\{\s*(?:\}|"(?:[^"\\]|\\.)*"\s*:)|\[\s*(?:\]|\{|\[|"|-?\d|true\b|false\b|null\b))/.test(text);
  if (/html|json/.test(type) || html || json) {
    throw new Error('文件接口返回了 HTML/JSON 内容，已阻止作为附件打开。请检查登录状态或联系管理员。');
  }
  const signature = signatureType(bytes);
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const expected = [MIME_SIGNATURES[type], EXTENSION_SIGNATURES[extension]].filter(Boolean);
  if (expected.some(value => signature !== value)) {
    throw new Error('附件内容与文件类型不一致，已阻止打开。');
  }
  if (preview && (!attachmentPreviewKind(type) || !MIME_SIGNATURES[type] || signature !== MIME_SIGNATURES[type])) {
    throw new Error('此附件不支持安全在线预览，请使用受控下载。');
  }
}
