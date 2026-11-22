// 本地嵌入模型加载器（渲染层）
// transformers.js 在运行时从 CDN 动态加载（ESM + WASM），不打进安装包；
// 首次使用在线下载模型与 wasm，浏览器缓存后即可离线复用——即「在线安装、之后本地」。
// 计算出的向量通过 IPC 回传主进程存入 SQLite。

const CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

type ProgressCb = (p: { stage: string; loaded?: number; total?: number; ratio?: number }) => void;

let transformersPromise: Promise<any> | null = null;
let extractor: any = null;
let loadedModel = '';

async function loadTransformers(): Promise<any> {
  if (!transformersPromise) {
    // 动态 import 远程 ESM（CSP 已放行 cdn.jsdelivr.net）
    transformersPromise = import(/* @vite-ignore */ `${CDN}/dist/transformers.min.js`).then((mod: any) => {
      const env = mod.env;
      // 不用本地内置模型；wasm 也走 CDN，避免打包体积
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.wasmPaths = `${CDN}/dist/`;
      }
      return mod;
    });
  }
  return transformersPromise;
}

// 加载（首次会下载）指定模型，带下载进度
export async function ensureModel(model: string, onProgress?: ProgressCb): Promise<void> {
  if (extractor && loadedModel === model) return;
  const mod = await loadTransformers();
  onProgress?.({ stage: 'download' });
  extractor = await mod.pipeline('feature-extraction', model, {
    quantized: true,
    progress_callback: (p: any) => {
      if (p?.status === 'progress') {
        onProgress?.({ stage: 'download', loaded: p.loaded, total: p.total, ratio: p.progress });
      } else if (p?.status) {
        onProgress?.({ stage: p.status });
      }
    },
  });
  loadedModel = model;
}

export function isModelLoaded(model: string): boolean {
  return !!extractor && loadedModel === model;
}

// 批量编码为向量（mean pooling + L2 normalize），分小批避免卡顿
export async function embedTexts(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<number[][]> {
  if (!extractor) throw new Error('本地模型未加载');
  const out: number[][] = [];
  const batch = 16;
  for (let i = 0; i < texts.length; i += batch) {
    const slice = texts.slice(i, i + batch);
    const res = await extractor(slice, { pooling: 'mean', normalize: true });
    const dims = res.dims as number[];
    const data = res.data as Float32Array;
    const dim = dims[dims.length - 1];
    for (let r = 0; r < slice.length; r++) {
      out.push(Array.from(data.slice(r * dim, r * dim + dim)));
    }
    onProgress?.(Math.min(i + batch, texts.length), texts.length);
    // 让出主线程，保持 UI 响应
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}
