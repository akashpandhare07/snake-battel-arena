
const socket = io();

const $ = id => document.getElementById(id);

let roomCode = null;
let roomData = null;
let me = null;
let lastState = null;
let toastTimer = null;

const screens = ["home", "lobby", "game", "results"];

function show(id) {
  screens.forEach(screen => {
    const element = $(screen);
    if (element) {
      element.classList.toggle("hidden", screen !== id);
    }
  });
}

function toast(message) {
  const element = $("toast");
  if (!element) {
    console.log(message);
    return;
  }

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.classList.remove("show");
  }, 3000);
}

function name() {
  return $("nickname")?.value.trim().slice(0, 16) || "Player";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

// Connection status
socket.on("connect", () => {
  me = socket.id;
  console.log("Connected to game server:", me);
});

socket.on("disconnect", () => {
  toast("Disconnected from server. Reconnecting...");
});

socket.on("connect_error", error => {
  console.error("Socket connection error:", error);
  toast("Cannot connect to game server. Please refresh.");
});

// Create room
$("createBtn").onclick = () => {
  if (!socket.connected) {
    toast("Connecting to server. Please wait.");
    return;
  }

  socket.emit("room:create", { name: name() });
};

// Join room
$("joinBtn").onclick = () => {
  if (!socket.connected) {
    toast("Connecting to server. Please wait.");
    return;
  }

  const code = $("roomCode").value.trim();

  if (!code) {
    toast("Enter a room code first.");
    return;
  }

  socket.emit("room:join", {
    code,
    name: name()
  });
};

$("roomCode").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    $("joinBtn").click();
  }
});

// Copy room code
$("copyBtn").onclick = async () => {
  if (!roomCode) return;

  try {
    await navigator.clipboard.writeText(roomCode);
    toast("Room code copied!");
  } catch {
    toast("Room code: " + roomCode);
  }
};

// Leave room
$("leaveBtn").onclick = () => {
  location.reload();
};

// Ready button
$("readyBtn").onclick = () => {
  if (!roomData) return;

  const player = roomData.players.find(p => p.id === me);

  if (!player) {
    toast("You are not in this room.");
    return;
  }

  socket.emit("player:ready", !player.ready);
};

// Start button
$("startBtn").onclick = () => {
  if (!socket.connected) {
    toast("Not connected to the server.");
    return;
  }

  if (!roomData) {
    toast("Room information is not available.");
    return;
  }

  if (roomData.players.length < 2) {
    toast("At least 2 players are required.");
    return;
  }

  const notReady = roomData.players.filter(p => !p.ready);

  if (notReady.length > 0) {
    toast("Everyone must click I'M READY first.");
    return;
  }

  console.log("Sending game:start event...");
  toast("Starting match...");

  socket.emit("game:start");
};

// Rematch
$("rematchBtn").onclick = () => {
  if (!socket.connected) {
    toast("Not connected to server.");
    return;
  }

  socket.emit("game:rematch");
};

// Return home
$("homeBtn").onclick = () => {
  location.reload();
};

// Room joined
socket.on("room:joined", data => {
  roomCode = data.code;

  $("codeLabel").textContent = roomCode;

  show("lobby");

  toast("Joined room " + roomCode);
});

// Server errors
socket.on("error:message", message => {
  toast(message);
});

// Room updates
socket.on("room:update", room => {
  roomData = room;

  if (room.status === "waiting") {
    show("lobby");

    $("playerCount").textContent =
      `${room.players.length} / 8 players`;

    $("players").innerHTML = room.players.map(player => `
      <div class="player-card">
        <div class="avatar" style="background:${player.color}">
          ${escapeHtml(player.name[0].toUpperCase())}
        </div>

        <div>
          <b>${escapeHtml(player.name)}</b>
          <small>
            ${player.ready ? "✓ READY" : "NOT READY"}
            ${player.id === me ? " • YOU" : ""}
          </small>
        </div>
      </div>
    `).join("");

    const mine = room.players.find(player => player.id === me);

    $("readyBtn").classList.toggle("hidden", !mine);

    $("readyBtn").textContent =
      mine?.ready ? "CANCEL READY" : "I'M READY";

    const startButton = $("startBtn");

    startButton.classList.toggle(
      "hidden",
      !mine || room.players.length < 2
    );

    const everyoneReady =
      room.players.length >= 2 &&
      room.players.every(player => player.ready);

    startButton.disabled = !everyoneReady;

    startButton.textContent = everyoneReady
      ? "START GAME"
      : "WAITING FOR PLAYERS";

    if (room.players.length < 2) {
      startButton.textContent = "WAITING FOR PLAYERS";
    }
  }

  if (room.status === "playing" && room.state) {
    show("game");

    lastState = room.state;

    draw(room.state);
    updateRanks(room.players);

    const mine = room.players.find(player => player.id === me);

    $("myScore").textContent = mine?.score || 0;

    $("timer").textContent = formatTime(
      room.state.timeLeft
    );
  }
});

