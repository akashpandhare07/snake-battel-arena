
const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

// Check frontend files when the server starts.
console.log("Project directory:", __dirname);
console.log("Public directory:", PUBLIC_DIR);
console.log("Homepage exists:", fs.existsSync(INDEX_FILE));

// Serve frontend files.
app.use(express.static(PUBLIC_DIR));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    game: "Snake Battle Arena",
    homepageExists: fs.existsSync(INDEX_FILE)
  });
});

// Explicit homepage route.
app.get("/", (_req, res) => {
  if (!fs.existsSync(INDEX_FILE)) {
    return res.status(500).send(
      "Homepage missing. Check that public/index.html exists in your GitHub repository."
    );
  }

  res.sendFile(INDEX_FILE);
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const MAX_PLAYERS = 8;
const DURATION = 180;
const TICK_MS = 100;

const W = 1000;
const H = 650;
const CELL = 10;

const COLORS = [
  "#58f5a5",
  "#54c7ff",
  "#ff66c4",
  "#ffd166",
  "#b794ff",
  "#ff8066",
  "#7ee8fa",
  "#f7a8ff"
];

const rand = n => Math.floor(Math.random() * n);

const makeCode = () => {
  let code;
  do {
    code = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(code));
  return code;
};

const point = () => ({
  x: 30 + rand(W - 60),
  y: 30 + rand(H - 60)
});

function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    duration: DURATION,

    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      ready: p.ready,
      score: p.score,
      alive: p.alive
    })),

    state: room.status === "playing" ? {
      width: W,
      height: H,
      coins: room.coins,
      powerups: room.powerups,

      snakes: [...room.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        alive: p.alive,
        body: p.body
      })),

      timeLeft: Math.max(
        0,
        Math.ceil((room.endsAt - Date.now()) / 1000)
      )
    } : null
  };
}

function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function spawnCoin(room, golden = Math.random() < 0.12) {
  room.coins.push({
    id: crypto.randomUUID(),
    ...point(),
    value: golden ? 50 : 10,
    golden
  });
}

function startRoom(room) {
  room.status = "playing";
  room.startedAt = Date.now();
  room.endsAt = room.startedAt + DURATION * 1000;

  room.coins = [];
  room.powerups = [];

  for (let i = 0; i < 32; i++) {
    spawnCoin(room);
  }

  for (const [i, p] of [...room.players.values()].entries()) {
    const x = 100 + (i % 4) * 240;
    const y = 120 + Math.floor(i / 4) * 300;

    p.body = [
      { x, y },
      { x: x - 10, y },
      { x: x - 20, y }
    ];

    p.dir = { x: 1, y: 0 };
    p.nextDir = { x: 1, y: 0 };
    p.alive = true;
    p.score = 0;
    p.boostUntil = 0;
    p.lastMove = 0;
  }

  emitRoom(room);
}

function respawn(p) {
  p.score = Math.max(0, p.score - 20);

  const x = 80 + rand(W - 160);
  const y = 80 + rand(H - 160);

  p.body = [
    { x, y },
    { x: x - 10, y },
    { x: x - 20, y }
  ];

  p.dir = { x: 1, y: 0 };
  p.nextDir = { x: 1, y: 0 };
  p.alive = true;
  p.lastMove = 0;
}

function tick(room) {
  if (room.status !== "playing") return;

  if (Date.now() >= room.endsAt) {
    room.status = "finished";

    room.final = [...room.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({
        rank: i + 1,
        name: p.name,
        score: p.score,
        color: p.color
      }));

    io.to(room.code).emit("game:over", {
      final: room.final,
      winner: room.final[0] || null
    });

    clearInterval(room.timer);
    room.timer = null;

    emitRoom(room);
    return;
  }

  const now = Date.now();

  const activePlayers = [...room.players.values()]
    .filter(p => p.alive);

  for (const p of activePlayers) {
    if (
      p.nextDir.x !== -p.dir.x ||
      p.nextDir.y !== -p.dir.y
    ) {
      p.dir = p.nextDir;
    }

    const speed = now < p.boostUntil ? 100 : 200;

    if (!p.lastMove || now - p.lastMove >= speed) {
      p.lastMove = now;

      const head = {
        x: p.body[0].x + p.dir.x * CELL,
        y: p.body[0].y + p.dir.y * CELL
      };

      if (
        head.x < 0 ||
        head.x >= W ||
        head.y < 0 ||
        head.y >= H
      ) {
        respawn(p);
        continue;
      }

      p.body.unshift(head);

      let got = -1;

      for (let i = 0; i < room.coins.length; i++) {
        const c = room.coins[i];

        if (Math.hypot(head.x - c.x, head.y - c.y) < 15) {
          got = i;
          break;
        }
      }

      if (got >= 0) {
        const coin = room.coins.splice(got, 1)[0];
        p.score += coin.value;
        spawnCoin(room);
      } else {
        p.body.pop();
      }

      const powerIndex = room.powerups.findIndex(q =>
        Math.hypot(head.x - q.x, head.y - q.y) < 15
      );

      if (powerIndex >= 0) {
        room.powerups.splice(powerIndex, 1);
        p.boostUntil = now + 5000;
      }
    }
  }

  // Snake-to-snake collision detection.
  for (const p of room.players.values()) {
    if (!p.alive) continue;

    const head = p.body[0];
    let hit = false;

    for (const other of room.players.values()) {
      const body = other.body.slice(
        other.id === p.id ? 1 : 0
      );

      if (body.some(segment =>
        Math.hypot(
          head.x - segment.x,
          head.y - segment.y
        ) < 7
      )) {
        hit = true;
        break;
      }
    }

    if (hit) respawn(p);
  }

  if (Math.random() < 0.004 && room.powerups.length < 3) {
    room.powerups.push({
      id: crypto.randomUUID(),
      ...point()
    });
  }

  emitRoom(room);
}

