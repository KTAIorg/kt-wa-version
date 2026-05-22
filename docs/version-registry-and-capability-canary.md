# WhatsApp 版本库与能力金丝雀设计

本文定义 `kt-wa-version` 在 KT WhatsApp 插件体系里的定位。

当前仓库已经能按小时抓取 WhatsApp Web HTML 快照，并保存 `en_US`、`zh_CN` 两种 locale。这个能力应该继续保留，但它只解决“发现页面版本”和“保存初始 HTML shell”的问题；它还不能证明登录后的插件能力一定可用。

## 第一性原理

WhatsApp 插件适配真正需要回答三个问题：

1. WhatsApp Web 是否发布了新版本？
2. 这个版本的资源结构是否和已知版本一致？
3. 这个版本登录后是否仍然支持 KT 插件需要的能力？

当前仓库主要覆盖第 1 个问题，并部分覆盖第 2 个问题。

未来目标是把本仓库升级为：

```text
WhatsApp Version Registry + Capability Canary
```

也就是：

- Version Registry：持续发现 WhatsApp Web 版本、HTML、locale、静态资源入口和 fingerprint。
- Capability Canary：使用 KT 的测试账号加载新版本，运行 `kt.im.whatsapp` 的 capability probe，提前发现能力缺失。

## 当前事实

当前抓取的是 WhatsApp Web 初始 HTML shell。

它包含：

- 页面版本线索，例如 `client_revision`。
- bootloader 配置。
- 初始 mount 节点。
- 静态 JS/CSS 资源 URL。
- `en_US` 和 `zh_CN` HTML 变体。

它通常不包含登录后的运行时 DOM，例如：

- 左侧会话列表。
- 当前聊天消息区。
- 输入框。
- 发送按钮。
- 附件入口。
- 登录后渲染出来的消息 DOM。

它也不能直接证明这些内部能力存在：

- `window.Store` 是否能构造。
- `sendTextMsgToChat` 是否存在。
- `addAndSendMsgToChat` 是否可用。
- 媒体上传和下载模块是否可用。

因此，当前 HTML 快照不能单独作为“插件能力可用”的证明。

## 目标职责

### 1. Version Registry

继续负责：

- 按固定频率发现 WhatsApp Web 新版本。
- 保存 HTML 快照。
- 保存 locale 变体。
- 维护 `versions.json`。
- 判断旧版本是否过期或不再工作。

新增建议：

- 从 HTML 解析静态 JS/CSS 资源 URL。
- 生成 asset fingerprint。
- 保存每个版本的资源索引。
- 记录抓取时的 user agent、locale、cookie hint、抓取时间。

建议输出：

```text
snapshots/<version>/
  html/en_US.html
  html/zh_CN.html
  assets.json
  fingerprint.json
  metadata.json
```

其中 `fingerprint.json` 至少包含：

```json
{
  "hostApp": "whatsapp-web",
  "hostAppVersion": "2.3000.1039974632-alpha",
  "locale": ["en_US", "zh_CN"],
  "scriptUrlsHash": "sha256:...",
  "styleUrlsHash": "sha256:...",
  "bootloaderManifest": "1039974632_main",
  "capturedAt": "2026-05-22T02:33:41.626Z"
}
```

### 2. Capability Canary

新增能力金丝雀，用于自动检测新版本是否破坏插件能力。

流程：

```text
发现新 WhatsApp Web 版本
  -> 启动受控浏览器/Electron 环境
  -> 使用 KT 测试 WhatsApp 账号登录
  -> 加载目标版本页面
  -> 注入 kt.im.whatsapp capability-probe
  -> 产出 capability report
  -> 上传报告到 kt-plugin-platform
  -> 能力缺失时告警并创建适配任务
```

Capability Canary 不应该使用客户账号。

它应该使用内部测试账号、固定测试联系人和最小测试数据。

## 能力检测范围

首期检测 P0 能力：

- `host.version.detect`
- `host.comet.detect`
- `module.enumerate`
- `store.chat.read`
- `store.msg.read`
- `store.sendText`
- `store.sendMessage`
- `dom.chatList.read`
- `dom.activeChat.read`
- `dom.composer.write`
- `dom.sendButton.click`
- `message.sendText`
- `safety.outgoingGuard`

