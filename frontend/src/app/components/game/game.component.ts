import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { io, Socket } from 'socket.io-client';

/* ─── Types ─────────────────────────────────── */

interface PlayerState {
  playerId  : string;
  playerName: string;
  x         : number;
  y         : number;
  score     : number;
}

interface StarState {
  x      : number;
  y      : number;
  active : boolean;
}

interface MovedPlayer {
  playerId: string;
  x       : number;
  y       : number;
}

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

/* ─── Component ──────────────────────────────── */

@Component({
  selector   : 'app-game',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  styleUrls  : ['./game.component.css'],

  template: `

    <div *ngIf="!gameStarted" class="lobby">
      <div class="lobby-particles"></div>
      <div class="lobby-box">
        <h1 class="title-glow">🚀 Space Coin</h1>
        <p class="sub sub-glow">Multiplayer coin-collection game</p>

        <div class="input-group">
          <label for="playerName">Your Name</label>
          <input id="playerName" [(ngModel)]="playerName" placeholder="Enter name..." maxlength="20"
                 autocomplete="off" (keyup.enter)="joinRoom()" />
          <span class="input-border"></span>
        </div>

        <div class="input-group">
          <label for="roomName">Room Name</label>
          <input id="roomName" [(ngModel)]="roomName" placeholder="e.g. room1" maxlength="24"
                 autocomplete="off" (keyup.enter)="joinRoom()" />
          <span class="input-border"></span>
        </div>

        <button (click)="joinRoom()" [disabled]="!playerName || !roomName" class="join-btn">
          <span class="btn-text">Join / Create Room</span>
          <div class="btn-liquid"></div>
        </button>

        <p *ngIf="serverError" class="error">{{ serverError }}</p>
      </div>
    </div>

    <div *ngIf="gameStarted" id="game-container">
      <div class="hud-overlay">
        <button class="leave-btn" (click)="leaveGame()">⟵ Leave</button>

        <div class="conn-banner" [class.is-connecting]="connectionStatus === 'connecting'"
             *ngIf="connectionStatus !== 'connected'">
          <span class="conn-dot"></span>
          {{ connectionStatus === 'connecting' ? 'Connecting…' : 'Reconnecting…' }}
        </div>

        <div class="join-error-panel" *ngIf="joinError">
          <p>{{ joinError }}</p>
          <button (click)="leaveGame()">Back to Lobby</button>
        </div>
      </div>
    </div>

  `
})
export class GameComponent implements OnInit, OnDestroy {

  gameStarted      = false;
  playerName       = '';
  roomName         = '';
  serverError      = '';
  joinError        : string | null = null;
  connectionStatus : ConnectionStatus = 'connecting';

  private readonly ROOM_NAME_RE = /^[a-zA-Z0-9 _-]{1,24}$/;

  private phaserGame : any;
  private socket     : Socket | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {}

  async joinRoom() {
    const name = this.playerName.trim();
    const room = this.roomName.trim();
    if (!name || !room) return;

    if (!this.ROOM_NAME_RE.test(room)) {
      this.serverError = 'Room name must be 1-24 letters, numbers, spaces, - or _.';
      return;
    }

    this.playerName  = name;
    this.roomName    = room;
    this.serverError = '';
    this.joinError    = null;
    this.gameStarted  = true;
    setTimeout(() => this.initGame(), 0);
  }

  /** Leaves the current game and returns to the lobby, cleaning up the socket + Phaser instance. */
  leaveGame(): void {
    if (this.joinError) this.serverError = this.joinError;
    this.joinError = null;

    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;

    this.phaserGame?.destroy(true);
    this.phaserGame = null;

    this.gameStarted      = false;
    this.connectionStatus = 'connecting';
  }

