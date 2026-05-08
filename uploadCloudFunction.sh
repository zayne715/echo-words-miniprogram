#!/usr/bin/env bash
# !!!警告：本脚本仅为 WeChat 官方 quickstartFunctions 遗留示例，不应在生产环境执行!!!
# 生产部署请参阅 docs/DEPLOY.md，按项目云函数逐一部署：
#   baiduTts / deepseekStory / reportAnalytics / adminAnalytics
#
# quickstartFunctions 不被任何业务代码调用，无需上线。
echo "ERROR: 此脚本仅为历史遗留示例，已被禁用，不可在生产执行。" >&2
echo "生产部署请参阅 docs/DEPLOY.md（baiduTts / deepseekStory / reportAnalytics / adminAnalytics）。" >&2
exit 1
# --- 以下命令已被禁用，保留仅作历史参考 ---
# ${installPath} cloud functions deploy --e ${envId} --n quickstartFunctions --r --project ${projectPath}
