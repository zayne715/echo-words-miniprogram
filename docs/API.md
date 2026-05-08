# API Contract

This project uses WeChat Cloud Functions as backend endpoints.

## `baiduTts`

- **Purpose**: Convert English word/sentence text to MP3 (base64).
- **Caller**: `miniprogram/utils/baiduTtsPlay.js`
- **Input**:
  - `text` (string, required)
  - `per` (number, optional)
- **Output**:
  - success: `{ ok: true, base64, format: "mp3", per }`
  - failure: `{ ok: false, error }`
- **Failure handling**:
  - client catches and shows toast `"播放失败"` where needed.

## `deepseekStory`

- **Purpose**: Generate bilingual story content from selected words/style.
- **Caller**: `miniprogram/pages/story-generating/index.js`
- **Input**:
  - `systemPrompt` (string, required)
  - `userContent` (string, required)
  - `genreKey` (string, optional)
  - `genreLabel` (string, optional)
  - `model` (string, optional, default `deepseek-chat`)
  - `temperature` (number, optional, default `0.55`)
- **Output**:
  - success: `{ ok: true, story }`
  - failure: `{ ok: false, errMsg, raw? }`

## `reportAnalytics`

- **Purpose**: Ingest daily per-user metrics into `analytics_user_day`.
- **Caller**: `miniprogram/utils/analyticsReport.js`
- **Input**:
  - `dateKey` (`YYYY-MM-DD`, required)
  - `wordsLearned` (int >= 0, optional)
  - `studyMsDelta` (int >= 0, optional)
  - `wordsReviewed` (int >= 0, optional)
  - `reviewMsDelta` (int >= 0, optional)
  - `appOpen` (int >= 0, optional)
- **Output**:
  - success create/update: `{ ok: true, created: true }` or `{ ok: true, updated: true }`
  - success no-op: `{ ok: true, skipped: true }`
  - failure: `{ ok: false, error }`

## `adminAnalytics`

- **Purpose**: Query aggregate analytics data for operations dashboard.
- **Input**:
  - `token` (must equal `ADMIN_ANALYTICS_TOKEN`)
  - `startDate`, `endDate` (`YYYY-MM-DD`)
- **Output**:
  - success: `{ ok: true, daily, sums, uniqueUsersInRange, ... }`
  - failure: `{ ok: false, error }`

## Error Strategy

- Backend functions return `ok: false` payloads instead of throwing to clients.
- Client side handles known failures with toast/modal and fallback behavior.
