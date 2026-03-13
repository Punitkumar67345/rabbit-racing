const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

/* =========================
   CONFIG & STATE
========================= */
const MAX_PLAYERS = 5, WIN_SCORE = 50, GAME_WIDTH = 800, GAME_HEIGHT = 600, SPAWN_X = 400, SPAWN_Y = 300;
const rooms = {}; // roomName → RoomObject

/* =========================
   HELPERS
========================= */
const generateStar = () => ({
  x: Math.floor(Math.random() * (GAME_WIDTH - 100)) + 50,
  y: Math.floor(Math.random() * (GAME_HEIGHT - 100)) + 50,
  active: true
});

const createRoom = (roomName) => {
  rooms[roomName] = { players: {}, star: generateStar(), gameOver: false, created: Date.now() };
  console.log('[Room Created]', roomName);
};

const resetRoom = (room) => {
  room.gameOver = false;
  room.star = generateStar();
  for (const id in room.players) {
    const p = room.players[id];
    p.score = 0;
    p.x = SPAWN_X;
    p.y = SPAWN_Y;
    p.isDirty = true; 
  }
};

const emitToRoom = (roomName, event, data = {}) => {
  io.to(roomName).emit(event, { roomName, ...data });
};

/* =========================
   SOCKET CONNECTION
========================= */
io.on('connection', (socket) => {
  console.log('[Connected]', socket.id);

  /* ── JOIN ROOM ── */
  socket.on('joinRoom', ({ roomName, playerName }) => {
    if (!rooms[roomName]) createRoom(roomName);
    
    const room = rooms[roomName];
    if (Object.keys(room.players).length >= MAX_PLAYERS) {
      return socket.emit('serverError', { msg: 'Room is full (max 5 players).' });
    }

    socket.join(roomName);
    const playerInfo = {
      playerId: socket.id,
      playerName: (playerName || 'Player').slice(0, 20),
      x: SPAWN_X, y: SPAWN_Y, score: 0, isDirty: false
    };
    
    room.players[socket.id] = playerInfo;
    console.log(`[Join] ${playerInfo.playerName} → ${roomName}`);

    // Send initial state
    socket.emit('currentPlayersInRoom', { roomName, players: room.players });
    socket.emit('starLocationInRoom', { roomName, star: room.star });

    // Notify others
    socket.to(roomName).emit('newPlayerInRoom', { roomName, playerInfo });
    emitToRoom(roomName, 'scoreUpdateInRoom', { players: room.players });
  });

  /* ── PLAYER MOVEMENT ── */
  socket.on('playerMovementInRoom', ({ roomName, movementData }) => {
    const player = rooms[roomName]?.players[socket.id];
    if (player) {
      player.x = movementData.x;
      player.y = movementData.y;
      player.isDirty = true; 
    }
  });

  /* ── STAR COLLECTED ── */
  socket.on('starCollectedInRoom', ({ roomName }) => {
    const room = rooms[roomName];
    if (!room || room.gameOver || !room.star.active) return;

    const player = room.players[socket.id];
    if (!player) return;

    room.star.active = false;
    player.score += 5;

    emitToRoom(roomName, 'scoreUpdateInRoom', { players: room.players });

    /* ── WIN CONDITION ── */
    if (player.score >= WIN_SCORE) {
      room.gameOver = true;
      emitToRoom(roomName, 'gameOverInRoom', { winnerId: socket.id });

      setTimeout(() => {
        const activeRoom = rooms[roomName];
        if (!activeRoom) return; // Room deleted check

        resetRoom(activeRoom);
        
        emitToRoom(roomName, 'gameResetInRoom');
        emitToRoom(roomName, 'currentPlayersInRoom', { players: activeRoom.players });
        emitToRoom(roomName, 'scoreUpdateInRoom', { players: activeRoom.players });
        emitToRoom(roomName, 'starLocationInRoom', { star: activeRoom.star });
      }, 5000);
    } else {
      /* ── NEXT STAR ── */
      room.star = generateStar();
      emitToRoom(roomName, 'starLocationInRoom', { star: room.star });
    }
  });

  /* ── REQUEST HELPERS ── */
  socket.on('requestPlayersInRoom', ({ roomName }) => {
    if (rooms[roomName]) socket.emit('currentPlayersInRoom', { roomName, players: rooms[roomName].players });
  });

  socket.on('requestStarInRoom', ({ roomName }) => {
    if (rooms[roomName]) socket.emit('starLocationInRoom', { roomName, star: rooms[roomName].star });
  });

  /* ── DISCONNECT ── */
  socket.on('disconnecting', () => {
    // Optimized: No array creation, direct loop over socket.rooms set
    for (const roomName of socket.rooms) {
      const room = rooms[roomName];
      if (!room) continue;

      delete room.players[socket.id];
      io.to(roomName).emit('playerDisconnectedInRoom', { roomName, playerId: socket.id });
      emitToRoom(roomName, 'scoreUpdateInRoom', { players: room.players });

      // Delete empty rooms
      if (Object.keys(room.players).length === 0) {
        delete rooms[roomName];
        console.log('[Room Deleted]', roomName);
      }
    }
  });

  socket.on('disconnect', () => console.log('[Disconnected]', socket.id));
});

/* =========================
   SERVER GAME LOOP (40 TICK RATE)
========================= */
setInterval(() => {
  for (const roomName in rooms) {
    const room = rooms[roomName];
    for (const playerId in room.players) {
      const player = room.players[playerId];
      
      if (player.isDirty) {
        io.volatile.to(roomName).emit('playerMovedInRoom', { roomName, playerInfo: player });
        player.isDirty = false; 
      }
    }
  }
}, 25); 

/* =========================
   SERVER START
========================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));