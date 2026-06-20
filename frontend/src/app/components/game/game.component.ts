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

/* ─── Component ──────────────────────────────── */

@Component({
  selector   : 'app-game',
  standalone : true,
  imports    : [CommonModule, FormsModule],

  template: `

    <div *ngIf="!gameStarted" class="lobby">
      <div class="lobby-particles"></div>

      <div class="lobby-box" [class.shake]="shakeError">
        <div class="logo-badge">🚀</div>

        <h1 class="title-glow">Space Coin</h1>
        <p class="sub sub-glow">Multiplayer coin-collection game</p>

        <div class="input-group">
          <label for="playerName">👤 Your Name</label>
          <input
            id="playerName"
            [(ngModel)]="playerName"
            placeholder="Enter your name..."
            maxlength="20"
            autocomplete="off"
            autofocus
            [disabled]="isJoining"
            (keyup.enter)="focusRoomInput()"
          />
          <span class="input-border"></span>
          <span class="char-count">{{ playerName.length }}/20</span>
        </div>

        <div class="input-group">
          <label for="roomName">🚪 Room Code</label>
          <input
            id="roomName"
            #roomInput
            [(ngModel)]="roomName"
            placeholder="e.g. room1"
            maxlength="20"
            autocomplete="off"
            [disabled]="isJoining"
            (keyup.enter)="joinRoom()"
          />
          <span class="input-border"></span>
          <span class="char-count">{{ roomName.length }}/20</span>
        </div>

        <p class="hint">💡 Same room code = same game room. Up to 5 players.</p>

        <button (click)="joinRoom()" [disabled]="!canJoin || isJoining" class="join-btn">
          <span class="btn-text" *ngIf="!isJoining">Join / Create Room</span>
          <span class="btn-text btn-loading" *ngIf="isJoining">
            <span class="spinner"></span> Connecting...
          </span>
          <div class="btn-liquid"></div>
        </button>

        <p *ngIf="serverError" class="error">⚠️ {{ serverError }}</p>
      </div>
    </div>

    <div *ngIf="gameStarted" id="game-container"></div>

  `,

  styles: [`
    /* ── Global Fonts & Reset ── */
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&family=Rajdhani:wght@400;600;700&display=swap');

    :host {
      font-family: 'Rajdhani', sans-serif;
    }

    /* ── LOBBY BACKGROUND & ANIMATION ── */
    .lobby {
      position        : fixed;
      inset           : 0;
      display         : flex;
      align-items     : center;
      justify-content : center;
      background      : radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%);
      overflow        : hidden;
      padding         : 20px;
      box-sizing      : border-box;
    }

    .lobby-particles {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      background-image: 
        radial-gradient(white, rgba(255,255,255,.2) 2px, transparent 3px),
        radial-gradient(white, rgba(255,255,255,.15) 1px, transparent 2px),
        radial-gradient(white, rgba(255,255,255,.1) 2px, transparent 3px);
      background-size: 550px 550px, 350px 350px, 250px 250px;
      background-position: 0 0, 0 0, 0 0;
      animation: starMove 100s linear infinite;
      opacity: 0.5;
      z-index: 0;
    }

    @keyframes starMove {
      from { background-position: 0 0, 0 0, 0 0; }
      to   { background-position: 0 600px, 0 400px, 0 300px; }
    }

    /* ── GLASSMORPHISM LOBBY CARD ── */
    .lobby-box {
      position: relative;
      z-index: 1;
      display         : flex;
      flex-direction  : column;
      gap             : 16px;
      background      : rgba(255, 255, 255, 0.03);
      box-shadow      : 0 8px 32px 0 rgba(0, 0, 0, 0.3);
      backdrop-filter : blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius   : 24px;
      border          : 1px solid rgba(255, 255, 255, 0.1);
      padding         : 42px 36px;
      width           : 100%;
      max-width       : 380px;
      color           : #fff;
      transition      : transform 0.3s ease, box-shadow 0.3s ease;
      animation       : floatIn 0.5s ease;
    }

    @keyframes floatIn {
      from { opacity: 0; transform: translateY(16px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .lobby-box:hover {
      transform: translateY(-5px);
      box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(255,255,255,0.05);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .lobby-box.shake {
      animation: shakeBox 0.4s ease;
    }

    @keyframes shakeBox {
      0%, 100% { transform: translateX(0); }
      20%      { transform: translateX(-8px); }
      40%      { transform: translateX(8px); }
      60%      { transform: translateX(-6px); }
      80%      { transform: translateX(6px); }
    }

    /* ── LOGO BADGE ── */
    .logo-badge {
      width: 64px;
      height: 64px;
      margin: 0 auto 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(14,165,233,0.25), rgba(168,85,247,0.25));
      border: 1px solid rgba(255,255,255,0.15);
      box-shadow: 0 0 25px rgba(14, 165, 233, 0.25);
    }

    /* ── TYPOGRAPHY & GLOW ── */
    .title-glow {
      font-family: 'Orbitron', sans-serif;
      margin: 0 0 2px;
      font-size: 2.1rem;
      text-align: center;
      letter-spacing: 1px;
      background: linear-gradient(90deg, #0ea5e9, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow: 0 0 15px rgba(14, 165, 233, 0.4);
    }

    .sub-glow {
      margin: 0 0 10px;
      text-align: center;
      color: #94a3b8;
      font-size: 0.95rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.5px;
    }

    /* ── FUTURISTIC INPUTS ── */
    .input-group {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .input-group label {
      font-size: 0.9rem;
      color: #cbd5e1;
      font-weight: 600;
      margin-left: 4px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .input-group input {
      padding: 14px 16px;
      border-radius: 10px;
      border: none;
      background: rgba(0, 0, 0, 0.3);
      color: #fff;
      font-size: 1.1rem;
      outline: none;
      box-shadow: inset 0 2px 5px rgba(0,0,0,0.5);
      transition: all 0.3s ease;
      font-family: 'Rajdhani', sans-serif;
    }

    .input-group input::placeholder {
      color: #64748b;
    }

    .input-group input:focus {
      background: rgba(0, 0, 0, 0.5);
      box-shadow: inset 0 2px 5px rgba(0,0,0,0.5), 0 0 15px rgba(14, 165, 233, 0.4);
    }

    .input-group input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .input-border {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      width: 0;
      background: linear-gradient(90deg, #0ea5e9, #a855f7);
      transition: width 0.4s ease;
      border-radius: 0 0 10px 10px;
    }

    .input-group input:focus ~ .input-border {
      width: 100%;
    }

    .char-count {
      position: absolute;
      right: 4px;
      bottom: -18px;
      font-size: 0.7rem;
      color: #475569;
      letter-spacing: 0.5px;
    }

    .hint {
      margin: 0;
      font-size: 0.8rem;
      color: #64748b;
      text-align: center;
      line-height: 1.4;
    }

    /* ── LIQUID BUTTON ── */
    .join-btn {
      position: relative;
      margin-top: 6px;
      padding: 16px;
      border-radius: 12px;
      border: none;
      background: transparent;
      color: #fff;
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      overflow: hidden;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-family: 'Orbitron', sans-serif;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    }
    
    .join-btn::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      border-radius: 12px;
      background: linear-gradient(135deg, #0ea5e9, #a855f7);
      z-index: -2;
    }
    
    .join-btn::after {
      content: '';
      position: absolute;
      top: 2px; left: 2px; right: 2px; bottom: 2px;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.9);
      z-index: -1;
      transition: background 0.3s;
    }

    .join-btn:hover::after {
      background: transparent;
    }

    .join-btn:hover:not(:disabled) {
      transform: scale(1.03);
      box-shadow: 0 6px 25px rgba(14, 165, 233, 0.5);
    }

    .btn-text {
      position: relative;
      z-index: 2;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .btn-loading {
      font-size: 1rem;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .btn-liquid {
      position: absolute;
      top: -80px; left: 0;
      width: 380px; height: 380px;
      background: rgba(255,255,255,0.2);
      box-shadow: inset 0 0 50px rgba(0,0,0,0.5);
      transition: 0.5s;
      z-index: -1;
      border-radius: 40%;
      animation: liquid 4s linear infinite;
      opacity: 0;
    }

    .join-btn:hover .btn-liquid {
      top: -180px;
      opacity: 1;
    }

    @keyframes liquid {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .join-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      filter: grayscale(0.8);
    }

    .error {
      color: #ef4444;
      font-size: 0.9rem;
      text-align: center;
      margin-top: 4px;
      font-weight: 600;
      text-shadow: 0 0 5px rgba(239, 68, 68, 0.5);
    }

    /* ── GAME CONTAINER ── */
    #game-container {
      position        : fixed;
      inset           : 0;
      width           : 100vw;
      height          : 100vh;
      background      : radial-gradient(circle at 30% 30%, #0f172a, #020617);
      overflow        : hidden;
    }

    #game-container canvas {
      border-radius : 18px;
      box-shadow    :
        0 0 50px rgba(0,0,0,1),
        0 0 100px rgba(14, 165, 233, 0.2);
      margin: auto !important; 
      display: block;
    }

  `]
})
export class GameComponent implements OnInit, OnDestroy {

