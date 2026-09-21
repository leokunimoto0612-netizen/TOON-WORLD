// 小学生でも絶対知っている身近なお題リスト（ストック）
const BASE_ODAI_LIST = [
    "アンパンマン", "ドラえもん", "ピカチュウ", "りんご", "バナナ",
    "すいか", "いちご", "ハンバーガー", "ラーメン", "カレーライス",
    "ねこ", "いぬ", "ぞう", "きりん", "さかな", "ライオン", "ぺんぎん",
    "くるま", "ひこうき", "かんせん", "ふね", "じてんしゃ",
    "いえ", "すべりだい", "ぶらんこ", "テレビ", "スマホ", "えんぴつ",
    "メガネ", "かさ", "すし", "ケーキ", "アイス", "サッカーボール"
];

// 自動無限生成用コンビネーション（形容詞＋名詞）
const ADJECTIVES = ["でっかい", "ちいさい", "そらとぶ", "おこった", "なきむし", "黄金の", "ロボット"];
const NOUNS = ["ねこ", "いぬ", "くるま", "りんご", "さかな", "ハンバーガー", "ロボ", "ひこうき"];

function generateRandomOdai() {
    if (Math.random() < 0.7) {
        return BASE_ODAI_LIST[Math.floor(Math.random() * BASE_ODAI_LIST.length)];
    } else {
        const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
        const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
        return `${adj}${noun}`;
    }
}

let peer = null;
let connections = [];
let myName = "";
let myId = "";
let roomId = "";
let isHost = false;

let gameState = {
    players: [], // {id, name}
    settings: { wolfMode: "1-maybe0", drawMode: "10", rounds: 2, syncType: "realtime", reversal: "true" },
    odai: "",
    odaiLeaderId: "",
    wolves: [],
    turnIndex: 0,
    currentRound: 1,
    turnOrder: [],
    votes: {}, // {voterId: targetId}
    isStarted: false
};

