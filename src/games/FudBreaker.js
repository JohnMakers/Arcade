import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const FudBreaker = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- CONFIGURATION ---
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 800;
  const INITIAL_PADDLE_WIDTH = 100;
  const PADDLE_HEIGHT = 20;
  const BALL_RADIUS = 10;
  const INITIAL_BALL_SPEED = 6;
  const SPEED_MULTIPLIER = 1.02; // +2% per hit

  const gameState = useRef({
    sprites: {},
    paddle: { x: CANVAS_WIDTH / 2 - INITIAL_PADDLE_WIDTH / 2, y: CANVAS_HEIGHT - 60, w: INITIAL_PADDLE_WIDTH, h: PADDLE_HEIGHT },
    ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 80, vx: 0, vy: 0, speed: INITIAL_BALL_SPEED },
    bricks: [],
    powerups: [],
    particles: [],
    score: 0,
    level: 1,
    diamondTimer: 0,
    wideTimer: 0,
    lastTime: 0
  });

  // Load Assets
  useEffect(() => {
    const loadSprite = (key, src) => {
      const img = new Image();
      img.src = src;
      img.crossOrigin = "Anonymous";
      img.onload = () => { gameState.current.sprites[key] = img; };
    };

    loadSprite('bg', ASSETS.FUD_BG);
    loadSprite('paddle', ASSETS.FUD_PADDLE);
    loadSprite('ball', ASSETS.FUD_BALL);
    loadSprite('brick', ASSETS.FUD_BRICK);
    loadSprite('power_wide', ASSETS.FUD_POWER_WIDE);
    loadSprite('power_diamond', ASSETS.FUD_POWER_DIAMOND);
  }, []);

  // Input Handling (Mouse & Touch)
  useEffect(() => {
    const handleMove = (e) => {
      if (!isPlaying || gameOver) return;
      
      let clientX;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        // Prevent scrolling while swiping paddle
        if (e.cancelable) e.preventDefault(); 
      } else {
        clientX = e.clientX;
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        let mouseX = (clientX - rect.left) * scaleX;
        
        const paddle = gameState.current.paddle;
        paddle.x = mouseX - paddle.w / 2;
        
        // Clamp to screen
        if (paddle.x < 0) paddle.x = 0;
        if (paddle.x + paddle.w > CANVAS_WIDTH) paddle.x = CANVAS_WIDTH - paddle.w;
      }
    };

    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('mousemove', handleMove);
      wrapper.addEventListener('touchmove', handleMove, { passive: false });
    }

    return () => {
      if (wrapper) {
        wrapper.removeEventListener('mousemove', handleMove);
        wrapper.removeEventListener('touchmove', handleMove);
      }
    };
  }, [isPlaying, gameOver]);

  // Core Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const generateBricks = (currentLevel) => {
      const bricks = [];
      const rows = Math.min(4 + Math.floor(currentLevel / 2), 10);
      const cols = 7;
      const padding = 10;
      const offsetTop = 80;
      const offsetLeft = 15;
      const width = (CANVAS_WIDTH - (offsetLeft * 2) - (padding * (cols - 1))) / cols;
      const height = 30;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          bricks.push({
            x: offsetLeft + c * (width + padding),
            y: offsetTop + r * (height + padding),
            w: width,
            h: height,
            status: 1
          });
        }
      }
      return bricks;
    };

    const resetLevel = (lvl) => {
      const state = gameState.current;
      state.level = lvl;
      setLevel(lvl);
      
      // Calculate Paddle Shrink (Shrinks by 5px every 5 levels, min 50px)
      const shrinkAmount = Math.floor(lvl / 5) * 5;
      let newPaddleWidth = INITIAL_PADDLE_WIDTH - shrinkAmount;
      if (newPaddleWidth < 50) newPaddleWidth = 50;
      
      state.paddle.w = newPaddleWidth;
      state.paddle.x = CANVAS_WIDTH / 2 - state.paddle.w / 2;
      
      // Reset Ball
      state.ball.x = CANVAS_WIDTH / 2;
      state.ball.y = state.paddle.y - BALL_RADIUS - 5;
      state.ball.speed = INITIAL_BALL_SPEED + (lvl * 0.5); // Slight base speed increase per level
      
      // Drop straight down to start
      state.ball.vx = (Math.random() > 0.5 ? 1 : -1) * 2;
      state.ball.vy = state.ball.speed;
      
      state.bricks = generateBricks(lvl);
      state.powerups = [];
      state.diamondTimer = 0;
      state.wideTimer = 0;
    };

    const triggerGameOver = async () => {
      setGameOver(true);
      setIsPlaying(false);
      
      if (username) {
        await supabase.from('leaderboards').insert([{
            game_id: 'fudbreaker', 
            username, 
            score: gameState.current.score, 
            address: address
        }]);
      }
    };

    // --- INITIALIZE RESET ---
    gameState.current.score = 0;
    setScore(0);
    resetLevel(1);
    gameState.current.lastTime = performance.now();

    let animationId;

    const loop = (time) => {
      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // Clear Screen
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (state.sprites['bg']) {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(state.sprites['bg'], 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.globalAlpha = 1.0;
      }

      if (isPlaying && !gameOver) {
        // --- TIMERS ---
        if (state.diamondTimer > 0) state.diamondTimer -= dt;
        if (state.wideTimer > 0) {
          state.wideTimer -= dt;
          state.paddle.w = INITIAL_PADDLE_WIDTH * 1.5; // WIDE PEPE
        } else {
          // Revert to normal calculated width based on level
          state.paddle.w = Math.max(50, INITIAL_PADDLE_WIDTH - (Math.floor(state.level / 5) * 5));
        }

        // --- BALL PHYSICS ---
        state.ball.x += state.ball.vx * dt;
        state.ball.y += state.ball.vy * dt;

        // Wall collisions
        if (state.ball.x + BALL_RADIUS > CANVAS_WIDTH) {
          state.ball.x = CANVAS_WIDTH - BALL_RADIUS;
          state.ball.vx = -state.ball.vx;
        } else if (state.ball.x - BALL_RADIUS < 0) {
          state.ball.x = BALL_RADIUS;
          state.ball.vx = -state.ball.vx;
        }
        if (state.ball.y - BALL_RADIUS < 0) {
          state.ball.y = BALL_RADIUS;
          state.ball.vy = -state.ball.vy;
        } else if (state.ball.y + BALL_RADIUS > CANVAS_HEIGHT) {
          triggerGameOver();
        }

        // Paddle Collision ("The Always Possible Rule")
        if (
          state.ball.vy > 0 &&
          state.ball.y + BALL_RADIUS >= state.paddle.y &&
          state.ball.y - BALL_RADIUS <= state.paddle.y + state.paddle.h &&
          state.ball.x >= state.paddle.x &&
          state.ball.x <= state.paddle.x + state.paddle.w
        ) {
          // Increase velocity by 2%
          state.ball.speed *= SPEED_MULTIPLIER;
          
          // Calculate bounce angle based on hit location
          let hitPoint = state.ball.x - (state.paddle.x + state.paddle.w / 2);
          let normalizedHit = hitPoint / (state.paddle.w / 2); // -1 (left) to 1 (right)
          let angle = normalizedHit * (Math.PI / 3); // Max 60 degree bounce
          
          state.ball.vx = state.ball.speed * Math.sin(angle);
          state.ball.vy = -state.ball.speed * Math.cos(angle);
          
          state.ball.y = state.paddle.y - BALL_RADIUS; // Snap out of paddle
        }

        // Brick Collision
        let bricksDestroyedThisFrame = false;
        for (let i = 0; i < state.bricks.length; i++) {
          let b = state.bricks[i];
          if (b.status === 1) {
            // Simple AABB vs Circle
            let closestX = Math.max(b.x, Math.min(state.ball.x, b.x + b.w));
            let closestY = Math.max(b.y, Math.min(state.ball.y, b.y + b.h));
            let distanceX = state.ball.x - closestX;
            let distanceY = state.ball.y - closestY;

            if ((distanceX * distanceX + distanceY * distanceY) < (BALL_RADIUS * BALL_RADIUS)) {
              b.status = 0;
              state.score += 10;
              setScore(state.score);
              bricksDestroyedThisFrame = true;

              // Diamond Hands logic: Don't bounce if active
              if (state.diamondTimer <= 0) {
                 // Determine bounce direction
                 if (Math.abs(distanceX) > Math.abs(distanceY)) {
                     state.ball.vx = -state.ball.vx;
                 } else {
                     state.ball.vy = -state.ball.vy;
                 }
              }

              // Powerup Drop Chance (10%)
              if (Math.random() < 0.10) {
                state.powerups.push({
                  x: b.x + b.w / 2,
                  y: b.y,
                  type: Math.random() > 0.5 ? 'WIDE' : 'DIAMOND',
                  vy: 3,
                  w: 30, h: 30
                });
              }
            }
          }
        }

        // Powerup Physics & Collision
        state.powerups.forEach(p => {
            p.y += p.vy * dt;
            if (
                p.y + p.h >= state.paddle.y && p.y <= state.paddle.y + state.paddle.h &&
                p.x + p.w >= state.paddle.x && p.x <= state.paddle.x + state.paddle.w
            ) {
                p.markedForDeletion = true;
                if (p.type === 'WIDE') state.wideTimer = 600; // ~10 seconds at 60fps
                if (p.type === 'DIAMOND') state.diamondTimer = 300; // ~5 seconds
                state.score += 50; 
                setScore(state.score);
            }
        });
        state.powerups = state.powerups.filter(p => !p.markedForDeletion && p.y < CANVAS_HEIGHT);

        // Check Level Clear
        if (state.bricks.every(b => b.status === 0)) {
          resetLevel(state.level + 1);
        }
      }

      // --- RENDER ---
      ctx.save();

      // Draw Bricks
      state.bricks.forEach(b => {
        if (b.status === 1) {
          if (state.sprites['brick']) {
             ctx.drawImage(state.sprites['brick'], b.x, b.y, b.w, b.h);
          } else {
             ctx.fillStyle = '#ff0000';
             ctx.fillRect(b.x, b.y, b.w, b.h);
             ctx.strokeStyle = '#fff';
             ctx.strokeRect(b.x, b.y, b.w, b.h);
          }
        }
      });

      // Draw Powerups
      state.powerups.forEach(p => {
         const spriteKey = p.type === 'WIDE' ? 'power_wide' : 'power_diamond';
         if (state.sprites[spriteKey]) {
             ctx.drawImage(state.sprites[spriteKey], p.x, p.y, p.w, p.h);
         } else {
             ctx.fillStyle = p.type === 'WIDE' ? 'lime' : 'cyan';
             ctx.fillRect(p.x, p.y, p.w, p.h);
         }
      });

      // Draw Paddle
      if (state.sprites['paddle']) {
        ctx.drawImage(state.sprites['paddle'], state.paddle.x, state.paddle.y, state.paddle.w, state.paddle.h);
      } else {
        ctx.fillStyle = state.wideTimer > 0 ? '#00ff00' : '#00aa00';
        ctx.fillRect(state.paddle.x, state.paddle.y, state.paddle.w, state.paddle.h);
      }

      // Draw Ball
      ctx.beginPath();
      ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
      if (state.sprites['ball']) {
         // Custom offset to center image on the ball coordinates
         ctx.drawImage(state.sprites['ball'], state.ball.x - BALL_RADIUS, state.ball.y - BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);
      } else {
         ctx.fillStyle = state.diamondTimer > 0 ? 'cyan' : '#f2a900'; // Bitcoin orange or Diamond Cyan
         ctx.fill();
         ctx.closePath();
      }
      
      // HUD
      ctx.fillStyle = 'lime';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`LVL: ${state.level}`, 10, 30);
      
      if (state.diamondTimer > 0) ctx.fillText(`💎 DIAMOND HANDS`, 10, 60);
      if (state.wideTimer > 0) ctx.fillText(`🐸 WIDE PEPE`, 10, 80);

      ctx.restore();
      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [resetKey, isPlaying]);

  return (
    <div ref={containerRef} className="game-wrapper" style={{ position: 'relative', outline: 'none' }}>
        <GameUI 
            score={score} 
            gameOver={gameOver} 
            isPlaying={isPlaying} 
            onRestart={() => { 
                setGameOver(false); 
                setIsPlaying(true); 
                setResetKey(prev => prev + 1); 
            }} 
            onExit={onExit} 
            gameId="fudbreaker" 
        />
        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT} 
            style={{ width: '100%', maxWidth: '500px', height: 'auto', display: 'block', cursor: 'none' }} 
        />
        {!isPlaying && !gameOver && (
            <div 
               style={{ position: 'absolute', top: '40%', width: '100%', textAlign: 'center', color: 'lime', textShadow: '2px 2px #000', cursor: 'pointer' }}
               onClick={() => setIsPlaying(true)}
            >
                <h2 className="meme-text">TAP TO START</h2>
                <p>Destroy the FUD!</p>
            </div>
        )}
    </div>
  );
};

export default FudBreaker;