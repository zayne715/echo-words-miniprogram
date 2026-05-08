# Security Notes

## Secret Management

- Do not commit production secrets to git.
- Keep API secrets in cloud function environment variables only:
  - `BAIDU_API_KEY`, `BAIDU_SECRET_KEY`
  - `DEEPSEEK_API_KEY`
  - `ADMIN_ANALYTICS_TOKEN`

## Access Control

- `adminAnalytics` is protected by token check.
- `reportAnalytics` derives user identity from cloud context (`OPENID`) rather than client input.
- Cloud DB permissions should prefer:
  - app clients: read-only where needed (`words`)
  - write operations: through cloud functions

## Input and Abuse Controls

- `reportAnalytics` clamps all numeric inputs to safe ranges.
- `adminAnalytics` enforces date format and max date range.
- `deepseekStory` and `baiduTts` return safe `ok: false` payloads on failure.

## Recommended Next Hardening

1. Rotate `ADMIN_ANALYTICS_TOKEN` periodically.
2. Add request-level rate limiting for admin endpoints.
3. Add centralized error tracking/alerts for cloud functions.
4. Add periodic dependency updates and vulnerability checks.
