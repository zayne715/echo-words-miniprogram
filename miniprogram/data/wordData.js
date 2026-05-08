/** 与学习/复习共用的四个词 */
const WORD_DATA = {
  abandon: {
    word: "abandon",
    phonetic: "/əˈbændən/",
    meaning: "v. 放弃；遗弃",
    examples: [
      { enPre: "The old lighthouse was ", enHighlight: "abandoned", enPost: " after years of neglect.", cn: "那座古老的灯塔因常年年久失修而被废弃。" },
      { enPre: "The mother refused to ", enHighlight: "abandon", enPost: " her sick baby.", cn: "这位母亲拒绝抛弃她生病的孩子。" },
    ],
    inflections: [["三单", "abandons"], ["过去式", "abandoned"], ["过去分词", "abandoned"], ["现在分词", "abandoning"]],
    collocations: [["abandon hope", "放弃希望"], ["abandon ship", "弃船"], ["abandon oneself to", "沉溺于"]],
  },
  absorb: {
    word: "absorb",
    phonetic: "/əbˈzɔːrb/",
    meaning: "v. 吸收；理解；使专心",
    examples: [{ enPre: "A sponge ", enHighlight: "absorbs", enPost: " water very quickly and efficiently.", cn: "海绵能快速高效地吸水。" }],
    inflections: [["三单", "absorbs"], ["过去式", "absorbed"], ["过去分词", "absorbed"], ["现在分词", "absorbing"]],
    collocations: [["absorb knowledge", "吸收知识"], ["absorb heat", "吸收热量"], ["be absorbed in", "专注于"]],
  },
  adapt: {
    word: "adapt",
    phonetic: "/əˈdæpt/",
    meaning: "v. 适应；改编",
    examples: [{ enPre: "He ", enHighlight: "adapted", enPost: " quickly to college life.", cn: "他很快适应了大学生活。" }],
    inflections: [["三单", "adapts"], ["过去式", "adapted"], ["过去分词", "adapted"], ["现在分词", "adapting"]],
    collocations: [["adapt to change", "适应变化"], ["adapt for TV", "改编为电视剧"], ["adapt oneself", "使自己适应"]],
  },
  benefit: {
    word: "benefit",
    phonetic: "/ˈbenɪfɪt/",
    meaning: "n. 益处；好处",
    examples: [{ enPre: "Reading daily brings long-term ", enHighlight: "benefit", enPost: ".", cn: "每天阅读会带来长期益处。" }],
    inflections: [["三单", "benefits"], ["过去式", "benefited"], ["过去分词", "benefited"], ["现在分词", "benefiting"]],
    collocations: [["mutual benefit", "互利"], ["benefit from", "从中受益"], ["public benefit", "公共利益"]],
  },
};

module.exports = {
  WORD_DATA,
};
