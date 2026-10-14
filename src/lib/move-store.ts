import { type FileItem } from '@/api/types';

/** Items waiting for a destination in the move/copy picker (too rich for route params). */
export type PendingTransfer = { mode: 'move' | 'copy'; items: FileItem[] };

let pending: PendingTransfer | null = null;

export function setPendingTransfer(next: PendingTransfer | null) {
  pending = next;
}

export function getPendingTransfer(): PendingTransfer | null {
  return pending;
}
