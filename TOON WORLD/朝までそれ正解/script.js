const initialOdaiList = [
    "「あ」で始まるテンションが上がる曲は？", "「い」で始まる初恋を思い出すアイテムは？",
    "「う」で始まる言われるとイラッとする言葉は？", "「え」で始まるカッコいい職業は？",
    "「お」で始まる子供が喜ぶものは？", "「か」で始まる政治家に必要なものは？",
    "「き」で始まる強い生き物は？", "「く」で始まるクラスに一人はいたやつは？",
    "「け」で始まる男のロマンは？", "「こ」で始まる強い言葉は？",
    "「さ」で始まる人から言われて嬉しい言葉は？", "「し」で始まる主婦がスーパーで買うものは？",
    "「す」で始まる女性の部屋に必ずあるものは？", "「せ」で始まる名作映画は？",
    "「そ」で始まる男なら一度は憧れるシチュエーションは？", "「た」で始まるセクシーな男性芸能人は？",
    "「ち」で始まる中華料理の定番メニューは？", "「つ」で始まる旅行に持っていくと便利なものは？",
    "「て」で始まるデートで行きたい場所は？", "「と」で始まるテンションが下がる言葉は？"
];

const hiraganaList = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ";
let remainingOdaiList = [...initialOdaiList];
let learnedQuestionTypes = [];

initialOdaiList.forEach(item => {
    const match = item.match(/「.」で始まる(.+)/);
    if (match && match[1]) learnedQuestionTypes.push(match[1]);
});

let peer = null;
let connections = [];
let hostConn = null;
let isHost = false;
let myName = "";
let roomId = "";
let currentOdai = "";
let answers = {}; 
let players = []; // 参加者PeerIDリスト
let judgeIndex = 0; // 判定者インデックス
let scores = {}; // { peerId: point }
let selectedWinners = []; // 正解者としてタッチされたPeerID

let currentMode = 'text'; // 'text' | 'draw'
let canvas, ctx, isDrawing = false;

const urlParams = new URLSearchParams(window.location.search);
const joinRoomId = urlParams.get('room');

if (joinRoomId) {
    document.getElementById('status').innerText = `部屋 「${joinRoomId}」 に接続準備完了`;
} else {
    document.getElementById('status').innerText = "新しい部屋の作成が可能です";
}

function initGame() {
    myName = document.getElementById('username').value.trim();
    if (!myName) {
        alert("名前を入力してください！");
        return;
    }

    document.getElementById('join-section').style.display = 'none';
    document.getElementById('game-section').style.display = 'block';

    initCanvas();

    if (joinRoomId) {
        roomId = joinRoomId;
        isHost = false;
        document.getElementById('display-room-id').innerText = roomId;
        connectToHost();
    } else {
        isHost = true;
        roomId = Math.random().toString(36).substring(2, 8);
        document.getElementById('display-room-id').innerText = roomId;
        document.getElementById('next-btn').style.display = 'inline-block';
        document.getElementById('reveal-btn').style.display = 'inline-block';
        document.getElementById('point-btn').style.display = 'inline-block';
        setupHost();
    }
}

function setupHost() {
    peer = new Peer(roomId);
    peer.on('open', (id) => {
        document.getElementById('status').innerText = "ホストとして部屋を開設しました";
        players.push({ id: id, name: myName });
        scores[id] = 0;
        updateJudgeInfo();
    });

    peer.on('connection', (conn) => {
        connections.push(conn);
        conn.on('data', (data) => handleData(data, conn.peer));
        conn.on('open', () => {
            conn.send({ 
                type: 'sync', 
                odai: currentOdai, 
                answers: answers, 
                players: players, 
                judgeIndex: judgeIndex,
                scores: scores 
            });
        });
    });
}

