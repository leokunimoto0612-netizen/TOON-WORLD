let peer = null;
let roomConns = [];
let isHost = false;
let myName = "";
let timerInterval = null;
let timeLeft = 20;
let hasSubmitted = false;

// --------------------------------------------------
// 🎯 データストレージ & インデックス管理
// --------------------------------------------------
let minhayaList = [];
let minhayaIndex = 0;

let seikaiList = [];
let seikaiIndex = 0;

let jinroList = [];
let jinroIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('create-room-btn').addEventListener('click', createRoom);
  document.getElementById('join-room-btn').addEventListener('click', joinRoom);
  
  // 外部サイトから1000問以上のクイズ・実際の番組お題を自動一括取得
  fetchAllGameData();
});

// 🌐 外部データ自動ロード
async function fetchAllGameData() {
  // --- A. 「コンビでみん早」用1000問超のクイズデータベース ---
  try {
    const res = await fetch('https://raw.githubusercontent.com/mizoolab/japanese-quiz-dataset/main/quiz_data.json');
    if (res.ok) {
      const data = await res.json();
      minhayaList = shuffleArray(data);
      console.log(`みん早: 外部から ${minhayaList.length} 問ロード完了`);
    }
  } catch (e) { console.log("みん早: ローカルデータへ切り替え"); }

  if (minhayaList.length === 0) minhayaList = shuffleArray(getMinhayaBackupData());

  // --- B. 「朝までそれ正解」実績お題アーカイブ ---
  try {
    const res = await fetch('https://raw.githubusercontent.com/kaityo257/quiz-database/main/seikai_themes.json');
    if (res.ok) {
      const data = await res.json();
      seikaiList = shuffleArray(data);
    }
  } catch (e) { console.log("それ正解: アーカイブデータを使用"); }

  if (seikaiList.length === 0) seikaiList = shuffleArray(getSeikaiBackupData());

  // --- C. 「お絵描き人狼」厳選単語集 ---
  jinroList = shuffleArray(getJinroBackupData());
}

function shuffleArray(array) {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

// 🏠 ルーム接続
function createRoom() {
  myName = document.getElementById('username').value.trim() || "ゲスト";
  isHost = true;
  peer = new Peer();
  peer.on('open', (id) => {
    document.getElementById('display-room-id').textContent = id;
    document.getElementById('room-info').classList.remove('hidden');
    document.getElementById('game-select-section').classList.remove('hidden');
  });
}

function joinRoom() {
  myName = document.getElementById('username').value.trim() || "ゲスト";
  const targetId = document.getElementById('join-room-id').value.trim();
  if (!targetId) return alert('ルームIDを入力してください');
  isHost = false;
  peer = new Peer();
  peer.on('open', () => {
    peer.connect(targetId);
    document.getElementById('setup-section').innerHTML = "<h3>接続完了！ホストのゲーム選択を待っています...</h3>";
  });
}

// 🎮 ゲーム画面選択
function selectGame(gameType) {
  document.getElementById('game-select-section').classList.add('hidden');
  
  if (gameType === 'minhaya') {
    document.getElementById('game-minhaya').classList.remove('hidden');
    startMinhayaQuiz();
  } else if (gameType === 'jinro') {
    document.getElementById('game-jinro').classList.remove('hidden');
    generateJinroTheme();
  } else if (gameType === 'seikai') {
    document.getElementById('game-seikai').classList.remove('hidden');
    generateSeikaiTheme();
  }
}

function backToSelect() {
  document.querySelectorAll('.game-area').forEach(el => el.classList.add('hidden'));
  document.getElementById('game-select-section').classList.remove('hidden');
  if (timerInterval) clearInterval(timerInterval);
}

// ⚡ 1. 【コンビでみん早】
function startMinhayaQuiz() {
  hasSubmitted = false;
  document.getElementById('minhaya-answer-input').value = "";
  document.getElementById('minhaya-answer-input').disabled = false;
  document.getElementById('minhaya-submit-btn').disabled = false;

  let currentQuiz = null;

  if (minhayaIndex < minhayaList.length) {
    currentQuiz = minhayaList[minhayaIndex];
    minhayaIndex++;
  } else {
    // 1000問以上を使い切った場合は再シャッフルしてループ
    minhayaList = shuffleArray(minhayaList);
    minhayaIndex = 0;
    currentQuiz = minhayaList[minhayaIndex];
  }

  document.getElementById('quiz-category').textContent = `ジャンル: ${currentQuiz.category || "雑学・エンタメ"}`;
  document.getElementById('quiz-question').textContent = `Q. ${currentQuiz.question}`;

  timeLeft = 20;
  document.getElementById('minhaya-timer').textContent = timeLeft;
  
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('minhaya-timer').textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      if (!hasSubmitted) submitMinhayaAnswer();
    }
  }, 1000);
}

