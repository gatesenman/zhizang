// 知识图谱 + 语义检索引擎（主进程）
// 三种向量来源：
//  - lexical：本地 TF-IDF（中文按字符 bigram + 拉丁词），零依赖、离线、随时可用
//  - api：调用 OpenAI 兼容 /embeddings（联网 + Key）
//  - local：transformers.js 在渲染层算好后回传向量（见 graph:storeVectors）
// 本模块负责：文本构造、TF-IDF、余弦相似、Top-K 近邻、图数据组装。
import type {
  GraphData,
  GraphLink,
  GraphNode,
  GraphOptions,
  LlmConfig,
  SemanticHit,
} from '@zhicang/shared';
import {
  getAllEmbeddings,
  listBookmarksForGraph,
  listCategories,
} from './db';
import { netFetch } from './net-fetch';

export interface GraphDoc {
  id: number;
  title: string;
  description: string;
  url: string;
  contentExcerpt: string | null;
  categoryId: number | null;
  favorite: boolean;
  tags: string[];
}

// 构造用于嵌入/检索的文本：标题权重更高（重复一次）+ 描述 + 标签 + 摘要 + 域名
export function docText(d: {
  title: string;
  description: string;
  url: string;
  contentExcerpt?: string | null;
  tags?: string[];
}): string {
  let host = '';
  try {
    host = new URL(d.url).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }
  return [
    d.title,
    d.title,
    d.description,
    (d.tags ?? []).join(' '),
    d.contentExcerpt ?? '',
    host,
  ]
    .filter(Boolean)
    .join('\n');
}

// 分词：拉丁词（>=2）+ CJK 字符 unigram & bigram
export function tokenize(text: string): string[] {
  const lower = (text || '').toLowerCase();
  const tokens: string[] = [];
  const latin = lower.match(/[a-z0-9]{2,}/g);
  if (latin) tokens.push(...latin);
  const cjk = lower.match(/[\u4e00-\u9fff]/g);
  if (cjk) {
    for (let i = 0; i < cjk.length; i++) {
      tokens.push(cjk[i]);
      if (i + 1 < cjk.length) tokens.push(cjk[i] + cjk[i + 1]);
    }
  }
  return tokens;
}

type SparseVec = Map<string, number>;

// 基于一组文档构建 TF-IDF，返回每篇文档的 L2 归一化稀疏向量 + 用于查询的编码器
export class TfIdf {
  private idf = new Map<string, number>();
  private n = 0;

  fit(docs: string[]): void {
    this.n = docs.length;
    const df = new Map<string, number>();
    for (const doc of docs) {
      const seen = new Set(tokenize(doc));
      for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
    }
    for (const [t, d] of df) this.idf.set(t, Math.log(1 + this.n / d));
  }

  encode(text: string): SparseVec {
    const tf = new Map<string, number>();
    for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vec: SparseVec = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const idf = this.idf.get(t);
      if (!idf) continue;
      const w = (1 + Math.log(c)) * idf;
      vec.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of vec) vec.set(t, w / norm);
    return vec;
  }
}

export function cosineSparse(a: SparseVec, b: SparseVec): number {
  // 两个均已 L2 归一化 → 点积即余弦
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) {
    const w2 = large.get(t);
    if (w2) dot += w * w2;
  }
  return dot;
}

export function cosineDense(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ---------- API 嵌入（OpenAI 兼容 /embeddings） ----------
export async function apiEmbed(texts: string[], cfg: LlmConfig, model: string): Promise<Float32Array[]> {
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await netFetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ model: model || 'text-embedding-3-small', input: texts }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`嵌入接口返回 ${res.status}: ${t.slice(0, 200)}`);
  }
  const json: any = await res.json();
  return (json.data as any[]).map((d) => Float32Array.from(d.embedding as number[]));
}

// ---------- 图数据组装 ----------
const CAT_COLORS = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6'];

