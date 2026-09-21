// 全ゲームデータ ＆ 通信管理
let QUIZ_DATABASE = [];

let peer = null;
let connections = {};
let roomId = "";
let isHost = false;
let myName = "";
let players = [];
let teams = [];

let gameMode = "quiz";
let gameConfig = { winScore: 50, correctScore: 10, penaltyScore: 10, roleMode: "auto" };

// クイズ用変数
let currentRound = 0;
let currentQuiz = null;
let quizCharIndex = 0;
let textTimer = null;
let isPushed = false;
let currentResultData = null;

// お絵描き用
let isDrawing = false;
let canvas, ctx;

window.addEventListener('DOMContentLoaded', () => {
    loadOnlineQuizDatabase();
    initUIEvents();
    setupCanvas();
});

function logStatus(msg) {
    const el = document.getElementById('status-message');
    if (el) el.innerText = msg;
}

async function loadOnlineQuizDatabase() {
    try {
        const res = await fetch('https://raw.githubusercontent.com/kuroda/quiz-db/main/quiz_all.json');
        if (res.ok) {
            QUIZ_DATABASE = await res.json();
            return;
        }
    } catch (e) {}

    // 取得失敗時のフォールバックデータ
    QUIZ_DATABASE = [
        { genre: "アニメ", q: "『ONE PIECE』に登場する主人公ルフィが食べた悪魔の実の本当の名前は何の実でしょう？", a: ["ヒトヒトの実", "ニカ"] },
        { genre: "ゲーム", q: "『任天堂』の看板キャラクターで、赤い帽子と青いオーバーオールが特徴の配管工は誰でしょう？", a: ["マリオ"] },
        { genre: "雑学", q: "サッカーの試合で、1人の選手が1試合中に3得点以上決めることを何というでしょう？", a: ["ハットトリック"] }
    ];
}

function initUIEvents() {
    document.getElementById('create-room-btn').addEventListener('click', createRoom);
    document.getElementById('join-room-btn').addEventListener('click', joinRoom);
    document.getElementById('start-game-btn').addEventListener('click', hostStartGame);
    
    document.getElementById('begin-round-btn').addEventListener('click', startQuizRound);
    document.getElementById('push-btn').addEventListener('click', handlePushBtn);
    document.getElementById('submit-quiz-btn').addEventListener('click', handleSubmitQuizAnswer);
    document.getElementById('next-question-btn').addEventListener('click', handleNextAction);

    document.getElementById('finish-draw-btn').addEventListener('click', () => alert("話合いタイム開始！人狼（ウルフ）を推理してください！"));
    document.getElementById('clear-canvas-btn').addEventListener('click', clearCanvas);
    document.getElementById('submit-morning-btn').addEventListener('click', submitMorningAnswer);

    document.getElementById('game-mode-select').addEventListener('change', (e) => {
        gameMode = e.target.value;
        const quizBox = document.getElementById('quiz-config-box');
        if (gameMode === 'quiz') quizBox.classList.remove('hidden');
        else quizBox.classList.add('hidden');
    });
}

function normalizeText(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .replace(/[A-Za-z0-9]/g, s => String.fromCharCode(s.charCodeAt(0) + 0xfee0))
        .replace(/[\u30a1-\u30f6]/g, s => String.fromCharCode(s.charCodeAt(0) - 0x60))
        .replace(/\s+/g, "");
}

// --- 1. 部屋作成・参加 ---
function createRoom() {
    myName = document.getElementById('player-name').value.trim();
    if (!myName) return alert("プレイヤー名を入力してください！");

    isHost = true;
    logStatus("通信サーバーに接続中...");

    try {
        // PeerJS初期化
        peer = typeof Peer !== 'undefined' ? new Peer() : null;

        if (!peer) {
            // ライブラリ未読み込み時の保護
            setupLocalRoom();
            return;
        }

        peer.on('open', (id) => {
            roomId = id.substring(0, 6);
            document.getElementById('display-room-id').innerText = roomId;
            document.getElementById('room-info').classList.remove('hidden');
            document.getElementById('host-settings').classList.remove('hidden');
            document.getElementById('start-game-btn').classList.remove('hidden');
            
            players = [{ id: peer.id, name: myName }];
            updateMemberList();
            logStatus("✅ 部屋を作成しました！参加者を待っています。");
        });

        peer.on('connection', (conn) => {
            conn.on('open', () => {
                connections[conn.peer] = conn;
                conn.on('data', (data) => handleDataFromClient(conn.peer, data));
            });
        });

        peer.on('error', (err) => {
            setupLocalRoom();
        });

    } catch (e) {
        setupLocalRoom();
    }
}

