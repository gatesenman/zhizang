# 智藏 ZhiCang 浏览器插件（Chrome / Firefox）

一键把当前页 / 所有标签页 / 链接 / 选中内容收藏到智藏桌面端，并自动抓取正文用于离线存档。

## 工作原理

插件通过本地桥接服务（`http://127.0.0.1:38121`，端口可配置）与桌面端通信。**请先启动桌面端**，插件才能保存。

## 安装（Chrome / Edge）

1. 打开 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点「加载已解压的扩展程序」，选择本目录（`apps/extension`）
4. 点击工具栏图标即可使用

> 正式发布时执行 `pnpm --filter @zhicang/extension build` 生成 `dist/zhicang-chrome.zip` 上传到 Chrome 网上应用店。

## 安装（Firefox）

1. 运行 `node build.mjs firefox` 生成使用 MV2 manifest 的包（或手动把 `manifest.firefox.json` 重命名为 `manifest.json`）
2. 打开 `about:debugging#/runtime/this-firefox`
3. 点「临时载入附加组件」，选择该目录下的 `manifest.json`

## 功能

- 收藏当前页（含正文存档，断网可读）
- 收藏当前窗口所有标签页（批量）
- 右键菜单：收藏此页 / 收藏此链接 / 剪藏选中内容（含来源）
- 设置页可修改桥接端口（需与桌面端一致）

## 端口配置

桌面端「设置 → 本地桥接服务」可查看 / 修改端口；插件「设置」页填写同一端口。
