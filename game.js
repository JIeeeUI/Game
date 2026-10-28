(function () {
  'use strict';

  // ---------- 상수 ----------
  const MAX_MOVES = 30; 
  const MIN_CONNECT = 3;
  const BONUS_FROM = 5; 
  const FADE_DURATION = 300; 
  const SHUFFLE_DURATION = 600;
  const HARD_DISAPPEAR_INTERVAL = 2000; 
  
  const DIFFICULTY = {
    easy: { name: '보통', size: 5 },
    hard: { name: '어려움', size: 7 }
  };
  let currentDiff = 'easy';

  const COLORS = { 'R': '#e63946', 'B': '#4dabf7', 'G': '#2a9d8f', 'Y': '#f4a261' };

  // ---------- 상태 ----------
  const STATE = { READY:'ready', PLAYING:'playing', PAUSED:'paused', WIN:'win', LOSE:'lose' };
  let state = STATE.READY;

  const game = {
    gridSize: 5, moves: 0, score: 0, board: [], selectedPath: [], soundOn: false, best: 0, isAnimating: false, disappearTimer: null, round: 0 
  };

  // ---------- DOM ----------
  const gridContainer = document.getElementById('grid-container');
  const targetEl = document.getElementById('target');
  const movesEl = document.getElementById('moves');
  const bestEl = document.getElementById('best');
  const msg = document.getElementById('msg');
  const msgTitle = document.getElementById('msgTitle');
  const msgBody = document.getElementById('msgBody');
  const btnStart = document.getElementById('btnStart');
  const pauseMenu = document.getElementById('pauseMenu');
  const statusEl = document.getElementById('status');
  const btnSound = document.getElementById('btnSound');
  const btnSoundPause = document.getElementById('btnSoundPause');
  const diffBtns = document.querySelectorAll('.diff-btn');
  const bannerEl = document.getElementById('banner');
  const bonusTextEl = document.getElementById('bonus-text');

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const lineSvg = document.createElementNS(SVG_NS, 'svg');
  lineSvg.id = 'drag-line';
  const linePoly = document.createElementNS(SVG_NS, 'polyline');
  lineSvg.appendChild(linePoly);
  gridContainer.appendChild(lineSvg);

  // ---------- 오디오 ----------
  let audioCtx = null;
  let activeNodes = [];
  function beep(freq, dur, type) {
    if (!game.soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      g.gain.value = 0.05;
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start();
      const node = { osc, g };
      activeNodes.push(node);
      setTimeout(() => {
        try { osc.stop(); } catch(e){}
        activeNodes = activeNodes.filter(n => n !== node);
      }, dur * 1000);
    } catch(e) {}
  }
  function stopAllSound() {
    activeNodes.forEach(n => { try { n.osc.stop(); } catch(e){} });
    activeNodes = [];
  }

  function updateSoundButtons() {
    const text = '소리: ' + (game.soundOn ? '켜짐' : '꺼짐');
    btnSound.textContent = text;
    if (btnSoundPause) btnSoundPause.textContent = text;
  }

  function toggleSound() {
    game.soundOn = !game.soundOn;
    if (!game.soundOn) stopAllSound();
    updateSoundButtons();
  }

  // ---------- 저장 ----------
  const SAVE_KEY = 'dotConnectSave_v1';
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { best: 0 };
      const obj = JSON.parse(raw);
      const best = Number(obj && obj.best);
      return { best: Number.isFinite(best) && best >= 0 ? best : 0 };
    } catch(e) { return { best: 0 }; }
  }
  function saveBest() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ best: game.best })); } catch(e) {}
  }

  // ---------- 타이머 ----------
  function startDisappearTimer() {
    stopDisappearTimer();
    if (currentDiff !== 'hard') return;

    game.disappearTimer = setInterval(() => {
      if (state !== STATE.PLAYING || game.isAnimating) return;
      
      const aliveDots = [];
      for (let r = 0; r < game.gridSize; r++) {
        for (let c = 0; c < game.gridSize; c++) {
          if (game.board[r][c]) aliveDots.push({ r, c });
        }
      }

      if (aliveDots.length > 10) { 
        const target = aliveDots[Math.floor(Math.random() * aliveDots.length)];
        if (!game.selectedPath.some(p => p.r === target.r && p.c === target.c)) {
          const cell = document.querySelector(`[data-pos="${target.r}-${target.c}"]`);
          if (cell) {
            cell.classList.add('fading-out');
            beep(250, 0.1, 'triangle');
            setTimeout(() => {
              game.board[target.r][target.c] = { color: ['R','B','G','Y'][Math.floor(Math.random()*4)], selected: false };
              renderGrid();
            }, FADE_DURATION);
          }
        }
      }
    }, HARD_DISAPPEAR_INTERVAL);
  }

  function stopDisappearTimer() {
    if (game.disappearTimer) { clearInterval(game.disappearTimer); game.disappearTimer = null; }
  }

  // ---------- 초기화 ----------
  function resetRound() {
    stopDisappearTimer();
    game.round++;
    bannerEl.classList.remove('show');
    bonusTextEl.classList.remove('show');
    game.moves = 0; game.score = 0; game.board = []; game.selectedPath = []; game.isAnimating = false;
    game.gridSize = DIFFICULTY[currentDiff].size;
    
    for (let r = 0; r < game.gridSize; r++) {
      const row = [];
      for (let c = 0; c < game.gridSize; c++) {
        row.push({ color: ['R','B','G','Y'][Math.floor(Math.random()*4)], selected: false });
      }
      game.board.push(row);
    }
    
    gridContainer.style.gridTemplateColumns = `repeat(${game.gridSize}, 1fr)`;
    gridContainer.style.gridTemplateRows = `repeat(${game.gridSize}, 1fr)`;
    
    if (!checkAvailableMoves()) shuffleBoard();
    
    updateHUD();
    renderGrid();
  }

  function startGame() {
    resetRound();
    state = STATE.PLAYING;
    msg.classList.add('hidden');
    pauseMenu.classList.add('hidden');
    startDisappearTimer(); 
    setStatus('진행 중: 같은 색 점을 드래그해서 3개 이상 연결하세요.');
  }

  function endGame(isWin) {
    state = isWin ? STATE.WIN : STATE.LOSE;
    stopDisappearTimer(); 
    if (game.score > game.best) { game.best = game.score; saveBest(); }
    msgTitle.textContent = isWin ? '게임 클리어!' : '게임 종료';
    msgBody.innerHTML = `점수: ${game.score} / 최고: ${game.best}`;
    btnStart.textContent = '다시 시작';
    pauseMenu.classList.add('hidden');
    btnStart.style.display = 'block';
    msg.classList.remove('hidden');
    setStatus(isWin ? '승리' : '패배');
  }

  function togglePause() {
    if (game.isAnimating) return; 
    if (state === STATE.PLAYING) {
      cancelDrag();
      state = STATE.PAUSED;
      stopDisappearTimer(); 
      msgTitle.textContent = '일시정지';
      msgBody.innerHTML = 'ESC를 누르거나 ▶ 버튼을 눌러 재개하세요.';
      btnStart.style.display = 'none';
      pauseMenu.classList.remove('hidden');
      msg.classList.remove('hidden');
      setStatus('일시정지');
    } else if (state === STATE.PAUSED) {
      state = STATE.PLAYING;
      startDisappearTimer(); 
      pauseMenu.classList.add('hidden');
      msg.classList.add('hidden');
      setStatus('진행 중: 같은 색 점을 드래그해서 3개 이상 연결하세요.');
    }
  }

  // ⭐️ DFS(깊이 우선 탐색)를 사용해 꺾인 경로까지 완벽하게 탐색
  function checkAvailableMoves() {
    const dirs = [[-1,0], [1,0], [0,-1], [0,1]];
    const size = game.gridSize;

    for (let startR = 0; startR < size; startR++) {
      for (let startC = 0; startC < size; startC++) {
        const startDot = game.board[startR][startC];
        if (!startDot) continue;

        const targetColor = startDot.color;
        const visited = Array.from({ length: size }, () => Array(size).fill(false));
        
        function dfs(r, c, count) {
          if (count >= 3) return true;

          for (let d of dirs) {
            const nr = r + d[0], nc = c + d[1];
            if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
              const nextDot = game.board[nr][nc];
              if (!visited[nr][nc] && nextDot && nextDot.color === targetColor) {
                visited[nr][nc] = true;
                if (dfs(nr, nc, count + 1)) return true;
                visited[nr][nc] = false;
              }
            }
          }
          return false;
        }

        visited[startR][startC] = true;
        if (dfs(startR, startC, 1)) return true;
      }
    }
    return false;
  }

  function shuffleBoard() {
    for (let r = 0; r < game.gridSize; r++) {
      for (let c = 0; c < game.gridSize; c++) {
        game.board[r][c] = { color: ['R','B','G','Y'][Math.floor(Math.random()*4)], selected: false };
      }
    }
    if (!checkAvailableMoves()) shuffleBoard();
  }

  function checkWin() { if (game.moves >= MAX_MOVES) endGame(false); }

  // ---------- 드래그 입력 ----------
  let dragging = false;
  let activePointerId = null;
  let lastX = 0, lastY = 0;

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest ? el.closest('.dot-cell') : null;
    if (!cell || !cell.dataset.pos || !gridContainer.contains(cell)) return null;
    const [r, c] = cell.dataset.pos.split('-').map(Number);
    return { r, c };
  }

  function startDrag(r, c) {
    if (state !== STATE.PLAYING || game.isAnimating) return false;
    const dot = game.board[r][c];
    if (!dot) return false;
    game.selectedPath = [{ r, c }];
    dot.selected = true;
    dragging = true;
    beep(400, 0.05, 'sine');
    refreshSelection();
    return true;
  }

  function extendDrag(r, c) {
    const path = game.selectedPath;
    if (!path.length) return;
    const last = path[path.length - 1];
    if (last.r === r && last.c === c) return;
    const dot = game.board[r][c];
    if (!dot) return;

    if (path.length >= 2) {
      const prev = path[path.length - 2];
      if (prev.r === r && prev.c === c) {
        game.board[last.r][last.c].selected = false;
        path.pop();
        beep(350, 0.05, 'sine');
        refreshSelection();
        return;
      }
    }

    if (path.some(p => p.r === r && p.c === c)) return;
    if (dot.color !== game.board[last.r][last.c].color) return;
    if (Math.abs(r - last.r) + Math.abs(c - last.c) !== 1) return;

    path.push({ r, c });
    dot.selected = true;
    beep(400 + path.length * 40, 0.05, 'sine');
    refreshSelection();
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    activePointerId = null;
    const path = game.selectedPath;
    if (path.length >= MIN_CONNECT) {
      commitPath(path);
    } else {
      if (path.length > 1) beep(300, 0.1, 'triangle');
      clearSelection();
    }
  }

  function cancelDrag() {
    if (!dragging) return;
    dragging = false;
    activePointerId = null;
    clearSelection();
  }

  function commitPath(path) {
    game.isAnimating = true;
    
    let earnedScore = 1 + (path.length - 3);
    
    if (path.length >= BONUS_FROM) {
      showBonusText(path.length - 3);
    }
    
    game.score += earnedScore;
    game.moves++;
    updateHUD();

    path.forEach(p => {
      const cell = document.querySelector(`[data-pos="${p.r}-${p.c}"]`);
      if (cell) cell.classList.add('fading-out');
    });

    beep(800, 0.1, 'square');

    setTimeout(() => {
      path.forEach(p => { game.board[p.r][p.c] = null; });
      for (let i = 0; i < game.gridSize; i++) {
        for (let j = 0; j < game.gridSize; j++) {
          if (game.board[i][j] === null) game.board[i][j] = { color: ['R','B','G','Y'][Math.floor(Math.random()*4)], selected: false };
        }
      }
      clearSelection();
      if (!checkAvailableMoves()) {
        reshuffleWithBanner();
      } else {
        game.isAnimating = false;
      }
      checkWin();
    }, FADE_DURATION);
  }

  function showBonusText(extra) {
    bonusTextEl.textContent = `보너스 점수! +${extra}`;
    bonusTextEl.classList.remove('show');
    void bonusTextEl.offsetWidth; 
    bonusTextEl.classList.add('show');
  }

  // ---------- 재배치 ----------
  function showBanner() {
    bannerEl.classList.remove('show');
    void bannerEl.offsetWidth;
    bannerEl.classList.add('show');
  }

  function reshuffleWithBanner() {
    const round = game.round;
    game.isAnimating = true; 
    setStatus('움직일 수 있는 곳이 없습니다! 판을 재배치합니다.');
    showBanner();
    setTimeout(() => {
      if (round !== game.round) return;
      shuffleBoard();
      recolorGrid();
      setTimeout(() => {
        if (round !== game.round) return;
        game.isAnimating = false;
        if (state === STATE.PLAYING) setStatus('진행 중: 같은 색 점을 드래그해서 3개 이상 연결하세요.');
      }, 800);
    }, 500);
  }

  function recolorGrid() {
    gridContainer.querySelectorAll('.dot-cell').forEach(cell => {
      const [r, c] = cell.dataset.pos.split('-').map(Number);
      const dot = game.board[r][c];
      if (dot) cell.style.backgroundColor = COLORS[dot.color];
    });
  }

  function refreshSelection() {
    gridContainer.querySelectorAll('.dot-cell').forEach(cell => {
      const [r, c] = cell.dataset.pos.split('-').map(Number);
      const dot = game.board[r][c];
      cell.classList.toggle('selected', !!(dot && dot.selected));
    });
    drawLine();
  }

  function drawLine() {
    const path = game.selectedPath;
    if (path.length < 2) { linePoly.setAttribute('points', ''); return; }
    const first = game.board[path[0].r][path[0].c];
    if (first) linePoly.setAttribute('stroke', COLORS[first.color]);
    const pts = [];
    path.forEach(p => {
      const cell = gridContainer.querySelector(`[data-pos="${p.r}-${p.c}"]`);
      if (cell) pts.push((cell.offsetLeft + cell.offsetWidth / 2) + ',' + (cell.offsetTop + cell.offsetHeight / 2));
    });
    linePoly.setAttribute('points', pts.join(' '));
  }

  function clearSelection() {
    game.selectedPath.forEach(p => { if (game.board[p.r][p.c]) game.board[p.r][p.c].selected = false; });
    game.selectedPath = [];
    renderGrid();
  }

  // ---------- 렌더링 ----------
  function renderGrid() {
    gridContainer.querySelectorAll('.dot-cell').forEach(el => el.remove());
    for (let r = 0; r < game.gridSize; r++) {
      for (let c = 0; c < game.gridSize; c++) {
        const dot = game.board[r][c];
        const cell = document.createElement('div');
        cell.className = 'dot-cell';
        cell.dataset.pos = `${r}-${c}`;
        if (dot) {
          cell.style.backgroundColor = COLORS[dot.color];
          if (dot.selected) cell.classList.add('selected');
        }
        gridContainer.appendChild(cell);
      }
    }
    drawLine();
  }

  function updateHUD() {
    targetEl.textContent = game.score;
    movesEl.textContent = game.moves + ' / ' + MAX_MOVES;
    bestEl.textContent = game.best;
  }
  function setStatus(t) { statusEl.textContent = t; }

  // ---------- 이벤트 ----------
  function onKeyDown(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') { togglePause(); e.preventDefault(); return; }
    if (k === 'enter' && (state === STATE.READY || state === STATE.WIN || state === STATE.LOSE)) { startGame(); }
  }

  diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const newDiff = btn.dataset.diff;
      if (currentDiff === newDiff) return;
      currentDiff = newDiff;
      diffBtns.forEach(b => { if (b.dataset.diff === newDiff) b.classList.add('active'); else b.classList.remove('active'); });
      setStatus(`난이도 변경: ${DIFFICULTY[newDiff].size}x${DIFFICULTY[newDiff].size} (새 게임 시작)`);
      startGame(); 
    });
  });

  gridContainer.addEventListener('pointerdown', (e) => {
    if (dragging) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = cellFromPoint(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    if (startDrag(p.r, p.c)) {
      activePointerId = e.pointerId;
      lastX = e.clientX; lastY = e.clientY;
      try { gridContainer.setPointerCapture(e.pointerId); } catch (err) {}
    }
  });

  gridContainer.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== activePointerId) return;
    if (state !== STATE.PLAYING) return;
    e.preventDefault();
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10));
    for (let i = 1; i <= steps; i++) {
      const p = cellFromPoint(lastX + dx * i / steps, lastY + dy * i / steps);
      if (p) extendDrag(p.r, p.c);
    }
    lastX = e.clientX; lastY = e.clientY;
  });

  function releasePointer(e) {
    if (!dragging || e.pointerId !== activePointerId) return;
    try { gridContainer.releasePointerCapture(e.pointerId); } catch (err) {}
    if (e.type === 'pointercancel') cancelDrag();
    else endDrag();
  }
  gridContainer.addEventListener('pointerup', releasePointer);
  gridContainer.addEventListener('pointercancel', releasePointer);
  gridContainer.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('blur', () => { if (state === STATE.PLAYING) togglePause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === STATE.PLAYING) togglePause();
  });

  btnStart.addEventListener('click', startGame);
  document.getElementById('btnResume').addEventListener('click', togglePause);
  document.getElementById('btnRestart').addEventListener('click', () => { startGame(); });
  document.getElementById('btnPause').addEventListener('click', togglePause);
  
  btnSound.addEventListener('click', toggleSound);
  btnSoundPause.addEventListener('click', toggleSound);

  // ---------- 시작 ----------
  const saved = loadSave();
  game.best = saved.best;
  updateSoundButtons();
  updateHUD();
  setStatus('시작 버튼을 누르세요');
  resetRound();
})();
