const WORD_IMAGE_CLOUD_DIRS = ["图片/图片", "图片", ""];
const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"];
const FILENAME_ROOT_ALIASES = {
  abandon: ["abound"],
  abound: ["abandon"],
};

function fileId(envId, dir, filename) {
  const d = String(dir || "").replace(/^\/+|\/+$/g, "");
  const fn = String(filename || "").replace(/^\/+/, "");
  if (!envId || !fn) return "";
  if (!d) return `cloud://${envId}/${fn}`;
  return `cloud://${envId}/${d}/${fn}`;
}

function padFileIndex(n) {
  const v = Math.max(1, Math.floor(Number(n) || 1));
  return String(v).padStart(4, "0");
}

function expandFilenameRoots(wordKey, displayWord) {
  const k = String(wordKey || "").toLowerCase().trim();
  const dw = String(displayWord || k)
    .trim()
    .toLowerCase();
  const roots = [];
  const push = (s) => {
    const t = String(s || "").toLowerCase().trim();
    if (t && !roots.includes(t)) roots.push(t);
  };
  const pre = FILENAME_ROOT_ALIASES[k];
  if (Array.isArray(pre)) pre.forEach((x) => push(x));
  push(k);
  if (dw && dw !== k) push(dw);
  const seenBase = roots.slice();
  seenBase.forEach((r) => {
    const al = FILENAME_ROOT_ALIASES[r];
    if (Array.isArray(al)) al.forEach((x) => push(x));
  });
  return roots;
}

function fileIdMatchesWord(fileID, wordKey, displayWord) {
  const lower = String(fileID || "").toLowerCase();
  if (!lower) return false;
  const roots = expandFilenameRoots(wordKey, displayWord);
  return roots.some((r) => {
    if (!r) return false;
    return (
      lower.indexOf(`_${r}.`) >= 0 ||
      lower.indexOf(`_${r}_`) >= 0 ||
      lower.endsWith(`/${r}.jpg`) ||
      lower.endsWith(`/${r}.jpeg`) ||
      lower.endsWith(`/${r}.png`) ||
      lower.endsWith(`/${r}.webp`)
    );
  });
}

function filterFileIdsForWord(fileIds, wordKey, displayWord) {
  const list = fileIds || [];
  const filtered = list.filter((id) => fileIdMatchesWord(id, wordKey, displayWord));
  return filtered.length ? filtered : list;
}

function buildCloudFileIdCandidates(envIds, wordKey, displayWord, orderedIndexes, maxCandidateIds) {
  const roots = expandFilenameRoots(wordKey, displayWord);
  if (!roots.length || !Array.isArray(envIds) || !envIds.length) return [];
  const nums = orderedIndexes || [];
  const out = [];
  const seen = new Set();
  const pushId = (id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    out.push(id);
    return out.length >= maxCandidateIds;
  };

  outer: for (let ei = 0; ei < envIds.length; ei++) {
    const envId = envIds[ei];
    for (let ni = 0; ni < nums.length && ni < 48; ni++) {
      const p = padFileIndex(nums[ni]);
      for (let di = 0; di < WORD_IMAGE_CLOUD_DIRS.length; di++) {
        const dir = WORD_IMAGE_CLOUD_DIRS[di];
        for (let ri = 0; ri < roots.length; ri++) {
          const root = roots[ri];
          for (let xi = 0; xi < IMAGE_EXTS.length; xi++) {
            const fn = `${p}_${root}.${IMAGE_EXTS[xi]}`;
            if (pushId(fileId(envId, dir, fn))) break outer;
          }
        }
      }
    }
  }

  if (out.length < maxCandidateIds) {
    outer2: for (let ei = 0; ei < envIds.length; ei++) {
      const envId = envIds[ei];
      for (let di = 0; di < WORD_IMAGE_CLOUD_DIRS.length; di++) {
        const dir = WORD_IMAGE_CLOUD_DIRS[di];
        for (let ri = 0; ri < roots.length; ri++) {
          const root = roots[ri];
          for (let xi = 0; xi < IMAGE_EXTS.length; xi++) {
            const fn = `${root}.${IMAGE_EXTS[xi]}`;
            if (pushId(fileId(envId, dir, fn))) break outer2;
          }
        }
      }
    }
  }
  return out;
}

function buildNumberedFileNames(wordKey, displayWord, orderedIndexes) {
  const roots = expandFilenameRoots(wordKey, displayWord);
  const nums = orderedIndexes || [];
  const names = [];
  nums.forEach((num) => {
    const p = padFileIndex(num);
    roots.forEach((root) => {
      IMAGE_EXTS.forEach((ext) => {
        const nm = `${p}_${root}.${ext}`;
        if (!names.includes(nm)) names.push(nm);
      });
    });
  });
  roots.forEach((root) => {
    IMAGE_EXTS.forEach((ext) => {
      const nm = `${root}.${ext}`;
      if (!names.includes(nm)) names.push(nm);
    });
  });
  return names;
}

module.exports = {
  WORD_IMAGE_CLOUD_DIRS,
  IMAGE_EXTS,
  fileId,
  padFileIndex,
  expandFilenameRoots,
  fileIdMatchesWord,
  filterFileIdsForWord,
  buildCloudFileIdCandidates,
  buildNumberedFileNames,
};
