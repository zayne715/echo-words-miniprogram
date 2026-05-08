const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_STORY_WORDS = 20;

function formatDateLabelFromPick(y, m, d) {
  return `${MONTH_LABELS[m]} ${d}`;
}

function buildCalendarRows(viewYear, viewMonth, pickedYear, pickedMonth, pickedDay) {
  const firstDay = new Date(viewYear, viewMonth, 1);
  const firstDow = firstDay.getDay();
  const monStartIndex = (firstDow + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < monStartIndex; i++) cells.push({ isDay: false });
  for (let d = 1; d <= daysInMonth; d++) {
    const isSelected =
      pickedYear === viewYear && pickedMonth === viewMonth && pickedDay === d;
    cells.push({ isDay: true, day: d, isSelected });
  }
  while (cells.length % 7 !== 0) cells.push({ isDay: false });
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function buildSelectedSheetListFromGroups(groups) {
  const out = [];
  (groups || []).forEach((g, groupIndex) => {
    (g.words || []).forEach((w, wordIndex) => {
      if (w.selected) {
        out.push({
          word: w.word,
          groupIndex,
          wordIndex,
          chipKey: `${groupIndex}_${wordIndex}`,
        });
      }
    });
  });
  return out;
}

function showMaxStoryWordsToast() {
  wx.showToast({
    title: `Maximum ${MAX_STORY_WORDS} words can be selected.`,
    icon: "none",
  });
}

function filterReviewGroupsForPickedDay(groups, pickedYear, pickedMonth, pickedDay, dayKeyFromDate) {
  const y = Number(pickedYear);
  const m = Number(pickedMonth);
  const d = Number(pickedDay);
  if (!y || Number.isNaN(m) || Number.isNaN(d)) return groups || [];
  const targetKey = dayKeyFromDate(new Date(y, m, d));
  return (groups || []).filter((g) => {
    const ts = g && g.createdAt;
    if (ts == null || ts === "") return false;
    const gKey = dayKeyFromDate(new Date(Number(ts)));
    return gKey === targetKey;
  });
}

module.exports = {
  MONTH_LABELS,
  MAX_STORY_WORDS,
  formatDateLabelFromPick,
  buildCalendarRows,
  buildSelectedSheetListFromGroups,
  showMaxStoryWordsToast,
  filterReviewGroupsForPickedDay,
};
