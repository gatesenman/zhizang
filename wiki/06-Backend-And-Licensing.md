# 06 · 可选自托管同步与账号（0.4.0）

文件名保留以避免旧链接失效；注册码/许可证服务器已移除。

## 当前架构

`AppModule` 仅装配 Settings、Auth、Sync；保留 helmet、CORS、ValidationPipe、全局限流与登录限流。无 products / orders / payment / email / admin 商业管理接口，无激活码、设备绑定、许可证公私钥或支付凭据依赖。`@nestjs/jwt` 仅用于同步账号认证，不对本地功能设门槛。

- `GET /api/health`：健康检查。
- `POST /api/auth/register`、`POST /api/auth/login`：同步账号（部署者可在 settings 表设置 login.allowRegister=false 禁止新注册）。
- `GET /api/auth/me`：当前账号。
- `POST /api/sync`：必须携带有效账号 Bearer token，经 JwtAuthGuard 查用户身份后只读写该账号的同步命名空间；不信任客户端提交的邮箱身份。

## 升级与数据安全

桌面继续使用原 appId/数据目录/收藏 SQLite；不迁移、不删除收藏、笔记、AI Key 或旧授权配置。旧 license_token/license_email/device_salt/backend_url/local_mode 不再读取。新的 sync_backend_url、sync_account_session、sync_auto_enabled_v2 与旧配置隔离，默认不连接任何服务器，旧自动同步不自动上传。

服务端移除商业 entity 注册，不执行 drop 表、清库或删除文件。旧 activation_codes/device_bindings/products/orders 表及历史 settings 可保留，不被应用使用；生产应 DB_SYNC=false，并先备份、审核 schema。自托管账号仍需强 JWT_SECRET、HTTPS、安全数据库凭据与备份。

**遗留云数据不能按自报邮箱直接继承**：未验证邮箱的注册流程不证明邮箱所有权。0.4.0 同步使用 `account:<user UUID>` 作为存储命名空间（沿用 sync_items.email 列名，不代表实际邮箱），旧邮箱行保留但隔离。管理员如需迁移，应在验证身份、备份并停机后，将指定用户旧邮箱行迁入其 account 命名空间，处理 urlHash 冲突；本版本不自动操作。

桌面登录密码不持久化；会话令牌保存在设置数据库（与旧设置同级保护），完整备份也含它。账号/服务切换会清除会话、关闭自动同步并重置游标，不删本地内容。不要在共享设备上不受保护地保存该目录或上传备份。

## 限制

同步仍是原有 LWW 协议，不是协同编辑：时钟偏差、冲突、5000 条拉取上限/分页仍需后续专项改进。先备份再跨库合并。后端未实现邮箱验证、密码找回、托管运营或客户端会话自动续期，不能作为已验收的公共多租户服务部署。生产依赖审计有未修复严重项，详见 docs/OPEN-SOURCE-0.4.0.md，勿未经升级加固暴露公网。

## 相关源码

- apps/backend/src/{app.module.ts,auth/,sync/,db/}
- apps/desktop/src/main/{sync-account.ts,sync.ts,service-url.ts}
- apps/desktop/src/renderer/src/components/SyncAccountSettings.tsx
- .env.example、docker-compose.yml

安全整改已升级 Nest 11 / Express 5 / TypeORM 0.3.31，明确拒绝缺失的同步请求体；真实路径与剩余两个 ORM glob/minimatch 中危见 [安全整改](../docs/SECURITY-DEPENDENCIES-0.4.0.md)。