  async initGame() {
    if (!isPlatformBrowser(this.platformId)) return;

    const self = this; // capture the component instance for use inside Phaser's scene callbacks

    const PhaserImport = await import('phaser');
    const Phaser = (PhaserImport as any).default ?? PhaserImport;

    const serverUrl = window.location.hostname === 'localhost'
        ? 'http://localhost:3000' : window.location.origin;

    /* ── ULTIMATE PERFORMANCE: Force WebSocket (0 Polling Delay) ── */
    this.socket = io(serverUrl, {
      transports: ['websocket']
    });

    const socket   = this.socket;
    const roomName = this.roomName;
    const playerName = this.playerName;

    let player       : any = null;
    let otherPlayersMap: Record<string, any> = {}; // O(1) lookups by playerId instead of a Phaser group array
    let walls        : any;
    let cursors      : any;
    let wasd         : any;
    let star         : any;
    let scoreText    : any;

    let isTouchLeft  = false;
    let isTouchRight = false;
    let isTouchUp    = false;
    let isTouchDown  = false;

    let canCollect   = true;
    let winText      : any = null;
    let subText      : any = null;
    let oldPosition  : { x: number; y: number } | undefined;
    let lastSentAt   = 0;
    const MOVE_EMIT_INTERVAL_MS = 20; // ~50 sends/sec — under the server's 60/sec cap, smooth at its 40-tick rate

    const registerStarOverlap = (scene: any) => {
      if (!player || !star) return;
      scene.physics.add.overlap(player, star, () => {
          if (star.active && star.visible && canCollect) {
            star.setVisible(false);
            star.body.enable = false;
            canCollect = false;
            socket.emit('starCollectedInRoom', { roomName });
          }
        }, undefined, scene);
    };

    /* ── Performance Optimized Config (120 FPS Target) ── */
    const config = {
      type   : Phaser.AUTO,
      width  : 800,
      height : 600,
      parent : 'game-container',
      antialias: true,
      clearBeforeRender: false,
      powerPreference: 'high-performance',
      fps: {
        target: 120,
        forceSetTimeOut: true,
        smoothStep: true
      },
      scale: {
        mode      : Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      physics: {
        default : 'arcade',
        arcade  : { gravity: { x: 0, y: 0 }, debug: false }
      },
      scene: {

        preload(this: any) {
          this.load.image('player',   'assets/gubbu.ico');
          this.load.image('spaceBg',  'assets/bg.png');
          this.load.image('coin',     'assets/coin.png');
        },

        create(this: any) {
          const scene = this;

          scene.add.tileSprite(400, 300, 800, 600, 'spaceBg');

          /* ── Walls (Rounded & Neon Glow) ── */
          walls = scene.physics.add.staticGroup();

          const createWall = (x: number, y: number, w: number, h: number) => {
            const key = `neonWall_${w}_${h}`;
            if (!scene.textures.exists(key)) {
              const graphics = scene.make.graphics({ x: 0, y: 0, add: false });

              graphics.lineStyle(6, 0x0ea5e9, 0.4);
              graphics.strokeRoundedRect(3, 3, w - 6, h - 6, 12);

              graphics.fillStyle(0x0284c7, 0.2);
              graphics.fillRoundedRect(3, 3, w - 6, h - 6, 12);

              graphics.lineStyle(2, 0x38bdf8, 1);
              graphics.strokeRoundedRect(6, 6, w - 12, h - 12, 8);

              graphics.generateTexture(key, w, h);
            }
            const wall = scene.add.sprite(x, y, key);
            scene.physics.add.existing(wall, true);
            walls.add(wall);
          };

          createWall(400, 50,  700, 20); // Top
          createWall(400, 550, 700, 20); // Bottom
          createWall(50,  300, 20, 500); // Left
          createWall(750, 300, 20, 500); // Right

          createWall(250, 300, 150, 20); // Center-Left Small Wall
          createWall(550, 300, 150, 20); // Center-Right Small Wall


          /* ── Touch Buttons (Glass UI) - ONLY FOR MOBILE ── */
          if (!scene.sys.game.device.os.desktop) {
            const createBtn = (x: number, y: number, text: string) => {
              const container = scene.add.container(x, y).setScrollFactor(0).setDepth(20);

              const bg = scene.add.graphics();
              bg.fillStyle(0x0f172a, 0.7);
              bg.lineStyle(2, 0x0ea5e9, 0.8);
              bg.fillRoundedRect(0, 0, 70, 70, 16);
              bg.strokeRoundedRect(0, 0, 70, 70, 16);

              const icon = scene.add.text(35, 35, text, { fontSize: '35px' }).setOrigin(0.5);
              container.add([bg, icon]);

              const hitArea = scene.add.rectangle(35, 35, 70, 70, 0x000000, 0).setInteractive();
              container.add(hitArea);

              hitArea.on('pointerdown', () => { bg.setAlpha(0.5); });
              hitArea.on('pointerup',   () => { bg.setAlpha(1); });
              hitArea.on('pointerout',  () => { bg.setAlpha(1); });

              return hitArea;
            };

            const btnLeft  = createBtn(30,  490, '⬅️');
            const btnRight = createBtn(115, 490, '➡️');
            const btnUp    = createBtn(680, 400, '⬆️');
            const btnDown  = createBtn(680, 490, '⬇️');

            const bindBtn = (btn: any, setTrue: () => void, setFalse: () => void) => {
              btn.on('pointerdown', setTrue);
              btn.on('pointerup',   setFalse);
              btn.on('pointerout',  setFalse);
            };

            bindBtn(btnLeft,  () => isTouchLeft  = true, () => isTouchLeft  = false);
            bindBtn(btnRight, () => isTouchRight = true, () => isTouchRight = false);
            bindBtn(btnUp,    () => isTouchUp    = true, () => isTouchUp    = false);
            bindBtn(btnDown,  () => isTouchDown  = true, () => isTouchDown  = false);
          }

          /* ── Coin / Star ── */
          star = scene.physics.add.sprite(-100, -100, 'coin');
          star.setDepth(5);
          star.setScale(0.05);
          star.setBlendMode('ADD');
          star.setVisible(false);

          scene.tweens.add({
            targets  : star,
            angle    : 360,
            duration : 5000,
            repeat   : -1
          });

          /* ── Scoreboard ── */
          const scoreBg = scene.add.graphics();
          scoreBg.fillStyle(0x0f172a, 0.7);
          scoreBg.lineStyle(1, 0x0ea5e9, 0.5);
          scoreBg.fillRoundedRect(16, 16, 180, 85, 10);
          scoreBg.strokeRoundedRect(16, 16, 180, 85, 10);
          scoreBg.setDepth(9).setScrollFactor(0);

          scoreText = scene.add.text(24, 24, 'Connecting...', {
            fontSize        : '15px',
            fontFamily      : 'Rajdhani, sans-serif',
            fill            : '#38bdf8',
            fontStyle       : 'bold',
            lineSpacing     : 4
          }).setDepth(10);

          scene.add.text(16, scene.scale.height - 30, `Room: ${roomName}`, {
            fontSize  : '14px',
            fontFamily: 'Rajdhani, sans-serif',
            fill      : '#94a3b8'
          }).setScrollFactor(0).setDepth(10);

          /* ── Init Inputs ── */
          cursors = scene.input.keyboard.createCursorKeys();
          wasd    = scene.input.keyboard.addKeys('W,S,A,D');

          /* ════════════════
              SOCKET EVENTS
          ════════════════ */

          const updateScoreBoard = (players: Record<string, PlayerState>) => {
            const lines = Object.values(players)
              .sort((a, b) => b.score - a.score)
              .map(p => {
                const tag = p.playerId === socket.id ? '(You)' : '';
                return `${p.playerName}${tag} : ${p.score}`;
              });
            scoreText.setText(['🏆 SCORES', ...lines].join('\n'));
          };

          const spawnStar = (starData: StarState) => {
            star.setPosition(starData.x, starData.y);
            star.setVisible(true);
            star.setActive(true);
            if (star.body) {
              star.body.enable = true;
              star.body.reset(starData.x, starData.y);
            }
            canCollect = true;
          };

          // Builds/updates the local view of the room from a full player list, without
          // tearing down and recreating sprites that are still present — this runs on
          // every join *and* every reconnection resync, so being non-destructive here
          // is what keeps reconnects from causing a visible flicker for everyone else.
          const syncPlayers = (players: Record<string, PlayerState>) => {
            const incomingIds = new Set(Object.keys(players));

            for (const id of Object.keys(otherPlayersMap)) {
              if (!incomingIds.has(id)) {
                otherPlayersMap[id].destroy();
                delete otherPlayersMap[id];
              }
            }

            Object.values(players).forEach(pData => {
              if (pData.playerId === socket.id) {
                if (!player) {
                  player = scene.physics.add.sprite(pData.x, pData.y, 'player');
                  player.setScale(0.15).setTint(0x00ff00).setDepth(5);
                  player.playerId = pData.playerId;
                  scene.physics.add.collider(player, walls);
                  registerStarOverlap(scene);
                } else {
                  player.setPosition(pData.x, pData.y);
                }
              } else {
                let other = otherPlayersMap[pData.playerId];
                if (!other) {
                  other = scene.physics.add.sprite(pData.x, pData.y, 'player');
                  other.setScale(0.15).setTint(0xff0000).setDepth(5);
                  other.playerId = pData.playerId;
                  otherPlayersMap[pData.playerId] = other;
                } else {
                  other.setAlpha(1); // un-ghost in case this was a disconnect/reconnect resync
                  other.setPosition(pData.x, pData.y);
                }
              }
            });

            updateScoreBoard(players);
          };

          socket.on('connect', () => {
            self.connectionStatus = 'connected';
            self.joinError = null;

            if (socket.recovered) {
              // Same session restored server-side (id, room, score) — it will push a
              // fresh currentPlayersInRoom/starLocationInRoom on its own; re-joining
              // here would just overwrite our recovered score with a brand new player.
              scoreText.setText('Reconnected!');
            } else {
              scoreText.setText('Connected! Joining room...');
              socket.emit('joinRoom', { roomName, playerName });
            }
          });

          socket.on('disconnect', () => {
            self.connectionStatus = 'reconnecting';
          });

          socket.on('serverError', ({ msg }: { msg: string }) => {
            scoreText.setText('⚠ ' + msg);
            self.joinError = msg;
          });

          socket.on('currentPlayersInRoom', ({ players }: { players: Record<string, PlayerState> }) => {
            syncPlayers(players);
          });

          socket.on('newPlayerInRoom', ({ playerInfo }: { playerInfo: PlayerState }) => {
            if (otherPlayersMap[playerInfo.playerId] || playerInfo.playerId === socket.id) return;
            const other = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player');
            other.setScale(0.15).setTint(0xff0000).setDepth(5);
            other.playerId = playerInfo.playerId;
            otherPlayersMap[playerInfo.playerId] = other;
          });

          socket.on('starLocationInRoom', ({ star: starData }: { star: StarState }) => {
            spawnStar(starData);
          });

          socket.on('scoreUpdateInRoom', ({ players }: { players: Record<string, PlayerState> }) => {
            updateScoreBoard(players);
          });

          // Batched, 40-tick movement broadcast — one event per room per tick covering
          // every player who moved, instead of one event per player.
          socket.on('playersMovedInRoom', ({ players: moved }: { players: MovedPlayer[] }) => {
            for (const p of moved) {
              if (p.playerId === socket.id) continue; // our own position is already authoritative locally
              const other = otherPlayersMap[p.playerId];
              if (!other) continue;
              scene.tweens.killTweensOf(other);
              scene.tweens.add({
                targets  : other,
                x        : p.x,
                y        : p.y,
                duration : 40,   // slightly above the 25ms tick to smooth over dropped/late packets
                ease     : 'Linear'
              });
            }
          });

          // The other player may just be mid network-blip — fade them out rather than
          // remove them, and only delete for real once the server confirms they're gone.
          socket.on('playerDisconnectedInRoom', ({ playerId, reconnecting }: { playerId: string; reconnecting?: boolean }) => {
            const other = otherPlayersMap[playerId];
            if (!other) return;
            if (reconnecting) {
              other.setAlpha(0.35);
            } else {
              other.destroy();
              delete otherPlayersMap[playerId];
            }
          });

          socket.on('playerReconnectedInRoom', ({ playerId }: { playerId: string }) => {
            const other = otherPlayersMap[playerId];
            if (other) other.setAlpha(1);
          });

          socket.on('playerLeftInRoom', ({ playerId }: { playerId: string }) => {
            const other = otherPlayersMap[playerId];
            if (other) {
              other.destroy();
              delete otherPlayersMap[playerId];
            }
          });

          socket.on('gameOverInRoom', ({ winnerId }: { winnerId: string }) => {
            scene.physics.pause();
            if (star) {
              star.setVisible(false);
              if (star.body) star.body.enable = false;
            }

            const isWinner = winnerId === socket.id;
            winText = scene.add.text(400, 240,
              isWinner ? '🏆 YOU WIN!' : '💀 YOU LOSE!',
              {
                fontSize        : '56px',
                fontFamily      : 'Orbitron, sans-serif',
                fill            : isWinner ? '#4ade80' : '#f87171',
                stroke          : '#000',
                strokeThickness : 6,
                backgroundColor : 'rgba(15, 23, 42, 0.8)',
                padding         : { x: 20, y: 10 }
              }
            ).setOrigin(0.5).setDepth(30);

            subText = scene.add.text(400, 320,
              'Restarting in 5 seconds...',
              { fontSize: '20px', fontFamily: 'Rajdhani, sans-serif', fill: '#cbd5e1' }
            ).setOrigin(0.5).setDepth(30);
          });

          socket.on('gameResetInRoom', () => {
            if (winText)  { winText.destroy();  winText  = null; }
            if (subText)  { subText.destroy();  subText  = null; }
            scene.physics.resume();
            canCollect  = true;
            oldPosition = undefined;
          });

          if (socket.connected && !socket.recovered) {
            socket.emit('joinRoom', { roomName, playerName });
          }
        },

        update(this: any) {
          if (!player) return;

          player.body.setVelocity(0);

          const goLeft  = cursors.left.isDown  || wasd.A.isDown || isTouchLeft;
          const goRight = cursors.right.isDown || wasd.D.isDown || isTouchRight;
          const goUp    = cursors.up.isDown    || wasd.W.isDown || isTouchUp;
          const goDown  = cursors.down.isDown  || wasd.S.isDown || isTouchDown;

          if (goLeft)  player.body.setVelocityX(-200);
          else if (goRight) player.body.setVelocityX(200);

          if (goUp)   player.body.setVelocityY(-200);
          else if (goDown) player.body.setVelocityY(200);

          const { x, y } = player;
          const moved =
            !oldPosition ||
            Math.abs(x - oldPosition.x) > 2 ||
            Math.abs(y - oldPosition.y) > 2;

          const now = Date.now();
          if (moved && now - lastSentAt >= MOVE_EMIT_INTERVAL_MS) {
            socket.emit('playerMovementInRoom', { roomName, movementData: { x, y } });
            oldPosition = { x, y };
            lastSentAt  = now;
          }
        }
      }
    };

    this.phaserGame = new Phaser.Game(config);
  }

  ngOnDestroy(): void {
    this.socket?.disconnect();
    this.phaserGame?.destroy(true);
  }
}
