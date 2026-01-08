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
    
    let isTouchLeft = false;
    let isTouchRight = false;
    let isTouchUp = false;
    let isTouchDown = false;

    let canCollect = true;

    let winText: any = null;
    let subText: any = null;
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
        arcade: { gravity: { x: 0, y: 0 }, debug: false }
      },
      scene: {
        preload: function(this: any) {
            // --- CHANGE 1: GUBBU WAPAS AAYA ---
            // Hum 'assets/gubbu.png' use kar rahe hain
            this.load.image('player', 'assets/gubbu.png'); 
            
            this.load.image('spaceBg', 'assets/bg.png');
            this.load.image('spaceWall', 'assets/wall.png');
        },

        create: function(this: any) {
          const self = this;

          // --- BACKGROUND ---
          this.add.tileSprite(400, 300, 800, 600, 'spaceBg');
          
          socket.on('connect', () => {
              scoreText.setText('Connected! Loading...');
              socket.emit('requestPlayers');
              socket.emit('requestStar');
          });

          // --- TOUCH BUTTONS ---
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


          // --- WALLS ---
          walls = self.physics.add.staticGroup();
          const createWall = (x: number, y: number, w: number, h: number) => {
             const wall = self.add.tileSprite(x, y, w, h, 'spaceWall');
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
          star.setDepth(5);

          socket.on('starLocation', (location: any) => {
             if (!star || !star.scene) {
                 star = self.add.circle(location.x, location.y, 15, 0xffff00);
                 self.physics.add.existing(star);
                 star.setDepth(5);
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
          scoreText = self.add.text(16, 16, 'Connecting...', { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 }).setDepth(10);
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
            if(star) {
                star.setVisible(false);
                if(star.body) star.body.enable = false;
            }
            let resultText = (winnerId === socket.id) ? 'YOU WIN! 🏆' : 'YOU LOSE! 😢';
            let color = (winnerId === socket.id) ? '#00ff00' : '#ff0000';
            winText = self.add.text(250, 250, resultText, { fontSize: '60px', fill: color, backgroundColor: '#000' }).setDepth(20);
            subText = self.add.text(280, 320, 'Restarting in 5 seconds...', { fontSize: '20px', fill: '#fff' }).setDepth(20);
          });

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
                // MAIN PLAYER
                player = self.physics.add.sprite(players[id].x, players[id].y, 'player');
                // --- CHANGE 2: SIZE CHHOTA KIYA (0.15) ---
                player.setScale(0.15); 
                player.setTint(0x00ff00);
                player.playerId = players[id].playerId;
                player.setDepth(5);
                self.physics.add.collider(player, walls);
                
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
                // ENEMY
                const other = self.physics.add.sprite(players[id].x, players[id].y, 'player');
                // --- CHANGE 2: SIZE CHHOTA KIYA (0.15) ---
                other.setScale(0.15); 
                other.setTint(0xff0000);
                otherPlayers.add(other);
                other.setDepth(5);
                (other as any).playerId = players[id].playerId;
              }
            });
            updateScoreBoard(players);
          });

          socket.on('newPlayer', (playerInfo: any) => {
            const other = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'player');
            // --- CHANGE 2: SIZE CHHOTA KIYA (0.15) ---
            other.setScale(0.15);
            other.setTint(0xff0000);
            otherPlayers.add(other);
            other.setDepth(5);
            (other as any).playerId = playerInfo.playerId;
          });

          // --- CHANGE 3: SMOOTH MOVEMENT (NO LAG) ---
          socket.on('playerMoved', (playerInfo: any) => {
            otherPlayers.getChildren().forEach((other: any) => {
              if (playerInfo.playerId === other.playerId) {
                // Teleport ki jagah Tween (Slide) use kar rahe hain
                self.tweens.add({
                    targets: other,
                    x: playerInfo.x,
                    y: playerInfo.y,
                    duration: 100, // 100ms mein pahunchega (Masks lag)
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
          
          if(socket.connected) {
              scoreText.setText('Connected! Loading...');
              socket.emit('requestPlayers');
              socket.emit('requestStar');
          }
        },

        update: function(this: any) {
          if (player) {
            player.body.setVelocity(0);
            
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
            // Network Traffic Kam karne ke liye check
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