const canvas = document.getElementById('paint-canvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let myTurn = false;
let timerInterval = null;
let odaiTimerInterval = null;

// Peer初期化
function initPeer(id = null) {
    peer = id ? new Peer(id) : new Peer();
    peer.on('open', (assignedId) => {
        myId = assignedId;
        if (isHost) {
            roomId = assignedId;
            document.getElementById('display-room-id').innerText = roomId;
            gameState.players.push({ id: myId, name: myName });
            updateLobbyUI();
        }
    });

    peer.on('connection', (conn) => {
        connections.push(conn);
        conn.on('data', (data) => handleData(data));
    });
}

function copyRoomId() {
    navigator.clipboard.writeText(roomId);
    alert("合言葉をコピーしました！");
}

document.getElementById('create-room-btn').addEventListener('click', () => {
    myName = document.getElementById('player-name').value || "プレイヤー1";
    isHost = true;
    initPeer();
    showPanel('lobby-screen');
    document.getElementById('host-settings').classList.remove('hidden');
    document.getElementById('start-game-btn').classList.remove('hidden');
    document.getElementById('waiting-msg').classList.add('hidden');
});

document.getElementById('join-room-btn').addEventListener('click', () => {
    myName = document.getElementById('player-name').value || "ゲスト";
    roomId = document.getElementById('join-room-id').value;
    if (!roomId) return alert("合言葉を入力してください");

    isHost = false;
    initPeer();
    
    setTimeout(() => {
        const conn = peer.connect(roomId);
        connections.push(conn);
        conn.on('open', () => {
            conn.send({ type: 'JOIN', name: myName, id: myId });
        });
        conn.on('data', (data) => handleData(data));
    }, 1000);

    showPanel('lobby-screen');
});

function handleData(data) {
    if (data.type === 'JOIN' && isHost) {
        gameState.players.push({ id: data.id, name: data.name });
        broadcastState();
        updateLobbyUI();
    } else if (data.type === 'STATE_UPDATE') {
        gameState = data.state;
        updateLobbyUI();
        checkPhaseTransition();
    } else if (data.type === 'DRAW_LINE') {
        drawLineOnCanvas(data.line);
    } else if (data.type === 'SUBMIT_ODAI' && isHost) {
        gameState.odai = data.odai;
        startDrawingPhase();
    } else if (data.type === 'VOTE' && isHost) {
        gameState.votes[data.voterId] = data.targetId;
        broadcastState();
        checkVoteComplete();
    } else if (data.type === 'SUBMIT_GUESS' && isHost) {
        processWolfGuess(data.guess);
    }
}

function broadcastState() {
    connections.forEach(conn => conn.send({ type: 'STATE_UPDATE', state: gameState }));
}

function showPanel(panelId) {
    ['setup-screen', 'lobby-screen', 'odai-select-screen', 'game-screen', 'vote-screen', 'reversal-screen', 'result-screen'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(panelId).classList.remove('hidden');
}

function updateLobbyUI() {
    document.getElementById('player-count').innerText = gameState.players.length;
    const list = document.getElementById('player-list');
    list.innerHTML = "";
    gameState.players.forEach(p => {
        const li = document.createElement('li');
        li.innerText = p.name + (p.id === roomId ? " 👑(ホスト)" : "");
        list.appendChild(li);
    });
}

// ゲームスタート（ホスト実行）
document.getElementById('start-game-btn').addEventListener('click', () => {
    if (gameState.players.length < 3) return alert("3人以上で始めてください！");

    gameState.settings.wolfMode = document.getElementById('setting-wolf-mode').value;
    gameState.settings.drawMode = document.getElementById('setting-draw-mode').value;
    gameState.settings.rounds = parseInt(document.getElementById('setting-rounds').value);
    gameState.settings.syncType = document.getElementById('setting-sync-type').value;
    gameState.settings.reversal = document.getElementById('setting-reversal').value;

    // 人狼決定
    let wolfCount = 1;
    if (gameState.settings.wolfMode === "2") wolfCount = 2;
    if (gameState.settings.wolfMode === "1-maybe0" && Math.random() < 0.3) {
        wolfCount = 0; // 30%の確率で人狼0人（平和村）
    }

    const shuffled = [...gameState.players].sort(() => 0.5 - Math.random());
    gameState.wolves = wolfCount > 0 ? shuffled.slice(0, wolfCount).map(p => p.id) : [];

    // お題担当リーダー決定（市民から1人）
    const citizens = gameState.players.filter(p => !gameState.wolves.includes(p.id));
    const leader = citizens[Math.floor(Math.random() * citizens.length)];
    gameState.odaiLeaderId = leader.id;

    gameState.turnOrder = shuffled.map(p => p.id);
    gameState.phase = "ODAI_SELECT";
    gameState.isStarted = true;

    broadcastState();
    startOdaiPhase();
});

function checkPhaseTransition() {
    if (gameState.phase === "ODAI_SELECT") startOdaiPhase();
    if (gameState.phase === "DRAWING") startGameUI();
    if (gameState.phase === "VOTING") startVotingUI();
    if (gameState.phase === "REVERSAL") startReversalUI();
    if (gameState.phase === "RESULT") showResultUI();
}

// お題決定フェーズ
function startOdaiPhase() {
    showPanel('odai-select-screen');

    if (myId === gameState.odaiLeaderId) {
        document.getElementById('odai-wait-msg').classList.add('hidden');
        document.getElementById('odai-selector-box').classList.remove('hidden');
        setupOdaiChoices();
    } else {
        document.getElementById('odai-wait-msg').classList.remove('hidden');
        document.getElementById('odai-selector-box').classList.add('hidden');
    }

    // 30秒タイマー
    let timeLeft = 30;
    clearInterval(odaiTimerInterval);
    odaiTimerInterval = setInterval(() => {
        timeLeft--;
        if (document.getElementById('odai-timer')) document.getElementById('odai-timer').innerText = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(odaiTimerInterval);
            if (myId === gameState.odaiLeaderId) {
                submitSelectedOdai(generateRandomOdai());
            }
        }
    }, 1000);
}

function setupOdaiChoices() {
    let opt1 = generateRandomOdai();
    let opt2 = generateRandomOdai();

    const btn1 = document.getElementById('odai-opt-1');
    const btn2 = document.getElementById('odai-opt-2');
    btn1.innerText = opt1;
    btn2.innerText = opt2;

    btn1.onclick = () => submitSelectedOdai(opt1);
    btn2.onclick = () => submitSelectedOdai(opt2);

    document.getElementById('shuffle-odai-btn').onclick = setupOdaiChoices;
    document.getElementById('submit-custom-odai-btn').onclick = () => {
        const val = document.getElementById('custom-odai-input').value.trim();
        if (val) submitSelectedOdai(val);
    };
}

function submitSelectedOdai(selectedOdai) {
    clearInterval(odaiTimerInterval);
    if (isHost) {
        gameState.odai = selectedOdai;
        startDrawingPhase();
    } else {
        const hostConn = connections.find(c => c.peer === roomId);
        if (hostConn) hostConn.send({ type: 'SUBMIT_ODAI', odai: selectedOdai });
    }
}

function startDrawingPhase() {
    gameState.phase = "DRAWING";
    gameState.turnIndex = 0;
    gameState.currentRound = 1;
    broadcastState();
    startGameUI();
}

function startGameUI() {
    showPanel('game-screen');

    const isWolf = gameState.wolves.includes(myId);
    const roleBadge = document.getElementById('role-badge');
    const odaiDisplay = document.getElementById('odai-display');

    if (isWolf) {
        roleBadge.innerText = "🐺 あなたは人狼です";
        roleBadge.style.background = "#ff0055";
        odaiDisplay.innerText = "お題: ❓（他の人の絵から推測せよ！）";
    } else {
        roleBadge.innerText = "🎨 あなたは市民です";
        roleBadge.style.background = "#00f0ff";
        roleBadge.style.color = "#000";
        odaiDisplay.innerText = `お題: ${gameState.odai}`;
    }

    startTurn();
}

function startTurn() {
    const currentDrawerId = gameState.turnOrder[gameState.turnIndex];
    const drawer = gameState.players.find(p => p.id === currentDrawerId);
    
    document.getElementById('turn-player').innerHTML = `現在の描き手: <span>${drawer ? drawer.name : "---"}</span>`;
    myTurn = (currentDrawerId === myId);

    const tools = document.getElementById('canvas-tools');
    if (myTurn) {
        tools.classList.remove('hidden');
    } else {
        tools.classList.add('hidden');
    }

    let timeLeft = parseInt(gameState.settings.drawMode) || 10;
    document.getElementById('timer-display').innerText = timeLeft;

    clearInterval(timerInterval);
    if (gameState.settings.drawMode !== "stroke") {
        timerInterval = setInterval(() => {
            timeLeft--;
            document.getElementById('timer-display').innerText = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                finishTurn();
            }
        }, 1000);
    }
}

