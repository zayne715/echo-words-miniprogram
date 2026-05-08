/**
 * 根据所选单词与风格组装故事展示块（对齐 Figma 60:727 版式与示例文案）。
 */

const GENRE_LABEL = {
  cultivation: "Cultivation",
  urban: "Urban Powers",
  survival: "Doomsday Survival",
  epic: "Epic Court",
  heartbeat: "Sweet Romantic",
};

const GENRE_TITLE = {
  cultivation: "The Jade Path",
  urban: "The Road of Ambition",
  survival: "Last Light",
  epic: "Crown Games",
  heartbeat: "Soft Morning",
};

function figmaUrbanTriple() {
  return {
    title: GENRE_TITLE.urban,
    genreLabel: GENRE_LABEL.urban,
    blocks: [
      {
        enParts: [
          { type: "text", text: "The young coder chose to " },
          { type: "word", text: "abandon" },
          {
            type: "text",
            text: " his safe routine and chase a strange signal hidden in an old system.",
          },
        ],
        zh: "年轻的程序员决定放弃安稳的生活，去追寻一个藏在旧系统里的神秘信号。",
      },
      {
        enParts: [
          { type: "text", text: "As he explored deeper, the code began to " },
          { type: "word", text: "absorb" },
          { type: "text", text: " his thoughts, echoing his fears and dreams." },
        ],
        zh: "当他不断深入时，这段代码开始吸收他的思想，映射出他的恐惧与愿望。",
      },
      {
        enParts: [
          { type: "text", text: "In the end, he didn’t just solve the mystery—he managed to " },
          { type: "word", text: "achieve" },
          { type: "text", text: " something greater: understanding himself." },
        ],
        zh: "最终，他不仅解开了谜团，还实现了更重要的事——真正理解了自己。",
      },
    ],
  };
}

function buildGenericBlocks(words) {
  const w = words.slice(0, 3).map((x) => String(x || "").trim()).filter(Boolean);
  while (w.length < 3) {
    w.push(w[w.length - 1] || "hope");
  }
  const [a, b, c] = w;
  return [
    {
      enParts: [
        { type: "text", text: "In a quiet moment, they chose to " },
        { type: "word", text: a },
        { type: "text", text: " — and the room felt different." },
      ],
      zh: `在静谧的一刻，一切因「${a}」而改变。`,
    },
    {
      enParts: [
        { type: "text", text: "The story began to " },
        { type: "word", text: b },
        { type: "text", text: " new meaning with every step forward." },
      ],
      zh: `随着前行，「${b}」不断赋予这段旅程新的意义。`,
    },
    {
      enParts: [
        { type: "text", text: "What mattered most was to " },
        { type: "word", text: c },
        { type: "text", text: " something true — even if it was small." },
      ],
      zh: `最重要的是去「${c}」一些真实的东西——哪怕它很小。`,
    },
  ];
}

/**
 * @param {string[]} words
 * @param {string} genreKey
 */
function buildStoryFromWords(words, genreKey) {
  const list = Array.isArray(words) ? words : [];
  const lower = list.map((x) => String(x).toLowerCase());
  const isDemoTriple =
    lower.length === 3 &&
    lower[0] === "abandon" &&
    lower[1] === "absorb" &&
    lower[2] === "achieve" &&
    genreKey === "urban";

  if (isDemoTriple) {
    const figma = figmaUrbanTriple();
    return {
      title: figma.title,
      metaLine: `${figma.genreLabel} · Generated just now`,
      blocks: figma.blocks,
      plainEn: figma.blocks
        .map((b) =>
          b.enParts
            .map((p) => p.text)
            .join("")
        )
        .join("\n\n"),
      plainZh: figma.blocks.map((b) => b.zh).join("\n\n"),
      genreKey: "urban",
      genreLabel: GENRE_LABEL.urban,
    };
  }

  const g = genreKey && GENRE_LABEL[genreKey] ? genreKey : "urban";
  const blocks = buildGenericBlocks(list.length ? list : ["word"]);
  const title = GENRE_TITLE[g] || GENRE_TITLE.urban;
  const genreLabel = GENRE_LABEL[g] || GENRE_LABEL.urban;
  return {
    title,
    metaLine: `${genreLabel} · Generated just now`,
    blocks,
    plainEn: blocks
      .map((b) =>
        b.enParts
          .map((p) => p.text)
          .join("")
      )
      .join("\n\n"),
    plainZh: blocks.map((b) => b.zh).join("\n\n"),
    genreKey: g,
    genreLabel,
  };
}

module.exports = {
  buildStoryFromWords,
  GENRE_LABEL,
};
