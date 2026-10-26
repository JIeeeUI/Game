/* =========================================================
   게임 설정값
   ========================================================= */
const CONFIG = {
  TOTAL_HOLES: 9,        // 구멍 개수 (3x3)
  TARGET_CATCH: 20,      // 성공 조건: 몇 마리 잡기
  MAX_DAMAGE: 5,         // 실패 조건: 몇 번 놓치면 끝
  MOLE_UP_TIME: 2000,    // 두더지 올라와 있는 시간 (ms)
  SPAWN_INTERVAL: 800,   // 두더지 기본 등장 간격 (800ms = 속도 1단계)
  SPEED_STEP: 50,        // 👈 속도 1단계당 줄어들 간격 (10단계까지 오르도록 50으로 조정)
  MIN_INTERVAL: 300,     // 최대 속도 (이보다 빨라지지 않음)
  MAX_SPEED_LEVEL: 10,   // 👈 최대 속도 10단계로 상향
  CATCH_PER_SPEEDUP: 5,  // 5마리 잡을 때마다 속도 1단계 상승
  COMBO_START: 5,        // 콤보 시작 마릿수
};

/* =========================================================
   게임 상태
   ========================================================= */
let state = {
  caught: 0,
  damage: 0,
  combo: 0,
  score: 0,
  isPlaying: false,
  isPaused: false,
  activeHole: -1,
  moleTimer: null,
  upTimer: null,
  speedLevel: 1, // 현재 속도 (1 ~ 10)
};

let bestScore = 0;
let muted = false;
let lastSpeedLevel = 1; // 게임 종료 시점의 속도를 기억하는 변수

/* =========================================================
   DOM 요소
   ========================================================= */
const fieldEl  = document.getElementById('field');
const caughtEl = document.getElementById('caught');
const damageEl = document.getElementById('damage');
const comboEl  = document.getElementById('combo');
const scoreEl  = document.getElementById('score');
const bestEl   = document.getElementById('best');
const muteBtn  = document.getElementById('muteBtn');
const pauseBtn = document.getElementById('pauseBtn');
const overlay  = document.getElementById('overlay');
const panel    = document.getElementById('panel');
const startBtn = document.getElementById('startBtn'); 
const pauseOverlay = document.getElementById('pauseOverlay');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const speedAlert = document.getElementById('speedAlert');

/* =========================================================
   밭 생성
   ========================================================= */
function buildField() {
  fieldEl.innerHTML = '';
  for (let i = 0; i < CONFIG.TOTAL_HOLES; i++) {
    const hole = document.createElement('div');
    hole.className = 'hole';
    hole.innerHTML = '<span class="mole">🐹</span>';
    hole.addEventListener('click', () => onHoleClick(i));
    fieldEl.appendChild(hole);
  }
}

/* =========================================================
   효과음
   ========================================================= */
let audioCtx = null;
function playSound(type) {
  if (muted) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;

  if (type === 'hit') {
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'miss') {
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.25);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  }
}

/* =========================================================
   저장 / 불러오기
   ========================================================= */
const STORAGE_KEY = 'moleGameData';
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('no data');
    const data = JSON.parse(raw);
    bestScore = Number.isFinite(data.bestScore) ? data.bestScore : 0;
    muted     = typeof data.muted === 'boolean' ? data.muted : false;
  } catch (e) {
    bestScore = 0; muted = false;
  }
  bestEl.textContent = bestScore;
  updateMuteButton();
}
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bestScore, muted }));
  } catch (e) { console.warn('저장 실패:', e); }
}

/* =========================================================
   화면 갱신
   ========================================================= */
function updateHUD() {
  caughtEl.textContent = state.caught;
  damageEl.textContent = state.damage;
  comboEl.textContent  = state.combo;
  scoreEl.textContent  = state.score;
  comboEl.classList.toggle('combo-hot', state.combo >= CONFIG.COMBO_START);
}
function updateMuteButton() {
  muteBtn.textContent = muted ? '🔇' : '🔊';
}
function showSpeedAlert() {
  speedAlert.classList.remove('show');
  void speedAlert.offsetWidth; // 애니메이션 재시작 트릭
  speedAlert.classList.add('show');
}

/* =========================================================
   화면 청소 (두더지 내리기)
   ========================================================= */
function clearAllMoles() {
  document.querySelectorAll('.hole.active').forEach(h => h.classList.remove('active'));
  state.activeHole = -1;
  clearTimeout(state.upTimer);
  clearTimeout(state.moleTimer);
}

/* =========================================================
   게임 시작 / 종료
   ========================================================= */
function startNewGame() {
  lastSpeedLevel = 1; // '다시 도전'은 무조건 1단계부터
  initGame(1);
}

function continueGame() {
  initGame(lastSpeedLevel); // 👈 '이어서 하기'는 끝났던 속도부터
}

function initGame(speedLevel) {
  clearAllMoles(); 

  state = {
    caught: 0, damage: 0, combo: 0, score: 0,
    isPlaying: true, isPaused: false, activeHole: -1,
    moleTimer: null, upTimer: null,
    speedLevel: speedLevel,
  };
  updateHUD();
  
  pauseBtn.textContent = '⏸️';
  overlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  scheduleNextMole();
}

