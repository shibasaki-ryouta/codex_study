const canvas = document.getElementById('board');
const context = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextContext = nextCanvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const scoreElement = document.getElementById('score');
const linesElement = document.getElementById('lines');
const levelElement = document.getElementById('level');
const startButton = document.getElementById('start-button');
const pauseButton = document.getElementById('pause-button');

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const NEXT_BLOCK = 24;
const COLORS = {
  I: '#22d3ee',
  J: '#60a5fa',
  L: '#fb923c',
  O: '#facc15',
  S: '#4ade80',
  T: '#c084fc',
  Z: '#fb7185',
};
const SHAPES = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]],
};
const TYPES = Object.keys(SHAPES);

let board;
let current;
let next;
let score = 0;
let lines = 0;
let level = 1;
let dropCounter = 0;
let lastTime = 0;
let isPlaying = false;
let isPaused = false;
let animationId = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function createPiece(type = TYPES[Math.floor(Math.random() * TYPES.length)]) {
  const matrix = SHAPES[type].map((row) => [...row]);
  return {
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: 0,
  };
}

function drawBlock(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x * size + 4, y * size + 4, size - 8, 5);
}

function drawMatrix(ctx, matrix, offset, size, type) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawBlock(ctx, x + offset.x, y + offset.y, size, COLORS[type]);
      }
    });
  });
}

function drawGrid() {
  context.strokeStyle = 'rgba(148, 163, 184, 0.12)';
  context.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    context.beginPath();
    context.moveTo(x * BLOCK, 0);
    context.lineTo(x * BLOCK, ROWS * BLOCK);
    context.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    context.beginPath();
    context.moveTo(0, y * BLOCK);
    context.lineTo(COLS * BLOCK, y * BLOCK);
    context.stroke();
  }
}

function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  board.forEach((row, y) => {
    row.forEach((type, x) => {
      if (type) drawBlock(context, x, y, BLOCK, COLORS[type]);
    });
  });
  if (current) drawMatrix(context, current.matrix, current, BLOCK, current.type);
}

function drawNext() {
  nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!next) return;
  const offset = {
    x: Math.floor((nextCanvas.width / NEXT_BLOCK - next.matrix[0].length) / 2),
    y: Math.floor((nextCanvas.height / NEXT_BLOCK - next.matrix.length) / 2),
  };
  drawMatrix(nextContext, next.matrix, offset, NEXT_BLOCK, next.type);
}

function collide(piece, targetBoard = board) {
  return piece.matrix.some((row, y) => row.some((value, x) => {
    if (!value) return false;
    const boardX = piece.x + x;
    const boardY = piece.y + y;
    return boardX < 0 || boardX >= COLS || boardY >= ROWS || targetBoard[boardY]?.[boardX];
  }));
}

function merge() {
  current.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) board[current.y + y][current.x + x] = current.type;
    });
  });
}

function clearLines() {
  let cleared = 0;
  outer: for (let y = ROWS - 1; y >= 0; y--) {
    for (let x = 0; x < COLS; x++) {
      if (!board[y][x]) continue outer;
    }
    board.splice(y, 1);
    board.unshift(Array(COLS).fill(null));
    cleared++;
    y++;
  }
  if (!cleared) return;
  const lineScores = [0, 100, 300, 500, 800];
  score += lineScores[cleared] * level;
  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  updateStats();
}

function rotate(matrix) {
  return matrix[0].map((_, x) => matrix.map((row) => row[x]).reverse());
}

function rotateCurrent() {
  if (!isPlaying || isPaused) return;
  const originalMatrix = current.matrix;
  const originalX = current.x;
  current.matrix = rotate(current.matrix);
  for (const offset of [0, -1, 1, -2, 2]) {
    current.x = originalX + offset;
    if (!collide(current)) {
      draw();
      return;
    }
  }
  current.matrix = originalMatrix;
  current.x = originalX;
}

function move(direction) {
  if (!isPlaying || isPaused) return;
  current.x += direction;
  if (collide(current)) current.x -= direction;
  draw();
}

function softDrop() {
  if (!isPlaying || isPaused) return;
  current.y++;
  if (collide(current)) {
    current.y--;
    lockPiece();
  } else {
    score += 1;
    updateStats();
  }
  dropCounter = 0;
  draw();
}

function hardDrop() {
  if (!isPlaying || isPaused) return;
  let distance = 0;
  while (!collide(current)) {
    current.y++;
    distance++;
  }
  current.y--;
  score += Math.max(0, distance - 1) * 2;
  lockPiece();
  updateStats();
  draw();
}

function lockPiece() {
  merge();
  clearLines();
  spawnPiece();
}

function spawnPiece() {
  current = next || createPiece();
  next = createPiece();
  drawNext();
  if (collide(current)) {
    endGame();
  }
}

function update(time = 0) {
  if (!isPlaying || isPaused) return;
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;
  const dropInterval = Math.max(120, 900 - (level - 1) * 70);
  if (dropCounter > dropInterval) softDrop();
  draw();
  animationId = requestAnimationFrame(update);
}

function updateStats() {
  scoreElement.textContent = score.toLocaleString('ja-JP');
  linesElement.textContent = lines.toString();
  levelElement.textContent = level.toString();
}

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function startGame() {
  board = createBoard();
  current = null;
  next = createPiece();
  score = 0;
  lines = 0;
  level = 1;
  dropCounter = 0;
  lastTime = 0;
  isPlaying = true;
  isPaused = false;
  updateStats();
  spawnPiece();
  hideOverlay();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(update);
}

function togglePause() {
  if (!isPlaying) return;
  isPaused = !isPaused;
  if (isPaused) {
    showOverlay('PAUSE', 'Pキーまたは一時停止ボタンで再開');
    cancelAnimationFrame(animationId);
  } else {
    hideOverlay();
    lastTime = 0;
    animationId = requestAnimationFrame(update);
  }
}

function endGame() {
  isPlaying = false;
  cancelAnimationFrame(animationId);
  showOverlay('GAME OVER', 'スタートボタンでもう一度プレイ');
  draw();
}

function handleAction(action) {
  const actions = {
    left: () => move(-1),
    right: () => move(1),
    down: softDrop,
    rotate: rotateCurrent,
    drop: hardDrop,
  };
  actions[action]?.();
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'p' || event.key === 'P') {
    togglePause();
    return;
  }
  const keyActions = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ArrowUp: 'rotate',
    x: 'rotate',
    X: 'rotate',
    ' ': 'drop',
  };
  const action = keyActions[event.key];
  if (action) {
    event.preventDefault();
    handleAction(action);
  }
});

startButton.addEventListener('click', startGame);
pauseButton.addEventListener('click', togglePause);
document.querySelectorAll('.touch-controls button').forEach((button) => {
  button.addEventListener('click', () => handleAction(button.dataset.action));
});

board = createBoard();
next = createPiece();
updateStats();
draw();
drawNext();
