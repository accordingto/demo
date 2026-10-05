// 新使用者的歡迎文章：新增使用者時自動放進他的文章庫（B1、約 300 字、標好 5 個單字）。檔名以底線開頭，不是 API 路由。
const BODY = [
  'Welcome to Reading Club! This website helps you read English articles and learn new words at the same time. You can read an article that you paste, import from a web page, or ask the AI to write for you. Every article stays in your own library, so you can come back to it whenever you like. You do not need to be an expert. Start with short texts, read at your own speed, and enjoy learning step by step.',
  'While you read, you can click any word to hear its pronunciation. If you double-click a word, it is added to your vocabulary list on the side of the page. The words in your list are shown with a colored highlight, so you can find them again in the text very quickly. You can also select two to six words to save a whole phrase, for example “look forward to”.',
  'Try it now! Click on the word “pronunciation” in this paragraph and listen carefully. Then press the green play button at the top of the article, and the website will read the whole text to you. If you want to hear one paragraph again, use the small play button in front of it. When you are ready, press the pencil icon to edit this article, or go to Create to start a new one.',
  'Reading a little every day is one of the best ways to improve your English. Choose topics that you enjoy, keep a list of the words you want to remember, and review them often. We hope that this site makes your learning easier and more fun. Do not worry about mistakes, because everyone makes them when learning a language. The most important thing is to keep going, one article at a time. Happy reading to you!',
].join('\n\n');

const countWords = (t) => (t.match(/\S+/g) || []).length;

const WELCOME = {
  article: { title: 'Welcome to Reading Club!', body: BODY, level: 'B1', source: '', wordCount: countWords(BODY), targetWords: 300, questions: [], discussion: [] },
  vocab: [
    { word: 'vocabulary', pos: 'noun', kk: '[voˈkæbjəˌlɛri]', definition: 'all the words that a person knows or uses', zh: '字彙', lemma: '' },
    { word: 'pronunciation', pos: 'noun', kk: '[prəˌnʌnsiˈeʃən]', definition: 'the way a word is said', zh: '發音', lemma: '' },
    { word: 'highlight', pos: 'noun', kk: '[ˈhaɪˌlaɪt]', definition: 'a bright mark or color that makes something easy to see', zh: '醒目標示', lemma: '' },
    { word: 'phrase', pos: 'noun', kk: '[frez]', definition: 'a small group of words that are used together', zh: '片語', lemma: '' },
    { word: 'improve', pos: 'verb', kk: '[ɪmˈpruv]', definition: 'to become better, or to make something better', zh: '改善；提升', lemma: '' },
  ],
};

module.exports = { WELCOME };
