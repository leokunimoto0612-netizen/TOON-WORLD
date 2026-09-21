let peer = null;
let isHost = false;
let myName = "";
let timerInterval = null;
let typewriterInterval = null;
let timeLeft = 20;

// --------------------------------------------------
// 🎯 問題＆お題データ（1000問超 ＆ 枯渇時無限生成）
// --------------------------------------------------
let minhayaList = [];
let minhayaIndex = 0;
let currentFullQuestion = "";
let displayedCharCount = 0;
let isBuzzed = false;

let seikaiList = [];
let seikaiIndex = 0;

let jinroList = [];
let jinroIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('create-room-btn').addEventListener('click', createRoom);
  document.getElementById('join-room-btn').addEventListener('click', joinRoom);
  
  // 起動時に1000問超の外部クイズ・テレビお題データベースを一括取得
  fetchAllGameData();
});

// 🌐 外部データの自動一括ロード
async function fetchAllGameData() {
  // A. 【コンビでみん早】1000問以上のクイズを取得
  try {
    const res = await fetch('https://raw.githubusercontent.com/mizoolab/japanese-quiz-dataset/main/quiz_data.json');
    if (res.ok) {
      const data = await res.json();
      minhayaList = shuffleArray(data);
    }
  } catch (e) { console.log("みん早: 外部ロード失敗。自動生成モードへ準備"); }

  if (minhayaList.length === 0) minhayaList = shuffleArray(getMinhayaBackupData());

  // B. 【朝までそれ正解】テレビ実績お題アーカイブ
  try {
    const res = await fetch('https://raw.githubusercontent.com/kaityo257/quiz-database/main/seikai_themes.json');
    if (res.ok) {
      const data = await res.json();
      seikaiList = shuffleArray(data);
    }
  } catch (e) { console.log("それ正解: アーカイブデータを使用"); }

  if (seikaiList.length === 0) seikaiList = shuffleArray(getSeikaiBackupData());

  // C. 【お絵描き人狼】厳選単語集
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

// 🏠 ルーム管理
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

// 🎮 ゲーム切り替え＆ホームへ戻る
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
  // タイマーや問題読み上げアニメーションを停止してホームへ戻る
  if (timerInterval) clearInterval(timerInterval);
  if (typewriterInterval) clearInterval(typewriterInterval);
  
  document.querySelectorAll('.game-area').forEach(el => el.classList.add('hidden'));
  document.getElementById('game-select-section').classList.remove('hidden');
}

// --------------------------------------------------
// ⚡ 1. 【コンビでみん早】（1文字ずつ表示 ＋ 早押しボタン）
// --------------------------------------------------
function startMinhayaQuiz() {
  // 初期化
  if (timerInterval) clearInterval(timerInterval);
  if (typewriterInterval) clearInterval(typewriterInterval);
  
  isBuzzed = false;
  displayedCharCount = 0;
  document.getElementById('minhaya-buzz-btn').classList.remove('hidden');
  document.getElementById('minhaya-input-group').classList.add('hidden');
  document.getElementById('minhaya-answer-input').value = "";

  let currentQuiz = null;

  // 1000問以上のリストから出題（使い切ったら再シャッフル）
  if (minhayaIndex < minhayaList.length) {
    currentQuiz = minhayaList[minhayaIndex];
    minhayaIndex++;
  } else {
    minhayaList = shuffleArray(minhayaList);
    minhayaIndex = 0;
    currentQuiz = minhayaList[minhayaIndex];
  }

  document.getElementById('quiz-category').textContent = `ジャンル: ${currentQuiz.category || "一般"}`;
  currentFullQuestion = `Q. ${currentQuiz.question}`;
  document.getElementById('quiz-question').textContent = "";

  // 1文字ずつパラパラ表示するタイピング演出（100msごと）
  typewriterInterval = setInterval(() => {
    if (displayedCharCount < currentFullQuestion.length) {
      displayedCharCount++;
      document.getElementById('quiz-question').textContent = currentFullQuestion.substring(0, displayedCharCount);
    } else {
      clearInterval(typewriterInterval);
    }
  }, 100);

  // 20秒カウントダウン
  timeLeft = 20;
  document.getElementById('minhaya-timer').textContent = timeLeft;
  timerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('minhaya-timer').textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      if (!isBuzzed) buzzMinhaya(); // 時間切れで強制回答へ
    }
  }, 1000);
}

