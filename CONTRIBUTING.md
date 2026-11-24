# 参与贡献

1. 使用独立功能分支，提交 PR，不直接覆盖 main 或重写他人的历史。
2. 推荐 Node 24 LTS（最低 22.12.0） / pnpm 9.15.1：`pnpm install --frozen-lockfile && pnpm build:shared`；运行命令与平台构建方式见 README。
3. 修改前明确收藏→整理→找回→阅读→复用主线，保留本地免费、无需账号、不删除已有数据的约束。API Key、同步身份与本机桥接令牌是安全配置，不是软件付费授权。
4. 补上回归测试，同步更新相关 wiki；运行 lint、typecheck、test、test:edition、test:backend:e2e、test:packaging 和各应用 build。无法做的 GUI / 平台测试如实标记未测，附可复验步骤。
5. 不提交 .env、密钥、账号会话、完整备份、个人收藏/笔记、node_modules、数据库、安装包或缓存；截图和日志先脱敏。发现泄漏先私下通知维护者，不在公开 issue 粘贴凭据。
6. 项目自有贡献按 MIT；保留第三方许可和版权信息。引入模型/依赖/素材前核对来源及许可，不替不拥有的内容授予权利。

更多代码协作约定见 AGENTS.md。桌面打包依赖变化须做解包启动回归；不要把仅开发态运行写成打包态通过。

依赖变更需保留原始审计，区分实际运行时路径与开发/打包风险；不得用全局 overrides 伪造通过。当前剩余风险及禁止 AppImage 的原因见 [安全整改](./docs/SECURITY-DEPENDENCIES-0.4.0.md)。
