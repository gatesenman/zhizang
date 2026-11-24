# 03 · 桌面端（Electron）

桌面端是产品核心，位于 `apps/desktop`，使用 electron-vite 构建（主进程 / 预加载 / 渲染层三套构建）。

## 目录结构

```
apps/desktop/src/
├── main/                 # 主进程（Node 能力）
│   ├── index.ts          # 窗口创建 + 全部 IPC handler 注册
│   ├── db.ts             # SQLite/FTS5 schema、迁移、CRUD、查询、统计
│   ├── enrich.ts         # 抓取 meta / 正文、链接探活、静态存档、AI 富化
│   ├── sync-account.ts        # 可选同步账号连接/断开，服务地址与会话
│   ├── sync.ts           # 云同步（与后端 /sync 对接）
│   ├── bridge.ts         # 本地 HTTP 桥接服务（插件 + MCP，带令牌鉴权）
│   ├── updater.ts        # 自动更新（electron-updater，仅打包版生效）
│   └── import-export.ts  # HTML/JSON/CSV/YAML 导入导出
├── preload/index.ts      # contextBridge 暴露 window.api
└── renderer/src/
    ├── App.tsx, store.ts (zustand), theme.ts, util.ts, i18n.tsx (中/英)
    └── components/        # Sidebar / BookmarkPanel / WebPreview /
                           # AIPanel / CommandPalette / SettingsModal /
                           # PasteImportModal / StatsModal / SmartFolderModal /
                           # AddBookmarkModal / ListToolbar / GraphModal
```

## IPC API（`window.api`）

预加载层把能力按域分组暴露，渲染层只通过 `window.api.*` 操作数据。完整分组：

| 分组 | 主要方法 |
| --- | --- |
| `categories` | `list / counts / create / rename / remove / move / reorder`、`seedPreset(roleId)`（按角色预设一键生成多级分类树） |
| `tags` | `list / counts` |
| `bookmarks` | `query / get / create / update / visit / remove / removeMany / restore / emptyTrash / trashCount / move / addTag / favoriteMany / readStateMany / reenrich / reenrichMany / importPaste` |
| `dup` | `find / merge`（重复检测与合并） |
| `links` | `checkAll / check`（失效链接探活） |
| `snapshot` | `save / get / archive`（离线正文存档） |
| `smart` | `list / create / remove`（智能文件夹） |
| `stats` | `overview`（统计热力图） |
| `sync` | `run / lastAt`（手动云同步）、`getConfig / setConfig`（自动同步开关与间隔） |
| `ai` | `status / ask`（AI 面板检索/问答） |
| `graph` | `getConfig / setConfig`（嵌入配置）、`status`（向量统计+模式）、`data(opts)`（构建并返回图谱）、`docsForEmbedding`（取待嵌入文本，供渲染层本地模型用）、`storeVectors(items, model)` / `clearVectors`（向量增删）、`buildApi`（主进程用 API 批量算向量，带 `graph:progress` 事件）、`search(q, k)`（lexical/api 检索）、`searchByVector(vec, k)`（local 模式：渲染层算好查询向量后稠密检索） |
| `bridge` | `status`（桥接服务状态，含端口与访问令牌）、`resetToken`（重置令牌，旧令牌立即失效） |
| `settings` | `getLlm / setLlm / get / set` |
| `io` | `importHtml / importJson / importCsv / importYaml / exportHtml / exportJson` |
| `app` | `version`（当前版本）、`checkUpdate`（手动检查更新）、`updateStatus`（取当前更新状态） |
| 其它 | `openExternal(url)`、`on(channel, cb)` 订阅主进程事件（如 `bookmarks:changed`、`update:status`、`graph:progress`） |

> IPC channel 命名采用 `域:动作`（如 `bookmarks:query`、`sync:connect`），在 `main/index.ts` 内用 `ipcMain.handle` 注册，与 preload 一一对应。

### `bookmarks:create` 返回结构与重复处理

`bookmarks:create` 返回 `{ bookmark, duplicate: boolean }`，**不再在 URL 重复时抛异常**：

- 新建成功：`{ bookmark, duplicate: false }`，并入队 AI 富化。
- URL 已存在：handler 捕获重复错误，用 `getBookmarkByUrl(url)`（`db.ts`，按 `url_hash` 查未删除记录）取回现有记录，返回 `{ bookmark: existing, duplicate: true }`。

