import type { Bookmark } from '@zhicang/shared';
import type { SiteMeta } from './enrich';
export function metadataPatch(current: Bookmark, meta: SiteMeta): Partial<Bookmark> {
  return { favicon: meta.favicon || current.favicon, image: meta.image || current.image, contentExcerpt: meta.excerpt,
    ...(!current.title || current.title === current.url ? { title: meta.title || current.title } : {}),
    ...(!current.description ? { description: meta.description } : {}),
  };
}
export function mayReplaceDescription(beforeFetch: Bookmark, beforeAi: Bookmark, latest: Bookmark, meta: SiteMeta): boolean {
  return latest.description === beforeAi.description && (!beforeFetch.description || beforeFetch.description === meta.description) && (!beforeAi.description || beforeAi.description === meta.description);
}
