# Database Design

## Collections

## `words`

- **Purpose**: Source word bank for study/review content.
- **Consumed by**: `miniprogram/utils/wordBankCloud.js`
- **Key fields**:
  - Chinese or English aliases are both supported by normalizer
  - Required logical key: `单词` or `word`
  - Optional: `音标`/`phonetic`, `释义`/`meaning`, examples, collocations, inflections
- **Notes**:
  - normalization logic is in `normalizeCloudDoc()`
  - collection read permission must allow app users per your policy

## `analytics_user_day`

- **Purpose**: Per-user per-day aggregated analytics counters.
- **Written by**: cloud function `reportAnalytics`
- **Read by**: cloud function `adminAnalytics`
- **Main fields**:
  - `openid` (string)
  - `dateKey` (`YYYY-MM-DD`)
  - `wordsLearned`, `studyMs`, `wordsReviewed`, `reviewMs`, `appOpenCount`
  - `updatedAt` (server date)

## Index Recommendation

Create these indexes in Cloud Database console:

1. `analytics_user_day(openid, dateKey)` unique
2. `analytics_user_day(dateKey)` normal
3. `words(word)` or `words(单词)` normal (depending on your schema)

## Data Safety

- User identity is taken from cloud context (`OPENID`) in `reportAnalytics`.
- Client does not directly write analytics collection.