function setupLocalRoom() {
    roomId = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('display-room-id').innerText = roomId;
    document.getElementById('room-info').classList.remove('hidden');
    document.getElementById('host-settings').classList.remove('hidden');
    document.getElementById('start-game-btn').classList.remove('hidden');
    
    players = [{ id: "local-host", name: myName }];
    updateMemberList();
    logStatus("✅ ルームを作成しました！（ローカルテストモード）");
}

function joinRoom() {
    myName = document.getElementById('player-name').value.trim();
    const targetRoom = document.getElementById('room-id-input').value.trim();
    if (!myName) return alert("名前を入力してください");
    if (!targetRoom) return alert("部屋IDを入力してください");

    logStatus("部屋に接続中...");
    peer = new Peer();

    peer.on('open', () => {
        const conn = peer.connect(targetRoom);
        conn.on('open', () => {
            connections[targetRoom] = conn;
            conn.send({ type: 'JOIN', name: myName });
            logStatus("✅ 部屋に参加しました！開始を待っています。");
        });
        conn.on('data', handleDataFromServer);
    });

    peer.on('error', () => {
        alert("部屋に接続できませんでした。IDを確認してください。");
        logStatus("接続失敗");
    });
}

function handleDataFromClient(senderId, data) {
    if (data.type === 'JOIN') {
        players.push({ id: senderId, name: data.name });
        broadcast({ type: 'MEMBER_UPDATE', players: players });
        updateMemberList();
    } else if (data.type === 'PUSH_BUTTON') {
        handlePushAction(senderId, data.charIndex);
    } else if (data.type === 'SUBMIT_QUIZ') {
        verifyQuizAnswer(senderId, data.answer);
    } else if (data.type === 'DRAW_LINE') {
        broadcast(data);
    } else if (data.type === 'SUBMIT_MORNING') {
        handleMorningAnswer(senderId, data.answer);
    }
}

function handleDataFromServer(data) {
    if (data.type === 'MEMBER_UPDATE') {
        players = data.players;
        updateMemberList();
    } else if (data.type === 'START_QUIZ_TEAM') {
        teams = data.teams;
        gameConfig = data.config;
        showTeamScreen();
    } else if (data.type === 'NEW_QUIZ') {
        teams = data.teams;
        setupQuizRound(data);
    } else if (data.type === 'UPDATE_TEXT') {
        document.getElementById('quiz-question-text').innerText = data.text;
    } else if (data.type === 'STOP_FOR_ANSWER') {
        onQuestionStopped(data);
    } else if (data.type === 'RESULT') {
        teams = data.teams;
        currentResultData = data;
        showResult(data);
    } else if (data.type === 'START_DRAW') {
        setupDrawGame(data);
    } else if (data.type === 'DRAW_LINE') {
        drawOnCanvas(data.x, data.y, data.color, data.isNew);
    } else if (data.type === 'START_MORNING') {
        setupMorningGame(data);
    }
}

function broadcast(data) {
    Object.values(connections).forEach(conn => conn.send(data));
}

function updateMemberList() {
    document.querySelector('.room-actions').style.display = 'none';
    document.getElementById('member-list-box').classList.remove('hidden');
    document.getElementById('member-count').innerText = players.length;
    document.getElementById('member-list').innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
}

