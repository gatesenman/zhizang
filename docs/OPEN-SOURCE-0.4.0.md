# 0.4.0 初始免费开源迭代记录（历史阶段）

> 以下保存安全依赖整改前的三轮真实过程，不代表当前依赖/打包状态。Electron 31、原漏洞计数和旧 AppImage 测试均为历史证据。当前事实、Linux ZIP 与剩余阻塞见 [安全整改记录](./SECURITY-DEPENDENCIES-0.4.0.md)。

## 第一轮：盘点与实现

追踪桌面门禁/徽章/横幅、store、preload、主进程、共享 RSA/JWT 工具、服务端商业模块、同步鉴权、项目站、部署和文档。删除注册码/设备绑定/订单支付/发码邮件实现与依赖，而不是将许可判断硬编码为 true。保留收藏主线、AI Key、本机桥接令牌和安全检查；同步改为可选普通账号认证。版本统一为 0.4.0，项目自有代码选择 MIT，第三方与素材权属边界单独说明。

第一轮 shared 构建、全工作区 typecheck 实际通过。初次安装在 Node 24 下缺少 make，原生 SQLite 编译失败；修复环境后再验证，不将此次失败计为安装通过。

## 第二轮：回归与遗漏

补齐首轮遗漏的首启引导、双语字典、Vite 公钥注入、部署注释、项目站 Docker 参数及 wiki。同步凭据仅 HTTPS（回环开发地址除外），拒绝重定向；账号切换关闭自动同步并重置游标，丢弃旧账号在途响应。

安全复核发现：自报邮箱注册不能证明旧邮箱数据所有权。因此新同步使用 account:<user UUID> 命名空间，旧邮箱云数据保留但不自动继承。补批量输入校验和生产 JWT_SECRET 检查；CI 增加开源边界、打包守卫、后端/真实桌面 HTTP+SQLite 集成。

实测：lint、typecheck 通过；桌面 65 项测试全部通过（包括新增 4 项旧设置忽略/AI Key保留、HTTPS、同步账号、在途响应回归）；开源边界 3 项、Windows 打包守卫 5 项通过；真实 Nest HTTP + SQL.js + Electron SQLite 客户端登录同步 E2E 通过。商业路由 404、未登录/篡改令牌 401、跨账号隔离、无效数据 400、LWW/删除、旧表保留均在测试中校验。共享包/后端原商业单测被删除后暂无独立单测，后端由集成测试覆盖，未将跳过当作测试通过。

本轮新增源码候选 225 文件经过 Gitleaks 8.30.1（校验下载 SHA256）扫描无发现；已提交 Git 全历史扫描无发现；候选文件无 .env/数据库/安装包/依赖或缓存。扫描不能替代完整安全审计。

## 第三轮：最终验证

复核跨包版本与发布/部署入口：Chrome/Firefox manifest 同步 0.4.0，MCP 从 package.json 读取版本；修复 Docker 缺少 patches/.npmrc、复制不存在 public 目录的问题，并新增 .dockerignore 防止凭据/用户数据进入构建上下文。PostgreSQL schema 同步改为显式 opt-in，部署脚本不会在后端未就绪时声称成功；新增 3 项后端批量原子校验、请求限制和非破坏性 schema 配置单测。同步主流程格式整理，当前 wiki 图/表移除旧商业调用。

### 最终实测命令（2026-11-24，Asia/Shanghai UTC+8）

环境：Linux x64，Node 24.22.1 / pnpm 9.15.9；桌面/SQLite 使用 Electron 31.7.7 的 Node ABI。CI 声明 Node 20，尚未在此环境复跑 CI；旧工具链的安全升级另见下方。

