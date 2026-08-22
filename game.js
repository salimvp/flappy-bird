// ── Canvas Setup ──────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const W = 400;
const H = 600;
canvas.width = W;
canvas.height = H;

// ── DOM Elements ─────────────────────────────────────────────
const scoreDisplay = document.getElementById('score-display');
const startScreen = document.getElementById('start-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const finalScoreEl = document.getElementById('final-score');
const bestScoreEl = document.getElementById('best-score');
const cooldownText = document.getElementById('cooldown-text');
const cooldownCount = document.getElementById('cooldown-count');
const restartText = document.getElementById('restart-text');

// ── Game Constants ───────────────────────────────────────────
const GRAVITY = 0.45;
const FLAP_POWER = -7.5;
const PIPE_WIDTH = 60;
const PIPE_GAP = 150;
const PIPE_SPEED = 2.5;
const PIPE_SPAWN_INTERVAL = 90;
const GROUND_HEIGHT = 60;

// ── Colors ───────────────────────────────────────────────────
const SKY_TOP = '#4dc9f6';
const SKY_BOTTOM = '#87ceeb';
const PIPE_COLOR = '#5cb85c';
const PIPE_BORDER = '#3d8b3d';
const PIPE_HIGHLIGHT = '#7ed67e';
const GROUND_COLOR = '#ded895';
const GROUND_DARK = '#c2b870';
const GROUND_LINE = '#a89e56';

// ── Load Bird Image ──────────────────────────────────────────
const birdImg = new Image();
let birdImageLoaded = false;
birdImg.onload = () => { birdImageLoaded = true; };
birdImg.src = 'bird.png';

// ── Load Flap Audio ──────────────────────────────────────────
const flapAudio = new Audio('flap.mp3');
flapAudio.preload = 'auto';

// ── Audio Engine (Web Audio API) ─────────────────────────────
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playFlapSound() {
  ensureAudio();
  flapAudio.currentTime = 0;
  flapAudio.play().catch(() => {});

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.12);
}

function playScore() {
  ensureAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(520, audioCtx.currentTime);
  osc.frequency.setValueAtTime(680, audioCtx.currentTime + 0.06);
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.18);
}

function playHit() {
  ensureAudio();
  const bufferSize = audioCtx.sampleRate * 0.2;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  noise.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  noise.start(audioCtx.currentTime);

  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.15);
  oscGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
  osc.connect(oscGain);
  oscGain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.15);
}

function playDie() {
  ensureAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.4);
  gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.4);
}

// ── Game State ───────────────────────────────────────────────
let gameState = 'start';
let bird, pipes, score, bestScore, frameCount, groundOffset;
let deathTimer = 0;
let cooldownTimer = 0;
let canRestart = false;

bestScore = parseInt(localStorage.getItem('flappyBest') || '0', 10);

function resetGame() {
  bird = { x: 80, y: H / 2 - 20, vy: 0, rotation: 0, width: 50, height: 50 };
  pipes = [];
  score = 0;
  frameCount = 0;
  groundOffset = 0;
  deathTimer = 0;
  cooldownTimer = 0;
  canRestart = false;
  scoreDisplay.textContent = '0';
}

resetGame();

// ── Input ────────────────────────────────────────────────────
function flap() {
  if (gameState === 'start') {
    gameState = 'playing';
    startScreen.classList.add('hidden');
    bird.vy = FLAP_POWER;
    playFlapSound();
    return;
  }
  if (gameState === 'playing') {
    bird.vy = FLAP_POWER;
    playFlapSound();
    return;
  }
  if (gameState === 'gameover' && canRestart) {
    gameoverScreen.classList.add('hidden');
    cooldownText.classList.remove('hidden');
    restartText.classList.add('hidden');
    resetGame();
    gameState = 'playing';
    bird.vy = FLAP_POWER;
    playFlapSound();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    flap();
  }
});