  gameStarted  = false;
  playerName   = '';
  roomName     = '';
  serverError  = '';
  isJoining    = false;
  shakeError   = false;

  private phaserGame : any;
  private socket     : Socket | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {}

  get canJoin(): boolean {
    return this.playerName.trim().length > 0 && this.roomName.trim().length > 0;
  }

  focusRoomInput(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const el = document.getElementById('roomName');
    el?.focus();
  }

  private triggerShake(): void {
    this.shakeError = true;
    setTimeout(() => (this.shakeError = false), 400);
  }

  async joinRoom() {
    if (!this.canJoin || this.isJoining) {
      if (!this.canJoin) this.triggerShake();
      return;
    }

    this.playerName = this.playerName.trim();
    this.roomName   = this.roomName.trim();
    this.serverError = '';
    this.isJoining    = true;

    // Small delay so the loading state is visible before the canvas mounts
    setTimeout(() => {
      this.gameStarted = true;
      setTimeout(() => this.initGame(), 0);
    }, 250);
  }

  async initGame() {
    if (!isPlatformBrowser(this.platformId)) return;

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
    let otherPlayersMap: Record<string, any> = {}; // OPTIMIZED: Replaced slow group array with fast Map
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

          socket.on('connect', () => {
            scoreText.setText('Connected! Joining room...');
            socket.emit('joinRoom', { roomName, playerName });
          });

          socket.on('serverError', ({ msg }: { msg: string }) => {
            scoreText.setText('Error: ' + msg);
          });

          socket.on('currentPlayersInRoom', ({ players }: { players: Record<string, PlayerState> }) => {
            if (player) { player.destroy(); player = null; }
            
            // OPTIMIZED: Clear the map
            Object.values(otherPlayersMap).forEach(p => p.destroy());
            otherPlayersMap = {};

            Object.values(players).forEach(pData => {
              if (pData.playerId === socket.id) {
                player = scene.physics.add.sprite(pData.x, pData.y, 'player');
                player.setScale(0.15).setTint(0x00ff00).setDepth(5);
                player.playerId = pData.playerId;
                scene.physics.add.collider(player, walls);
                registerStarOverlap(scene);
              } else {
                const other = scene.physics.add.sprite(pData.x, pData.y, 'player');
                other.setScale(0.15).setTint(0xff0000).setDepth(5);
                (other as any).playerId = pData.playerId;
                otherPlayersMap[pData.playerId] = other; // Fast Insert
              }
            });
            updateScoreBoard(players);
          });

          socket.on('newPlayerInRoom', ({ playerInfo }: { playerInfo: PlayerState }) => {
            const other = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player');
            other.setScale(0.15).setTint(0xff0000).setDepth(5);
            (other as any).playerId = playerInfo.playerId;
            otherPlayersMap[playerInfo.playerId] = other; // Fast Insert
          });

          socket.on('starLocationInRoom', ({ star: starData }: { star: StarState }) => {
            spawnStar(starData);
          });

          socket.on('scoreUpdateInRoom', ({ players }: { players: Record<string, PlayerState> }) => {
            updateScoreBoard(players);
          });

          socket.on('playerMovedInRoom', ({ playerInfo }: { playerInfo: PlayerState }) => {
            const other = otherPlayersMap[playerInfo.playerId]; // OPTIMIZED: O(1) Instant Lookup
            if (other) {
              scene.tweens.killTweensOf(other);
              scene.tweens.add({
                targets  : other,
                x        : playerInfo.x,
                y        : playerInfo.y,
                duration : 25,          // <-- Perfect Sync: Exact 25ms (Matches backend 40-Tick)
                ease     : 'Linear'
              });
            }
          });

          socket.on('playerDisconnectedInRoom', ({ playerId }: { playerId: string }) => {
            const other = otherPlayersMap[playerId]; // OPTIMIZED: O(1) Lookup
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

          if (socket.connected) {
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

          if (moved) {
            socket.emit('playerMovementInRoom', { roomName, movementData: { x, y } });
            oldPosition = { x, y };
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
