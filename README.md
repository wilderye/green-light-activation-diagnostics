# 绿灯激活诊断器

绿灯激活诊断器是一个独立的 SillyTavern 第三方扩展，用于查看某条 AI 回复生成前，原生世界书机制里哪些绿灯条目实际加入提示词，以及哪些条目命中后被概率、预算、分组等规则挡下。

本扩展默认只使用 SillyTavern 原生扩展接口，不使用 Tavern Helper API。

## 安装

开发期可以把本仓库复制或链接到：

```text
SillyTavern/public/scripts/extensions/third-party/green-light-activation-diagnostics
```

重启或刷新 SillyTavern 后，在扩展列表中启用「绿灯激活诊断器」。

发布后可通过 SillyTavern 第三方扩展的 Git URL 安装。

## 使用

- AI 消息右上角三点菜单会出现交通灯按钮。
- 用户消息不显示此按钮。
- 点击后打开「绿灯激活诊断」面板。
- 没有记录的 AI 消息也可以点击，会显示「本条消息没有绿灯诊断记录」。
- 手机端使用接近全屏的单列面板，避免把桌面双栏硬缩小。

## 准确性边界

诊断结果分两层：

- 原生确认：哪些世界书条目最终加入提示词，以 SillyTavern 原生 `WORLD_INFO_ACTIVATED` 事件为准。
- 插件解释：触发关键词、来源楼层和短片段，由本扩展基于原生扫描输入解释匹配。

SillyTavern 当前没有公开逐词 match trace。本扩展不修改 `world-info.js`，因此「哪个楼层哪个词」是高可信解释，不伪装成原生逐词轨迹。

## 存储和清理

诊断记录会持久化到当前聊天消息中：

```text
message.swipe_info[swipe_id].extra.green_light_activation_diagnostics_v1
message.extra.green_light_activation_diagnostics_v1
```

默认只保存紧凑证据，不保存完整提示词、完整扫描文本或完整世界书内容。记录较多时聊天文件仍可能变大，设置面板提供「清除当前聊天诊断记录」按钮，并在平均记录超过 20KB 或总量超过 2MB 时提醒。

## 开发

```bash
npm test
```

测试覆盖 storage、session capture、原生 WI scan collector、绿灯过滤、关键词解释、record builder、消息按钮、响应式面板、设置清理和 controller 集成流。