// --- 2. ホスト：ゲームスタート ---
function hostStartGame() {
    gameMode = document.getElementById('game-mode-select').value;

    if (gameMode === 'quiz') {
        gameConfig.winScore = parseInt(document.getElementById('win-score').value);
        gameConfig.correctScore = parseInt(document.getElementById('correct-score').value);
        gameConfig.penaltyScore = parseInt(document.getElementById('penalty-score').value);
        gameConfig.roleMode = document.getElementById('role-mode').value;

        let shuffled = [...players].sort(() => Math.random() - 0.5);
        teams = [];
        let teamCount = 1;

        while (shuffled.length > 0) {
            if (shuffled.length === 1) {
                teams.push({ teamId: `チーム ${teamCount}`, members: [shuffled.pop().id], isSolo: true, score: 0 });
            } else {
                teams.push({ teamId: `チーム ${teamCount}`, members: [shuffled.pop().id, shuffled.pop().id], isSolo: false, score: 0 });
            }
            teamCount++;
        }

        broadcast({ type: 'START_QUIZ_TEAM', teams: teams, config: gameConfig });
        showTeamScreen();

    } else if (gameMode === 'draw') {
        const themes = ["リンゴ", "パンダ", "ドラえもん", "サッカーボール", "車"];
        const theme = themes[Math.floor(Math.random() * themes.length)];
        const wolfIndex = Math.floor(Math.random() * players.length);

        players.forEach((p, idx) => {
            const isWolf = (idx === wolfIndex);
            const data = { type: 'START_DRAW', theme: isWolf ? "あなたは【人狼（ウルフ）】です！" : theme };
            if (p.id === (peer ? peer.id : "local-host")) setupDrawGame(data);
            else if (connections[p.id]) connections[p.id].send(data);
        });

    } else if (gameMode === 'morning') {
        const morningThemes = ["「ス」で始まる、カッコいいものとは？", "「あ」で始まる、おにぎりの最強の具とは？", "「ね」で始まる、もらって一番嬉しいものとは？"];
        const theme = morningThemes[Math.floor(Math.random() * morningThemes.length)];
        const data = { type: 'START_MORNING', theme: theme };
        broadcast(data);
        setupMorningGame(data);
    }
}

// --- モード1: ⚡ コンビでみんはや ---
function showTeamScreen() {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('team-screen').classList.remove('hidden');
    
    let hasSolo = false;
    document.getElementById('team-list').innerHTML = teams.map(t => {
        if (t.isSolo) hasSolo = true;
        const mNames = t.members.map(id => players.find(p => p.id === id)?.name || "プレイヤー").join(' & ');
        return `<div class="team-card"><h3>${t.teamId}</h3><p>${mNames}</p>${t.isSolo ? '<small>(兼任)</small>' : ''}</div>`;
    }).join('');

    if (hasSolo) document.getElementById('solo-notice').classList.remove('hidden');
    if (isHost) document.getElementById('begin-round-btn').classList.remove('hidden');
}

function startQuizRound() {
    if (!isHost) return;
    currentRound++;
    currentQuiz = QUIZ_DATABASE[Math.floor(Math.random() * QUIZ_DATABASE.length)];
    quizCharIndex = 0;

    const roundData = {
        type: 'NEW_QUIZ',
        round: currentRound,
        genre: currentQuiz.genre || "総合",
        fullText: currentQuiz.q,
        teams: teams
    };

    broadcast(roundData);
    setupQuizRound(roundData);
}

