# Deployment Guide

## 1) Prepare cloud environment

1. Create/select WeChat Cloud environment.
2. Ensure `CLOUD_ENV_ID` and `CLOUD_STORAGE_FILEID_ENV` in `miniprogram/app.js` match your environment.

## 2) Configure cloud function env vars

Set in cloud console:

- `BAIDU_API_KEY`
- `BAIDU_SECRET_KEY`
- `BAIDU_TTS_PER` (optional)
- `DEEPSEEK_API_KEY`
- `ADMIN_ANALYTICS_TOKEN`

## 3) Deploy cloud functions

Functions to deploy:

- `baiduTts`
- `deepseekStory`
- `reportAnalytics`
- `adminAnalytics`

Note:

- `quickstartFunctions` is a retained legacy sample function and is not required for current business flow.

For each function:

1. Open `cloudfunctions/<name>`
2. Install deps (`npm install`)
3. Upload & deploy in WeChat DevTools

## 4) Initialize database

Create collections:

- `words`
- `analytics_user_day`

Add recommended indexes from `docs/DB.md`.

## 5) Smoke verification

1. Open app home page.
2. Enter learning flow and verify TTS works.
3. Enter story generation flow and verify result/fallback.
4. Complete one study/review group and verify analytics write path.

## 6) Release

1. Build and preview in WeChat DevTools.
2. Run local checks: `npm run ci`
3. Upload code and submit for review/release.