function connectToHost() {
    peer = new Peer();
    peer.on('open', (id) => {
        hostConn = peer.connect(roomId);
        hostConn.on('open', () => {
            document.getElementById('status').innerText = "部屋に接続しました！";
            hostConn.send({ type: 'join', name: myName, id: id });
        });
        hostConn.on('data', (data) => handleData(data));
    });
}

function handleData(data, senderPeerId) {
    if (data.type === 'join' && isHost) {
        if (!players.find(p => p.id === data.id)) {
            players.push({ id: data.id, name: data.name });
            scores[data.id] = 0;
        }
        broadcastSync();
    } else if (data.type === 'sync' || data.type === 'state_update') {
        currentOdai = data.odai;
        answers = data.answers || {};
        players = data.players || [];
        judgeIndex = data.judgeIndex || 0;
        scores = data.scores || {};
        
        document.getElementById('odai').innerText = currentOdai || "お題を待っています...";
        if (currentOdai) document.getElementById('answer-input-section').style.display = 'block';

        updateJudgeInfo();
        renderAnswers();
        renderScores();
    } else if (data.type === 'answer') {
        answers[senderPeerId || hostConn.peer] = { 
            name: data.name, 
            answer: data.answer, 
            isImage: data.isImage, 
            isRevealed: false 
        };
        if (isHost) broadcastSync();
    }
}

function broadcastSync() {
    const state = {
        type: 'state_update',
        odai: currentOdai,
        answers: answers,
        players: players,
        judgeIndex: judgeIndex,
        scores: scores
    };
    handleData(state); // ホスト自身の画面更新
    connections.forEach(conn => conn.send(state));
}

function updateJudgeInfo() {
    if (players.length === 0) return;
    const currentJudge = players[judgeIndex % players.length];
    document.getElementById('judge-info').innerText = `現在の判定者: ${currentJudge ? currentJudge.name : '-'}`;
}

// お題更新＆判定者の交代
function nextQuestion() {
    if (remainingOdaiList.length > 0) {
        const randomIndex = Math.floor(Math.random() * remainingOdaiList.length);
        currentOdai = remainingOdaiList.splice(randomIndex, 1)[0];
    } else {
        const randomChar = hiraganaList[Math.floor(Math.random() * hiraganaList.length)];
        const randomTheme = learnedQuestionTypes[Math.floor(Math.random() * learnedQuestionTypes.length)];
        currentOdai = `「${randomChar}」で始まる${randomTheme}（AI自動生成お題）`;
    }

    answers = {};
    selectedWinners = [];
    judgeIndex = (judgeIndex + 1) % players.length; // 判定者交代
    
    document.getElementById('my-answer-text').value = '';
    clearCanvas();
    document.getElementById('submit-btn').disabled = false;

    broadcastSync();
}

// タブ切り替え
function switchTab(mode) {
    currentMode = mode;
    document.getElementById('tab-text-btn').classList.toggle('active', mode === 'text');
    document.getElementById('tab-draw-btn').classList.toggle('active', mode === 'draw');
    document.getElementById('input-text-container').style.display = mode === 'text' ? 'block' : 'none';
    document.getElementById('input-draw-container').style.display = mode === 'draw' ? 'block' : 'none';
}

// キャンバス初期化
function initCanvas() {
    canvas = document.getElementById('draw-canvas');
    ctx = canvas.getContext('2d');
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startDraw = (e) => { isDrawing = true; const pos = getPos(e); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); };
    const draw = (e) => { if (!isDrawing) return; const pos = getPos(e); ctx.lineTo(pos.x, pos.y); ctx.stroke(); };
    const stopDraw = () => { isDrawing = false; };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('touchstart', startDraw);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDraw);
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function submitAnswer() {
    let ansData = "";
    let isImg = false;

    if (currentMode === 'text') {
        ansData = document.getElementById('my-answer-text').value.trim();
        if (!ansData) return;
    } else {
        ansData = canvas.toDataURL(); // 画像データ(Base64)
        isImg = true;
    }

    document.getElementById('submit-btn').disabled = true;
    const myId = peer.id;

    answers[myId] = { name: myName, answer: ansData, isImage: isImg, isRevealed: false };

    if (isHost) {
        broadcastSync();
    } else {
        hostConn.send({ type: 'answer', name: myName, answer: ansData, isImage: isImg });
    }
}