这样渲染层（`store.addBookmark` → `AddBookmarkModal`）能定位到现有收藏并提示「该网址已收藏」，**避免出现 `Error invoking remote method 'bookmarks:create'` 的技术报错**。`util.cleanIpcError()` 用于剥离 IPC 报错前缀，仅向用户展示真正信息。

### 定时自动云同步

`sync.ts` 在手动同步（`runSync`）之外提供定时自动同步：

- 配置存于 SQLite `settings` 表：`sync_auto_enabled`（`'1'`/`'0'`）与 `sync_auto_interval_min`（默认 30，最小 5）。
- `getSyncConfig()` / `setSyncConfig(cfg)` 读写配置；`setSyncConfig` 写库后调用 `scheduleAutoSync()` 热更新定时器（`setInterval`，并 `unref()` 不阻塞退出）。
- `initAutoSync()` 在 `app.whenReady` 后延迟启动（避开冷启动高峰）：若已开启则先尝试同步一次再起定时器。
- 定时回调内 `runSync().catch(() => undefined)`：未连接账号 / 网络异常时记录错误并跳过，不打断用户。

设置页 `SettingsModal` 新增「云同步」分组：`自动云同步` 开关 + `同步间隔（分钟，最小 5）`，经 `window.api.sync.getConfig/setConfig` 读写。

### 首启分类目录初始化（按角色）

首次进入应用（`settings` 表无 `onboarded='1'`）时弹出 `OnboardingModal`，让用户按角色一键生成一套标准多级分类树：

- 角色模板定义在 `@zhicang/shared` 的 `CATEGORY_ROLE_PRESETS`（`RolePreset[]`，每个含 `id/label/desc/icon` 与 `CategoryNode[]` 树）：程序员/开发者、产品经理、UI/UX 设计师、测试工程师、方案顾问/售前、通用。`icon` 为字体图标标识（`code/product/design/experiment/solution/appstore`），由 `OnboardingModal` 映射到 Ant Design Icons 渲染（不使用 emoji）。
- 选角色 → `window.api.categories.seedPreset(roleId)` → 主进程 `seedRolePreset()` 调 `applyCategoryTree()` 递归落地（保留 parent_id 层级），返回 `{ created }`。
- 也可「导入 YAML 分类树」（复用 `io.importYaml`，已支持嵌套 children 保留层级）或「暂不，自己新建」。
- 完成后写入 `settings.onboarded='1'`，重启不再弹出；导入导出菜单亦有「按角色生成分类目录」入口可随时再次打开。

## 渲染层组件