P1 再检测：

- `message.sendMedia`
- `message.downloadMedia`
- `conversation.open`
- `contact.list`
- `conversation.unreadCount`

## 与客户侧上报的关系

客户侧不应默认上传完整页面。

客户侧只需要上报：

- `hostAppVersion`
- asset fingerprint。
- `desktopVersion`
- `pluginVersion`
- `capabilityProfileVersion`
- capability report。
- 错误码和 strategy。

平台收到客户上报后：

1. 如果 `hostAppVersion + fingerprint` 已存在，并且 canary 结果正常，则优先判断为客户本地状态或账号特殊问题。
2. 如果版本存在但 canary 未跑过，则触发 canary。
3. 如果版本不存在，则优先由 `kt-wa-version` 抓取，而不是要求客户上传页面。
4. 如果 canary 正常但客户仍异常，再收集 L2 脱敏诊断包。
5. 只有 L2 无法复现时，才考虑 L3 远程调试。

## 去重策略

客户问题按以下 key 聚合：

```text
hostAppVersion
+ assetFingerprint
+ desktopVersion
+ pluginVersion
+ capabilityProfileVersion
+ capabilityName
+ errorCode
```

同一个 key 下的重复上报不需要重复收集页面。

## 快速适配闭环

推荐闭环：

```text
GitHub Action 抓到新版本
  -> 生成 fingerprint
  -> 触发 Capability Canary
  -> probe 全部 ok
      -> 标记版本兼容
  -> probe missing/degraded
      -> 平台告警
      -> kt-im-plugins 补 fixture
      -> 开发插件 hotfix
      -> 内部验证
      -> 小范围 rollout
      -> 扩大 rollout
```

如果 canary 发现高风险能力缺失，例如发送能力不确定：

- 平台可以先下发禁用或 fallback strategy。
- 插件 hotfix 走正常 artifact 发布链路。
- host pin 只作为短期止血，不作为默认手段。

## Artifact 和 OSS 关系

本仓库适合保存版本索引、HTML 快照和检测元数据。

大型或敏感产物建议放对象存储：

- 静态资源包归档。
- canary 运行日志。
- 截图或视频。
- L2 脱敏诊断包。

对象存储条目必须有：

- checksum。
- 过期策略。
- 访问审计。
- 与 `hostAppVersion`、fingerprint、traceId 的关联。

插件 runtime artifact 不应由本仓库直接发布给 Desktop。插件 artifact 仍由 `kt-im-plugins` 构建，并通过 `kt-plugin-platform` 注册和分发。

## 不做什么

本仓库不负责：

- 管理客户插件发布规则。
- 决定客户是否回滚。
- 存储客户聊天内容。
- 存储 cookies、token、localStorage、IndexedDB 原文。
- 直接向 Desktop 分发插件 runtime。
- 默认开启远程调试。

## 阶段规划

### 阶段 A：资源指纹

- 保留现有 HTML 抓取。
- 解析 script/css URL。
- 生成 fingerprint。
- 输出资源索引。

### 阶段 B：静态能力预检

- 静态检查 HTML 是否包含关键 bootloader 信息。
- 检查资源入口是否完整。
- 标记版本是否可加载。

### 阶段 C：登录后 Capability Canary

- 使用内部测试账号。
- 启动受控 Electron/Playwright。
- 注入 capability probe。
- 输出 capability report。

### 阶段 D：平台联动

- 将 canary report 上报到 `kt-plugin-platform`。
- 缺失能力触发告警和适配任务。
- 与 `kt-im-plugins` fixtures 形成闭环。

## 验收标准

- 新版本出现后，系统能自动生成 fingerprint。
- 同一个 fingerprint 的客户问题能自动去重。
- canary 能区分“HTML 已抓取”和“登录后能力可用”。
- 发送、读取、Store、DOM selector 的关键能力都有检测结果。
- 客户无需默认上传完整页面。
- 远程调试不是常规流程。