const gameWrapper = document.getElementById('game-wrapper');
gameWrapper.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  flap();
});
gameWrapper.addEventListener('touchstart', (e) => {
  e.preventDefault();
  flap();
}, { passive: false });
gameWrapper.addEventListener('touchmove', (e) => {
  e.preventDefault();
}, { passive: false });

// ── Pipe Spawning ────────────────────────────────────────────
function spawnPipe() {
  const minTop = 60;
  const maxTop = H - GROUND_HEIGHT - PIPE_GAP - 60;
  const topHeight = Math.random() * (maxTop - minTop) + minTop;
  pipes.push({ x: W, topHeight, scored: false });
}

// ── Collision Detection ──────────────────────────────────────
function checkCollision() {
  if (bird.y + bird.height / 2 >= H - GROUND_HEIGHT || bird.y - bird.height / 2 <= 0) {
    return true;
  }
  for (const pipe of pipes) {
    const birdLeft = bird.x - bird.width / 2 + 6;
    const birdRight = bird.x + bird.width / 2 - 6;
    const birdTop = bird.y - bird.height / 2 + 6;
    const birdBottom = bird.y + bird.height / 2 - 6;
    if (birdRight > pipe.x && birdLeft < pipe.x + PIPE_WIDTH) {
      if (birdTop < pipe.topHeight || birdBottom > pipe.topHeight + PIPE_GAP) {
        return true;
      }
    }
  }
  return false;
}

// ── Update ───────────────────────────────────────────────────
function update() {
  if (gameState === 'dying') {
    bird.vy += GRAVITY;
    bird.y += bird.vy;
    bird.rotation = Math.min(bird.rotation + 4, 90);
    deathTimer++;
    if (bird.y + bird.height / 2 >= H - GROUND_HEIGHT) {
      bird.y = H - GROUND_HEIGHT - bird.height / 2;
      gameState = 'cooldown';
      cooldownTimer = 0;
      playDie();
    }
    return;
  }

  if (gameState === 'cooldown') {
    cooldownTimer++;
    const secondsLeft = Math.ceil((180 - cooldownTimer) / 60);
    cooldownCount.textContent = Math.max(secondsLeft, 0);
    if (cooldownTimer >= 180) {
      canRestart = true;
      gameState = 'gameover';
      cooldownText.classList.add('hidden');
      restartText.classList.remove('hidden');
    }
    return;
  }

  if (gameState !== 'playing') return;

  frameCount++;
  bird.vy += GRAVITY;
  bird.y += bird.vy;
  bird.rotation = Math.min(Math.max(bird.vy * 3, -30), 90);

  if (frameCount % PIPE_SPAWN_INTERVAL === 0) spawnPipe();

  for (const pipe of pipes) pipe.x -= PIPE_SPEED;

  for (const pipe of pipes) {
    if (!pipe.scored && pipe.x + PIPE_WIDTH < bird.x) {
      pipe.scored = true;
      score++;
      scoreDisplay.textContent = score;
      playScore();
    }
  }

  pipes = pipes.filter((p) => p.x + PIPE_WIDTH > -10);
  groundOffset = (groundOffset + PIPE_SPEED) % 24;

  if (checkCollision()) {
    gameState = 'dying';
    deathTimer = 0;
    bird.vy = -4;
    playHit();
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('flappyBest', bestScore);
    }
    finalScoreEl.textContent = 'Score: ' + score;
    bestScoreEl.textContent = 'Best: ' + bestScore;
    gameoverScreen.classList.remove('hidden');
    cooldownText.classList.remove('hidden');
    restartText.classList.add('hidden');
  }
}