function endGame(win) {
  state.isPlaying = false;
  clearAllMoles(); 

  if (state.score > bestScore) {
    bestScore = state.score;
    bestEl.textContent = bestScore;
    saveData();
  }

  // 👇 게임이 끝난 시점의 속도를 기억합니다. (이어서 하기 위함)
  lastSpeedLevel = state.speedLevel; 

  panel.innerHTML = win
    ? `<h2>🎉 성공! 농장을 지켰어요!</h2>
       <p>잡은 두더지: <b>${state.caught}</b>마리</p>
       <p>최종 점수: <b>${state.score}</b></p>
       <div class="btn-group">
         <button id="continueBtn" class="btn-resume">이어서 하기</button>
         <button id="startBtn" class="btn-restart">다시 도전</button>
       </div>`
    : `<h2>😢 실패... 농작물이 망가졌어요</h2>
       <p>잡은 두더지: <b>${state.caught}</b>마리</p>
       <p>최종 점수: <b>${state.score}</b></p>
       <div class="btn-group">
         <button id="continueBtn" class="btn-resume">이어서 하기</button>
         <button id="startBtn" class="btn-restart">다시 도전</button>
       </div>`;

  document.getElementById('startBtn').addEventListener('click', startNewGame);
  document.getElementById('continueBtn').addEventListener('click', continueGame);
  overlay.classList.remove('hidden');
}

/* =========================================================
   두더지 등장 / 도망
   ========================================================= */
function scheduleNextMole() {
  if (!state.isPlaying || state.isPaused) return;

  const currentInterval = Math.max(
    CONFIG.MIN_INTERVAL, 
    CONFIG.SPAWN_INTERVAL - ((state.speedLevel - 1) * CONFIG.SPEED_STEP)
  );

  state.moleTimer = setTimeout(() => {
    if (!state.isPlaying || state.isPaused) return;
    spawnMole();
    scheduleNextMole();
  }, currentInterval);
}

function spawnMole() {
  if (state.activeHole !== -1) return;
  const idx = Math.floor(Math.random() * CONFIG.TOTAL_HOLES);
  state.activeHole = idx;
  fieldEl.children[idx].classList.add('active');

  state.upTimer = setTimeout(() => {
    if (state.isPaused) return; 
    if (state.activeHole === idx) moleEscaped();
  }, CONFIG.MOLE_UP_TIME);
}

function moleEscaped() {
  if (state.activeHole !== -1) {
    fieldEl.children[state.activeHole].classList.remove('active');
  }
  state.activeHole = -1;
  clearTimeout(state.upTimer);

  state.damage++;
  state.combo = 0;
  playSound('miss');
  updateHUD();

  if (state.damage >= CONFIG.MAX_DAMAGE) endGame(false);
}

/* =========================================================
   구멍 클릭
   ========================================================= */
function onHoleClick(idx) {
  if (!state.isPlaying || state.isPaused) return;
  if (state.activeHole !== idx) return;

  fieldEl.children[idx].classList.remove('active');
  state.activeHole = -1;
  clearTimeout(state.upTimer);

  state.caught++;
  state.combo++;

  let point = 1;
  if (state.combo >= CONFIG.COMBO_START) point = 2;
  state.score += point;

  playSound('hit');
  updateHUD();

  if (state.caught % CONFIG.CATCH_PER_SPEEDUP === 0) {
    if (state.speedLevel < CONFIG.MAX_SPEED_LEVEL) {
      state.speedLevel++;
      showSpeedAlert();
      clearTimeout(state.moleTimer);
      scheduleNextMole(); 
    }
  }

  if (state.caught >= CONFIG.TARGET_CATCH) endGame(true);
}

/* =========================================================
   포커스 이탈 시 자동 일시정지
   ========================================================= */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.isPlaying && !state.isPaused) {
      state.isPaused = true;
      pauseBtn.textContent = '▶️';
      pauseOverlay.classList.remove('hidden');
      
      clearTimeout(state.moleTimer);
      clearTimeout(state.upTimer);
      
      if (state.activeHole !== -1) {
        fieldEl.children[state.activeHole].classList.remove('active');
        state.activeHole = -1;
      }
    }
  }
});

/* =========================================================
   버튼 이벤트: 일시정지
   ========================================================= */
pauseBtn.addEventListener('click', () => {
  if (!state.isPlaying || state.isPaused) return;

  state.isPaused = true;
  pauseBtn.textContent = '▶️';
  pauseOverlay.classList.remove('hidden');
  
  clearTimeout(state.moleTimer);
  clearTimeout(state.upTimer);
});

/* =========================================================
   버튼 이벤트: 일시정지 화면 내부 버튼
   ========================================================= */
resumeBtn.addEventListener('click', () => {
  if (!state.isPlaying || !state.isPaused) return;

  state.isPaused = false;
  pauseBtn.textContent = '⏸️';
  pauseOverlay.classList.add('hidden');

  if (state.activeHole !== -1) {
    const idx = state.activeHole;
    state.upTimer = setTimeout(() => {
      if (state.isPaused) return;
      if (state.activeHole === idx) moleEscaped();
    }, CONFIG.MOLE_UP_TIME);
  }
  scheduleNextMole();
});

restartBtn.addEventListener('click', () => {
  pauseOverlay.classList.add('hidden');
  startNewGame();
});

/* =========================================================
   버튼 이벤트: 음소거
   ========================================================= */
muteBtn.addEventListener('click', () => {
  muted = !muted;
  updateMuteButton();
  saveData();
});

/* =========================================================
   초기 실행
   ========================================================= */
buildField();
loadData();
updateHUD();
startBtn.addEventListener('click', startNewGame);