function revealAnswers() {
    Object.keys(answers).forEach(id => answers[id].isRevealed = true);
    if (isHost) broadcastSync();
}

function revealSingleAnswer(targetPeerId) {
    if (answers[targetPeerId]) {
        answers[targetPeerId].isRevealed = true;
        if (isHost) broadcastSync();
    }
}

// 正解者を選択（タッチ・トグル）
function toggleWinner(targetPeerId) {
    const idx = selectedWinners.indexOf(targetPeerId);
    if (idx >= 0) {
        selectedWinners.splice(idx, 1);
    } else {
        selectedWinners.push(targetPeerId);
    }
    renderAnswers();
}

// ポイント確定
function confirmPoints() {
    if (selectedWinners.length === 0) {
        alert("正解者（ポイントをあげる人）をタッチして選択してください！");
        return;
    }

    selectedWinners.forEach(id => {
        scores[id] = (scores[id] || 0) + 1;
    });

    alert("ポイントを付与しました！");
    selectedWinners = [];
    if (isHost) broadcastSync();
}

function renderAnswers() {
    const list = document.getElementById('answers-list');
    list.innerHTML = '';

    const currentJudge = players[judgeIndex % players.length];
    const isAmIJudge = currentJudge && currentJudge.id === peer.id;

    Object.keys(answers).forEach(id => {
        const item = answers[id];
        const card = document.createElement('div');
        const isSelected = selectedWinners.includes(id);
        card.className = 'answer-card' + (isSelected ? ' selected-winner' : '');

        const leftDiv = document.createElement('div');
        leftDiv.className = 'answer-left';

        const nameSpan = document.createElement('div');
        nameSpan.className = 'player-name';
        nameSpan.innerText = item.name + ' さんの回答:';

        const ansDiv = document.createElement('div');
        ansDiv.className = 'answer-text' + (item.isRevealed ? '' : ' hidden-answer');

        if (item.isImage) {
            const img = document.createElement('img');
            img.src = item.answer;
            img.className = 'answer-image';
            ansDiv.appendChild(img);
        } else {
            ansDiv.innerText = item.answer;
        }

        leftDiv.appendChild(nameSpan);
        leftDiv.appendChild(ansDiv);
        card.appendChild(leftDiv);

        const rightDiv = document.createElement('div');

        // 個別公開ボタン（ホストのみ）
        if (isHost && !item.isRevealed) {
            const singleRevealBtn = document.createElement('button');
            singleRevealBtn.className = 'btn-small';
            singleRevealBtn.innerText = '👁️ 公開';
            singleRevealBtn.onclick = () => revealSingleAnswer(id);
            rightDiv.appendChild(singleRevealBtn);
        }

        // 正解者タッチボタン（判定者またはホスト）
        if ((isAmIJudge || isHost) && item.isRevealed) {
            const selectBtn = document.createElement('button');
            selectBtn.className = 'btn-small ' + (isSelected ? 'btn-gold' : '');
            selectBtn.innerText = isSelected ? '★ 正解中' : '選択';
            selectBtn.onclick = () => toggleWinner(id);
            rightDiv.appendChild(selectBtn);
        }

        card.appendChild(rightDiv);
        list.appendChild(card);
    });
}

function renderScores() {
    const container = document.getElementById('scores-list');
    container.innerHTML = '';

    players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'score-item';
        item.innerHTML = `<span>${p.name}</span><b>${scores[p.id] || 0} pt</b>`;
        container.appendChild(item);
    });
}

function copyShareUrl() {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
        alert("招待用URLをコピーしました！友達に送ってください。");
    });
}