| 组件 | 职责 |
| --- | --- |
| `OnboardingModal.tsx` | 首启引导：按角色（`CATEGORY_ROLE_PRESETS`）一键生成多级分类目录 / 导入 YAML 树 / 跳过 |
| `Sidebar.tsx` | 左侧导航：全部/星标/稍后读/回收站（固定项，不再与同名分类重复）；分类**多级目录树**（由扁平 `parentId` 构建父→子映射，缩进渲染、caret 折叠/展开、父级显示「自身+子孙」聚合计数）。目录右键菜单：重命名 / 新增下级 / **新增同级** / 删除（删除时收藏与子目录上提到上级，见数据模型）。**跨层级拖拽**：拖目录到另一目录行上=成为其子级；拖到目录间的缝隙（`CatGap`）=同级重排或上提为顶级（经 `categories.move`+`categories.reorder`，禁止拖入自身子孙）。点击目录展示「自身+所有子孙」的收藏。**父分类默认折叠**（仅记录被展开节点的 `expanded` 状态），分类目录标题栏提供「全部展开/折叠」切换，避免大型角色预设目录把侧栏一次铺开过长；行高/间距经收紧以提升信息密度 |
| `BookmarkPanel.tsx` | 中间列表/卡片视图、右键菜单、多选批量浮条、分页；`Favicon` 组件按 `util.faviconCandidates()` 逐级回退（富化 favicon → 站点 `/favicon.ico` → 公共服务 → 首字母占位）。**空状态**由 `library-presentation.ts` 按范围区分：全部空库引导首条收藏、星标/分类为空引导查看全部、条件零结果引导清除条件、收件箱为整理完成态、回收站无新增引导；每种空态仅一个主动作。批量粘贴固定在操作栏，新增沿用全局入口（空库额外提供首条引导），不再在零结果工具栏堆叠新增按钮；「按角色生成分类目录」属初始化专用操作，仅由首启引导与导入导出菜单入口触发，不放在空状态 |
| `WebPreview.tsx` | 右侧网页实时预览（webview）+ 地址栏 + 工具条（星标/阅读模式/编辑/重新富化/外部打开）。webview 用标准桌面 Chrome UA + 持久分区 `persist:webview`（保留登录态）；监听 `did-fail-load`，失败时显示可读提示与「在浏览器打开 / 阅读模式」兜底，避免右侧空白（忽略 errorCode -3 与非主框架错误） |
| `CommandPalette.tsx` | 命令面板（命令 + 收藏模糊搜索），由 Ctrl+K 或顶栏搜索框右侧的「Ctrl K」按钮**显式**打开；顶栏搜索框本身做内联关键词筛选（回车生效），不再在聚焦时自动弹出面板 |
| `AIPanel.tsx` | 右侧 AI 面板，自然语言检索/问答 |
| `GraphModal.tsx` | 知识图谱（`react-force-graph-2d` 力导向 canvas）：节点按分类着色、点节点开收藏、顶部语义检索框高亮命中并淡化其余、边类型/枢纽/语义近邻数开关、构建/重建向量按钮 |
| `embedder.ts` | 本地模型嵌入器（渲染层）：运行时从 CDN 动态加载 transformers.js（ESM+WASM，不打进安装包），首次在线下载模型并浏览器缓存，之后离线；mean pooling + L2 normalize，算好向量经 `graph.storeVectors` 回传主进程 |
| `StatsModal.tsx` | 访问热力图 / 高频域名 / 最常访问 |
| `SettingsModal.tsx` | 语言（中/英）、大模型配置、知识图谱/语义检索（嵌入来源 本地/API/TF-IDF + 本地模型选择）、桥接端口与访问令牌、自动更新状态、后端地址 |
| `PasteImportModal.tsx` | 批量粘贴链接导入 |
| `SmartFolderModal.tsx` | 智能文件夹规则编辑 |
| `AddBookmarkModal.tsx` | 新增收藏 |
| `ListToolbar.tsx` | 主内容区头：目录标题+数量、范围说明、统一排序/筛选/全选/批量粘贴操作行；多选时只替换操作行，标题与条件不消失，低频批量动作收进更多菜单 |

### 渲染层按需加载（启动加速）

`App.tsx` 用 `React.lazy` + `Suspense` 对所有按需弹窗/面板做代码分割，且**仅在打开时挂载**（`{open && <Modal open .../>}`，关闭即卸载）：`SettingsModal` / `AddBookmarkModal` / `CommandPalette` / `StatsModal` / `SmartFolderModal` / `AIPanel` / `GraphModal` / `PasteImportModal` / `OnboardingModal`。

- 收益最大的是 `GraphModal`——它依赖较重的 `react-force-graph-2d`（含 d3），被拆为独立 chunk（约 400 KB），仅在打开知识图谱时才加载。
- 启动主包从约 2.9 MB 降到约 2.2 MB；其余弹窗各自成块按需加载。
- 核心布局（`Sidebar` / `BookmarkPanel` / `ListToolbar` / `WebPreview`）保持同步加载，保证首屏即时可用。
- `embedder.ts`（transformers.js）本就运行时从 CDN 动态加载，不打进安装包。

### 状态管理

`store.ts` 使用 zustand 维护：当前导航（`nav`）、查询条件、视图模式（list/card）、多选集合、分类/标签缓存、分页等。组件读取派生状态、调用 `window.api` 后刷新。

> 注意（历史教训）：右键菜单项构造必须是**纯函数**（`contextMenuItems(b, categories, isTrash)`），不能在列表 `.map()` 内调用 React hook，否则收藏数量变化会触发「Rendered more hooks」崩溃。详见 [wiki/10](./10-Build-And-Release.md) 的踩坑记录。

## 本地桥接服务

主进程启动后通过 `bridge.ts` 在 `127.0.0.1:38121`（端口可在设置里改）开 HTTP 服务，仅监听本机，供插件与 MCP 复用：

| 方法 | 路由 | 说明 |
| --- | --- | --- |
| GET | `/api/ping` | 健康检查，返回名称/版本（**免令牌**，供发现） |
| GET | `/api/search?q=&limit=` | 全文检索收藏 |
| GET | `/api/recent?limit=` | 最近收藏 |
| GET | `/api/bookmark/:id/content` | 取离线正文存档 |
| POST | `/api/capture` | 收藏单个 URL（可带 title/description/html/tags） |
| POST | `/api/capture/batch` | 批量收藏（`urls[]` 或 `text` 中自动提取 URL） |

