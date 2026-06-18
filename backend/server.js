const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Minimal hardening headers (no extra dependency needed)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

const server = http.createServer(app);

/* =========================
   CONFIG & STATE
========================= */
const MAX_PLAYERS_PER_ROOM = 5;
const MAX_ROOMS = 200;              // hard cap so a flood of joinRoom calls can't exhaust memory
const WIN_SCORE = 50;
const GAME_WIDTH = 800, GAME_HEIGHT = 600;
const SPAWN_X = 400, SPAWN_Y = 300;
const STAR_RADIUS = 32;             // pickup must happen within this distance of the star
const MAX_PLAYER_SPEED = 500;       // px/sec ceiling used to reject teleport/speed-hack input
const MOVE_RATE_LIMIT_MS = 16;      // ignore movement packets faster than ~60/sec per client
const TICK_MS = 25;                 // 40 ticks/sec broadcast loop
const HEARTBEAT_MS = 5000;          // keeps connection-state-recovery offsets fresh
const RECONNECT_WINDOW_MS = 45_000; // grace period before a dropped player is fully removed
const ROOM_NAME_RE = /^[a-zA-Z0-9 _-]{1,24}$/;

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // Survive brief wifi/4G hand-offs: same socket.id + rooms are restored automatically
  // on reconnection within the window below, instead of the player being treated as new.
  connectionStateRecovery: {
    maxDisconnectionDuration: RECONNECT_WINDOW_MS,
    skipMiddlewares: true,
  },
  pingInterval: 10000,   // faster than the 25s default → dead clients are noticed sooner
  pingTimeout: 8000,
  maxHttpBufferSize: 1e5, // 100KB cap, plenty for this game, blocks oversized-payload abuse
  perMessageDeflate: false, // compression overhead isn't worth it for small, frequent packets
});

const rooms = new Map(); // roomName -> room

/* =========================
   HELPERS
========================= */
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

const generateStar = () => ({
  x: Math.floor(Math.random() * (GAME_WIDTH - 100)) + 50,
  y: Math.floor(Math.random() * (GAME_HEIGHT - 100)) + 50,
  active: true,
});

const sanitizeName = (name) =>
  (typeof name === 'string' ? name : 'Player')
    .replace(/[^\w \-]/g, '')
    .trim()
    .slice(0, 20) || 'Player';

// Only the fields the client actually needs — never leak internal timers/state.
const toPublicPlayer = (p) => ({
  playerId: p.playerId,
  playerName: p.playerName,
  x: p.x,
  y: p.y,
  score: p.score,
});

const playersObj = (room) => {
  const out = {};
  for (const [id, p] of room.players) out[id] = toPublicPlayer(p);
  return out;
};

const createRoom = (roomName) => {
  const room = { players: new Map(), star: generateStar(), gameOver: false, created: Date.now(), resetTimer: null };
  rooms.set(roomName, room);
  console.log('[Room Created]', roomName);
  return room;
};

const resetRoom = (room) => {
  room.gameOver = false;
  room.star = generateStar();
  for (const p of room.players.values()) {
    p.score = 0;
    p.x = SPAWN_X;
    p.y = SPAWN_Y;
    p.lastMoveAt = null;
    p.isDirty = true;
  }
};

const emitToRoom = (roomName, event, data = {}) => {
  io.to(roomName).emit(event, { roomName, ...data });
};

const deleteRoomIfEmpty = (roomName, room) => {
  if (room.players.size === 0) {
    if (room.resetTimer) clearTimeout(room.resetTimer);
    rooms.delete(roomName);
    console.log('[Room Deleted]', roomName);
  }
};

/* =========================
   HEALTH CHECK
========================= */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size, uptime: process.uptime() });
});

