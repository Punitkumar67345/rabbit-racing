import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { io } from 'socket.io-client';

@Component({
  selector: 'app-game',
  standalone: true,
  template: '<div id="game-container"></div>',
  styles: []
})
export class GameComponent implements OnInit {
  phaserGame: any;
  config: any;
  socket: any;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initGame();
    }
  }

  async initGame() {
    const PhaserImport = await import('phaser');
    const Phaser = (PhaserImport as any).default || PhaserImport;
    
    // --- CONNECTION ---
    const url = window.location.hostname === 'localhost' ? 'http://localhost:3000' : undefined;
    this.socket = io(url);

    const socket = this.socket;
    let player: any = null;
    let otherPlayers: any;
    let walls: any;
    let cursors: any;
    let wasd: any;
    let star: any;
    let scoreText: any;
    
    // --- STRICT LOCK VARIABLE (TALA) ---
    // Ye batayega ki coin utha sakte hain ya nahi
    let canCollect = true;

    let winText: any = null;
    let subText: any = null;
    let oldPosition: { x: number, y: number } | undefined;

    this.config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: 'game-container',
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false }
      },
      scene: {
        preload: function(this: any) {
            this.load.image('gubbu', 'https://labs.phaser.io/assets/sprites/phaser-dude.png'); 
        },

        create: function(this: any) {
          const self = this;
          
          socket.on('connect', () => {
              console.log('✅ Connected! My ID:', socket.id);
              scoreText.setText('Connected! Loading...');
              socket.emit('requestPlayers');
          });

          // --- WALLS ---
          walls = self.physics.add.staticGroup();
          const createWall = (x: number, y: number, w: number, h: number) => {
             const wall = self.add.rectangle(x, y, w, h, 0x0000ff);
             self.physics.add.existing(wall, true);
             walls.add(wall);
          };
          createWall(400, 50, 700, 20);
          createWall(400, 550, 700, 20);
          createWall(50, 300, 20, 500);
          createWall(750, 300, 20, 500);
          createWall(400, 300, 300, 20);

          // --- STAR (COIN) ---
          star = self.add.circle(-100, -100, 15, 0xffff00);
          self.physics.add.existing(star);

          // Backend se naya coin aane par Lock kholo
          socket.on('starLocation', (location: any) => {
             if (!star || !star.scene) {
                 star = self.add.circle(location.x, location.y, 15, 0xffff00);
                 self.physics.add.existing(star);
             }
             
             star.setPosition(location.x, location.y);
             star.setVisible(true);
             if(star.body) {
                 star.body.enable = true;
                 star.body.reset(location.x, location.y);
             }
             
             // --- LOCK KHOL DO (Ab naya coin utha sakte hain) ---
             canCollect = true;
          });

          socket.emit('requestStar');

          // --- SCOREBOARD ---
          scoreText = self.add.text(16, 16, 'Connecting...', { fontSize: '32px', fill: '#ffffff' });
          const updateScoreBoard = (players: any) => {
            let displayText = '';
            Object.keys(players).forEach((id) => {
                const p = players[id];
                const isMe = (p.playerId === socket.id);
                const name = isMe ? 'ME (Green)' : 'Enemy (Red)';
                displayText += name + ': ' + p.score + '\n';
            });
            scoreText.setText(displayText);
          };
          socket.on('scoreUpdate', updateScoreBoard);

          // --- GAME OVER ---
          socket.on('gameOver', (winnerId: string) => {
            self.physics.pause();
            if(star) star.destroy(); 
            
            let resultText = (winnerId === socket.id) ? 'YOU WIN! 🏆' : 'YOU LOSE! 😢';
            let color = (winnerId === socket.id) ? '#00ff00' : '#ff0000';
            
            winText = self.add.text(250, 250, resultText, { fontSize: '60px', fill: color, backgroundColor: '#000' });
            subText = self.add.text(280, 320, 'Restarting in 5 seconds...', { fontSize: '20px', fill: '#fff' });
          });

          // --- GAME RESET ---
          socket.on('gameReset', () => {
             console.log('Game Restarted!');
             if (winText) winText.destroy();
             if (subText) subText.destroy();
             self.physics.resume();
             canCollect = true; // Reset par lock kholo
          });

          // --- PLAYERS ---
          otherPlayers = self.physics.add.group();

          socket.on('currentPlayers', (players: any) => {
            if(player) player.destroy();
            otherPlayers.clear(true, true);

            Object.keys(players).forEach((id) => {
              if (players[id].playerId === socket.id) {
                // MAIN PLAYER
                player = self.physics.add.sprite(players[id].x, players[id].y, 'gubbu');
                player.setScale(1.5); 
                player.setTint(0x00ff00);
                player.playerId = players[id].playerId;
                self.physics.add.collider(player, walls);
                
                // --- STRICT OVERLAP LOGIC ---
                if(star) {
                    self.physics.add.overlap(player, star, () => {
                        // Agar Lock khula hai, tabhi uthao
                        if (canCollect) {
                            // 1. Turant Lock laga do (Tala band)
                            canCollect = false; 
                            
                            // 2. Coin gayab karo
                            star.setVisible(false);
                            if(star.body) star.body.enable = false;

                            // 3. Sirf ek baar server ko bolo
                            socket.emit('starCollected');
                        }
                    }, undefined, self);
                }

              } else {
                // ENEMY
                const other = self.physics.add.sprite(players[id].x, players[id].y, 'gubbu');
                other.setScale(1.5); 
                other.setTint(0xff0000);
                otherPlayers.add(other);
                (other as any).playerId = players[id].playerId;
              }
            });
            updateScoreBoard(players);
          });

          socket.on('newPlayer', (playerInfo: any) => {
            const other = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'gubbu');
            other.setScale(1.5);
            other.setTint(0xff0000);
            otherPlayers.add(other);
            (other as any).playerId = playerInfo.playerId;
          });

          socket.on('playerMoved', (playerInfo: any) => {
            otherPlayers.getChildren().forEach((other: any) => {
              if (playerInfo.playerId === other.playerId) {
                other.setPosition(playerInfo.x, playerInfo.y);
              }
            });
          });

          socket.on('playerDisconnected', (playerId: any) => {
            otherPlayers.getChildren().forEach((other: any) => {
              if (playerId === other.playerId) other.destroy();
            });
          });

          cursors = self.input.keyboard.createCursorKeys();
          wasd = self.input.keyboard.addKeys('W,S,A,D');
          
          if(socket.connected) {
              socket.emit('requestPlayers');
              socket.emit('requestStar');
          }
        },

        update: function(this: any) {
          if (player) {
            player.body.setVelocity(0);
            if (cursors.left.isDown || wasd.A.isDown) player.body.setVelocityX(-200);
            else if (cursors.right.isDown || wasd.D.isDown) player.body.setVelocityX(200);
            if (cursors.up.isDown || wasd.W.isDown) player.body.setVelocityY(-200);
            else if (cursors.down.isDown || wasd.S.isDown) player.body.setVelocityY(200);

            const x = player.x;
            const y = player.y;
            if (oldPosition && (x !== oldPosition.x || y !== oldPosition.y)) {
              socket.emit('playerMovement', { x: player.x, y: player.y });
            }
            oldPosition = { x: player.x, y: player.y };
          }
        }
      }
    };
    this.phaserGame = new Phaser.Game(this.config);
  }
}