document.getElementById('finish-turn-btn').addEventListener('click', finishTurn);

function finishTurn() {
    if (!myTurn) return;
    myTurn = false;
    clearInterval(timerInterval);

    if (isHost) {
        nextTurn();
    } else {
        const hostConn = connections.find(c => c.peer === roomId);
        if (hostConn) hostConn.send({ type: 'NEXT_TURN' });
    }
}

function nextTurn() {
    gameState.turnIndex++;
    if (gameState.turnIndex >= gameState.turnOrder.length) {
        gameState.turnIndex = 0;
        gameState.currentRound++;
    }

    if (gameState.currentRound > gameState.settings.rounds) {
        gameState.phase = "VOTING";
        broadcastState();
        startVotingUI();
    } else {
        broadcastState();
        startTurn();
    }
}

// 投票フェーズ
function startVotingUI() {
    showPanel('vote-screen');
    const grid = document.getElementById('vote-options');
    grid.innerHTML = "";

    gameState.players.forEach(p => {
        const btn = document.createElement('button');
        btn.className = "vote-btn";
        btn.innerText = p.name;
        btn.onclick = () => submitVote(p.id, btn);
        grid.appendChild(btn);
    });

    // 人狼はいない選択肢
    const noWolfBtn = document.createElement('button');
    noWolfBtn.className = "vote-btn";
    noWolfBtn.style.borderColor = "#ffe600";
    noWolfBtn.innerText = "🕊️ 人狼はいない（平和村）";
    noWolfBtn.onclick = () => submitVote("NONE", noWolfBtn);
    grid.appendChild(noWolfBtn);
}

function submitVote(targetId, btnElement) {
    document.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
    btnElement.classList.add('selected');
    document.getElementById('vote-status-msg').innerText = "投票完了！全員の投票を待っています...";

    if (isHost) {
        gameState.votes[myId] = targetId;
        checkVoteComplete();
    } else {
        const hostConn = connections.find(c => c.peer === roomId);
        if (hostConn) hostConn.send({ type: 'VOTE', voterId: myId, targetId: targetId });
    }
}

function checkVoteComplete() {
    if (Object.keys(gameState.votes).length >= gameState.players.length) {
        // 投票集計
        const counts = {};
        Object.values(gameState.votes).forEach(tid => counts[tid] = (counts[tid] || 0) + 1);

        let maxVoteTarget = null;
        let maxVotes = 0;
        for (const [tid, cnt] of Object.entries(counts)) {
            if (cnt > maxVotes) {
                maxVotes = cnt;
                maxVoteTarget = tid;
            }
        }

        gameState.voteResultTarget = maxVoteTarget;

        // 人狼0人の勝敗判定
        if (gameState.wolves.length === 0) {
            if (maxVoteTarget === "NONE" && maxVotes > gameState.players.length / 2) {
                gameState.winner = "CITIZEN_PEACE"; // 平和村成功
            } else {
                gameState.winner = "WOLF_PEACE_FAIL"; // 冤罪で失敗
            }
            gameState.phase = "RESULT";
            broadcastState();
            showResultUI();
            return;
        }

        // 人狼がいる場合
        if (gameState.wolves.includes(maxVoteTarget)) {
            // 人狼が追放された
            if (gameState.settings.reversal === "true") {
                gameState.phase = "REVERSAL";
                broadcastState();
                startReversalUI();
            } else {
                gameState.winner = "CITIZEN";
                gameState.phase = "RESULT";
                broadcastState();
                showResultUI();
            }
        } else {
            // 市民を吊ってしまった
            gameState.winner = "WOLF";
            gameState.phase = "RESULT";
            broadcastState();
            showResultUI();
        }
    }
}