`extractUrls(text)` 用正则从任意文本提取并去重 URL，是「批量粘贴导入」与插件批量收藏共用的工具。

### 桥接鉴权与防护（令牌 + Origin + Host）

桥接服务仅监听 `127.0.0.1`，并叠加三层校验，防止任意网页经用户浏览器对本机服务发起 CSRF / DNS-rebinding 写入：

- **访问令牌**：首次启动生成随机令牌（`getBridgeToken()`，`randomBytes(24).hex`，持久化于 `settings.bridgeToken`）。除 `/api/ping` 与预检外，所有请求必须携带匹配令牌（`Authorization: Bearer <token>` 或 `X-Zhicang-Token`），否则 401。设置页可一键重置（`bridge:resetToken`，旧令牌立即失效）。
- **Origin 校验**：仅放行 `chrome-extension://` / `moz-extension://` 与本机回环来源；其余网页来源返回 403。
- **Host 校验**：`Host` 头必须指向 `127.0.0.1`/`localhost`（防 DNS-rebinding），否则 403。

> 插件与 MCP 需在配置中带上该令牌：插件存于 `chrome.storage.local` 的 `bridgeToken`，MCP 读环境变量 `ZHICANG_BRIDGE_TOKEN`。详见 [wiki/08](./08-Browser-Extension.md) 与 [wiki/09](./09-MCP.md)。

## 自动更新（electron-updater）

`updater.ts` 基于 `electron-updater`，**默认停用**。只在已打包版本、更新开关启用且真实源有效时检查：

- `autoDownload=false`、`autoInstallOnAppQuit=false`。发现版本后用户明确下载，完成后确认重启安装。
- `disabled / checking / available / progress / downloaded / error` 状态通过 `update:status` 通知设置界面；未提供源与 dev 模式均明确说明原因，不静默假成功。
- 0.2.0 已移除原 GitHub 默认发布源。发行者可配置真实 HTTPS generic 目录，须正确托管 `latest.yml` 与安装包；本次未发布或验收线上更新。打包细节见 [wiki/10](./10-Build-And-Release.md)。

## 国际化（i18n，中/英）

渲染层 `i18n.tsx` 提供轻量 React Context 方案（无第三方 i18n 库）：

- `STRINGS` 按「命名空间.字段」组织既有中/英文案（本轮新增配置/引导文案优先中文）；`t(key, vars?)` 按点号路径查找并插值 `{var}`，英文缺键回退中文。
- `I18nProvider` 在 `main.tsx` 包裹应用，`Root` 据当前语言切换 antd `ConfigProvider` 的 `locale`（`zhCN`/`enUS`）。
- 语言持久化于 `localStorage('zc-lang')`，首次按 `navigator.language` 自动判定（非中文→英文）；切换时同步写入主进程 `settings.lang`（供更新弹窗等原生 UI 本地化）。
- 切换入口两处：标题栏 `GlobalOutlined` 一键切换按钮，以及 `SettingsModal` 顶部「语言」下拉。
- 非 React 模块（`util.ts`）经导出的 `getLang()` / `translate(lang, key, vars)` 读取当前语言（如 `relativeTime`、`cleanIpcError`）。

> 品牌字「智」logo、`CATEGORY_ROLE_PRESETS` 中文分类数据与代码注释属内容/数据，未做 i18n。

## 深色模式（主题）

深色由 `store.dark` 控制，标题栏 `BulbOutlined` 切换，状态持久化。两层协同保证全界面（含浮层）一致：

- **Antd 组件**：`main.tsx` 的 `Root` 据 `dark` 切换 `ConfigProvider` 的 `algorithm`（`darkAlgorithm`/`defaultAlgorithm`）+ `theme.ts` 的 `darkTheme`，覆盖所有 antd 组件的背景/文字/边框。
- **自定义布局与浮层**：`App.tsx` 用副作用把 `zc-dark` 类挂到 `document.body`（而非仅 App 根节点）。因为 Modal/Drawer/Dropdown/message 等经 portal 渲染到 `body` 之外的 App 子树，只有挂在 `body` 上，`styles.css` 里 `.zc-dark …` 规则才能同时命中页面内容与这些浮层。
- `styles.css` 的 `.zc-dark` 段为自定义容器（侧栏 / 列表面板 / 预览区 / 卡片 / 导航项 / 地址栏等）补齐暗色背景与文字，修复此前「白底 + 浅色文字」不可读的问题。新增自定义浅色样式时，须同步补 `.zc-dark` 覆盖。

