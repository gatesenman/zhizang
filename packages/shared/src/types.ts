// 共享领域类型定义（桌面端 / 后端 / 门户通用）

export type AiState = 'pending' | 'processing' | 'done' | 'failed' | 'skipped';
export type BookmarkStatus = 'active' | 'dead' | 'archived';
export type ReadState = 'unread' | 'read';

export interface Category {
  id: number;
  parentId: number | null;
  name: string;
  icon?: string | null;
  color?: string | null;
  sort: number;
  isSystem: boolean;
  createdAt: number;
}

export interface Tag {
  id: number;
  name: string;
  color?: string | null;
  isActive: boolean;
}

export interface Bookmark {
  id: number;
  url: string;
  urlHash: string;
  title: string;
  description: string;
  favicon?: string | null;
  image?: string | null;
  categoryId: number | null;
  contentExcerpt?: string | null;
  status: BookmarkStatus;
  aiState: AiState;
  tags: string[];
  favorite: boolean;
  pinned: boolean;
  readState: ReadState;
  notes: string;
  visitCount: number;
  hasSnapshot: boolean;
  snapshotAt?: number | null;
  httpStatus?: number | null;
  lastCheckAt?: number | null;
  sortIndex: number;
  deletedAt?: number | null;
  visitedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export type BookmarkSort =
  | 'created_desc'
  | 'created_asc'
  | 'title_asc'
  | 'visited_desc'
  | 'visit_count_desc'
  | 'manual';

export interface BookmarkQuery {
  ids?: number[];
  uncategorized?: boolean;
  keyword?: string;
  categoryId?: number | null;
  tag?: string;
  tags?: string[];
  domain?: string;
  status?: BookmarkStatus;
  favorite?: boolean;
  readState?: ReadState;
  pinned?: boolean;
  trashed?: boolean;
  createdFrom?: number;
  createdTo?: number;
  recentDays?: number;
  hasAi?: boolean;
  sort?: BookmarkSort;
  limit?: number;
  offset?: number;
}

// 智能文件夹：按规则自动匹配收藏（不存实体关系，查询时动态过滤）
export interface SmartFolderRule {
  keyword?: string;
  tags?: string[];
  domain?: string;
  categoryId?: number | null;
  favorite?: boolean;
  readState?: ReadState;
  status?: BookmarkStatus;
  recentDays?: number;
  hasAi?: boolean;
}

export interface SmartFolder {
  id: number;
  name: string;
  icon?: string | null;
  color?: string | null;
  rule: SmartFolderRule;
  sort: number;
  createdAt: number;
}

// 访问统计
export interface StatsOverview {
  total: number;
  active: number;
  dead: number;
  unread: number;
  favorite: number;
  withAi: number;
  topDomains: { domain: string; count: number }[];
  topVisited: { id: number; title: string; url: string; visitCount: number }[];
  heatmap: { date: string; count: number }[];
}

// 链接探活结果
export interface LinkCheckResult {
  id: number;
  url: string;
  httpStatus: number | null;
  status: BookmarkStatus;
}

// 云同步
export interface SyncPushItem {
  urlHash: string;
  url: string;
  title: string;
  description: string;
  favicon?: string | null;
  image?: string | null;
  categoryName?: string | null;
  tags: string[];
  favorite: boolean;
  pinned: boolean;
  readState: ReadState;
  notes: string;
  status: BookmarkStatus;
  deleted: boolean;
  updatedAt: number;
}

export interface SyncResponse {
  items: SyncPushItem[];
  serverTime: number;
  protocol?: 2;
  nextCursor?: string | null;
}

export interface LlmConfig {
  provider: string; // openai | deepseek | qwen | zhipu | custom
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  concurrency: number;
  enabled: boolean;
}

export const LLM_PRESETS: Record<string, { label: string; baseUrl: string; model: string }> = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { label: 'OpenAI 兼容', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  qwen: {
    label: '通义千问 (DashScope 兼容)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  zhipu: {
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
  },
  custom: { label: '自定义', baseUrl: '', model: '' },
};

// AI 富化返回的结构化结果
export interface AiEnrichResult {
  description: string;
  tags: string[];
  suggestedCategory: string;
}

// ===== 知识图谱 / 语义检索 =====

// 嵌入向量来源：
//  - lexical：本地 TF-IDF 关键词近似（零依赖、离线、随时可用，作为兜底）
//  - local：本地小型嵌入模型（transformers.js，首次在线安装后缓存离线）
//  - api：调用已配置大模型的 /embeddings 接口（联网 + Key，质量最好）
export type EmbeddingMode = 'lexical' | 'local' | 'api';

export interface EmbeddingConfig {
  mode: EmbeddingMode;
  localModel: string; // 本地模型名（transformers.js，如 Xenova/bge-small-zh-v1.5）
  apiModel: string; // API 嵌入模型名（如 text-embedding-3-small）
}

export const EMBEDDING_PRESETS: { value: string; label: string; size: string }[] = [
  { value: 'Xenova/bge-small-zh-v1.5', label: 'BGE small 中文（推荐）', size: '约 95MB' },
  { value: 'Xenova/multilingual-e5-small', label: 'E5 small 多语言', size: '约 110MB' },
  { value: 'Xenova/all-MiniLM-L6-v2', label: 'MiniLM L6（英文为主，最小）', size: '约 23MB' },
];

// 已存储嵌入的统计
export interface EmbeddingStatus {
  mode: EmbeddingMode;
  total: number; // 收藏总数（未删除）
  embedded: number; // 已生成向量的数量
  dim: number; // 向量维度（0 表示尚无向量）
  model: string; // 当前向量对应的模型/模式标识
}

// 力导向图节点
export interface GraphNode {
  id: string; // 'b:123' 收藏 / 'c:4' 分类 / 't:rust' 标签
  kind: 'bookmark' | 'category' | 'tag';
  label: string;
  refId?: number; // 收藏/分类 id
  categoryId?: number | null;
  favorite?: boolean;
  val?: number; // 节点大小权重
  color?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  kind: 'category' | 'tag' | 'semantic';
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// 图谱构建选项：开启哪些类型的边、语义近邻数、是否显示枢纽节点
export interface GraphOptions {
  category: boolean;
  tag: boolean;
  semantic: boolean;
  semanticK: number; // 每个节点连接的语义近邻数量
  semanticThreshold: number; // 语义相似度阈值（0~1）
  hubs: boolean; // 是否把分类/标签作为枢纽节点显示
}

// 语义检索命中
export interface SemanticHit {
  id: number;
  score: number;
}

// ---------- 首启分类目录预设（按角色） ----------
export interface CategoryNode {
  name: string;
  color?: string;
  children?: CategoryNode[];
}

export interface RolePreset {
  id: string;
  label: string; // 角色名
  desc: string; // 一句话说明
  icon: string; // 卡片图标标识（映射到 Ant Design 字体图标）
  tree: CategoryNode[];
}

// 内置角色目录模板：首次初始化时按角色一键生成多级分类树。
export const CATEGORY_ROLE_PRESETS: RolePreset[] = [
  {
    id: 'developer',
    label: '程序员 / 开发者',
    desc: '前后端、运维、算法与工程效率',
    icon: 'code',
    tree: [
      { name: '前端开发', children: [{ name: '框架·库' }, { name: 'CSS·样式' }, { name: '构建·工程化' }, { name: '浏览器·调试' }] },
      { name: '后端开发', children: [{ name: '语言·框架' }, { name: '数据库' }, { name: '消息·中间件' }, { name: '微服务·架构' }] },
      { name: '运维·DevOps', children: [{ name: '容器·K8s' }, { name: 'CI·CD' }, { name: '监控·日志' }, { name: '云服务' }] },
      { name: '算法·AI', children: [{ name: '大模型·LLM' }, { name: '机器学习' }, { name: '数据集' }, { name: '论文' }] },
      { name: '工具·效率', children: [{ name: '编辑器·IDE' }, { name: '命令行' }, { name: '效率工具' }] },
      { name: '学习·成长', children: [{ name: '教程·文档' }, { name: '开源项目' }, { name: '面试·求职' }, { name: '技术博客' }] },
    ],
  },
  {
    id: 'pm',
    label: '产品经理',
    desc: '竞品、需求、数据与增长',
    icon: 'product',
    tree: [
      { name: '竞品·行业', children: [{ name: '竞品分析' }, { name: '行业研究' }, { name: '趋势报告' }] },
      { name: '需求·设计', children: [{ name: '需求·PRD' }, { name: '原型·交互' }, { name: '设计参考' }] },
      { name: '数据·增长', children: [{ name: '数据分析' }, { name: '增长·运营' }, { name: '用户研究' }] },
      { name: '学习·方法', children: [{ name: '方法论' }, { name: '案例库' }, { name: '产品博客' }] },
    ],
  },
  {
    id: 'designer',
    label: 'UI / UX 设计师',
    desc: '灵感、视觉资源与设计系统',
    icon: 'design',
    tree: [
      { name: '灵感·参考', children: [{ name: '作品集' }, { name: '网站灵感' }, { name: 'App 灵感' }] },
      { name: '视觉资源', children: [{ name: '配色' }, { name: '字体' }, { name: '图标·插画' }, { name: '图片素材' }] },
      { name: '设计系统', children: [{ name: '组件库' }, { name: '设计规范' }, { name: '动效' }] },
      { name: '工具·插件', children: [{ name: '设计工具' }, { name: '插件·资源' }] },
    ],
  },
  {
    id: 'qa',
    label: '测试工程师',
    desc: '测试框架、专项测试与质量流程',
    icon: 'experiment',
    tree: [
      { name: '测试框架', children: [{ name: '单元测试' }, { name: 'UI 自动化' }, { name: '接口测试' }] },
      { name: '专项测试', children: [{ name: '性能测试' }, { name: '安全测试' }, { name: '兼容性测试' }] },
      { name: '工程·流程', children: [{ name: 'CI·CD' }, { name: '缺陷管理' }, { name: '测试平台' }] },
      { name: '方法·学习', children: [{ name: '用例·方法论' }, { name: '测试博客' }] },
    ],
  },
  {
    id: 'consultant',
    label: '方案顾问 / 售前',
    desc: '方案、客户商务与资料素材',
    icon: 'solution',
    tree: [
      { name: '方案·案例', children: [{ name: '行业方案' }, { name: '标杆案例' }, { name: '解决方案库' }] },
      { name: '客户·商务', children: [{ name: '客户资料' }, { name: '竞品对标' }, { name: '报价·合同' }] },
      { name: '资料·素材', children: [{ name: '技术白皮书' }, { name: '模板·PPT' }, { name: '演示 Demo' }] },
      { name: '学习·提升', children: [{ name: '行业报告' }, { name: '销售方法' }] },
    ],
  },
  {
    id: 'general',
    label: '通用 / 不确定',
    desc: '简洁实用的通用目录',
    icon: 'appstore',
    tree: [
      { name: '工作' },
      { name: '学习' },
      { name: '稍后读' },
      { name: '灵感·收集' },
      { name: '工具·资源' },
      { name: '生活·兴趣' },
    ],
  },
];
