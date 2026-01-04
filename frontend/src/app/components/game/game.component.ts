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

    const url =
      window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : undefined;

    this.socket = io(url);
    const socket = this.socket;

    let player: any;
    let otherPlayers: any;
    let walls: any;
    let cursors: any;
    let wasd: any;
    let star: any;
    let scoreText: any;
    let winText: any;
    let subText: any;
    let oldPosition: any;

    let canCollect = true;

    // --- TOUCH FLAGS ---
    let isTouchLeft = false;
    let isTouchRight = false;
    let isTouchUp = false;
    let isTouchDown = false;

    const config = {
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
        preload(this: any) {
          this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
          this.load.image('spaceBg', 'assets/bg.png');
          this.load.image('spaceWall', 'assets/wall.png');
        },

        create(this: any) {
          const self = this;

          // --- BACKGROUND ---
          this.add.tileSprite(400, 300, 800, 600, 'spaceBg');

          // --- SCOREBOARD (CREATE FIRST) ---
          scoreText = this.add.text(
            16,
            16,
            'Connecting...',
            {
              fontSize: '28px',
              fill: '#ffffff',
              stroke: '#000',
              strokeThickness: 4
            }
          ).setDepth(10);

          socket.on('connect', () => {
            scoreText.setText('Connected! Loading...');
            socket.emit('requestPlayers');
            socket.emit('requestStar');
          });

          // --- TOUCH BUTTONS ---
          const makeBtn = (x: number, y: number, label: string) => {
            return self.add.text(x, y, label, {
              fontSize: '50px',
              backgroundColor: '#333',
              padding: { x: 12, y: 12 }
            })
              .setScrollFactor(0)
              .setDepth(20)
              .setInteractive();
          };

          const btnLeft = makeBtn(40, 500, '⬅️');
          const btnRight = makeBtn(160, 500, '➡️');
          const btnUp = makeBtn(640, 430, '⬆️');
          const btnDown = makeBtn(640, 520, '⬇️');

          btnLeft.on('pointerdown', () => isTouchLeft = true);
          btnLeft.on('pointerup', () => isTouchLeft = false);
          btnLeft.on('pointerout', () => isTouchLeft = false);
          btnLeft.on('pointercancel', () => isTouchLeft = false);

          btnRight.on('pointerdown', () => isTouchRight = true);
          btnRight.on('pointerup', () => isTouchRight = false);
          btnRight.on('pointerout', () => isTouchRight = false);
          btnRight.on('pointercancel', () => isTouchRight = false);

          btnUp.on('pointerdown', () => isTouchUp = true);
          btnUp.on('pointerup', () => isTouchUp = false);
          btnUp.on('pointerout', () => isTouchUp = false);
          btnUp.on('pointercancel', () => isTouchUp = false);

          btnDown.on('pointerdown', () => isTouchDown = true);
          btnDown.on('pointerup', () => isTouchDown = false);
          btnDown.on('pointerout', () => isTouchDown = false);
          btnDown.on('pointercancel', () => isTouchDown = false);

          // --- WALLS ---
          walls = self.physics.add.staticGroup();

          const wall = (x: number, y: number, w: number, h: number) => {
            const obj = self.add.tileSprite(x, y, w, h, 'spaceWall');
            self.physics.add.existing(obj, true);
            walls.add(obj);
          };

          wall(400, 50, 700, 20);
          wall(400, 550, 700, 20);
          wall(50, 300, 20, 500);
          wall(750, 300, 20, 500);
          wall(400, 300, 300, 20);

          // --- STAR ---
          star = self.add.circle(-100, -100, 15, 0xffff00);
          self.physics.add.existing(star);
          star.setDepth(5);

          socket.on('starLocation', (pos: any) => {
            star.setPosition(pos.x, pos.y);
            star.setVisible(true);
            star.body.enable = true;
            canCollect = true;
          });

          // --- PLAYERS ---
          otherPlayers = self.physics.add.group();

          socket.on('currentPlayers', (players: any) => {
            if (player) player.destroy();

            otherPlayers.getChildren().forEach((p: any) => p.destroy());
            otherPlayers.clear();

            Object.values(players).forEach((p: any) => {
              if (p.playerId === socket.id) {
                player = self.physics.add.sprite(p.x, p.y, 'player');
                player.setScale(1.5);
                player.setTint(0x00ff00);
                player.setCollideWorldBounds(true);
                self.physics.add.collider(player, walls);

                self.physics.add.overlap(player, star, () => {
                  if (canCollect && star.visible) {
                    canCollect = false;
                    star.setVisible(false);
                    star.body.enable = false;
                    socket.emit('starCollected');
                  }
                });
              } else {
                const enemy = self.physics.add.sprite(p.x, p.y, 'player');
                enemy.setScale(1.5);
                enemy.setTint(0xff0000);
                (enemy as any).playerId = p.playerId;
                otherPlayers.add(enemy);
              }
            });

            updateScore(players);
          });

          socket.on('newPlayer', (p: any) => {
            const enemy = self.physics.add.sprite(p.x, p.y, 'player');
            enemy.setScale(1.5);
            enemy.setTint(0xff0000);
            (enemy as any).playerId = p.playerId;
            otherPlayers.add(enemy);
          });

          socket.on('playerMoved', (p: any) => {
            otherPlayers.getChildren().forEach((enemy: any) => {
              if (enemy.playerId === p.playerId) {
                enemy.setPosition(p.x, p.y);
              }
            });
          });

          socket.on('playerDisconnected', (id: string) => {
            otherPlayers.getChildren().forEach((enemy: any) => {
              if (enemy.playerId === id) enemy.destroy();
            });
          });

          socket.on('gameOver', (winnerId: string) => {
            self.physics.pause();

            winText = self.add.text(
              250,
              260,
              winnerId === socket.id ? 'YOU WIN 🏆' : 'YOU LOSE 😢',
              {
                fontSize: '60px',
                fill: winnerId === socket.id ? '#0f0' : '#f00',
                backgroundColor: '#000'
              }
            ).setDepth(50);

            subText = self.add.text(
              280,
              330,
              'Restarting...',
              { fontSize: '20px', fill: '#fff' }
            ).setDepth(50);
          });

          socket.on('gameReset', () => {
            winText?.destroy();
            subText?.destroy();
            self.physics.resume();
          });

          const updateScore = (players: any) => {
            let txt = '';
            Object.values(players).forEach((p: any) => {
              txt += (p.playerId === socket.id ? 'ME' : 'ENEMY') + ': ' + p.score + '\n';
            });
            scoreText.setText(txt);
          };

          cursors = self.input.keyboard.createCursorKeys();
          wasd = self.input.keyboard.addKeys('W,A,S,D');
        },

        update(this: any) {
          if (!player) return;

          player.body.setVelocity(0);

          if (cursors.left.isDown || wasd.A.isDown || isTouchLeft) {
            player.body.setVelocityX(-200);
          } else if (cursors.right.isDown || wasd.D.isDown || isTouchRight) {
            player.body.setVelocityX(200);
          }

          if (cursors.up.isDown || wasd.W.isDown || isTouchUp) {
            player.body.setVelocityY(-200);
          } else if (cursors.down.isDown || wasd.S.isDown || isTouchDown) {
            player.body.setVelocityY(200);
          }

          const x = player.x;
          const y = player.y;

          if (!oldPosition ||
            Phaser.Math.Distance.Between(x, y, oldPosition.x, oldPosition.y) > 5) {
            socket.emit('playerMovement', { x, y });
            oldPosition = { x, y };
          }
        }
      }
    };

    this.phaserGame = new Phaser.Game(config);
  }
}