// 人狼逆転フェーズ
function startReversalUI() {
    showPanel('reversal-screen');
    const isWolf = gameState.wolves.includes(myId);
    if (!isWolf) {
        document.getElementById('reversal-screen').innerHTML = `<h2>🐺 人狼逆転タイム</h2><p>追放された人狼がお題を予想しています...</p>`;
    }
}

document.getElementById('submit-guess-btn').addEventListener('click', () => {
    const guess = document.getElementById('wolf-guess-input').value.trim();
    if (isHost) {
        processWolfGuess(guess);
    } else {
        const hostConn = connections.find(c => c.peer === roomId);
        if (hostConn) hostConn.send({ type: 'SUBMIT_GUESS', guess: guess });
    }
});

function processWolfGuess(guess) {
    if (guess === gameState.odai) {
        gameState.winner = "WOLF_REVERSAL"; // 逆転勝ち
    } else {
        gameState.winner = "CITIZEN"; // 市民勝ち
    }
    gameState.phase = "RESULT";
    broadcastState();
    showResultUI();
}

// 結果発表UI
function showResultUI() {
    showPanel('result-screen');
    const title = document.getElementById('result-title');
    const detail = document.getElementById('result-detail');

    let wolfNames = gameState.wolves.map(wid => {
        const p = gameState.players.find(x => x.id === wid);
        return p ? p.name : "";
    }).join(", ");

    if (gameState.wolves.length === 0) wolfNames = "なし（平和村）";

    let html = `<p><strong>正解のお題：</strong> ${gameState.odai}</p>`;
    html += `<p><strong>人狼だった人：</strong> ${wolfNames}</p><hr>`;

    if (gameState.winner === "CITIZEN") {
        title.innerText = "🎉 市民陣営の勝利！";
        html += `<p>見事に人狼を特定し、平和を守り切りました！</p>`;
    } else if (gameState.winner === "CITIZEN_PEACE") {
        title.innerText = "🎉 平和村！市民の勝利！";
        html += `<p>過半数が「人狼はいない」に投票成功！平和村を見事見破りました！</p>`;
    } else if (gameState.winner === "WOLF") {
        title.innerText = "🐺 人狼陣営の勝利！";
        html += `<p>人狼は正体を隠し通すことに成功しました！</p>`;
    } else if (gameState.winner === "WOLF_PEACE_FAIL") {
        title.innerText = "💀 全員敗北...";
        html += `<p>本当は人狼がいなかったのに、市民を追放してしまいました...</p>`;
    } else if (gameState.winner === "WOLF_REVERSAL") {
        title.innerText = "🐺 人狼の劇的逆転勝利！";
        html += `<p>追放された人狼が正解のお題を見破り、見事逆転しました！</p>`;
    }

    detail.innerHTML = html;
}

document.getElementById('back-to-lobby-btn').addEventListener('click', () => {
    gameState.phase = "LOBBY";
    gameState.isStarted = false;
    gameState.votes = {};
    if (isHost) broadcastState();
    showPanel('lobby-screen');
});

// Canvas 描き処理
canvas.addEventListener('pointerdown', (e) => {
    if (!myTurn) return;
    isDrawing = true;
    draw(e);
});
canvas.addEventListener('pointermove', (e) => {
    if (!isDrawing || !myTurn) return;
    draw(e);
});
canvas.addEventListener('pointerup', () => isDrawing = false);

function draw(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const color = document.getElementById('color-picker').value;

    const lineData = { x, y, color };
    drawLineOnCanvas(lineData);

    if (gameState.settings.syncType === 'realtime') {
        connections.forEach(c => c.send({ type: 'DRAW_LINE', line: lineData }));
    }
}

function drawLineOnCanvas(line) {
    ctx.fillStyle = line.color;
    ctx.beginPath();
    ctx.arc(line.x, line.y, 4, 0, Math.PI * 2);
    ctx.fill();
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}