## 知识图谱 / 语义检索引擎

主进程 `graph.ts` 是图谱与检索核心（无渲染依赖）：`docText()` 拼接标题(2x)/描述/标签/正文/域名；`tokenize()` 拉丁词 + 中文 unigram/bigram；`TfIdf` 类做稀疏向量编码；`buildGraph(opts)` 装配节点（收藏 + 可选分类/标签枢纽）与边（同分类 / 共享标签 / 语义 Top-K 余弦近邻，语义建边上限 1200 节点防卡顿）。语义边优先用 `embeddings` 表的稠密向量，无则即时 TF-IDF 兜底（兜底阈值更低以适配 TF-IDF 量纲）。检索：`lexicalSearch`（TF-IDF）/ `denseSearch`（已存向量余弦 Top-K）/ `apiEmbed`（OpenAI 兼容 `/embeddings`）。三种嵌入模式：`lexical`（离线零依赖）、`local`（渲染层 transformers.js）、`api`（联网+Key），默认 `local`；lexical/已下载本地模型在本地计算，API 模式会向所配置模型服务发送相应内容，并非全部不上传。首次本地模型需要下载 CDN/WASM/模型资源。

## 相关源码

- `apps/desktop/src/main/index.ts` / `db.ts` / `bridge.ts` / `updater.ts` / `enrich.ts` / `sync-account.ts` / `sync.ts` / `import-export.ts` / `graph.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/src/`（App.tsx / store.ts / util.ts / i18n.tsx / embedder.ts / main.tsx / components/*）
- 测试：`apps/desktop/test/bridge.test.ts`（桥接鉴权 + Origin/Host 校验）


## 2026-11 本地交付补充

本次调整见 [交付记录](../docs/DELIVERY-2026-11.md)。工作台分主/次工具栏、三栏内容区与状态栏；新增支持自定标题/标签，详情可编辑标签。`bookmarks:purge(ids)` 只允许硬删回收站所选记录（UI 确认），单条永久删除不再调用 emptyTrash。离线阅读用无脚本沙箱 iframe，不能访问 preload。store 对列表/详情请求按序号防竞态，失败可重试。JSON v2 可跨库恢复分类层级和收藏元数据，但不含存档、智能目录、设置或许可证。

### 主内容区布局优化（2026-11-22）

- `App.tsx` 新增语义化工作区：未选中/已选记录不在当前列表时不占据右侧预览空间；点击记录后展开，关闭详情只改变 UI 折叠状态，保留选择/筛选/已挂载的笔记和 webview，并把焦点还给原记录（不主动跳顶）。
- `styles.css` 使用工作区/列表容器查询：宽屏按 `clamp(330px, 36%, 450px)` 分配列表，阅读区使用余宽；主区小于 710px 时详情覆盖为阅读面板，列表暂时不可聚焦，关闭恢复。未选时列表/卡片使用全部主区，不再显示双空态。
- `WebPreview.tsx` 标题与关闭入口独立，阅读/外部打开为直接操作，编辑/引用/归档等从更多菜单访问；标签默认 3 个，可展开，详情头限高并独立滚动，为正文保留空间。修复首次阅读提取时无加载反馈及错误后重试/返回网页时的事件重新绑定。
- `NoteEditor.tsx` 笔记正文可展开/收起，但始终挂载；保存状态始终保留在笔记标题中。折叠不取消草稿或自动保存；笔记区域不触发全局 Ctrl/Cmd+N/K。
- 相关源码：`renderer/src/library-presentation.ts`、`App.tsx`、`components/{ListToolbar,BookmarkPanel,WebPreview,NoteEditor}.tsx`、`styles.css`。测试：`test/library-presentation.test.ts`（纯展示策略）、`test/library-components.test.ts`（受控状态的静态组件渲染，非 GUI/E2E）。


## 0.4.0 免费开源模式

启动直接初始化收藏库，不再有激活/试用门禁、授权徽章或横幅；store 与 preload 移除 license API。新增 sync.accountStatus/connect/disconnect/setBackendUrl/testServer，仅服务于可选自托管同步；网络页不检查付费资格，但开启自动同步须有已连接账号。见 wiki/06 的旧配置忽略和安全边界。