// Game over
socket.on("game:over", data => {
  show("results");

  $("winner").textContent = data.winner
    ? `${data.winner.name} — ${data.winner.score} POINTS`
    : "No winner";

  $("finalRanks").innerHTML = data.final.map(player => `
    <div class="final-row">
      <span>
        #${player.rank} ${escapeHtml(player.name)}
      </span>
      <b>${player.score} pts</b>
    </div>
  `).join("");
});

// Ranking
function updateRanks(players) {
  $("ranking").innerHTML = [...players]
    .sort((a, b) => b.score - a.score)
    .map((player, index) => `
      <div class="rank-row">
        <span>${index + 1}.</span>

        <i class="rank-dot"
           style="background:${player.color}">
        </i>

        <span>
          ${escapeHtml(player.name)}
          ${player.id === me ? " (you)" : ""}
        </span>

        <strong>${player.score}</strong>
      </div>
    `).join("");
}

// Game canvas
const canvas = $("arena");
const ctx = canvas.getContext("2d");

function draw(state) {
  ctx.clearRect(0, 0, 1000, 650);

  ctx.fillStyle = "#07101b";
  ctx.fillRect(0, 0, 1000, 650);

  // Grid
  ctx.strokeStyle = "#14253a";
  ctx.lineWidth = 1;

  for (let x = 0; x < 1000; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 650);
    ctx.stroke();
  }

  for (let y = 0; y < 650; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1000, y);
    ctx.stroke();
  }

  // Coins
  for (const coin of state.coins || []) {
    ctx.beginPath();

    ctx.arc(
      coin.x,
      coin.y,
      coin.golden ? 8 : 5,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = coin.golden
      ? "#ffd166"
      : "#58f5a5";

    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 14;

    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Power-ups
  for (const powerup of state.powerups || []) {
    ctx.font = "20px sans-serif";
    ctx.fillText("⚡", powerup.x - 10, powerup.y + 8);
  }

  // Snakes
  for (const snake of state.snakes || []) {
    if (!snake.alive) continue;

    snake.body.forEach((segment, index) => {
      ctx.beginPath();

      ctx.arc(
        segment.x,
        segment.y,
        index === 0 ? 8 : 6,
        0,
        Math.PI * 2
      );

      ctx.fillStyle = snake.color;
      ctx.shadowColor = snake.color;
      ctx.shadowBlur = index === 0 ? 18 : 8;

      ctx.fill();
      ctx.shadowBlur = 0;
    });

    const head = snake.body[0];

    if (head) {
      ctx.fillStyle = "#07101b";
      ctx.beginPath();
      ctx.arc(head.x - 2, head.y - 2, 1.8, 0, 7);
      ctx.fill();
    }
  }
}

// Snake movement
function direction(value) {
  if (socket.connected) {
    socket.emit("player:direction", value);
  }
}

// Keyboard controls
document.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();

  const movement = {
    arrowup: "up",
    w: "up",
    arrowdown: "down",
    s: "down",
    arrowleft: "left",
    a: "left",
    arrowright: "right",
    d: "right"
  };

  if (movement[key]) {
    event.preventDefault();
    direction(movement[key]);
  }
});

// Mobile controls
document.querySelectorAll("[data-dir]").forEach(button => {
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    direction(button.dataset.dir);
  });
});

console.log("Snake Battle Arena app loaded successfully.");
