# 主内容区 UI 实现交接

## 范围与保护措施

仅修改附件副本 `/workspace/e2e-upload-20261122/ZhiCang` 的渲染层、对应 UI 测试和说明；没有远端 clone/commit/push，没有操作用户 Windows、没有更改数据库/桥接/IPC/后端语义，没有更换或重编 native 模块，没有打安装包。项目不是 Git 工作树；动手前保留了 5 个原始 UI 文件到 `/workspace/ui-layout-before`（App、styles、ListToolbar、BookmarkPanel、WebPreview），其他既有修复继续保留。独立审查文档未改。

## 已实现

1. **内容头**：去掉知识库眉题、泛化口号、孤立扩大范围按钮。目录标题与计数一行，范围说明一行，规范的 32px 控件集中在一个 40px 操作栏。无筛选条件时不留空 chips 行。按样式计算，无条件首内容起点为面板顶边约 120px，实际像素尚待 GUI 测量。
2. **操作去重**：顶部全局新增保持；内容工具栏不因查询为 0 再添加一组新增。批量粘贴常驻；排序/筛选/当前页全选统一。空列表全选禁用。筛选 chips 可删除/清除；扩大范围同屏最多一处。
3. **上下文空态**：真正空库→添加首条；星标/分类/智能目录→明确当前范围为空并查看全部；条件无结果→清除条件；收件箱→整理完；空回收站无新增引导。错误和加载继续是独立分支，不冒充空库。
4. **按需详情**：无有效选中时列表铺满主区。选中后列表宽 `clamp(330px,36%,450px)`，阅读用余宽；支持关闭和重新展开。折叠只改变局部 UI 状态，详情/笔记保持挂载，选择/筛选不清除。关闭用 `focus({preventScroll:true})` 回到原收藏，不主动重置列表滚动。列表宽度变化导致的卡片重排由浏览器处理，需 GUI 检查可见锚点。
5. **窄宽**：工作区不足 710px 时详情覆盖为阅读面板；列表 `visibility:hidden` 避免键盘进入被遮挡控件。展开及缩窄时焦点进入详情关闭按钮。默认原生最小窗宽仍为原有 960px，未更改。
6. **稳定批量模式**：标题/范围/条件不消失，仅替换操作行。移动、标签直接可达；星标/已读/重新分析/删除进更多。回收站保持恢复/永久删除。取消固定可见；极长英文批量动作组可横向滚动，取消不参与滚动。复选框与悬浮操作补可访问名称、键盘可达性。
7. **详情收口**：标题和关闭独立；阅读和浏览器打开直接可达，其余操作进更多菜单。标签默认 3 个、可展开，长标题/标签保留 title。详情头限高且可滚动，样式为正文预留 240px（扣地址栏后目标至少 200px）。笔记正文默认折叠，但输入控件/草稿/自动保存一直挂载，保存状态保留在笔记标题中；错误/冲突仍可见。笔记内不误触全局 Ctrl/Cmd+N/K。
8. **阅读反馈修复**：首次提取立即进入独立 loading 分支，按钮忙碌阻止重复点击；旧收藏请求不会清除新收藏加载状态。网页错误后重试会清除错误重新挂载 webview，返回网页/重试后重新绑定加载事件。未修改抓取 API 或存储逻辑。

## 修改清单

- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/src/renderer/src/library-presentation.ts`（新增纯展示策略）
- `apps/desktop/src/renderer/src/components/{ListToolbar,BookmarkPanel,WebPreview,NoteEditor}.tsx`
- `apps/desktop/test/library-presentation.test.ts`（新增 6 项）
- `apps/desktop/test/library-components.test.ts`（新增 5 项；SSR 静态组件契约，受控 store，不是浏览器测试）
- `wiki/03-Desktop-App.md`
- 本文和 `TESTS.log`

## 已执行验证 / 边界

- `pnpm --filter @zhicang/desktop test`：**61/61 通过**，日志 `docs/layout-polish/TESTS.log`。包含既有数据库/桥接/笔记保存测试和新增 11 项展示策略/静态组件契约。
- `pnpm --filter @zhicang/desktop lint`：通过。
- `pnpm --filter @zhicang/desktop typecheck`：通过。
- renderer-only Vite production build：通过，更新 `apps/desktop/out/renderer`，仅有既有大 chunk 体积提示；未构建主进程/预加载/安装包。
- **未宣称 GUI/E2E 通过**：本执行者没有可用桌面交互子代理，且未用 Shell/CDP/Playwright 绕过桌面交互边界。需父代理使用其 GUI 代理验收。特别是跨窗口像素、视觉对比度、卡片重排后的滚动锚点、webview 实载和 textarea 折叠展开焦点尚待实测。

## GUI 验收交接（请父代理逐项执行）

窗口：1024×645、1280×800、1440×900；浅/深主题，列表/卡片。使用既有隔离测试数据，不触碰用户原库。

1. 星标 0 条：只有一个“查看全部收藏”；无内容区新增误导；右侧无地球半屏占位；计数紧邻 h1；记录面板顶边到内容起点像素（目标 ≤120px）。
2. 真空库/收件箱/回收站/分类/筛选零条：空态与唯一主动作正确；故障时仍是错误+重试，不显示完成态。
3. 有数据未选：列表铺满；选中展开。当前样式预期：1024 列表330/详情504；1280 列表约382/详情680；1440 列表约440/详情782（以原有侧栏190/218/218为前提）。测实际值。
4. 列表滚动后选中→关闭→同条再选；确认返回原记录焦点，不跳顶，筛选/排序保留。卡片视图重排尤其要看可见锚点。
5. 勾选一条→全选当前页→取消；标题和列表首条 y 坐标跳动目标 ≤4px；复选框 Space 不打开详情；回收站仅有恢复/永久删除；批量更多动作可用。
6. 100 字标题、200 字母 URL、30 个长标签、6 行笔记：不横向撑破；标签能展开；详情头滚动后关闭仍可达；正文可视目标 ≥200px。
7. 笔记展开输入→折叠→展开→关闭详情→再开；确认文本和保存状态保留，保存失败/冲突重试可达；切换记录不串写。输入笔记时 Ctrl+N/K 不误开全局弹窗。
8. 首次点阅读：立即见 loading 与忙碌按钮；完成可读、可返回；失败仍有提示，再次可试。网页错误重试后事件/加载提示仍正常。
9. 窄宽（主区≤710px）：详情覆盖而不是挤成两条窄列；焦点在可见控件；关闭回列表；侧栏未被重做。
10. Tab/Shift+Tab/Enter/Space、更多菜单、筛选 chips、长文本 tooltip 与明暗色对比；不把构建/SSR 成功当作本项验收通过。

## 启动（仅供父代理调用其 GUI 代理）

现成 `out/main/index.js` 和 `out/preload/index.js` 保持原文件，renderer 已重建。Linux 隔离启动示例（不要复用真实用户目录）：

```bash
cd /workspace/e2e-upload-20261122/ZhiCang/apps/desktop
env -u ELECTRON_RUN_AS_NODE ZHICANG_USER_DATA_DIR=/workspace/zhicang-layout-gui-isolated pnpm exec electron out/main/index.js --no-sandbox
```

若已有本地桌面实例占用桥接端口，先由父代理确认实例归属并按现有隔离方案处理；不得杀未知实例，也不修改系统安全设置。Windows 正式打包/隔离实测由父代理串联，本子任务未生成最终包。

仅重建 renderer 的已用命令（cwd 为 apps/desktop）：

```bash
node --input-type=module -e "import {build} from 'vite'; import react from '@vitejs/plugin-react'; import {resolve} from 'node:path'; await build({configFile:false,root:resolve('src/renderer'),base:'./',plugins:[react()],resolve:{alias:{'@renderer':resolve('src/renderer/src')}},build:{outDir:resolve('out/renderer'),emptyOutDir:true,rollupOptions:{input:{index:resolve('src/renderer/index.html')}}}});"
```
