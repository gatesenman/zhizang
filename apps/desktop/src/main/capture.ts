import { createBookmark, getBookmark, getBookmarkByUrl, restoreBookmarks } from './db';
export function captureBookmark(input: Parameters<typeof createBookmark>[0] & { restoreTrashed?: boolean }) {
  const previous = getBookmarkByUrl(input.url, true);
  if (previous) {
    if (previous.deletedAt && input.restoreTrashed === true) {
      restoreBookmarks([previous.id]);
      return { bookmark: getBookmark(previous.id)!, duplicate: false, restored: true, trashed: false, created: false };
    }
    return { bookmark: previous, duplicate: true, trashed: !!previous.deletedAt, restored: false, created: false };
  }
  return { bookmark: createBookmark(input), duplicate: false, restored: false, trashed: false, created: true };
}
