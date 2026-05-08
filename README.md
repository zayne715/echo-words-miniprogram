# 背单词小程序

一个以「学习轮次 + 复习反馈 + AI 辅助记忆」为核心流程的微信小程序。  
项目基于微信小程序原生框架，使用云开发承载词库、图片与语音等能力。

## 功能概览

- 学习流程：页面 1（单词与发音）+ 页面 2（词义、例句、词形）分步吸收
- 复习流程：根据记忆反馈动态推进复习进度
- 轮次管理：支持多轮学习状态流转与进度可视化
- 语音能力：接入百度 TTS 云函数，支持单词与例句朗读
- 图片能力：从云存储按词条匹配并缓存图片，减少重复下载
- AI 扩展：包含 AI 记忆与故事相关页面/云函数（按当前配置启用）

## 项目结构

- `miniprogram/`：小程序前端主代码（页面、样式、工具函数）
- `cloudfunctions/`：云函数（TTS、统计、AI 相关能力）
- `miniprogram/utils/`：核心业务工具模块（词表、进度、断点、云图、语音）
- `miniprogram/pages/`：学习/复习/完成页等业务页面

## 本地开发

1. 使用微信开发者工具打开项目根目录。
2. 将 `project.config.json` 中的 `"appid"` 改为你自己的微信小程序 AppID（[微信公众平台](https://mp.weixin.qq.com) → 开发管理 → 开发设置）。
3. 在 `miniprogram/app.js` 中将以下两个占位符替换为你自己的云环境信息：
   - `CLOUD_ENV_ID`：云开发控制台 → 环境 → 环境 ID
   - `CLOUD_STORAGE_FILEID_ENV`：云存储文件详情中复制 fileID 取 `cloud://` 与第一个 `/` 之间的部分
4. 在开发者工具中启用云开发并选择正确环境。
5. 上传并部署 `cloudfunctions/` 下需要的云函数。
6. 在云函数的环境变量中配置必要密钥（参考 `.env.example`）：
   - `baiduTts`：`BAIDU_API_KEY`、`BAIDU_SECRET_KEY`（可选 `BAIDU_TTS_PER`）
   - `deepseekStory`：`DEEPSEEK_API_KEY`
   - `adminAnalytics`：`ADMIN_ANALYTICS_TOKEN`

## 质量与测试

- 运行基础检查：`npm run check:syntax`
- 运行自动化测试：`npm test`
- 一键执行 CI 本地同款检查：`npm run ci`

当前测试聚焦纯逻辑模块（如进度计算、词库归一化），用于防止重构回归。

## 云环境说明

云环境与文件存储环境段在 `miniprogram/app.js` 中维护：

- `CLOUD_ENV_ID`
- `CLOUD_STORAGE_FILEID_ENV`

切换环境时请同步更新以上配置，并确保云函数与云存储资源在同一环境下可访问。

## 代码维护说明

- 近期已对学习/复习主链路页面进行无行为变更的结构化重构：
  - 抽离 `miniprogram/utils/pageUiHelpers.js` 统一页面交互辅助逻辑
  - 减少重复代码，统一导航高度、入场动画、发音提示、按钮过渡与断点保存
- 后续建议继续按「页面薄、状态集中、工具模块职责单一」原则迭代。

## 工程文档

- API 契约：`docs/API.md`
- 数据库设计：`docs/DB.md`
- 部署说明：`docs/DEPLOY.md`
- 安全说明：`docs/SECURITY.md`
- 测试计划：`docs/TEST_PLAN.md`

