const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path'); // <--- Zaroori hai

const app = express();
app.use(cors());

// --- GAME DIKHANE KA MAGIC CODE ---
// Server ko batao ki game ki files "public" folder mein hain
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", // Sabko allow karo
        methods: ["GET", "POST"]
    }
});

var players = {};
var star = {
  x: Math.floor(Math.random() * 700) + 50,
  y: Math.floor(Math.random() * 500) + 50
};

io.on('connection', (socket) => {
    console.log('Naya Player aaya:', socket.id);

    players[socket.id] = {
        x: 400,
        y: 300,
        playerId: socket.id,
        score: 0
    };

    socket.emit('currentPlayers', players);
    socket.emit('starLocation', star);
    
    socket.on('requestStar', () => {
        socket.emit('starLocation', star);
    });

    socket.on('requestPlayers', () => {
        socket.emit('currentPlayers', players);
    });

    socket.broadcast.emit('newPlayer', players[socket.id]);
    io.emit('scoreUpdate', players);

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('starCollected', function () {
        if (players[socket.id]) {
            players[socket.id].score += 10;
            io.emit('scoreUpdate', players);

            if (players[socket.id].score >= 50) {
                io.emit('gameOver', socket.id);
                // Auto Reset Logic
                setTimeout(() => {
                    Object.keys(players).forEach(id => {
                        players[id].score = 0;
                        players[id].x = 400;
                        players[id].y = 300;
                    });
                    star.x = Math.floor(Math.random() * 700) + 50;
                    star.y = Math.floor(Math.random() * 500) + 50;
                    io.emit('gameReset');
                    io.emit('currentPlayers', players);
                    io.emit('scoreUpdate', players);
                    io.emit('starLocation', star);
                }, 5000);
            } else {
                star.x = Math.floor(Math.random() * 700) + 50;
                star.y = Math.floor(Math.random() * 500) + 50;
                io.emit('starLocation', star);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Player chala gaya:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
        io.emit('scoreUpdate', players);
    });
});

// --- AGAR KOI BHI LINK KHOLE TOH GAME DIKHAO ---

server.listen(3000, () => {
    console.log('SERVER ON HAI! Port 3000 par.');
});