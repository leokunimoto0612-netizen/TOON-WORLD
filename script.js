let peer = null;
let roomConns = [];
let isHost = false;
let myName = "";
let timerInterval = null;
let timeLeft = 20;
let hasSubmitted = false;

// クイズ管理用変数
let allQuizzes = [];      // 厳選問題データベース
let shuffledQuizzes = []; // シャッフル済みの出題用リスト
let currentQuizIndex = 0;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('create-room-btn').addEventListener('click', createRoom);
  document.getElementById('join-room-btn').addEventListener('click', joinRoom);
  
  // みん早 B/Cランク級クイズデータベースの初期化
  initQuizDatabase();
});

// みん早B〜Cランクレベルの厳選クイズ群（雑学・アニメ・エンタメ・スポーツ）
function initQuizDatabase() {
  allQuizzes = [
    // --- 雑学（B~Cランク） ---
    { id: 1, category: "雑学", question: "日本で一番高い山は富士山ですが、2番目に高い山は何でしょう？", answer: "北岳" },
    { id: 2, category: "雑学", question: "慣用句で、非常に珍しいことや滅多にないことを「何が西から昇る」というでしょう？", answer: "太陽" },
    { id: 3, category: "雑学", question: "トランプの4つの絵柄のうち、唯一「赤」ではなく黒で描かれている「スペード」と何でしょう？", answer: "クラブ" },
    { id: 4, category: "雑学", question: "サイコロの向かい合う面の数を足すと、必ずいくつになるでしょう？", answer: "7" },
    { id: 5, category: "雑学", question: "パスカルの原理や気圧の単位に名を残す科学者パスカルが言った言葉「人間は考える『何』」でしょう？", answer: "葦" },
    { id: 6, category: "雑学", question: "将棋の盤面はマス目が81ありますが、チェスの盤面はマス目がいくつあるでしょう？", answer: "64" },
    { id: 7, category: "雑学", question: "10月9日は「トラックの日」ですが、では11月9日は何の日でしょう？", answer: "119番の日" },
    { id: 8, category: "雑学", question: "元素記号「Au」で表される金属は「金」ですが、「Ag」で表される金属は何でしょう？", answer: "銀" },

    // --- アニメ・ゲーム（B~Cランク） ---
    { id: 9, category: "アニメ・ゲーム", question: "アニメ『ONE PIECE』で、主人公ルフィが食べた悪魔の実の本当の名前は何でしょう？", answer: "ヒトヒトの実" },
    { id: 10, category: "アニメ・ゲーム", question: "『ポケットモンスター』で、最初に選べる3匹のポケモンのタイプは「くさ」「ほのお」と何でしょう？", answer: "みず" },
    { id: 11, category: "アニメ・ゲーム", question: "スタジオジブリの映画『千と千尋の神隠し』で、ハクの本当の名前は何でしょう？", answer: "ニギハヤミコハクヌシ" },
    { id: 12, category: "アニメ・ゲーム", question: "『ドラゴンボール』の主人公・孫悟空が乗る、清い心を持つ人しか乗れない雲の名前は何でしょう？", answer: "筋斗雲" },
    { id: 13, category: "アニメ・ゲーム", question: "ゲーム『スーパーマリオブラザーズ』で、マリオが取ると大きくなるキノコの名前は何でしょう？", answer: "スーパーキノコ" },
    { id: 14, category: "アニメ・ゲーム", question: "アニメ『名探偵コナン』で、コナンが所属している少年探偵団の顧問の先生は誰でしょう？", answer: "小林澄子" },
    { id: 15, category: "アニメ・ゲーム", question: "『進撃の巨人』で、主人公エレン・イェーガーが所属する兵団は何でしょう？", answer: "調査兵団" },

    // --- エンタメ（B~Cランク） ---
    { id: 16, category: "エンタメ", question: "お笑いコンビ「ダウンタウン」のメンバーは、松本人志と誰でしょう？", answer: "浜田雅功" },
    { id: 17, category: "エンタメ", question: "映画『ハリー・ポッター』シリーズで、ハリーが所属するホグワーツの寮はどこでしょう？", answer: "グリフィンドール" },
    { id: 18, category: "エンタメ", question: "日本レコード大賞で、男性ソロアーティストとして史上初めて大賞を受賞した歌手は誰でしょう？", answer: "尾崎豊" },
    { id: 19, category: "エンタメ", question: "お笑いコンビ「サンドウィッチマン」のふたりの出身都道府県はどこでしょう？", answer: "宮城県" },
    { id: 20, category: "エンタメ", question: "日本の人気バンド「Mrs. GREEN APPLE」のボーカル・ギターを務める人物は誰でしょう？", answer: "大森元貴" },

    // --- スポーツ（B~Cランク） ---
    { id: 21, category: "スポーツ", question: "サッカーで1試合に同じ選手が3得点以上挙げることを何というでしょう？", answer: "ハットトリック" },
    { id: 22, category: "スポーツ", question: "バスケットボールで、3ポイントラインの内側から放たれたシュートが決まると何点入るでしょう？", answer: "2点" },
    { id: 23, category: "スポーツ", question: "野球で、バッターがノーヒットで一塁に出る方法のうち、デッドボールと何でしょう？", answer: "フォアボール" },
    { id: 24, category: "スポーツ", question: "大相撲の本場所で、一年に開催される本場所は全部で何場所でしょう？", answer: "6場所" },
    { id: 25, category: "スポーツ", question: "オリンピックの五輪のマーク（シンボル）に使われている5色とは、青、黄、黒、緑と何色でしょう？", answer: "赤" }
  ];
}