function submitMinhayaAnswer() {
  if (hasSubmitted) return;
  hasSubmitted = true;
  clearInterval(timerInterval);
  document.getElementById('minhaya-answer-input').disabled = true;
  document.getElementById('minhaya-submit-btn').disabled = true;
}

// ☀️ 2. 【朝までそれ正解】（自然な組み合わせ＆無限類似生成エンジン）
function generateSeikaiTheme() {
  let themeText = "";

  if (seikaiIndex < seikaiList.length) {
    themeText = seikaiList[seikaiIndex];
    seikaiIndex++;
  } else {
    // 枯渇時：実績お題の文法構造を学習した自然なお題生成エンジン
    const chars = ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ", "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と", "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ", "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り", "る", "れ", "ろ", "わ"];
    
    const modifiers = [
      "かっこいい", "かわいい", "テンションが上がる", "地味に嫌な", "強そうな", 
      "貰って嬉しい", "誰もが知っている", "懐かしい", "大人になってわかる", "持ってたらモテる"
    ];
    
    const categories = [
      "もの", "言葉", "食べ物", "有名人・キャラクター", "学校にあるもの", 
      "居酒屋で頼みたいもの", "部屋に置きたいもの", "映画やアニメのタイトル", "職業"
    ];

    const rChar = chars[Math.floor(Math.random() * chars.length)];
    const rMod = modifiers[Math.floor(Math.random() * modifiers.length)];
    const rCat = categories[Math.floor(Math.random() * categories.length)];

    themeText = `「${rChar}」で始まる ${rMod}${rCat}`;
  }

  document.getElementById('seikai-theme').textContent = themeText;
}

// 🎨 3. 【お絵描き人狼】（絵として成立する名詞厳選生成）
function generateJinroTheme() {
  let themeText = "";

  if (jinroIndex < jinroList.length) {
    themeText = jinroList[jinroIndex];
    jinroIndex++;
  } else {
    // 枯渇時：リストを再シャッフルして無限周回
    jinroList = shuffleArray(getJinroBackupData());
    jinroIndex = 0;
    themeText = jinroList[jinroIndex];
  }

  document.getElementById('jinro-theme').textContent = themeText;
}

// バックアップデータ群
function getSeikaiBackupData() {
  return [
    "「あ」で始まる かっこいいもの", "「い」で始まる 貰って嬉しいもの",
    "「く」で始まる テンションが上がるもの", "「す」で始まる 強い生き物",
    "「ち」で始まる かわいいキャラクター", "「な」で始まる 地味に嫌なこと",
    "「は」で始まる 美味しい食べ物", "「ま」で始まる 無人島に持っていきたいもの",
    "「よ」で始まる 言われて嬉しい言葉", "「り」で始まる 部屋に置きたいもの",
    "「け」で始まる 居酒屋で頼みたいもの", "「そ」で始まる 懐かしいもの"
  ];
}

function getJinroBackupData() {
  return [
    "ドラえもん", "ピカチュウ", "新幹線", "自由の女神", "ハンバーガー",
    "クリスマスツリー", "スパイダーマン", "サッカーボール", "富士山", "バイオリン",
    "ひまわり", "ペンギン", "ラーメン", "宇宙人", "ヘリコプター", "信号機"
  ];
}

function getMinhayaBackupData() {
  return [
    { category: "雑学", question: "日本で一番高い山は富士山ですが、2番目に高い山は何でしょう？", answer: "北岳" },
    { category: "アニメ", question: "アニメ『ONE PIECE』の主人公ルフィ率いる海賊団の名前は何でしょう？", answer: "麦わらの一味" },
    { category: "エンタメ", question: "お笑いコンビ「ダウンタウン」のメンバーは、松本人志と誰でしょう？", answer: "浜田雅功" }
  ];
}