function leaveRoom(socket) {
  const code = socket.data.room;
  if (!code) return;

  const room = rooms.get(code);

  if (room) {
    room.players.delete(socket.id);
    socket.leave(code);

    if (room.players.size === 0) {
      clearInterval(room.timer);
      rooms.delete(code);
    } else {
      emitRoom(room);
    }
  }

  socket.data.room = null;
}

io.on("connection", socket => {

  socket.on("room:create", ({ name } = {}) => {
    leaveRoom(socket);

    const code = makeCode();

    const room = {
      code,
      status: "waiting",
      players: new Map(),
      coins: [],
      powerups: [],
      timer: null
    };

    room.players.set(socket.id, {
      id: socket.id,
      name: String(name || "Player").trim().slice(0, 16) || "Player",
      color: COLORS[0],
      ready: false,
      score: 0,
      alive: true,
      body: [],
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 }
    });

    rooms.set(code, room);

    socket.join(code);
    socket.data.room = code;

    socket.emit("room:joined", { code });
    emitRoom(room);
  });

  socket.on("room:join", ({ code, name } = {}) => {
    leaveRoom(socket);

    const roomCode = String(code || "").toUpperCase().trim();
    const room = rooms.get(roomCode);

    if (!room) {
      return socket.emit("error:message", "Room not found. Check the code.");
    }

    if (room.status !== "waiting") {
      return socket.emit("error:message", "This game has already started.");
    }

    if (room.players.size >= MAX_PLAYERS) {
      return socket.emit("error:message", "Room is full (8 players maximum).");
    }

    const p = {
      id: socket.id,
      name: String(name || "Player").trim().slice(0, 16) || "Player",
      color: COLORS[room.players.size],
      ready: false,
      score: 0,
      alive: true,
      body: [],
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 }
    };

    room.players.set(socket.id, p);

    socket.join(roomCode);
    socket.data.room = roomCode;

    socket.emit("room:joined", { code: roomCode });
    emitRoom(room);
  });

  socket.on("player:ready", ready => {
    const room = rooms.get(socket.data.room);
    const p = room?.players.get(socket.id);

    if (!p || room.status !== "waiting") return;

    p.ready = !!ready;
    emitRoom(room);
  });

  socket.on("game:start", () => {
    const room = rooms.get(socket.data.room);

    if (
      !room ||
      room.status !== "waiting" ||
      room.players.size < 2
    ) return;

    if ([...room.players.values()].some(p => !p.ready)) {
      return socket.emit(
        "error:message",
        "Everyone must be ready before starting."
      );
    }

    startRoom(room);

    clearInterval(room.timer);
    room.timer = setInterval(() => tick(room), TICK_MS);
  });

  socket.on("player:direction", direction => {
    const room = rooms.get(socket.data.room);
    const p = room?.players.get(socket.id);

    if (!p || room.status !== "playing" || !p.alive) return;

    const map = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 }
    };

    const dir = map[direction];

    if (
      dir &&
      !(dir.x === -p.dir.x && dir.y === -p.dir.y)
    ) {
      p.nextDir = dir;
    }
  });

  socket.on("game:rematch", () => {
    const room = rooms.get(socket.data.room);

    if (room?.status === "finished" && room.players.size >= 2) {
      for (const p of room.players.values()) {
        p.ready = true;
      }

      startRoom(room);

      clearInterval(room.timer);
      room.timer = setInterval(() => tick(room), TICK_MS);
    }
  });

  socket.on("disconnect", () => {
    leaveRoom(socket);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Snake Battle Arena running on port ${PORT}`);
});