function semanticEdges(
  docs: GraphDoc[],
  k: number,
  threshold: number,
): GraphLink[] {
  if (docs.length < 2) return [];
  const dense = getAllEmbeddings();
  const denseById = new Map(dense.map((e) => [e.id, e.vec]));
  const useDense = docs.every((d) => denseById.has(d.id)) && dense.length > 0;

  // 计算相似度函数
  let sim: (i: number, j: number) => number;
  // TF-IDF 余弦量纲与稠密向量不同（通常偏低），兜底时用更低阈值
  let effThreshold = threshold;
  if (useDense) {
    const vecs = docs.map((d) => denseById.get(d.id)!);
    sim = (i, j) => cosineDense(vecs[i], vecs[j]);
  } else {
    const tfidf = new TfIdf();
    const texts = docs.map((d) => docText(d));
    tfidf.fit(texts);
    const vecs = texts.map((t) => tfidf.encode(t));
    sim = (i, j) => cosineSparse(vecs[i], vecs[j]);
    effThreshold = Math.min(threshold, 0.12);
  }

  // 为避免超大图卡顿，语义建边上限
  const N = docs.length;
  const cap = 1200;
  const limit = Math.min(N, cap);

  const seen = new Set<string>();
  const links: GraphLink[] = [];
  for (let i = 0; i < limit; i++) {
    const scores: { j: number; s: number }[] = [];
    for (let j = 0; j < limit; j++) {
      if (i === j) continue;
      const s = sim(i, j);
      if (s >= effThreshold) scores.push({ j, s });
    }
    scores.sort((a, b) => b.s - a.s);
    for (const { j, s } of scores.slice(0, k)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        source: `b:${docs[i].id}`,
        target: `b:${docs[j].id}`,
        kind: 'semantic',
        weight: Number(s.toFixed(3)),
      });
    }
  }
  return links;
}

export function buildGraph(opts: GraphOptions): GraphData {
  const docs = listBookmarksForGraph() as GraphDoc[];
  const cats = listCategories();
  const catColor = new Map<number, string>();
  cats.forEach((c, idx) => catColor.set(c.id, c.color || CAT_COLORS[idx % CAT_COLORS.length]));

  const nodes: GraphNode[] = docs.map((d) => ({
    id: `b:${d.id}`,
    kind: 'bookmark',
    label: d.title || d.url,
    refId: d.id,
    categoryId: d.categoryId,
    favorite: d.favorite,
    val: 1 + (d.favorite ? 2 : 0),
    color: d.categoryId != null ? catColor.get(d.categoryId) : '#94a3b8',
  }));

  const links: GraphLink[] = [];

  // 枢纽节点（分类 / 标签）
  if (opts.hubs) {
    const usedCats = new Set(docs.map((d) => d.categoryId).filter((x): x is number => x != null));
    for (const c of cats) {
      if (!usedCats.has(c.id)) continue;
      nodes.push({
        id: `c:${c.id}`,
        kind: 'category',
        label: c.name,
        refId: c.id,
        val: 4,
        color: catColor.get(c.id),
      });
    }
    if (opts.tag) {
      const tagSet = new Set<string>();
      docs.forEach((d) => d.tags.forEach((t) => tagSet.add(t)));
      for (const t of tagSet) {
        nodes.push({ id: `t:${t}`, kind: 'tag', label: `#${t}`, val: 2.5, color: '#f59e0b' });
      }
    }
  }

  // 同分类边：连到分类枢纽（有枢纽）或同分类两两（无枢纽时跳过，避免爆边）
  if (opts.category) {
    for (const d of docs) {
      if (d.categoryId == null) continue;
      if (opts.hubs) {
        links.push({ source: `b:${d.id}`, target: `c:${d.categoryId}`, kind: 'category', weight: 1 });
      }
    }
  }

  // 标签边：连到标签枢纽（有枢纽）
  if (opts.tag && opts.hubs) {
    for (const d of docs) {
      for (const t of d.tags) {
        links.push({ source: `b:${d.id}`, target: `t:${t}`, kind: 'tag', weight: 1 });
      }
    }
  }

  // 语义近邻边
  if (opts.semantic) {
    links.push(...semanticEdges(docs, opts.semanticK || 3, opts.semanticThreshold ?? 0.55));
  }

  // 去掉指向不存在节点的边（理论上不会发生）
  const ids = new Set(nodes.map((n) => n.id));
  const safeLinks = links.filter((l) => ids.has(l.source) && ids.has(l.target));
  return { nodes, links: safeLinks };
}

// ---------- 语义检索 ----------
// 用 TF-IDF 在当前文档集合内检索（lexical）
export function lexicalSearch(query: string, k: number): SemanticHit[] {
  const docs = listBookmarksForGraph() as GraphDoc[];
  if (!docs.length) return [];
  const texts = docs.map((d) => docText(d));
  const tfidf = new TfIdf();
  tfidf.fit(texts);
  const qv = tfidf.encode(query);
  const hits = docs.map((d, i) => ({ id: d.id, score: cosineSparse(qv, tfidf.encode(texts[i])) }));
  return hits
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// 用稠密查询向量在已存向量内检索（api / local 共用）
export function denseSearch(queryVec: Float32Array, k: number): SemanticHit[] {
  const all = getAllEmbeddings();
  if (!all.length) return [];
  const hits = all.map((e) => ({ id: e.id, score: cosineDense(queryVec, e.vec) }));
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}