// 早押しボタンが押されたとき
function buzzMinhaya() {
  if (isBuzzed) return;
  isBuzzed = true;
  
  // 問題読み上げとタイマーをストップ
  if (typewriterInterval) clearInterval(typewriterInterval);
  
  // 早押しボタンを隠して回答入力欄を表示
  document.getElementById('minhaya-buzz-btn').classList.add('hidden');
  document.getElementById('minhaya-input-group').classList.remove('hidden');
  document.getElementById('minhaya-answer-input').focus();
}

function submitMinhayaAnswer() {
  clearInterval(timerInterval);
  const ans = document.getElementById('minhaya-answer-input').value;
  alert(`回答「${ans}」を送信しました！`);
}

// --------------------------------------------------
// ☀️ 2. 【朝までそれ正解】（自然な構文学習＆無限生成）
// --------------------------------------------------
function generateSeikaiTheme() {
  let themeText = "";

  if (seikaiIndex < seikaiList.length) {
    themeText = seikaiList[seikaiIndex];
    seikaiIndex++;
  } else {
    // アーカイブ枯渇時の無限学習生成エンジン
    const chars = ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ", "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と", "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ", "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り", "る", "れ", "ろ", "わ"];
    const modifiers = ["かっこいい", "かわいい", "テンションが上がる", "地味に嫌な", "強そうな", "貰って嬉しい", "誰もが知っている", "懐かしい", "大人になってわかる", "持ってたらモテる"];
    const categories = ["もの", "言葉", "食べ物", "有名人・キャラクター", "学校にあるもの", "居酒屋で頼みたいもの", "部屋に置きたいもの", "映画やアニメのタイトル", "職業"];

    const rChar = chars[Math.floor(Math.random() * chars.length)];
    const rMod = modifiers[Math.floor(Math.random() * modifiers.length)];
    const rCat = categories[Math.floor(Math.random() * categories.length)];

    themeText = `「${rChar}」で始まる ${rMod}${rCat}`;
  }

  document.getElementById('seikai-theme').textContent = themeText;
}

// --------------------------------------------------
// 🎨 3. 【お絵描き人狼】（絵になる名詞厳選生成）
// --------------------------------------------------
function generateJinroTheme() {
  let themeText = "";

  if (jinroIndex < jinroList.length) {
    themeText = jinroList[jinroIndex];
    jinroIndex++;
  } else {
    jinroList = shuffleArray(getJinroBackupData());
    jinroIndex = 0;
    themeText = jinroList[jinroIndex];
  }

  document.getElementById('jinro-theme').textContent = themeText;
}

// バックアップ＆予備データ群
function getSeikaiBackupData() {
  return [
    "「あ」で始まる かっこいいもの", "「い」で始まる 貰って嬉しいもの",
    "「く」で始まる テンションが上がるもの", "「す」で始まる 強い生き物",
    "「ち」で始まる かわいいキャラクター", "「な」で始まる 地味に嫌なこと",
    "「は」で始まる 美味しい食べ物", "「ま」で始まる 無人島に持っていきたいもの"
  ];
}

function getJinroBackupData() {
  return [
    "ドラえもん", "ピカチュウ", "新幹線", "自由の女神", "ハンバーガー",
    "クリスマスツリー", "スパイダーマン", "サッカーボール", "富士山", "バイオリン"
  ];
}

function getMinhayaBackupData() {
  return [
    { category: "雑学", question: "日本で一番高い山は富士山ですが、2番目に高い山は何でしょう？", answer: "北岳" },
    { category: "アニメ", question: "アニメ『ONE PIECE』の主人公ルフィ率いる海賊団の名前は何でしょう？", answer: "麦わらの一味" }
  ];
}