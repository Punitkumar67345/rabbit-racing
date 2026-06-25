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

      <!-- Animated star field layers -->
      <div class="stars-sm"></div>
      <div class="stars-md"></div>
      <div class="stars-lg"></div>

      <!-- Ambient glow orbs -->
      <div class="orb orb-red"></div>
      <div class="orb orb-blue"></div>
      <div class="orb orb-red2"></div>

      <!-- Lobby Card -->
      <div class="lobby-card" [class.shake]="shakeError">

        <!-- Corner accent lines -->
        <span class="corner corner-tl"></span>
        <span class="corner corner-tr"></span>
        <span class="corner corner-bl"></span>
        <span class="corner corner-br"></span>

        <!-- Logo -->
        <div class="logo-wrap">
          <div class="logo-ring-outer">
            <div class="logo-ring-inner">🚀</div>
          </div>
        </div>

        <!-- Title -->
        <h1 class="title">Space Coin</h1>
        <p class="subtitle">Multiplayer Coin Collection</p>

        <div class="divider"></div>

        <!-- Player Name Input -->
        <div class="field-group">
          <label class="field-label" for="playerName">
            <span class="label-dot"></span> Your Name
          </label>
          <div class="input-wrap">
            <input
              id="playerName"
              [(ngModel)]="playerName"
              placeholder="Enter your callsign..."
              maxlength="20"
              autocomplete="off"
              autofocus
              [disabled]="isJoining"
              (keyup.enter)="focusRoomInput()"
            />
            <span class="input-glow-line"></span>
            <span class="char-count">{{ playerName.length }}/20</span>
          </div>
        </div>

        <!-- Room Code Input -->
        <div class="field-group">
          <label class="field-label" for="roomName">
            <span class="label-dot label-dot-blue"></span> Room Code
          </label>
          <div class="input-wrap">
            <input
              id="roomName"
              #roomInput
              [(ngModel)]="roomName"
              placeholder="e.g. alpha-7"
              maxlength="20"
              autocomplete="off"
              [disabled]="isJoining"
              (keyup.enter)="joinRoom()"
            />
            <span class="input-glow-line glow-blue"></span>
            <span class="char-count">{{ roomName.length }}/20</span>
          </div>
        </div>

        <!-- Hint -->
        <div class="hint-box">
          <span class="hint-icon">◈</span>
          Same room code = same game room &nbsp;·&nbsp; Up to 5 players
        </div>

        <!-- Join Button -->
        <button
          (click)="joinRoom()"
          [disabled]="!canJoin || isJoining"
          class="join-btn"
          [class.btn-loading-state]="isJoining"
        >
          <span class="btn-bg-gradient"></span>
          <span class="btn-shimmer"></span>
          <span class="btn-content">
            <ng-container *ngIf="!isJoining">
              <span class="btn-icon">⊕</span>
              Join / Create Room
            </ng-container>
            <ng-container *ngIf="isJoining">
              <span class="spinner"></span>
              Establishing Link...
            </ng-container>
          </span>
        </button>

        <!-- Error -->
        <p *ngIf="serverError" class="error-msg">
          <span class="error-icon">⚠</span> {{ serverError }}
        </p>

        <!-- Status footer -->
        <div class="status-footer">
          <span class="status-dot" [class.connected]="false"></span>
          Awaiting connection
        </div>

      </div>
    </div>

    <div *ngIf="gameStarted" id="game-container"></div>

  `,

  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&family=Rajdhani:wght@400;600;700&display=swap');

    /* ══════════════════════════════════════
       LOBBY BACKGROUND
    ══════════════════════════════════════ */

    :host {
      font-family: 'Rajdhani', sans-serif;
    }

    .lobby {
      position        : fixed;
      inset           : 0;
      display         : flex;
      align-items     : center;
      justify-content : center;
      background      : radial-gradient(ellipse at 25% 75%, #180808 0%, #080812 55%, #080410 100%);
      overflow        : hidden;
      padding         : 20px;
      box-sizing      : border-box;
    }

    /* ── Parallax star layers ── */
    .stars-sm,
    .stars-md,
    .stars-lg {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
    }

    .stars-sm {
      background-image: radial-gradient(rgba(255,160,160,0.85) 1px, transparent 1px),
                        radial-gradient(rgba(160,200,255,0.7) 1px, transparent 1px);
      background-size: 80px 80px, 130px 130px;
      background-position: 0 0, 40px 40px;
      animation: drift1 90s linear infinite;
      opacity: 0.45;
    }

    .stars-md {
      background-image: radial-gradient(rgba(255,100,100,0.6) 1.5px, transparent 1.5px),
                        radial-gradient(rgba(80,130,255,0.5) 1px, transparent 1px);
      background-size: 160px 160px, 220px 220px;
      background-position: 20px 20px, 80px 80px;
      animation: drift2 140s linear infinite;
      opacity: 0.35;
    }

    .stars-lg {
      background-image: radial-gradient(rgba(255,200,200,0.4) 2px, transparent 2px);
      background-size: 300px 300px;
      background-position: 60px 60px;
      animation: drift1 200s linear infinite;
      opacity: 0.2;
    }

    @keyframes drift1 {
      from { background-position: 0 0, 40px 40px; }
      to   { background-position: 0 500px, 40px 540px; }
    }

    @keyframes drift2 {
      from { background-position: 20px 20px, 80px 80px; }
      to   { background-position: 20px 550px, 80px 620px; }
    }

    /* ── Ambient glow orbs ── */
    .orb {
      position: absolute;
      border-radius: 50%;
      z-index: 0;
      pointer-events: none;
      filter: blur(60px);
    }

    .orb-red {
      width: 400px; height: 400px;
      bottom: -120px; left: -80px;
      background: radial-gradient(circle, rgba(200,35,35,0.22) 0%, transparent 70%);
      animation: breathe 8s ease-in-out infinite;
    }

    .orb-blue {
      width: 350px; height: 350px;
      top: -100px; right: -60px;
      background: radial-gradient(circle, rgba(35,80,210,0.18) 0%, transparent 70%);
      animation: breathe 10s ease-in-out infinite reverse;
    }

    .orb-red2 {
      width: 200px; height: 200px;
      top: 40%; right: 10%;
      background: radial-gradient(circle, rgba(180,30,30,0.1) 0%, transparent 70%);
      animation: breathe 6s ease-in-out infinite 2s;
    }

    @keyframes breathe {
      0%, 100% { opacity: 0.6; transform: scale(1); }
      50%       { opacity: 1;   transform: scale(1.15); }
    }

    /* ══════════════════════════════════════
       GLASSMORPHISM CARD
    ══════════════════════════════════════ */

    .lobby-card {
      position          : relative;
      z-index           : 1;
      display           : flex;
      flex-direction    : column;
      align-items       : stretch;
      gap               : 16px;
      width             : 100%;
      max-width         : 370px;
      padding           : 40px 32px;
      border-radius     : 26px;
      background        : linear-gradient(
        140deg,
        rgba(200,35,35,0.07) 0%,
        rgba(12,12,28,0.72) 35%,
        rgba(25,55,180,0.07) 100%
      );
      border            : 1px solid rgba(210,60,60,0.28);
      box-shadow        :
        inset 0 0 0 1px rgba(80,130,255,0.07),
        0 25px 70px rgba(0,0,0,0.65),
        0 0 50px rgba(180,30,30,0.09);
      backdrop-filter   : blur(28px);
      -webkit-backdrop-filter: blur(28px);
      color             : #fff;
      animation         : cardIn 0.55s cubic-bezier(0.22,1,0.36,1) forwards;
      transition        : border-color 0.3s ease, box-shadow 0.3s ease;
    }

    .lobby-card:hover {
      border-color: rgba(210,60,60,0.42);
      box-shadow:
        inset 0 0 0 1px rgba(80,130,255,0.12),
        0 30px 80px rgba(0,0,0,0.7),
        0 0 60px rgba(180,30,30,0.14);
    }

    @keyframes cardIn {
      from { opacity: 0; transform: translateY(22px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Shake animation on error */
    .lobby-card.shake {
      animation: shakeCard 0.45s ease;
    }

    @keyframes shakeCard {
      0%,100% { transform: translateX(0); }
      15%     { transform: translateX(-9px); }
      35%     { transform: translateX(9px); }
      55%     { transform: translateX(-6px); }
      75%     { transform: translateX(6px); }
    }

    /* ── Corner accent lines ── */
    .corner {
      position: absolute;
      width: 18px; height: 18px;
      pointer-events: none;
    }

    .corner-tl { top: 13px; left: 13px; border-top: 1.5px solid rgba(210,60,60,0.5); border-left: 1.5px solid rgba(210,60,60,0.5); border-radius: 5px 0 0 0; }
    .corner-tr { top: 13px; right: 13px; border-top: 1.5px solid rgba(70,120,220,0.45); border-right: 1.5px solid rgba(70,120,220,0.45); border-radius: 0 5px 0 0; }
    .corner-bl { bottom: 13px; left: 13px; border-bottom: 1.5px solid rgba(70,120,220,0.45); border-left: 1.5px solid rgba(70,120,220,0.45); border-radius: 0 0 0 5px; }
    .corner-br { bottom: 13px; right: 13px; border-bottom: 1.5px solid rgba(210,60,60,0.5); border-right: 1.5px solid rgba(210,60,60,0.5); border-radius: 0 0 5px 0; }

    /* ── Logo ── */
    .logo-wrap {
      display: flex;
      justify-content: center;
      margin-bottom: 2px;
    }

    .logo-ring-outer {
      width: 72px; height: 72px;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(200,35,35,0.18), rgba(35,80,210,0.18));
      border: 1.5px solid rgba(200,50,50,0.45);
      box-shadow:
        0 0 24px rgba(190,30,30,0.22),
        0 0 50px rgba(35,80,210,0.12),
        inset 0 0 18px rgba(200,40,40,0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      animation: logoPulse 4s ease-in-out infinite;
    }

    @keyframes logoPulse {
      0%,100% { box-shadow: 0 0 24px rgba(190,30,30,0.22), 0 0 50px rgba(35,80,210,0.12), inset 0 0 18px rgba(200,40,40,0.06); }
      50%     { box-shadow: 0 0 35px rgba(190,30,30,0.38), 0 0 65px rgba(35,80,210,0.2),  inset 0 0 25px rgba(200,40,40,0.1); }
    }

    .logo-ring-outer::after {
      content: '';
      position: absolute; inset: -5px;
      border-radius: 50%;
      border: 1px solid rgba(80,130,255,0.2);
      animation: ringExpand 4s ease-in-out infinite;
    }

    @keyframes ringExpand {
      0%,100% { transform: scale(1); opacity: 0.4; }
      50%     { transform: scale(1.08); opacity: 0.9; }
    }

    .logo-ring-inner {
      font-size: 28px;
      line-height: 1;
    }

    /* ── Typography ── */
    .title {
      font-family : 'Orbitron', sans-serif;
      font-size   : 2rem;
      font-weight : 700;
      text-align  : center;
      letter-spacing: 2px;
      margin      : 0;
      background  : linear-gradient(90deg, #e05555 0%, #c03535 30%, #6a9fff 70%, #4a7fee 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      text-align   : center;
      font-family  : 'Rajdhani', sans-serif;
      font-size    : 0.78rem;
      color        : rgba(185,130,130,0.85);
      text-transform: uppercase;
      letter-spacing: 2.8px;
      font-weight  : 700;
      margin       : -8px 0 0;
    }

    .divider {
      height     : 1px;
      background : linear-gradient(90deg, transparent 0%, rgba(200,55,55,0.35) 25%, rgba(55,100,220,0.35) 75%, transparent 100%);
      margin     : 2px 0;
    }

    /* ── Fields ── */
    .field-group {
      display       : flex;
      flex-direction: column;
      gap           : 7px;
    }

    .field-label {
      display      : flex;
      align-items  : center;
      gap          : 7px;
      font-family  : 'Rajdhani', sans-serif;
      font-size    : 0.74rem;
      color        : rgba(180,148,148,0.9);
      text-transform: uppercase;
      letter-spacing: 1.4px;
      font-weight  : 700;
      margin-left  : 2px;
    }

    .label-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: linear-gradient(135deg, #c03535, #8b1e1e);
      box-shadow: 0 0 5px rgba(190,30,30,0.5);
      flex-shrink: 0;
    }

    .label-dot-blue {
      background: linear-gradient(135deg, #4a7fee, #2a50c0);
      box-shadow: 0 0 5px rgba(60,100,220,0.5);
    }

    .input-wrap {
      position: relative;
    }

    .input-wrap input {
      width            : 100%;
      padding          : 13px 15px;
      background       : rgba(6,6,18,0.65);
      border           : 1px solid rgba(180,45,45,0.32);
      border-radius    : 10px;
      color            : rgba(255,240,240,0.95);
      font-size        : 1.05rem;
      font-family      : 'Rajdhani', sans-serif;
      font-weight      : 600;
      outline          : none;
      box-shadow       : inset 0 2px 8px rgba(0,0,0,0.45);
      transition       : border-color 0.3s, box-shadow 0.3s;
      caret-color      : #e05555;
    }

    .input-wrap input::placeholder {
      color: rgba(130,100,100,0.55);
      font-weight: 400;
    }

    .input-wrap input:focus {
      border-color: rgba(80,130,255,0.5);
      box-shadow: inset 0 2px 8px rgba(0,0,0,0.45), 0 0 18px rgba(55,100,215,0.18);
    }

    .input-wrap input:focus ~ .input-glow-line {
      transform: scaleX(1);
      opacity: 1;
    }

    .input-wrap input:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .input-glow-line {
      position     : absolute;
      bottom       : 0; left: 10px; right: 10px;
      height       : 1.5px;
      background   : linear-gradient(90deg, #c03535, #4a7fee);
      border-radius: 0 0 10px 10px;
      transform    : scaleX(0);
      opacity      : 0;
      transition   : transform 0.4s ease, opacity 0.3s;
      pointer-events: none;
    }

    .glow-blue {
      background: linear-gradient(90deg, #4a7fee, #c03535);
    }

    .char-count {
      position    : absolute;
      right       : 6px;
      bottom      : -17px;
      font-size   : 0.65rem;
      font-family : 'Rajdhani', sans-serif;
      color       : rgba(120,100,100,0.5);
      letter-spacing: 0.5px;
    }

    /* ── Hint ── */
    .hint-box {
      background   : rgba(190,35,35,0.06);
      border       : 1px solid rgba(190,50,50,0.18);
      border-left  : 2px solid rgba(190,50,50,0.45);
      border-radius: 8px;
      padding      : 9px 13px;
      font-family  : 'Rajdhani', sans-serif;
      font-size    : 0.78rem;
      color        : rgba(170,140,140,0.8);
      line-height  : 1.5;
      display      : flex;
      align-items  : center;
      gap          : 8px;
    }

    .hint-icon {
      color: rgba(190,60,60,0.7);
      font-size: 1rem;
      flex-shrink: 0;
    }

    /* ── Join Button ── */
    .join-btn {
      position      : relative;
      overflow      : hidden;
      padding       : 15px 20px;
      border-radius : 12px;
      border        : 1px solid rgba(180,45,45,0.55);
      background    : rgba(10,10,22,0.85);
      color         : #fff;
      font-family   : 'Orbitron', sans-serif;
      font-size     : 0.82rem;
      font-weight   : 700;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      cursor        : pointer;
      transition    : transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
      box-shadow    : 0 4px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04);
      margin-top    : 4px;
    }

    .btn-bg-gradient {
      position: absolute; inset: 0;
      background: linear-gradient(135deg, rgba(180,30,30,0.18) 0%, rgba(30,65,185,0.18) 100%);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .btn-shimmer {
      position: absolute;
      top: 0; left: -120%;
      width: 70%; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.055), transparent);
      pointer-events: none;
    }

    .join-btn:not(:disabled) .btn-shimmer {
      animation: btnShimmer 2.8s ease infinite 1s;
    }

    @keyframes btnShimmer {
      0%   { left: -120%; }
      100% { left: 200%; }
    }

    .btn-content {
      position    : relative;
      z-index     : 2;
      display     : flex;
      align-items : center;
      justify-content: center;
      gap         : 10px;
    }

    .btn-icon {
      font-size: 1.1rem;
      line-height: 1;
    }

    .join-btn:hover:not(:disabled) {
      transform   : translateY(-2px) scale(1.01);
      border-color: rgba(200,55,55,0.75);
      box-shadow  : 0 8px 30px rgba(0,0,0,0.5), 0 0 25px rgba(180,30,30,0.22);
    }

    .join-btn:hover:not(:disabled) .btn-bg-gradient {
      opacity: 1;
    }

    .join-btn:active:not(:disabled) {
      transform: translateY(0) scale(0.99);
    }

    .join-btn:disabled {
      opacity: 0.4;
      cursor : not-allowed;
      filter : grayscale(0.6);
    }

    /* ── Spinner ── */
    .spinner {
      display     : inline-block;
      width       : 15px;
      height      : 15px;
      border      : 2px solid rgba(255,255,255,0.25);
      border-top-color: rgba(255,160,160,0.9);
      border-radius: 50%;
      animation   : spin 0.65s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Error ── */
    .error-msg {
      display     : flex;
      align-items : center;
      gap         : 7px;
      font-family : 'Rajdhani', sans-serif;
      font-size   : 0.88rem;
      font-weight : 600;
      color       : #f06060;
      text-align  : center;
      justify-content: center;
      text-shadow : 0 0 8px rgba(220,50,50,0.4);
      margin      : 0;
    }

    .error-icon {
      font-size: 1rem;
    }

    /* ── Status footer ── */
    .status-footer {
      display     : flex;
      align-items : center;
      justify-content: center;
      gap         : 7px;
      font-family : 'Rajdhani', sans-serif;
      font-size   : 0.7rem;
      color       : rgba(130,110,110,0.55);
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .status-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: #c03535;
      animation: dotBlink 1.8s ease-in-out infinite;
    }

    .status-dot.connected {
      background: #30c060;
      animation: dotBlink 1.8s ease-in-out infinite;
    }

    @keyframes dotBlink {
      0%,100% { opacity: 0.3; }
      50%     { opacity: 1; }
    }

    /* ══════════════════════════════════════
       GAME CONTAINER
    ══════════════════════════════════════ */

    #game-container {
      position   : fixed;
      inset      : 0;
      width      : 100vw;
      height     : 100vh;
      background : radial-gradient(ellipse at 20% 80%, #180808 0%, #080812 55%, #080410 100%);
      overflow   : hidden;
    }

    #game-container canvas {
      border-radius : 18px;
      box-shadow    :
        0 0 60px rgba(0,0,0,0.9),
        0 0 80px rgba(190,30,30,0.12),
        0 0 120px rgba(35,80,210,0.1);
      margin        : auto !important;
      display       : block;
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
    setTimeout(() => (this.shakeError = false), 450);
  }

  async joinRoom() {
    if (!this.canJoin || this.isJoining) {
      if (!this.canJoin) this.triggerShake();
      return;
    }

    this.playerName  = this.playerName.trim();
    this.roomName    = this.roomName.trim();
    this.serverError = '';
    this.isJoining   = true;

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

    const socket     = this.socket;
    const roomName   = this.roomName;
    const playerName = this.playerName;

    let player          : any = null;
    let otherPlayersMap : Record<string, any> = {};
    let walls           : any;
    let cursors         : any;
    let wasd            : any;
    let star            : any;
    let scoreText       : any;

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

          /* ── Walls (Red-Blue Neon Glow) ── */
          walls = scene.physics.add.staticGroup();

          const createWall = (x: number, y: number, w: number, h: number, isBlue: boolean = false) => {
            const key = `neonWall_${w}_${h}_${isBlue ? 'b' : 'r'}`;
            if (!scene.textures.exists(key)) {
              const graphics = scene.make.graphics({ x: 0, y: 0, add: false });

              const outerColor = isBlue ? 0x3060cc : 0xb02020;
              const fillColor  = isBlue ? 0x1a3a99 : 0x7a1515;
              const innerColor = isBlue ? 0x6090ff : 0xe05050;

              graphics.lineStyle(6, outerColor, 0.35);
              graphics.strokeRoundedRect(3, 3, w - 6, h - 6, 10);

              graphics.fillStyle(fillColor, 0.18);
              graphics.fillRoundedRect(3, 3, w - 6, h - 6, 10);

              graphics.lineStyle(1.5, innerColor, 0.8);
              graphics.strokeRoundedRect(6, 6, w - 12, h - 12, 6);

              graphics.generateTexture(key, w, h);
            }
            const wall = scene.add.sprite(x, y, key);
            scene.physics.add.existing(wall, true);
            walls.add(wall);
          };

          /* Outer boundary walls — red tint */
          createWall(400, 50,  700, 20, false);
          createWall(400, 550, 700, 20, false);
          createWall(50,  300, 20, 500, false);
          createWall(750, 300, 20, 500, false);

          /* Interior walls — blue tint */
          createWall(250, 300, 150, 20, true);
          createWall(550, 300, 150, 20, true);

          /* ── Touch Buttons (Glass UI) - ONLY FOR MOBILE ── */
          if (!scene.sys.game.device.os.desktop) {
            const createBtn = (x: number, y: number, text: string) => {
              const container = scene.add.container(x, y).setScrollFactor(0).setDepth(20);

              const bg = scene.add.graphics();
              bg.fillStyle(0x080818, 0.75);
              bg.lineStyle(1.5, 0xb02020, 0.7);
              bg.fillRoundedRect(0, 0, 70, 70, 14);
              bg.strokeRoundedRect(0, 0, 70, 70, 14);

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

          /* ── Scoreboard (Red-Blue Glass Panel) ── */
          const scoreBg = scene.add.graphics();
          /* Outer fill */
          scoreBg.fillStyle(0x080818, 0.78);
          scoreBg.fillRoundedRect(16, 16, 186, 88, 12);
          /* Red accent border */
          scoreBg.lineStyle(1, 0xb02020, 0.55);
          scoreBg.strokeRoundedRect(16, 16, 186, 88, 12);
          /* Blue inner line */
          scoreBg.lineStyle(1, 0x3060cc, 0.3);
          scoreBg.strokeRoundedRect(19, 19, 180, 82, 10);
          scoreBg.setDepth(9).setScrollFactor(0);

          scoreText = scene.add.text(26, 26, 'Connecting...', {
            fontSize   : '14px',
            fontFamily : 'Rajdhani, sans-serif',
            fill       : '#e08080',
            fontStyle  : 'bold',
            lineSpacing: 5
          }).setDepth(10);

          /* Room label */
          const roomBg = scene.add.graphics();
          roomBg.fillStyle(0x080818, 0.7);
          roomBg.fillRoundedRect(14, scene.scale.height - 36, 140, 24, 6);
          roomBg.lineStyle(1, 0x3060cc, 0.4);
          roomBg.strokeRoundedRect(14, scene.scale.height - 36, 140, 24, 6);
          roomBg.setScrollFactor(0).setDepth(9);

          scene.add.text(22, scene.scale.height - 30, `◈ Room: ${roomName}`, {
            fontSize  : '13px',
            fontFamily: 'Rajdhani, sans-serif',
            fill      : '#6090ff',
            fontStyle : 'bold'
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
                const tag = p.playerId === socket.id ? ' (You)' : '';
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

            Object.values(otherPlayersMap).forEach(p => p.destroy());
            otherPlayersMap = {};

            Object.values(players).forEach(pData => {
              if (pData.playerId === socket.id) {
                player = scene.physics.add.sprite(pData.x, pData.y, 'player');
                player.setScale(0.15).setTint(0xe05050).setDepth(5);
                player.playerId = pData.playerId;
                scene.physics.add.collider(player, walls);
                registerStarOverlap(scene);
              } else {
                const other = scene.physics.add.sprite(pData.x, pData.y, 'player');
                other.setScale(0.15).setTint(0x4a7fee).setDepth(5);
                (other as any).playerId = pData.playerId;
                otherPlayersMap[pData.playerId] = other;
              }
            });
            updateScoreBoard(players);
          });

          socket.on('newPlayerInRoom', ({ playerInfo }: { playerInfo: PlayerState }) => {
            const other = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player');
            other.setScale(0.15).setTint(0x4a7fee).setDepth(5);
            (other as any).playerId = playerInfo.playerId;
            otherPlayersMap[playerInfo.playerId] = other;
          });

          socket.on('starLocationInRoom', ({ star: starData }: { star: StarState }) => {
            spawnStar(starData);
          });

          socket.on('scoreUpdateInRoom', ({ players }: { players: Record<string, PlayerState> }) => {
            updateScoreBoard(players);
          });

          socket.on('playerMovedInRoom', ({ playerInfo }: { playerInfo: PlayerState }) => {
            const other = otherPlayersMap[playerInfo.playerId];
            if (other) {
              scene.tweens.killTweensOf(other);
              scene.tweens.add({
                targets  : other,
                x        : playerInfo.x,
                y        : playerInfo.y,
                duration : 25,
                ease     : 'Linear'
              });
            }
          });

          socket.on('playerDisconnectedInRoom', ({ playerId }: { playerId: string }) => {
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

            /* Win/Lose panel background */
            const panelBg = scene.add.graphics();
            panelBg.fillStyle(0x080818, 0.88);
            panelBg.lineStyle(2, isWinner ? 0xc03030 : 0x3060cc, 0.7);
            panelBg.fillRoundedRect(250, 200, 300, 150, 16);
            panelBg.strokeRoundedRect(250, 200, 300, 150, 16);
            panelBg.setDepth(29);

            winText = scene.add.text(400, 255,
              isWinner ? '🏆 YOU WIN!' : '💀 YOU LOSE!',
              {
                fontSize   : '48px',
                fontFamily : 'Orbitron, sans-serif',
                fill       : isWinner ? '#e05050' : '#4a7fee',
                stroke     : '#000',
                strokeThickness: 5,
              }
            ).setOrigin(0.5).setDepth(30);

            subText = scene.add.text(400, 320,
              'Restarting in 5 seconds...',
              {
                fontSize  : '18px',
                fontFamily: 'Rajdhani, sans-serif',
                fill      : '#a08080',
                fontStyle : 'bold'
              }
            ).setOrigin(0.5).setDepth(30);
          });

          socket.on('gameResetInRoom', () => {
            if (winText) { winText.destroy();  winText  = null; }
            if (subText) { subText.destroy();  subText  = null; }
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

          if (goLeft)       player.body.setVelocityX(-200);
          else if (goRight) player.body.setVelocityX(200);

          if (goUp)         player.body.setVelocityY(-200);
          else if (goDown)  player.body.setVelocityY(200);

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
