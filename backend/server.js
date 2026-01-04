// ==========================
// IMPORTS & SETUP
// ==========================
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

// ==========================
// GAME STATE
// ==========================
const players = {};

const star = {
  x: randomX(),
  y: randomY(),
  active: true
};

// ==========================
// UTILS
// ==========================
function randomX() {
  return Math.floor(Math.random() * 700) + 50;
}

function randomY() {
  return Math.floor(Math.random() * 500) + 50;
}

function resetStar() {
  star.x = randomX();
  star.y = randomY();
  star.active = true;
}

function resetPlayers() {
  Object.values(players).forEach(p => {
    p.x = 400;
    p.y = 300;
    p.score = 0;
  });
}

// ==========================
// SOCKET LOGIC
// ==========================
io.on('connection', socket => {
  console.log('🟢 Player Connected:', socket.id);

  // Create Player
  players[socket.id] = {
    playerId: socket.id,
    x: 400,
    y: 300,
    score: 0
  };

  // Send initial data
  socket.emit('currentPlayers', players);
  socket.emit('starLocation', star);
  socket.emit('scoreUpdate', players);

  // Notify others
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // ------------------
  // REQUEST HANDLERS
  // ------------------
  socket.on('requestPlayers', () => {
    socket.emit('currentPlayers', players);
  });

  socket.on('requestStar', () => {
    socket.emit('starLocation', star);
  });

  // ------------------
  // MOVEMENT
  // ------------------
  socket.on('playerMovement', data => {
    const player = players[socket.id];
    if (!player) return;

    player.x = data.x;
    player.y = data.y;

    socket.broadcast.emit('playerMoved', player);
  });

  // ------------------
  // STAR COLLECTION
  // ------------------
  socket.on('starCollected', () => {
    const player = players[socket.id];
    if (!player || !star.active) return;

    star.active = false;
    player.score += 5;

    io.emit('scoreUpdate', players);

    // WIN CONDITION
    if (player.score >= 50) {
      io.emit('gameOver', socket.id);

      setTimeout(() => {
        console.log('🔄 Game Reset');
        resetPlayers();
        resetStar();

        io.emit('gameReset');
        io.emit('currentPlayers', players);
        io.emit('scoreUpdate', players);
        io.emit('starLocation', star);
      }, 5000);

    } else {
      resetStar();
      io.emit('starLocation', star);
    }
  });

  // ------------------
  // DISCONNECT
  // ------------------
  socket.on('disconnect', () => {
    console.log('🔴 Player Disconnected:', socket.id);
    delete players[socket.id];

    io.emit('playerDisconnected', socket.id);
    io.emit('scoreUpdate', players);
  });
});

// ==========================
// SERVER START
// ==========================
server.listen(3000, () => {
  console.log('🚀 Server running on port 3000');
});
