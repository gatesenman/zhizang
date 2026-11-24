export interface NoteRecord { id: number; notes: string; url?: string }
export const noteDraftKey = (b: NoteRecord): string => 'zc-note-draft-v1:' + b.id + ':' + encodeURIComponent(b.url ?? '');
export interface NoteState { text: string; status: 'saved' | 'pending' | 'saving' | 'error' | 'conflict'; error: string; durable: boolean }
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Options {
  bookmark: NoteRecord;
  storage: Storage;
  save: (id: number, notes: string, expectedNotes: string) => Promise<{ bookmark: NoteRecord; conflict: boolean }>;
  onSaved?: (bookmark: NoteRecord) => void;
  delay?: number;
}
// Kept independent of React so real SQLite integration can exercise every transition.
export class NoteDraft {
  private base: string;
  private server: string;
  private state: NoteState;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private key: string;
  constructor(private options: Options) {
    this.key = noteDraftKey(options.bookmark);
    this.base = this.server = options.bookmark.notes || '';
    this.state = { text: this.base, status: 'saved', error: '', durable: true };
    try {
      const raw = options.storage.getItem(this.key);
      const old = raw ? JSON.parse(raw) : null;
      if (old && typeof old.text === 'string' && typeof old.base === 'string' && old.text !== this.base) {
        this.base = old.base;
        this.state = { text: old.text, status: this.server === old.base ? 'pending' : 'conflict', error: '', durable: true };
      }
    } catch { this.state.durable = false; this.state.error = '本机草稿读取失败，请先复制重要笔记'; }
  }
  snapshot = (): NoteState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private emit(patch: Partial<NoteState>): void { this.state = { ...this.state, ...patch }; this.listeners.forEach((fn) => fn()); }
  private persist(): void {
    try {
      if (this.state.text === this.base && !this.running) this.options.storage.removeItem(this.key);
      else this.options.storage.setItem(this.key, JSON.stringify({ text: this.state.text, base: this.base }));
      this.emit({ durable: true });
    } catch { this.emit({ durable: false, error: '本机草稿保存失败，请立即保存到数据库或复制笔记' }); }
  }
  edit = (text: string): void => {
    this.emit({ text, status: this.state.status === 'conflict' ? 'conflict' : 'pending', error: '' }); this.persist();
    clearTimeout(this.timer);
    if (this.state.status !== 'conflict') this.timer = setTimeout(() => { void this.flush(); }, this.options.delay ?? 700);
  };
  observe(notes: string): void {
    this.server = notes || '';
    if (this.state.status === 'saved') { this.base = this.server; this.emit({ text: this.server }); }
    // Active requests use atomic CAS in SQLite; never overwrite the local draft here.
  }
  flush = (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    if (this.state.status === 'conflict') return Promise.resolve();
    if (this.state.text === this.base) { this.emit({ status: 'saved', error: '' }); this.persist(); return Promise.resolve(); }
    const work = async (): Promise<void> => {
      while (this.state.text !== this.base && this.state.status !== 'conflict') {
        const sent = this.state.text;
        this.emit({ status: 'saving', error: '' });
        try {
          const result = await this.options.save(this.options.bookmark.id, sent, this.base);
          this.server = result.bookmark.notes || '';
          if (result.conflict) { this.emit({ status: 'conflict', error: '笔记已在其他编辑器或恢复操作中变化，请选择要保留的版本' }); return; }
          this.base = this.server; this.options.onSaved?.(result.bookmark); this.persist();
          this.emit({ status: this.state.text === this.base ? 'saved' : 'pending' });
        } catch (e) { this.emit({ status: 'error', error: String((e as Error).message ?? e) }); this.persist(); return; }
      }
    };
    this.running = work().finally(() => { this.running = null; this.persist(); }); return this.running;
  };
  useSaved = (): void => { this.base = this.server; this.emit({ text: this.server, status: 'saved', error: '' }); this.persist(); };
  keepDraft = (): void => { this.base = this.server; this.emit({ status: 'pending', error: '' }); this.persist(); void this.flush(); };
  detach = (): void => { clearTimeout(this.timer); void this.flush(); };
}