function setupQuizRound(data) {
    document.getElementById('team-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    document.getElementById('result-overlay').classList.add('hidden');
    document.getElementById('answer-input-area').classList.add('hidden');

    document.getElementById('quiz-round-display').innerText = `第 ${data.round} 問`;
    document.getElementById('quiz-genre-badge').innerText = data.genre;
    document.getElementById('quiz-question-text').innerText = "";

    const myId = peer ? peer.id : "local-host";
    const myTeam = teams.find(t => t.members.includes(myId));
    document.getElementById('quiz-score-display').innerText = `獲得: ${myTeam ? myTeam.score : 0}pt`;

    let myRole = "観戦";
    if (myTeam) {
        if (myTeam.isSolo) {
            myRole = "押し手＆回答者";
        } else {
            const pusherIndex = (gameConfig.roleMode === "auto" && currentRound % 2 === 0) ? 1 : 0;
            myRole = (myTeam.members[pusherIndex] === myId) ? "押し手" : "回答者";
        }
    }

    document.getElementById('quiz-role-display').innerText = `役割: ${myRole}`;
    document.getElementById('pusher-panel').classList.add('hidden');
    document.getElementById('answerer-panel').classList.add('hidden');
    document.getElementById('quiz-waiting-panel').classList.add('hidden');

    if (myRole.includes("押し手")) document.getElementById('pusher-panel').classList.remove('hidden');
    if (myRole.includes("回答者") && !myRole.includes("押し手")) document.getElementById('answerer-panel').classList.remove('hidden');

    if (isHost) {
        isPushed = false;
        clearInterval(textTimer);
        textTimer = setInterval(() => {
            if (quizCharIndex < currentQuiz.q.length) {
                quizCharIndex++;
                const currentText = currentQuiz.q.substring(0, quizCharIndex);
                broadcast({ type: 'UPDATE_TEXT', text: currentText });
                document.getElementById('quiz-question-text').innerText = currentText;
            } else {
                clearInterval(textTimer);
            }
        }, 150);
    }
}

function handlePushBtn() {
    const myId = peer ? peer.id : "local-host";
    if (isHost) handlePushAction(myId, quizCharIndex);
    else connections[Object.keys(connections)[0]]?.send({ type: 'PUSH_BUTTON', charIndex: quizCharIndex });
}

function handlePushAction(pusherId, charIndex) {
    if (isPushed) return;
    isPushed = true;
    clearInterval(textTimer);

    const pushingTeam = teams.find(t => t.members.includes(pusherId));
    const stopData = { type: 'STOP_FOR_ANSWER', teamId: pushingTeam ? pushingTeam.teamId : "チーム", text: currentQuiz.q.substring(0, charIndex), pusherId: pusherId };
    broadcast(stopData);
    onQuestionStopped(stopData);
}

function onQuestionStopped(data) {
    document.getElementById('quiz-question-text').innerText = data.text + " 【★ストップ！】";
    document.getElementById('pusher-panel').classList.add('hidden');

    const myId = peer ? peer.id : "local-host";
    const myTeam = teams.find(t => t.members.includes(myId));
    if (myTeam && myTeam.teamId === data.teamId) {
        document.getElementById('answerer-panel').classList.remove('hidden');
        document.getElementById('answer-input-area').classList.remove('hidden');
    } else {
        document.getElementById('quiz-waiting-panel').classList.remove('hidden');
    }
}

function handleSubmitQuizAnswer() {
    const userAns = document.getElementById('quiz-answer-input').value.trim();
    document.getElementById('quiz-answer-input').value = "";

    const myId = peer ? peer.id : "local-host";
    if (isHost) verifyQuizAnswer(myId, userAns);
    else connections[Object.keys(connections)[0]]?.send({ type: 'SUBMIT_QUIZ', answer: userAns });
}

function verifyQuizAnswer(answererId, userAns) {
    let answers = Array.isArray(currentQuiz.a) ? currentQuiz.a : [currentQuiz.a];
    const normalizedUser = normalizeText(userAns);
    const isCorrect = answers.some(ans => {
        const normalizedAns = normalizeText(ans);
        return normalizedUser.length > 0 && (normalizedUser.includes(normalizedAns) || normalizedAns.includes(normalizedUser));
    });

    const targetTeam = teams.find(t => t.members.includes(answererId));
    let gainedPt = 0;

    if (targetTeam) {
        if (isCorrect) {
            gainedPt = gameConfig.correctScore;
            targetTeam.score += gainedPt;
        } else {
            gainedPt = -gameConfig.penaltyScore;
            targetTeam.score = Math.max(0, targetTeam.score - gameConfig.penaltyScore);
        }
    }

    const resultData = {
        type: 'RESULT',
        isCorrect: isCorrect,
        correctAnswer: answers[0],
        fullQuestion: currentQuiz.q,
        userAns: userAns || "（無回答）",
        answererId: answererId,
        teamId: targetTeam ? targetTeam.teamId : "",
        gainedPt: gainedPt,
        teams: teams
    };

    broadcast(resultData);
    currentResultData = resultData;
    showResult(resultData);
}

// --- モード2: 🎨 お絵描き人狼 ---
function setupCanvas() {
    canvas = document.getElementById('draw-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    const startDraw = (e) => { isDrawing = true; draw(e, true); };
    const stopDraw = () => { isDrawing = false; };
    const doDraw = (e) => { if (isDrawing) draw(e, false); };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mousemove', doDraw);

    canvas.addEventListener('touchstart', (e) => { startDraw(e.touches[0]); e.preventDefault(); });
    canvas.addEventListener('touchend', stopDraw);
    canvas.addEventListener('touchmove', (e) => { doDraw(e.touches[0]); e.preventDefault(); });
}

function draw(e, isNew) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const color = document.getElementById('draw-color').value;

    drawOnCanvas(x, y, color, isNew);

    const drawData = { type: 'DRAW_LINE', x: x, y: y, color: color, isNew: isNew };
    if (isHost) broadcast(drawData);
    else connections[Object.keys(connections)[0]]?.send(drawData);
}

function drawOnCanvas(x, y, color, isNew) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    if (isNew) {
        ctx.beginPath();
        ctx.moveTo(x, y);
    } else {
        ctx.lineTo(x, y);
        ctx.stroke();
    }
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function setupDrawGame(data) {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('draw-screen').classList.remove('hidden');
    document.getElementById('my-draw-theme').innerText = data.theme;
    if (isHost) document.getElementById('finish-draw-btn').classList.remove('hidden');
}

// --- モード3: ☀️ 朝までそれ正解 ---
function setupMorningGame(data) {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('morning-screen').classList.remove('hidden');
    document.getElementById('morning-theme-text').innerText = data.theme;
}

function submitMorningAnswer() {
    const ans = document.getElementById('morning-answer-input').value.trim();
    if (!ans) return alert("回答を入力してください");

    document.getElementById('morning-input-box').classList.add('hidden');
    document.getElementById('morning-board').classList.remove('hidden');

    const myId = peer ? peer.id : "local-host";
    if (isHost) handleMorningAnswer(myId, ans);
    else connections[Object.keys(connections)[0]]?.send({ type: 'SUBMIT_MORNING', answer: ans });
}

let morningAnswers = [];
function handleMorningAnswer(senderId, answer) {
    const player = players.find(p => p.id === senderId);
    morningAnswers.push({ name: player ? player.name : "ゲスト", answer: answer });

    document.getElementById('morning-answers-list').innerHTML = morningAnswers.map(a => `
        <div class="answer-card">
            <strong>${a.name}</strong>: <span>「${a.answer}」</span>
        </div>
    `).join('');
}

// --- 結果表示＆手動修正＆順位表 ---
function showResult(data) {
    const resBox = document.getElementById('result-overlay');
    resBox.classList.remove('hidden');

    const titleEl = document.getElementById('result-title');
    if (data.isCorrect) {
        titleEl.innerText = `⭕ 正解！ (+${data.gainedPt}pt)`;
        titleEl.style.color = "#22c55e";
    } else {
        titleEl.innerText = `❌ 不正解... (${data.gainedPt}pt)`;
        titleEl.style.color = "#ef4444";
    }

    document.getElementById('correct-answer-text').innerHTML = `
        <div style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 8px; margin: 10px 0; border: 2px solid #000;">
            <p style="font-size: 0.85rem; color: #666; margin: 0;">${data.teamId} の回答</p>
            <p style="font-size: 1.4rem; font-weight: bold; color: #d97706; margin: 4px 0;">「${data.userAns}」</p>
            <p style="font-size: 0.85rem; color: #666; margin: 8px 0 0 0;">正解: <strong>「${data.correctAnswer}」</strong></p>
        </div>
    `;

    let overrideBox = document.getElementById('override-control-box');
    if (isHost) {
        overrideBox.innerHTML = `
            <div style="background: #f1f5f9; padding: 8px; border-radius: 8px; margin-top: 10px; border: 2px solid #000;">
                <p style="font-size: 0.8rem; margin-bottom: 4px;">👑 ホスト判定調整</p>
                <button onclick="requestOverride(true)" class="btn" style="background:#22c55e; padding:6px; font-size:0.8rem; margin-right:4px;">⭕ 正解にする</button>
                <button onclick="requestOverride(false)" class="btn" style="background:#ef4444; padding:6px; font-size:0.8rem;">❌ 不正解にする</button>
            </div>
        `;
        document.getElementById('next-question-btn').classList.remove('hidden');
    }

    renderRankingTable(resBox);
}

function renderRankingTable(container) {
    let rankingBox = document.getElementById('ranking-table-box');
    if (!rankingBox) return;

    const sortedTeams = [...teams].sort((a, b) => b.score - a.score);
    rankingBox.innerHTML = `
        <h3 style="font-size: 0.95rem; margin-top: 10px;">🏆 ランキング</h3>
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
            ${sortedTeams.map((t, idx) => `
                <div style="display: flex; justify-content: space-between; background: #fff; padding: 6px 10px; border-radius: 6px; border: 1px solid #000; font-size: 0.85rem;">
                    <span>${idx + 1}位 <strong>${t.teamId}</strong></span>
                    <span style="font-weight: bold; color: #d97706;">${t.score} pt</span>
                </div>
            `).join('')}
        </div>
    `;
}

function requestOverride(forceCorrect) {
    if (!isHost || !currentResultData) return;

    const targetTeam = teams.find(t => t.teamId === currentResultData.teamId);
    if (!targetTeam) return;

    targetTeam.score = Math.max(0, targetTeam.score - currentResultData.gainedPt);
    const newGainedPt = forceCorrect ? gameConfig.correctScore : -gameConfig.penaltyScore;
    targetTeam.score = Math.max(0, targetTeam.score + newGainedPt);

    currentResultData.isCorrect = forceCorrect;
    currentResultData.gainedPt = newGainedPt;
    currentResultData.teams = teams;

    broadcast(currentResultData);
    showResult(currentResultData);
}

function handleNextAction() {
    startQuizRound();
}