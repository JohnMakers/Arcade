import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const FlappyDoge = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username } = useContext(UserContext);

  // --- REACT STATE (For UI Only) ---
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false); // UI State
  const [resetKey, setResetKey] = useState(0);

  // --- ENGINE STATE (Mutable Ref - No Stale Closures) ---
  const engine = useRef({
    running: false, // The "Real" isPlaying for the loop
    bird: { x: 50, y: 300, vy: 0, w: 40, h: 40 },
    pipes: [],
    sprites: {},
    frame: 0,
    score: 0,
    speed: 3.5,
    isDead: false
  });

  // --- 1. ASSET LOADER ---
  useEffect(() => {
    const load = (k, src) => {
        const img = new Image();
        img.src = src;
        img.crossOrigin = "Anonymous";
        img.onload = () => engine.current.sprites[k] = img;
    };
    load('doge', ASSETS.DOGE_HERO);
    load('pipe', ASSETS.RED_CANDLE);
  }, []);

  // --- 2. INPUT HANDLER (Global & Robust) ---
  useEffect(() => {
    const handleInput = (e) => {
      // Filter keys (Space, ArrowUp, or Click/Tap)
      if (e.type === 'keydown' && e.code !== 'Space' && e.code !== 'ArrowUp') return;
      
      const state = engine.current;

      // Prevent default scrolling for Space/Arrows
      if (e.type === 'keydown') e.preventDefault();

      // JUMP LOGIC
      if (state.running && !state.isDead && !gameOver) {
        state.bird.vy = -8; // Instant upward velocity
      }
    };

    window.addEventListener('keydown', handleInput);
    window.addEventListener('mousedown', handleInput);
    window.addEventListener('touchstart', handleInput, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleInput);
      window.removeEventListener('mousedown', handleInput);
      window.removeEventListener('touchstart', handleInput);
    };
  }, [gameOver]); // Only re-bind if game over state changes

  // --- 3. GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    // Reset Engine State
    engine.current.running = false; // Wait for countdown
    engine.current.isDead = false;
    engine.current.score = 0;
    engine.current.speed = 3.5;
    engine.current.bird = { x: 50, y: 300, vy: 0, w: 40, h: 40 };
    engine.current.pipes = [];
    engine.current.frame = 0;

    // Physics Constants
    const GRAVITY = 0.5;
    const MAX_SPEED = 7.0;

    const loop = () => {
      const state = engine.current;

      // A. DRAW BACKGROUND
      // Transition from Office (Grey) to Moon (Dark Blue) based on score
      const bgLevel = Math.min(1, state.score / 50);
      const r = Math.floor(240 * (1 - bgLevel)); // 240 -> 0
      const g = Math.floor(240 * (1 - bgLevel)); // 240 -> 0
      const b = Math.floor(240 - (180 * bgLevel)); // 240 -> 60
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // B. PHYSICS (Only if running and alive)
      if (state.running && !state.isDead) {
        // 1. Update Speed (Smooth Scaling)
        if (state.score > 0 && state.score % 5 === 0) {
           // Small speed bump every 5 points, maxing at 7.0
           const targetSpeed = 3.5 + (state.score * 0.1); 
           state.speed = Math.min(MAX_SPEED, targetSpeed);
        }

        // 2. Bird Physics
        state.bird.vy += GRAVITY;
        state.bird.y += state.bird.vy;

        // 3. Pipe Spawning
        // Spawn distance gets smaller as speed gets faster to keep rhythm
        const spawnRate = Math.floor(180 / (state.speed / 3)); 
        if (state.frame % spawnRate === 0) {
            const gap = 150; // Constant gap for fairness
            const minPipe = 50;
            const maxPipe = canvas.height - gap - minPipe;
            const topH = Math.random() * (maxPipe - minPipe) + minPipe;
            state.pipes.push({ x: canvas.width, topH, gap, passed: false });
        }

        // 4. Pipe Logic
        state.pipes.forEach(p => {
            p.x -= state.speed;

            // Collision (Forgiving Hitbox: smaller than sprite)
            const birdHitbox = {
                x: state.bird.x + 5, 
                y: state.bird.y + 5, 
                w: state.bird.w - 10, 
                h: state.bird.h - 10 
            };

            const hitTop = birdHitbox.y < p.topH;
            const hitBot = birdHitbox.y + birdHitbox.h > p.topH + p.gap;
            const hitPipeX = birdHitbox.x + birdHitbox.w > p.x && birdHitbox.x < p.x + 50;

            if (hitPipeX && (hitTop || hitBot)) {
                handleDeath();
            }

            // Score Logic
            if (!p.passed && p.x + 50 < state.bird.x) {
                p.passed = true;
                state.score += 1;
                setScore(state.score); // Sync to UI
            }
        });

        // 5. Floor/Ceiling Logic
        if (state.bird.y > canvas.height - state.bird.h || state.bird.y < -50) {
            handleDeath();
        }

        // Cleanup
        state.pipes = state.pipes.filter(p => p.x + 50 > 0);
        state.frame++;
      }

      // C. DRAW SPRITES
      // Pipes
      state.pipes.forEach(p => {
          // Top Candle (Flip logic handled by drawing negative height or separate sprite)
          // Ideally flip context, but for simple rects/images:
          drawSprite(ctx, state.sprites.pipe, p.x, 0, 50, p.topH, 'red');
          drawSprite(ctx, state.sprites.pipe, p.x, p.topH + p.gap, 50, canvas.height, 'green'); 
      });

      // Bird
      drawSprite(ctx, state.sprites.doge, state.bird.x, state.bird.y, state.bird.w, state.bird.h, 'orange');

      animationId = requestAnimationFrame(loop);
    };

    const drawSprite = (ctx, img, x, y, w, h, fallbackColor) => {
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, x, y, w, h);
        } else {
            ctx.fillStyle = fallbackColor;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = "white";
            ctx.strokeRect(x, y, w, h);
        }
    };

    const handleDeath = () => {
        engine.current.isDead = true;
        engine.current.running = false; // Stop physics immediately
        setGameOver(true);
        if (username) {
            supabase.from('leaderboards').insert([{
                game_id: 'flappy',
                username,
                score: engine.current.score
            }]).then();
        }
    };

    loop();
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]); // Only rebuilds when Reset Key changes

  // --- 4. COUNTDOWN SYNC ---
  useEffect(() => {
    if (!gameOver) {
      // UI Countdown is 3 seconds
      const t = setTimeout(() => {
        setIsPlaying(true);
        engine.current.running = true; // UNLOCK PHYSICS HERE
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [resetKey, gameOver]);

  // --- 5. RESTART HANDLER ---
  const handleRestart = () => {
    setScore(0);
    setGameOver(false);
    setIsPlaying(false);
    setResetKey(prev => prev + 1); // Triggers full re-mount of game loop
  };

  return (
    <div className="game-wrapper">
      <GameUI 
        score={score} 
        gameOver={gameOver} 
        isPlaying={isPlaying} 
        onRestart={handleRestart} 
        onExit={onExit} 
        gameId="flappy" 
      />
      <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default FlappyDoge;