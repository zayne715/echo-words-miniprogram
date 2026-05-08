# Test Plan

This document defines manual and automated verification steps before sharing, review, or release.

## 1. Test Environment

- WeChat DevTools with correct cloud environment selected
- Cloud functions deployed:
  - `baiduTts`
  - `deepseekStory`
  - `reportAnalytics`
  - `adminAnalytics`
- Database collections prepared:
  - `words`
  - `analytics_user_day`
- Required env vars configured (see `.env.example` and `docs/DEPLOY.md`)

## 2. Automated Checks

Run in repository root:

1. `npm run check:syntax`
2. `npm test`
3. `npm run ci`

Expected:

- syntax check passes
- tests pass
- CI command completes without failure

## 3. Manual Smoke Test (Core Path)

## 3.1 App Launch

- Open app, ensure home page loads without blank/error.
- Verify no blocking modal appears due to cloud initialization failure.

## 3.2 Learning Flow

1. Enter learning from home.
2. Verify page transition chain:
   - `learning` -> `word-detail`
   - `learning-next` -> `word-detail-absorb`
   - `finish` / `finish-round3` / `finish-final`
3. Verify:
   - progress bar text/width is reasonable
   - word TTS button works
   - example TTS works where available
   - back-to-home and continue buttons work

## 3.3 Review Flow

1. Enter review from home.
2. Complete at least one full review group.
3. Verify:
   - choice buttons (remember / dont-remember or know / dont-know) navigate correctly
   - progress updates correctly
   - completion page appears
   - checkpoint resume works after force-close and reopen

## 3.4 AI Story Flow

1. Select words and style in AI memory flow.
2. Enter generating page and wait for result.
3. Verify:
   - successful result route to `story-result`
   - if API unavailable, fallback path still works with user-visible message

## 4. Data and API Validation

## 4.1 Word Bank

- Confirm cloud `words` records appear in UI after refresh.
- Validate example/collocation/inflection rendering for at least 3 words.

## 4.2 Analytics

- Trigger app open + one study or review completion.
- Confirm `analytics_user_day` has expected increments for:
  - `appOpenCount`
  - `wordsLearned`/`studyMs` or `wordsReviewed`/`reviewMs`

## 4.3 Admin Analytics

- Call `adminAnalytics` with valid token and date range.
- Verify response has:
  - `ok: true`
  - `daily` array
  - `sums`
- Call with invalid token and verify unauthorized response.

## 5. Error Handling Scenarios

- Disable cloud capability in devtools, verify app degrades gracefully.
- Break `DEEPSEEK_API_KEY`, verify story generation fallback path.
- Break `BAIDU_API_KEY`, verify TTS failure toast is shown and app still usable.
- Use invalid date/token for admin analytics and verify safe error payload.

## 6. Security and Permission Checklist

- Secrets are not hardcoded in client JS.
- No `.env` committed.
- `adminAnalytics` requires token.
- Analytics write path derives user identity from cloud context (`OPENID`).
- Database write access is restricted to cloud functions where possible.

## 7. Pre-Release Checklist

- [ ] `npm run ci` passed
- [ ] smoke test passed on main user path
- [ ] cloud env vars checked
- [ ] cloud function versions up to date
- [ ] DB indexes verified
- [ ] changelog updated (`CHANGELOG.md`)
- [ ] docs updated for new behavior/API