// 配列を完全ランダムにシャッフルするアルゴリズム（フィッシャー–イェーツ）
function shuffleArray(array) {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

// ルーム作成（ホスト）
function createRoom() {
  myName = document.getElementById('username').value.trim() || "ゲスト";
  isHost = true;
  peer = new Peer();

  peer.on('open', (id) => {
    document.getElementById('display-room-id').textContent = id;
    document.getElementById('room-info').classList.remove('hidden');
    document.getElementById('game-select-section').classList.remove('hidden');
  });

  peer.on('connection', (conn) => {
    roomConns.push(conn);
    setupConnection(conn);
  });
}

// ルーム参加（ゲスト）
function joinRoom() {
  myName = document.getElementById('username').value.trim() || "ゲスト";
  const targetId = document.getElementById('join-room-id').value.trim();
  if (!targetId) return alert('ルームIDを入力してください');

  isHost = false;
  peer = new Peer();

  peer.on('open', () => {
    const conn = peer.connect(targetId);
    roomConns.push(conn);
    setupConnection(conn);
    document.getElementById('setup-section').innerHTML = "<h3>接続完了！ホストのゲーム開始を待っています...</h3>";
  });
}

function setupConnection(conn) {
  conn.on('data', (data) => {
    handleNetworkData(data);
  });
}

// ゲーム選択処理
function selectGame(gameType) {
  if (gameType === 'minhaya') {
    document.getElementById('game-select-section').classList.add('hidden');
    document.getElementById('game-minhaya').classList.remove('hidden');
    
    // 全問題をランダムシャッフルして出題順を初期化
    shuffledQuizzes = shuffleArray(allQuizzes);
    currentQuizIndex = 0;
    
    startMinhayaQuiz();
  } else if (gameType === 'jinro') {
    document.getElementById('game-select-section').classList.add('hidden');
    document.getElementById('game-jinro').classList.remove('hidden');
  } else if (gameType === 'seikai') {
    document.getElementById('game-select-section').classList.add('hidden');
    document.getElementById('game-seikai').classList.remove('hidden');
  }
}

// 【コンビでみん早】クイズ開始＆カウントダウン処理
function startMinhayaQuiz() {
  hasSubmitted = false;
  document.getElementById('minhaya-answer-input').value = "";
  document.getElementById('minhaya-answer-input').disabled = false;
  document.getElementById('minhaya-submit-btn').disabled = false;

  // 出題リストが一巡したら再度シャッフル
  if (currentQuizIndex >= shuffledQuizzes.length) {
    shuffledQuizzes = shuffleArray(allQuizzes);
    currentQuizIndex = 0;
  }

  const quiz = shuffledQuizzes[currentQuizIndex];
  document.getElementById('quiz-category').textContent = `ジャンル: ${quiz.category}`;
  document.getElementById('quiz-question').textContent = `Q. ${quiz.question}`;

  // 20秒カウントダウンスタート
  timeLeft = 20;
  document.getElementById('minhaya-timer').textContent = timeLeft;
  
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('minhaya-timer').textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      if (!hasSubmitted) {
        submitMinhayaAnswer();
      }
    }
  }, 1000);
}

// 回答の送信
function submitMinhayaAnswer() {
  if (hasSubmitted) return;
  hasSubmitted = true;
  clearInterval(timerInterval);

  const ans = document.getElementById('minhaya-answer-input').value.trim() || "(無回答)";
  document.getElementById('minhaya-answer-input').disabled = true;
  document.getElementById('minhaya-submit-btn').disabled = true;

  console.log("送信された回答:", ans);
}

// 次の問題へ
function nextMinhayaQuiz() {
  currentQuizIndex++;
  startMinhayaQuiz();
}

function handleNetworkData(data) {
  // 通信拡張用
}