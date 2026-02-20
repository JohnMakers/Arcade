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
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- CONFIGURATION ---
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 800;
  const INITIAL_PADDLE_WIDTH = 100;
  const MIN_PADDLE_WIDTH = 50;
  const PADDLE_HEIGHT = 20;
  const BALL_RADIUS = 10;
  
  const INITIAL_BALL_SPEED = 6;
  const MAX_BALL_SPEED = 16;
  const SPEED_MULTIPLIER = 1.005; 
  const PADDLE_KEY_SPEED = 400; 

  const BRICK_COLS = 7;
  const BRICK_PADDING = 10;
  const BRICK_OFFSET_TOP = 80;
  const BRICK_OFFSET_LEFT = 15;
  const BRICK_WIDTH = (CANVAS_WIDTH - (BRICK_OFFSET_LEFT * 2) - (BRICK_PADDING * (BRICK_COLS - 1))) / BRICK_COLS;
  const BRICK_HEIGHT = 30;
  const DANGER_ZONE_Y = CANVAS_HEIGHT - 120; 

  const gameState = useRef({
    sprites: {},
    paddle: { x: CANVAS_WIDTH / 2 - INITIAL_PADDLE_WIDTH / 2, y: CANVAS_HEIGHT - 60, w: INITIAL_PADDLE_WIDTH, h: PADDLE_HEIGHT },
    ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 80, vx: 0, vy: 0, speed: INITIAL_BALL_SPEED },
    bricks: [],
    powerups: [],
    score: 0,
    diamondTimer: 0,
    wideTimer: 0,
    lastTime: 0,
    keys: { left: false, right: false },
    
    // Decoupled loop states
    isPlaying: false,
    gameOver: false,
    
    totalBricksBroken: 0,
    bricksSinceSpawn: 0,
    nextSpawnTarget: 5
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
    loadSprite('brick_tough', ASSETS.FUD_BRICK_TOUGH); // <--- NEW ASSET LOADED
    loadSprite('power_wide', ASSETS.FUD_POWER_WIDE);
    loadSprite('power_diamond', ASSETS.FUD_POWER_DIAMOND);
  }, []);

  // Sync React State to Game State ref to prevent loop re-renders
  useEffect(() => {
    gameState.current.isPlaying = isPlaying;
    gameState.current.gameOver = gameOver;
  }, [isPlaying, gameOver]);

  // Input Handling
  useEffect(() => {
    const handleMove = (e) => {
      if (!isPlaying || gameOver) return;
      
      let clientX;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
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
        
        if (paddle.x < 0) paddle.x = 0;
        if (paddle.x + paddle.w > CANVAS_WIDTH) paddle.x = CANVAS_WIDTH - paddle.w;
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') gameState.current.keys.left = true;
      if (e.key === 'ArrowRight') gameState.current.keys.right = true;
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.code === 'Space') && !isPlaying && !gameOver) {
          setIsPlaying(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'ArrowLeft') gameState.current.keys.left = false;
      if (e.key === 'ArrowRight') gameState.current.keys.right = false;
    };

    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('mousemove', handleMove);
      wrapper.addEventListener('touchmove', handleMove, { passive: false });
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      if (wrapper) {
        wrapper.removeEventListener('mousemove', handleMove);
        wrapper.removeEventListener('touchmove', handleMove);
      }
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPlaying, gameOver]);

  // Core Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const triggerGameOver = async () => {
      const finalScore = gameState.current.score;
      gameState.current.gameOver = true;
      gameState.current.isPlaying = false;
      setGameOver(true);
      setIsPlaying(false);
      
      if (username) {
        await supabase.from('leaderboards').insert([{
            game_id: 'fudbreaker', 
            username, 
            score: finalScore, 
            address: address
        }]);
      }
    };

    const spawnBrickRow = () => {
      const state = gameState.current;
      state.bricks = state.bricks.filter(b => b.status === 1);

      state.bricks.forEach(b => { b.y += BRICK_HEIGHT + BRICK_PADDING; });

      const lowestBrick = Math.max(...state.bricks.map(b => b.y + b.h), 0);
      if (lowestBrick >= DANGER_ZONE_Y) {
          triggerGameOver();
          return;
      }

      for (let c = 0; c < BRICK_COLS; c++) {
        const isTough = Math.random() < 0.2;
        state.bricks.push({
          x: BRICK_OFFSET_LEFT + c * (BRICK_WIDTH + BRICK_PADDING),
          y: BRICK_OFFSET_TOP,
          w: BRICK_WIDTH,
          h: BRICK_HEIGHT,
          status: 1,
          hp: isTough ? 2 : 1,
          maxHp: isTough ? 2 : 1
        });
      }
    };

    // --- INITIALIZE RESET ---
    const state = gameState.current;
    state.score = 0;
    state.totalBricksBroken = 0;
    state.bricksSinceSpawn = 0;
    state.nextSpawnTarget = 5;
    state.bricks = [];
    state.powerups = [];
    state.diamondTimer = 0;
    state.wideTimer = 0;
    state.paddle.w = INITIAL_PADDLE_WIDTH;
    state.paddle.x = CANVAS_WIDTH / 2 - state.paddle.w / 2;
    state.ball.x = CANVAS_WIDTH / 2;
    state.ball.y = state.paddle.y - BALL_RADIUS - 5;
    state.ball.speed = INITIAL_BALL_SPEED;
    
    state.ball.vx = (Math.random() > 0.5 ? 1 : -1) * 2;
    state.ball.vy = state.ball.speed;
    
    setScore(0);
    for(let i=0; i<5; i++) { spawnBrickRow(); }

    state.lastTime = performance.now();
    let animationId;

    const loop = (time) => {
      const dt = Math.min((time - state.lastTime) / 1000, 0.03); 
      const dtFrames = dt * 60; 
      state.lastTime = time;

      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (state.sprites['bg']) {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(state.sprites['bg'], 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.globalAlpha = 1.0;
      }

      ctx.beginPath();
      ctx.moveTo(0, DANGER_ZONE_Y);
      ctx.lineTo(CANVAS_WIDTH, DANGER_ZONE_Y);
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (state.isPlaying && !state.gameOver) {
        if (state.diamondTimer > 0) state.diamondTimer -= dtFrames;
        
        if (state.wideTimer > 0) {
          state.wideTimer -= dtFrames;
          state.paddle.w = INITIAL_PADDLE_WIDTH * 1.5; 
        } else {
          const shrink = Math.floor(state.totalBricksBroken / 10);
          state.paddle.w = Math.max(MIN_PADDLE_WIDTH, INITIAL_PADDLE_WIDTH - shrink);
        }

        if (state.keys.left) state.paddle.x -= PADDLE_KEY_SPEED * dt;
        if (state.keys.right) state.paddle.x += PADDLE_KEY_SPEED * dt;
        
        if (state.paddle.x < 0) state.paddle.x = 0;
        if (state.paddle.x + state.paddle.w > CANVAS_WIDTH) state.paddle.x = CANVAS_WIDTH - state.paddle.w;

        state.ball.x += state.ball.vx * dtFrames;
        state.ball.y += state.ball.vy * dtFrames;

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

        if (
          state.ball.vy > 0 &&
          state.ball.y + BALL_RADIUS >= state.paddle.y &&
          state.ball.y - BALL_RADIUS <= state.paddle.y + state.paddle.h &&
          state.ball.x >= state.paddle.x &&
          state.ball.x <= state.paddle.x + state.paddle.w
        ) {
          state.ball.speed = Math.min(state.ball.speed * SPEED_MULTIPLIER, MAX_BALL_SPEED);
          
          let hitPoint = state.ball.x - (state.paddle.x + state.paddle.w / 2);
          let normalizedHit = hitPoint / (state.paddle.w / 2); 
          let angle = normalizedHit * (Math.PI / 3); 
          
          state.ball.vx = state.ball.speed * Math.sin(angle);
          state.ball.vy = -state.ball.speed * Math.cos(angle);
          state.ball.y = state.paddle.y - BALL_RADIUS; 
        }

        let hitBrickThisFrame = false;
        let primaryHitBrick = null;
        
        for (let i = 0; i < state.bricks.length; i++) {
          let b = state.bricks[i];
          if (b.status === 1) {
            let closestX = Math.max(b.x, Math.min(state.ball.x, b.x + b.w));
            let closestY = Math.max(b.y, Math.min(state.ball.y, b.y + b.h));
            let distanceX = state.ball.x - closestX;
            let distanceY = state.ball.y - closestY;

            if ((distanceX * distanceX + distanceY * distanceY) < (BALL_RADIUS * BALL_RADIUS)) {
              b.hp -= 1;
              
              if (b.hp <= 0) {
                  b.status = 0;
                  state.score += 10;
                  state.totalBricksBroken++;
                  state.bricksSinceSpawn++;

                  if (Math.random() < 0.05) {
                    state.powerups.push({
                      x: b.x + b.w / 2,
                      y: b.y,
                      type: Math.random() > 0.5 ? 'WIDE' : 'DIAMOND',
                      vy: 3,
                      w: 30, h: 30
                    });
                  }
              } else {
                  state.score += 5; 
              }
              
              setScore(state.score);

              if (Math.abs(distanceX) > Math.abs(distanceY)) {
                  state.ball.vx = -state.ball.vx;
              } else {
                  state.ball.vy = -state.ball.vy;
              }
              
              hitBrickThisFrame = true;
              primaryHitBrick = b;
              break; 
            }
          }
        }

        if (hitBrickThisFrame && state.diamondTimer > 0) {
            const blastRadius = BRICK_WIDTH * 1.5;
            state.bricks.forEach(otherB => {
                if (otherB.status === 1 && otherB !== primaryHitBrick) {
                    let dx = (primaryHitBrick.x + primaryHitBrick.w/2) - (otherB.x + otherB.w/2);
                    let dy = (primaryHitBrick.y + primaryHitBrick.h/2) - (otherB.y + otherB.h/2);
                    let dist = Math.sqrt(dx*dx + dy*dy);
                    
                    if (dist <= blastRadius) {
                        otherB.hp -= 1;
                        if (otherB.hp <= 0) {
                            otherB.status = 0;
                            state.score += 10;
                            state.totalBricksBroken++;
                            state.bricksSinceSpawn++;
                        } else {
                            state.score += 5;
                        }
                    }
                }
            });
            setScore(state.score);
        }

        let activeBricksCount = state.bricks.filter(b => b.status === 1).length;
        if (state.bricksSinceSpawn >= state.nextSpawnTarget || activeBricksCount < 12) {
            spawnBrickRow();
            state.bricksSinceSpawn = 0;
            state.nextSpawnTarget = Math.floor(Math.random() * 5) + 4;
        }

        state.powerups.forEach(p => {
            p.y += p.vy * dtFrames;
            if (
                p.y + p.h >= state.paddle.y && p.y <= state.paddle.y + state.paddle.h &&
                p.x + p.w >= state.paddle.x && p.x <= state.paddle.x + state.paddle.w
            ) {
                p.markedForDeletion = true;
                if (p.type === 'WIDE') state.wideTimer = 600; 
                if (p.type === 'DIAMOND') state.diamondTimer = 300; 
                state.score += 50; 
                setScore(state.score);
            }
        });
        state.powerups = state.powerups.filter(p => !p.markedForDeletion && p.y < CANVAS_HEIGHT);
      }

      // --- RENDER ---
      ctx.save();

      state.bricks.forEach(b => {
        if (b.status === 1) {
          ctx.save();
          
          if (b.hp < b.maxHp) {
              ctx.globalAlpha = 0.5;
          }
          
          // --- NEW: Select correct sprite based on Max HP ---
          const spriteKey = b.maxHp === 2 ? 'brick_tough' : 'brick';
          
          if (state.sprites[spriteKey]) {
             ctx.drawImage(state.sprites[spriteKey], b.x, b.y, b.w, b.h);
          } else {
             ctx.fillStyle = b.maxHp === 2 ? '#aa0000' : '#ff0000';
             ctx.fillRect(b.x, b.y, b.w, b.h);
             ctx.strokeStyle = '#fff';
             ctx.strokeRect(b.x, b.y, b.w, b.h);
          }
          ctx.restore();
        }
      });

      state.powerups.forEach(p => {
         const spriteKey = p.type === 'WIDE' ? 'power_wide' : 'power_diamond';
         if (state.sprites[spriteKey]) {
             ctx.drawImage(state.sprites[spriteKey], p.x, p.y, p.w, p.h);
         } else {
             ctx.fillStyle = p.type === 'WIDE' ? 'lime' : 'cyan';
             ctx.fillRect(p.x, p.y, p.w, p.h);
         }
      });

      if (state.sprites['paddle']) {
        ctx.drawImage(state.sprites['paddle'], state.paddle.x, state.paddle.y, state.paddle.w, state.paddle.h);
      } else {
        ctx.fillStyle = state.wideTimer > 0 ? '#00ff00' : '#00aa00';
        ctx.fillRect(state.paddle.x, state.paddle.y, state.paddle.w, state.paddle.h);
      }

      ctx.beginPath();
      ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
      if (state.sprites['ball']) {
         ctx.drawImage(state.sprites['ball'], state.ball.x - BALL_RADIUS, state.ball.y - BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);
      } else {
         ctx.fillStyle = state.diamondTimer > 0 ? 'cyan' : '#f2a900'; 
         ctx.fill();
         ctx.closePath();
      }
      
      ctx.fillStyle = 'lime';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      
      if (state.diamondTimer > 0) ctx.fillText(`💎 DIAMOND HANDS`, 10, 30);
      if (state.wideTimer > 0) ctx.fillText(`🐸 WIDE PEPE`, 10, 50);

      ctx.restore();
      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]); 

  return (
    <div ref={containerRef} className="game-wrapper" style={{ position: 'relative', outline: 'none' }} tabIndex="0">
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
                <h2 className="meme-text">TAP OR SPACE</h2>
                <p>Destroy the FUD!</p>
            </div>
        )}
    </div>
  );
};

export default FudBreaker;