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
    
    // SERVER CONNECTION
    // Localhost aur Render dono par chalega
    const url = window.location.hostname === 'localhost' ? 'http://localhost:3000' : undefined;
    this.socket = io(url);

    const socket = this.socket;
    
    // Game Variables
    let player: any = null;
    let otherPlayers: any;
    let walls: any;
    let cursors: any;
    let wasd: any;
    let star: any; // Ye Coin hai
    let scoreText: any;
    
    // Touch Controls
    let isTouchLeft = false;
    let isTouchRight = false;
    let isTouchUp = false;
    let isTouchDown = false;

    let canCollect = true;

    // UI Text
    let winText: any = null;
    let subText: any = null;
    
    // Movement Optimization Variable
    let oldPosition: { x: number, y: number } | undefined;

    this.config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: 'game-container',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      physics: {
        default: 'arcade',
        arcade: { 
            gravity: { x: 0, y: 0 }, 
            debug: false 
        }
      },
      scene: {
        preload: function(this: any) {
            // --- ASSETS LOAD (IMAGES) ---
            
            // 1. Gubbu (Rabbit)
            this.load.image('player', 'assets/gubbu.png'); 
            
            // 2. Background & Walls
            this.load.image('spaceBg', 'assets/bg.png');
            this.load.image('spaceWall', 'assets/wall.png');
            
            // 3. COIN (Gold Coin)
            // Make sure karein ki 'coin.png' frontend/src/assets mein ho
            this.load.image('coin', 'assets/coin.png');
        },

        create: function(this: any) {
          const self = this;

          // --- BACKGROUND ---
          this.add.tileSprite(400, 300, 800, 600, 'spaceBg');
          
          socket.on('connect', () => {
              console.log('✅ Connected to Server');
              scoreText.setText('Connected! Loading...');
              socket.emit('requestPlayers');
              socket.emit('requestStar');
          });

          // --- TOUCH BUTTONS (Transparent & Bottom Corners) ---
          const createBtn = (x: number, y: number, text: string) => {
              let btn = self.add.text(x, y, text, { fontSize: '70px', padding: { x: 0, y: 0 } })
                .setScrollFactor(0)
                .setInteractive()
                .setDepth(20);
              return btn;
          };

          const btnLeft = createBtn(20, 520, '⬅️');
          const btnRight = createBtn(150, 520, '➡️');
          const btnUp = createBtn(680, 440, '⬆️');
          const btnDown = createBtn(680, 520, '⬇️');

          // Button Events
          btnLeft.on('pointerdown', () => isTouchLeft = true);
          btnLeft.on('pointerup', () => isTouchLeft = false);
          btnLeft.on('pointerout', () => isTouchLeft = false);

          btnRight.on('pointerdown', () => isTouchRight = true);
          btnRight.on('pointerup', () => isTouchRight = false);
          btnRight.on('pointerout', () => isTouchRight = false);

          btnUp.on('pointerdown', () => isTouchUp = true);
          btnUp.on('pointerup', () => isTouchUp = false);
          btnUp.on('pointerout', () => isTouchUp = false);

          btnDown.on('pointerdown', () => isTouchDown = true);
          btnDown.on('pointerup', () => isTouchDown = false);
          btnDown.on('pointerout', () => isTouchDown = false);


          // --- WALLS (Map Design) ---
          walls = self.physics.add.staticGroup();
          const createWall = (x: number, y: number, w: number, h: number) => {
             const wall = self.add.tileSprite(x, y, w, h, 'spaceWall');
             self.physics.add.existing(wall, true);
             walls.add(wall);
          };
          // Borders
          createWall(400, 50, 700, 20);  // Top
          createWall(400, 550, 700, 20); // Bottom
          createWall(50, 300, 20, 500);  // Left
          createWall(750, 300, 20, 500); // Right
          // Center Obstacle
          createWall(400, 300, 300, 20);

          // --- COIN (Sprite Logic) ---
          // Pehle hum ise screen ke bahar (-100, -100) banayenge
          star = self.physics.add.sprite(-100, -100, 'coin');
          star.setDepth(5);
          
          // --- FIX: Scale Bada Kiya (0.5) Taaki Dikhe ---
          star.setScale(0.1); 

          socket.on('starLocation', (location: any) => {
             if (!star || !star.scene) {
                 // Agar coin destroy ho gaya ho, naya banao
                 star = self.physics.add.sprite(location.x, location.y, 'coin');
                 star.setDepth(5);
                 star.setScale(0.1); // Size bada rakha hai
             }
             
             star.setPosition(location.x, location.y);
             star.setVisible(true);
             
             if(star.body) {
                 star.body.enable = true;
                 star.body.reset(location.x, location.y);
             }
             canCollect = true; 
          });

          // --- SCOREBOARD ---
          scoreText = self.add.text(16, 16, 'Connecting...', { 
              fontSize: '32px', 
              fill: '#ffffff', 
              stroke: '#000000', 
              strokeThickness: 4 
          }).setDepth(10);

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

          // --- GAME OVER LOGIC ---
          socket.on('gameOver', (winnerId: string) => {
            self.physics.pause();
            
            // Coin chupao
            if(star) {
                star.setVisible(false);
                if(star.body) star.body.enable = false;
            }
            
            let resultText = (winnerId === socket.id) ? 'YOU WIN! 🏆' : 'YOU LOSE! 😢';
            let color = (winnerId === socket.id) ? '#00ff00' : '#ff0000';
            
            winText = self.add.text(250, 250, resultText, { 
                fontSize: '60px', 
                fill: color, 
                backgroundColor: '#000' 
            }).setDepth(20);
            
            subText = self.add.text(280, 320, 'Restarting in 5 seconds...', { 
                fontSize: '20px', 
                fill: '#fff' 
            }).setDepth(20);
          });

          // --- GAME RESET ---
          socket.on('gameReset', () => {
             if (winText) winText.destroy();
             if (subText) subText.destroy();
             self.physics.resume();
             canCollect = true; 
          });

          // --- PLAYERS ---
          otherPlayers = self.physics.add.group();

          socket.on('currentPlayers', (players: any) => {
            if(player) player.destroy();
            otherPlayers.clear(true, true);

            Object.keys(players).forEach((id) => {
              if (players[id].playerId === socket.id) {
                // --- MAIN PLAYER (ME) ---
                player = self.physics.add.sprite(players[id].x, players[id].y, 'player');
                player.setScale(0.15); // Gubbu Size
                player.setTint(0x00ff00); // Green Tint
                player.playerId = players[id].playerId;
                player.setDepth(5);
                self.physics.add.collider(player, walls);
                
                // Coin Collection Logic
                if(star) {
                    self.physics.add.overlap(player, star, () => {
                        if (star.visible && canCollect) {
                            star.setVisible(false); 
                            canCollect = false; 
                            socket.emit('starCollected');
                        }
                    }, undefined, self);
                }

              } else {
                // --- ENEMY PLAYERS ---
                const other = self.physics.add.sprite(players[id].x, players[id].y, 'player');
                other.setScale(0.15); // Gubbu Size
                other.setTint(0xff0000); // Red Tint
                otherPlayers.add(other);
                other.setDepth(5);
                (other as any).playerId = players[id].playerId;
              }
            });
            updateScoreBoard(players);
          });

          socket.on('newPlayer', (playerInfo: any) => {
            const other = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'player');
            other.setScale(0.15);
            other.setTint(0xff0000);
            otherPlayers.add(other);
            other.setDepth(5);
            (other as any).playerId = playerInfo.playerId;
          });

          // --- SMOOTH MOVEMENT (No Lag) ---
          socket.on('playerMoved', (playerInfo: any) => {
            otherPlayers.getChildren().forEach((other: any) => {
              if (playerInfo.playerId === other.playerId) {
                // Interpolation (Slide effect)
                self.tweens.add({
                    targets: other,
                    x: playerInfo.x,
                    y: playerInfo.y,
                    duration: 100,
                    ease: 'Linear'
                });
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
          
          // Initial Request
          if(socket.connected) {
              socket.emit('requestPlayers');
              socket.emit('requestStar');
          }
        },

        update: function(this: any) {
          if (player) {
            player.body.setVelocity(0);
            
            // Movement Controls
            if (cursors.left.isDown || wasd.A.isDown || isTouchLeft) {
                player.body.setVelocityX(-200);
            }
            else if (cursors.right.isDown || wasd.D.isDown || isTouchRight) {
                player.body.setVelocityX(200);
            }

            if (cursors.up.isDown || wasd.W.isDown || isTouchUp) {
                player.body.setVelocityY(-200);
            }
            else if (cursors.down.isDown || wasd.S.isDown || isTouchDown) {
                player.body.setVelocityY(200);
            }

            const x = player.x;
            const y = player.y;
            
            // --- NETWORK OPTIMIZATION ---
            // Sirf tab bhejo jab player hila ho (Traffic bachao)
            if (oldPosition && (Math.abs(x - oldPosition.x) > 2 || Math.abs(y - oldPosition.y) > 2)) {
              socket.emit('playerMovement', { x: player.x, y: player.y });
              oldPosition = { x: player.x, y: player.y };
            }
            if (!oldPosition) oldPosition = { x: player.x, y: player.y };
          }
        }
      }
    };
    this.phaserGame = new Phaser.Game(this.config);
  }
}