// ── Draw ─────────────────────────────────────────────────────
function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, SKY_TOP);
  grad.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  drawCloud(50, 80, 1);
  drawCloud(200, 50, 0.7);
  drawCloud(320, 110, 0.9);
  drawCloud(140, 140, 0.6);
}

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.arc(25, -5, 25, 0, Math.PI * 2);
  ctx.arc(50, 0, 20, 0, Math.PI * 2);
  ctx.arc(20, 10, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGround() {
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, H - GROUND_HEIGHT, W, GROUND_HEIGHT);
  ctx.fillStyle = '#6abf4b';
  ctx.fillRect(0, H - GROUND_HEIGHT, W, 8);
  ctx.fillStyle = GROUND_DARK;
  for (let x = -groundOffset; x < W + 24; x += 24) {
    ctx.fillRect(x, H - GROUND_HEIGHT + 14, 12, 4);
    ctx.fillRect(x + 12, H - GROUND_HEIGHT + 22, 12, 4);
  }
  ctx.strokeStyle = GROUND_LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H - GROUND_HEIGHT);
  ctx.lineTo(W, H - GROUND_HEIGHT);
  ctx.stroke();
}

function drawPipe(pipe) {
  const topH = pipe.topHeight;
  const bottomY = topH + PIPE_GAP;
  const capHeight = 26;
  const capOverhang = 4;

  ctx.fillStyle = PIPE_COLOR;
  ctx.fillRect(pipe.x, 0, PIPE_WIDTH, topH);
  ctx.fillStyle = PIPE_HIGHLIGHT;
  ctx.fillRect(pipe.x + 4, 0, 8, topH);
  ctx.fillStyle = PIPE_BORDER;
  ctx.fillRect(pipe.x + PIPE_WIDTH - 8, 0, 8, topH);
  ctx.strokeStyle = PIPE_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(pipe.x, 0, PIPE_WIDTH, topH);

  const capX = pipe.x - capOverhang;
  const capW = PIPE_WIDTH + capOverhang * 2;
  const capY = topH - capHeight;
  ctx.fillStyle = PIPE_COLOR;
  ctx.fillRect(capX, capY, capW, capHeight);
  ctx.fillStyle = PIPE_HIGHLIGHT;
  ctx.fillRect(capX + 4, capY, 10, capHeight);
  ctx.fillStyle = PIPE_BORDER;
  ctx.fillRect(capX + capW - 8, capY, 8, capHeight);
  ctx.strokeStyle = PIPE_BORDER;
  ctx.strokeRect(capX, capY, capW, capHeight);

  const bottomH = H - GROUND_HEIGHT - bottomY;
  ctx.fillStyle = PIPE_COLOR;
  ctx.fillRect(pipe.x, bottomY, PIPE_WIDTH, bottomH);
  ctx.fillStyle = PIPE_HIGHLIGHT;
  ctx.fillRect(pipe.x + 4, bottomY, 8, bottomH);
  ctx.fillStyle = PIPE_BORDER;
  ctx.fillRect(pipe.x + PIPE_WIDTH - 8, bottomY, 8, bottomH);
  ctx.strokeStyle = PIPE_BORDER;
  ctx.strokeRect(pipe.x, bottomY, PIPE_WIDTH, bottomH);

  const bCapY = bottomY;
  ctx.fillStyle = PIPE_COLOR;
  ctx.fillRect(capX, bCapY, capW, capHeight);
  ctx.fillStyle = PIPE_HIGHLIGHT;
  ctx.fillRect(capX + 4, bCapY, 10, capHeight);
  ctx.fillStyle = PIPE_BORDER;
  ctx.fillRect(capX + capW - 8, bCapY, 8, capHeight);
  ctx.strokeStyle = PIPE_BORDER;
  ctx.strokeRect(capX, bCapY, capW, capHeight);
}

function drawBird() {
  if (!birdImg.complete || !birdImageLoaded) {
    // Fallback: yellow circle while image loads
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate((bird.rotation * Math.PI) / 180);
    ctx.fillStyle = '#f5c842';
    ctx.beginPath();
    ctx.ellipse(0, 0, bird.width / 2, bird.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate((bird.rotation * Math.PI) / 180);
  ctx.drawImage(birdImg, -bird.width / 2, -bird.height / 2, bird.width, bird.height);
  ctx.restore();
}

function draw() {
  drawBackground();
  pipes.forEach(drawPipe);
  drawGround();
  drawBird();
}

// ── Game Loop ────────────────────────────────────────────────
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
