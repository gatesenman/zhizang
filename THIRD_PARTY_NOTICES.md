# 第三方权利与许可边界

本仓库原始 0.3.1 提交未包含 LICENSE、NOTICE 或 COPYING。应维护者的免费开源请求，0.4.0 为项目自有代码与文档选择 MIT：简洁、允许使用/修改/再分发与商业使用，不制造新的产品解锁限制。MIT 不承诺服务永久免费，也不要求衍生作品必须开源。

MIT 仅适用于维护者有权许可的项目原创内容，不改变第三方权利。不能仅凭源码存在于本仓库就推定素材作者已授权再许可。发布者仍需确认权属。

- Electron、React、Ant Design、NestJS、Next.js、TypeORM、better-sqlite3、Cheerio、electron-updater、MCP SDK 及所有传递依赖，保留各包自带 LICENSE / NOTICE / 版权声明；以锁文件确定版本。打包分发时须保留依赖的法定声明（含 Electron 的 LICENSE / LICENSES.chromium.html），不得因本项目新增 MIT 而删除。
- `patches/app-builder-lib@24.13.3.patch` 是对第三方打包工具的补丁，仅作为历史证据保留（0.4.1使用已含修复的上游26模板及SHA守卫），依然受上游许可约束；本项目不替上游授予额外权利。
- `apps/extension/browser-polyfill.js` 是四行 chrome/browser 别名垫片，不是 vendored Mozilla webextension-polyfill 分发包。
- transformers.js、CDN 加载的代码、BGE/E5/MiniLM 等下载模型不随本仓库重新许可；下载使用前核对相应版本的许可证、模型卡及使用条件。
- 网页快照、收藏内容、第三方 API 输出、品牌和商标不因被本软件保存或显示而变为 MIT 内容；由用户尊重原权利与服务条款。
- 桌面/扩展图标、历史截图的原始创作凭据未随初始提交提供。本次未替换或冒称它们可任意再授权；二次分发者应核对素材来源，必要时替换。仓库的源码开源声明不能代替素材权属确认。

本次没有发现已有冲突许可证，也没有覆盖任何第三方许可证；这不等同于完整法律审计或所有依赖的安全审计。