/* =========================
   SOCKET CONNECTION
========================= */
io.on('connection', (socket) => {
  console.log('[Connected]', socket.id, socket.recovered ? '(recovered)' : '');

  // ── RECONNECTION (connection state recovery succeeded) ──
  // socket.io has already restored this socket's id and room memberships.
  // We just need to cancel the pending cleanup and resync this client.
  if (socket.recovered) {
    for (const roomName of socket.rooms) {
      const room = rooms.get(roomName);
      const player = room?.players.get(socket.id);
      if (!room || !player) continue;

      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = null;
      }
      player.disconnectedAt = null;

      socket.emit('currentPlayersInRoom', { roomName, players: playersObj(room) });
      socket.emit('starLocationInRoom', { roomName, star: room.star });
      socket.to(roomName).emit('playerReconnectedInRoom', { roomName, playerId: socket.id });
    }
  }

  /* ── JOIN ROOM ── */
  socket.on('joinRoom', ({ roomName, playerName } = {}) => {
    if (typeof roomName !== 'string' || !ROOM_NAME_RE.test(roomName)) {
      return socket.emit('serverError', { msg: 'Invalid room name (1-24 letters/numbers/spaces/-/_).' });
    }

    let room = rooms.get(roomName);
    if (!room) {
      if (rooms.size >= MAX_ROOMS) {
        return socket.emit('serverError', { msg: 'Server is at capacity. Please try again shortly.' });
      }
      room = createRoom(roomName);
    }

    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      return socket.emit('serverError', { msg: 'Room is full (max 5 players).' });
    }

    socket.join(roomName);
    const playerInfo = {
      playerId: socket.id,
      playerName: sanitizeName(playerName),
      x: SPAWN_X, y: SPAWN_Y,
      score: 0,
      isDirty: false,
      lastMoveAt: null,
      disconnectedAt: null,
      disconnectTimer: null,
    };

    room.players.set(socket.id, playerInfo);
    console.log(`[Join] ${playerInfo.playerName} → ${roomName}`);

    // Send initial state
    socket.emit('currentPlayersInRoom', { roomName, players: playersObj(room) });
    socket.emit('starLocationInRoom', { roomName, star: room.star });

    // Notify others
    socket.to(roomName).emit('newPlayerInRoom', { roomName, playerInfo: toPublicPlayer(playerInfo) });
    emitToRoom(roomName, 'scoreUpdateInRoom', { players: playersObj(room) });
  });

  /* ── PLAYER MOVEMENT (validated, rate-limited, speed-checked) ── */
  socket.on('playerMovementInRoom', ({ roomName, movementData } = {}) => {
    const room = rooms.get(roomName);
    const player = room?.players.get(socket.id);
    if (!room || !player || !movementData) return;

    const now = Date.now();
    if (player.lastMoveAt && now - player.lastMoveAt < MOVE_RATE_LIMIT_MS) return;

    const { x, y } = movementData;
    if (!isFiniteNum(x) || !isFiniteNum(y)) return;

    const targetX = clamp(x, 0, GAME_WIDTH);
    const targetY = clamp(y, 0, GAME_HEIGHT);

    if (player.lastMoveAt) {
      const dt = Math.max((now - player.lastMoveAt) / 1000, 0.001);
      const dist = Math.hypot(targetX - player.x, targetY - player.y);
      const maxDist = MAX_PLAYER_SPEED * dt * 1.5; // small leeway for network jitter

      if (dist > maxDist) {
        // Likely a speed-hack or a bad/lagged packet — clamp toward the max allowed step
        // instead of either accepting the teleport or freezing the player outright.
        const ratio = maxDist / dist;
        player.x += (targetX - player.x) * ratio;
        player.y += (targetY - player.y) * ratio;
        player.lastMoveAt = now;
        player.isDirty = true;
        return;
      }
    }

    player.x = targetX;
    player.y = targetY;
    player.lastMoveAt = now;
    player.isDirty = true;
  });

  /* ── STAR COLLECTED (must actually be near the star) ── */
  socket.on('starCollectedInRoom', ({ roomName } = {}) => {
    const room = rooms.get(roomName);
    if (!room || room.gameOver || !room.star.active) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    const dx = player.x - room.star.x;
    const dy = player.y - room.star.y;
    if (dx * dx + dy * dy > STAR_RADIUS * STAR_RADIUS) return; // too far away — ignore

    room.star.active = false;
    player.score += 5;

    emitToRoom(roomName, 'scoreUpdateInRoom', { players: playersObj(room) });

    /* ── WIN CONDITION ── */
    if (player.score >= WIN_SCORE) {
      room.gameOver = true;
      emitToRoom(roomName, 'gameOverInRoom', { winnerId: socket.id });

      room.resetTimer = setTimeout(() => {
        const activeRoom = rooms.get(roomName);
        if (!activeRoom) return; // room was deleted while the timer was pending

        resetRoom(activeRoom);
        activeRoom.resetTimer = null;

        emitToRoom(roomName, 'gameResetInRoom');
        emitToRoom(roomName, 'currentPlayersInRoom', { players: playersObj(activeRoom) });
        emitToRoom(roomName, 'scoreUpdateInRoom', { players: playersObj(activeRoom) });
        emitToRoom(roomName, 'starLocationInRoom', { star: activeRoom.star });
      }, 5000);
    } else {
      /* ── NEXT STAR ── */
      room.star = generateStar();
      emitToRoom(roomName, 'starLocationInRoom', { star: room.star });
    }
  });

  /* ── REQUEST HELPERS ── */
  socket.on('requestPlayersInRoom', ({ roomName } = {}) => {
    const room = rooms.get(roomName);
    if (room) socket.emit('currentPlayersInRoom', { roomName, players: playersObj(room) });
  });

  socket.on('requestStarInRoom', ({ roomName } = {}) => {
    const room = rooms.get(roomName);
    if (room) socket.emit('starLocationInRoom', { roomName, star: room.star });
  });

  /* ── DISCONNECT ── */
  socket.on('disconnecting', () => {
    for (const roomName of socket.rooms) {
      const room = rooms.get(roomName);
      const player = room?.players.get(socket.id);
      if (!room || !player) continue;

      player.disconnectedAt = Date.now();
      // Tell others they *might* be back soon, rather than yanking them immediately.
      socket.to(roomName).emit('playerDisconnectedInRoom', { roomName, playerId: socket.id, reconnecting: true });

      // Give connection-state-recovery a chance to restore the session before
      // permanently removing the player and their score.
      player.disconnectTimer = setTimeout(() => {
        const stillRoom = rooms.get(roomName);
        const stillPlayer = stillRoom?.players.get(socket.id);
        if (!stillRoom || !stillPlayer || !stillPlayer.disconnectedAt) return; // already reconnected

        stillRoom.players.delete(socket.id);
        io.to(roomName).emit('playerLeftInRoom', { roomName, playerId: socket.id });
        emitToRoom(roomName, 'scoreUpdateInRoom', { players: playersObj(stillRoom) });
        deleteRoomIfEmpty(roomName, stillRoom);
      }, RECONNECT_WINDOW_MS);
    }
  });

  socket.on('disconnect', (reason) => console.log('[Disconnected]', socket.id, reason));
});

/* =========================
   SERVER GAME LOOP (40 TICK RATE)
========================= */
setInterval(() => {
  for (const [roomName, room] of rooms) {
    const moved = [];
    for (const player of room.players.values()) {
      if (player.isDirty) {
        moved.push({ playerId: player.playerId, x: player.x, y: player.y });
        player.isDirty = false;
      }
    }
    // One batched, volatile emit per room per tick instead of one emit per player —
    // far fewer socket writes under load, which is where most perceived "lag" comes from.
    if (moved.length) {
      io.volatile.to(roomName).emit('playersMovedInRoom', { roomName, players: moved, t: Date.now() });
    }
  }
}, TICK_MS);

/* =========================
   HEARTBEAT (keeps recovery offsets fresh on quiet rooms)
========================= */
setInterval(() => {
  for (const [roomName, room] of rooms) {
    if (room.players.size > 0) {
      io.to(roomName).emit('heartbeatInRoom', { roomName, t: Date.now() });
    }
  }
}, HEARTBEAT_MS);

/* =========================
   GRACEFUL SHUTDOWN
========================= */
const shutdown = () => {
  console.log('[Server] Shutting down...');
  io.close(() => {
    server.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/* =========================
   SERVER START
========================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));
