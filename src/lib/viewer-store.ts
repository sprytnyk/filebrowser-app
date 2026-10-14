import { type FileItem } from '@/api/types';

/** Items the viewer can page through (siblings of the opened file), set before navigating. */
let gallery: FileItem[] = [];

export function setViewerItems(items: FileItem[]) {
  gallery = items;
}

export function getViewerItems(): FileItem[] {
  return gallery;
}