| 命令 | 结果 |
| --- | --- |
| pnpm install --frozen-lockfile | 修复缺少 make / C++ 等系统依赖后重试成功；保留锁文件与原打包补丁 |
| pnpm lint | 通过，零 warning 门槛 |
| pnpm typecheck | 通过，后端/桌面/项目站 |
| pnpm test | 后端 3 + 桌面 65 全通过；shared 移除商业工具后无独立测试（明确跳过） |
| pnpm test:edition | 4 项通过 |
| pnpm test:packaging | 5 项通过（原有 Windows 打包补丁/分卷守卫） |
| pnpm test:backend:e2e | 真实 HTTP + 临时 SQL.js DB + 实际 Electron/SQLite 客户端通过；旧商业表/邮箱云数据保留但不会被新注册邮箱继承 |
| pnpm build:all | shared、backend、portal、desktop 全部通过 |
| pnpm build:extension | Chrome / Firefox ZIP 构建通过，manifest 均 0.4.0 |
| pnpm --filter @zhicang/desktop dist:linux | 首次磁盘不足失败；仅清理本 checkout 的失败产物后同命令重试成功，生成未签名 AppImage |
| AppImage 解包启动 | 隔离临时数据目录 + Xvfb 启动通过，存活超过延迟初始化；bridge ping 为 0.4.0、私有路由无令牌 401；带旧授权/旧自动同步配置仍初始化真实 SQLite，不删除旧设置 |

构建警告：Browserslist 数据过旧、Next 未检测到其 ESLint 插件（根 ESLint 独立通过）、Electron builder 原生依赖建议。Xvfb 无 DBus 的环境日志与结束测试进程时的 shutdown 日志不作为 GUI 成功证据。

最终源码候选共 227 文件，Gitleaks 8.30.1 全量工作树与已提交 Git 历史扫描均无发现，候选清单无凭据/用户数据/依赖/安装包/构建缓存。AppImage 的 main/preload JS 与最终源码构建字节一致；安装包仅保留在盒子测试产物目录，不提交、不发布。

### 未测与风险

- **没有新版可视 GUI 验收**；AppImage 启动/桥接 smoke 不等于页面交互通过。Windows/macOS 打包/安装运行、真实浏览器扩展 GUI、线上更新、真实外部 AI 服务、自托管公网账号与 PostgreSQL/Docker 镜像未实际验收。
- `pnpm audit --prod --json` 返回漏洞：**4 critical / 56 high / 76 moderate / 14 low**。严重项涉及继承的 Next.js 与 proxy-addr；没有为注册码清理而贸然做跨主版本升级。Electron 31 / Node 20 等旧工具链也需要独立升级与回归。不可声称依赖安全审计通过；部署公网前应解决这些依赖问题并复审安全配置。
- 同步保留既有 LWW/时钟偏差、最多 5000 条拉取且无分页等限制；大量/冲突数据同步需先备份。旧邮箱云数据需维护者核验身份后人工迁移。没有邮箱验证/找回密码/自动刷新 token。同步会话存入本机 settings，完整备份也含会话，请保护目录与备份。
- MIT 仅覆盖维护者有权许可的原创内容；图标/旧截图等素材来源未附证明，第三方依赖/模型维持原许可，二次分发前应核对素材权利。

### GUI 复验方式与清单

在有图形桌面的 Linux：

```bash
pnpm install --frozen-lockfile && pnpm build:shared
ZHICANG_USER_DATA_DIR=/tmp/zhicang-0.4-gui pnpm dev:desktop
# 当前请运行自己构建的 Linux ZIP 中的 @zhicangdesktop；AppImage 已因安全原因禁止。
```

1. 新库直接出现工作台/分类向导，无激活页、试用横幅、付费入口或授权徽章。
2. 在复制的旧库中验证旧授权过期也不阻止操作，收藏/笔记/自备 API Key 都保留；不要对唯一一份原库做试验。
3. 新增/分类/标签/搜索/笔记/预览/导入导出/回收站/备份恢复主线；无 AI Key 时本地功能正常。
4. 同步页可不填写；自托管账号登录后手动开启自动同步，错误不冒充成功；切账号/断开不删除本地数据，切换会关闭自动同步。
5. 插件/MCP 有正确桥接令牌可访问，无/错令牌拒绝；API Key 仍是第三方服务凭据而非软件注册码。

证据与测试产物保存在执行盒子的 /workspace/zhizang-*.log、/workspace/zhizang-artifacts/，未提交二进制/本地数据。后续执行者需自行复验，不应将旧版截图写成新版 GUI 通过。
