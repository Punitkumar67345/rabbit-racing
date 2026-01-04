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

    this.socket = io(
      window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : undefined
    );

    const socket = this.socket;

    let player: any;
    let enemies: any;
    let walls: any;
    let star: any;
    let cursors: any;
    let wasd: any;
    let scoreText: any;
    let oldPos: any;

    let canCollect = true;

    let touch = { l: false, r: false, u: false, d: false };

    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: 'game-container',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false }
      },

      scene: {
        preload(this: any) {
          this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
          this.load.image('spaceBg', 'assets/bg.png');
          this.load.image('spaceWall', 'assets/wall.png');
        },

        create(this: any) {
          const self = this;

          // Background
          this.add.tileSprite(400, 300, 800, 600, 'spaceBg');

          // Score
          scoreText = this.add.text(16, 16, 'Connecting...', {
            fontSize: '28px',
            fill: '#fff',
            stroke: '#000',
            strokeThickness: 4
          });

          // Touch Buttons
          const btn = (x: number, y: number, t: string, key: keyof typeof touch) =>
            self.add.text(x, y, t, { fontSize: '50px', backgroundColor: '#333', padding: 10 })
              .setInteractive()
              .on('pointerdown', () => touch[key] = true)
              .on('pointerup', () => touch[key] = false)
              .on('pointerout', () => touch[key] = false);

          btn(40, 500, '⬅️', 'l');
          btn(160, 500, '➡️', 'r');
          btn(640, 430, '⬆️', 'u');
          btn(640, 520, '⬇️', 'd');

          // Walls
          walls = self.physics.add.staticGroup();
          const wall = (x: number, y: number, w: number, h: number) => {
            const o = self.add.tileSprite(x, y, w, h, 'spaceWall');
            self.physics.add.existing(o, true);
            walls.add(o);
          };

          wall(400, 50, 700, 20);
          wall(400, 550, 700, 20);
          wall(50, 300, 20, 500);
          wall(750, 300, 20, 500);
          wall(400, 300, 300, 20);

          // Star
          star = self.add.circle(-100, -100, 15, 0xffff00);
          self.physics.add.existing(star);

          // Players
          enemies = self.physics.add.group();

          // Input
          cursors = self.input.keyboard.createCursorKeys();
          wasd = self.input.keyboard.addKeys('W,A,S,D');

          // SOCKET EVENTS
          socket.on('connect', () => {
            scoreText.setText('Connected');
            socket.emit('requestPlayers');
            socket.emit('requestStar');
          });

          socket.on('currentPlayers', (players: any) => {
            if (player) player.destroy();
            enemies.clear(true, true);

            Object.values(players).forEach((p: any) => {
              if (p.playerId === socket.id) {
                player = self.physics.add.sprite(p.x, p.y, 'player')
                  .setTint(0x00ff00)
                  .setScale(1.5);

                self.physics.add.collider(player, walls);
                self.physics.add.overlap(player, star, () => {
                  if (canCollect && star.visible) {
                    canCollect = false;
                    star.setVisible(false);
                    socket.emit('starCollected');
                  }
                });
              } else {
                const e = self.physics.add.sprite(p.x, p.y, 'player')
                  .setTint(0xff0000)
                  .setScale(1.5);
                (e as any).playerId = p.playerId;
                enemies.add(e);
              }
            });
          });

          socket.on('playerMoved', (p: any) => {
            enemies.getChildren().forEach((e: any) => {
              if (e.playerId === p.playerId) e.setPosition(p.x, p.y);
            });
          });

          socket.on('playerDisconnected', (id: string) => {
            enemies.getChildren().forEach((e: any) => {
              if (e.playerId === id) e.destroy();
            });
          });

          socket.on('starLocation', (s: any) => {
            star.setPosition(s.x, s.y);
            star.setVisible(true);
            canCollect = true;
          });

          socket.on('scoreUpdate', (players: any) => {
            let t = '';
            Object.values(players).forEach((p: any) => {
              t += (p.playerId === socket.id ? 'ME' : 'ENEMY') + ': ' + p.score + '\n';
            });
            scoreText.setText(t);
          });
        },

        update(this: any) {
          if (!player) return;

          player.body.setVelocity(0);

          if (cursors.left.isDown || wasd.A.isDown || touch.l) player.body.setVelocityX(-200);
          if (cursors.right.isDown || wasd.D.isDown || touch.r) player.body.setVelocityX(200);
          if (cursors.up.isDown || wasd.W.isDown || touch.u) player.body.setVelocityY(-200);
          if (cursors.down.isDown || wasd.S.isDown || touch.d) player.body.setVelocityY(200);

          if (!oldPos || Phaser.Math.Distance.Between(player.x, player.y, oldPos.x, oldPos.y) > 5) {
            socket.emit('playerMovement', { x: player.x, y: player.y });
            oldPos = { x: player.x, y: player.y };
          }
        }
      }
    };

    this.phaserGame = new Phaser.Game(config);
  }
}
