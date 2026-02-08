import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const FlappyDoge = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- SENIOR DEV TUNING ---
  // Toggle this to see the bounding boxes vs images
  const DEBUG_MODE = true;    

  // 1. Character Size
  // Reduced from 60 to 45 for better precision/scale relative to canvas
  const CHARACTER_SIZE = 45;
  
  // 2. Pipe Dimensions
  // Previous 120 was way too wide (30% of screen). 
  // 52 is standard for "Mario/Flappy" style on this resolution.
  const PIPE_HITBOX_WIDTH = 52; 
  
  // 3. Visual Width
  // We make the image slightly wider (60px) than the hitbox (52px).
  // This creates a forgiving "grace area" of 4px on each side where 
  // the art overlaps but doesn't kill you.
  const PIPE_IMAGE_WIDTH = 60; 
  
  // Offset centers the image over the hitbox
  const PIPE_IMAGE_OFFSET = (PIPE_IMAGE_WIDTH - PIPE_HITBOX_WIDTH) / 2;

  // 4. Gap
  // Since pipes are thinner, we tighten the gap slightly (240 -> 170)
  // to maintain challenge.
  const PIPE_GAP = 170; 

  // 5. Hitbox Padding
  // Tighter core for the bird. 
  // With a 45px bird, a 10px padding creates a 25px "heart" hitbox.
  const BIRD_HITBOX_PADDING = 10; 

  const engine = useRef({
    running: false,
    bird: { x: 50, y: 300, vy: 0, w: CHARACTER_SIZE, h: CHARACTER_SIZE },
    pipes: [],
    sprites: {},
    frame: 0,
    score: 0,
    speed: 3.5,
    isDead: false,
    lastTime: 0
  });

  useEffect(() => {
    const load = (k, src) => {
        const img = new Image();
        img.onload = () => engine.current.sprites[k] = img;
        img.src = src;
    };
    load('doge', ASSETS.DOGE_HERO);
    load('pipe', ASSETS.RED_CANDLE);
  }, []);

  useEffect(() => {
    const handleInput = (e) => {
      // Prevent scrolling on spacebar
      if (e.target.closest('button') || e.target.closest('.interactive')) return;
      if (e.type === 'keydown' && (e.code === 'Space' || e.code === 'ArrowUp')) {
          e.preventDefault();
      } else if (e.type === 'keydown') {
          return;
      }

      const state = engine.current;
      if (state.running && !state.isDead && !gameOver) {
        // Jump force
        state.bird.vy = -8; 
      }
    };

    const wrapper = containerRef.current;
    window.addEventListener('keydown', handleInput);
    if(wrapper) {
        wrapper.addEventListener('mousedown', handleInput);
        wrapper.addEventListener('touchstart', handleInput, { passive: false });
    }
    return () => {
      window.removeEventListener('keydown', handleInput);
      if(wrapper) {
          wrapper.removeEventListener('mousedown', handleInput);
          wrapper.removeEventListener('touchstart', handleInput);
      }
    };
  }, [gameOver]); 

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    // Reset Engine State
    engine.current.running = false; 
    engine.current.isDead = false;
    engine.current.score = 0;
    engine.current.speed = 3.5;
    engine.current.bird = { x: 50, y: 300, vy: 0, w: CHARACTER_SIZE, h: CHARACTER_SIZE };
    engine.current.pipes = [];
    engine.current.frame = 0;
    engine.current.lastTime = performance.now();

    const GRAVITY = 0.5;
    const MAX_SPEED = 7.0;

    const loop = (time) => {
      const state = engine.current;
      // Delta time limiter to prevent huge jumps on lag
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // Draw Background (Dynamic Sky Color)
      const bgLevel = Math.min(1, state.score / 50);
      const r = Math.floor(135 * (1 - bgLevel)); // Start Sky Blue (approx)
      const g = Math.floor(206 * (1 - bgLevel)); 
      const b = Math.floor(235 - (100 * bgLevel)); 
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (state.running && !state.isDead) {
        // Speed scaling
        if (state.score > 0 && state.score % 5 === 0) {
           const targetSpeed = 3.5 + (state.score * 0.1); 
           state.speed = Math.min(MAX_SPEED, targetSpeed);
        }
        
        state.bird.vy += GRAVITY * dt;
        state.bird.y += state.bird.vy * dt;

        // Spawn Logic (adjusted for speed)
        const spawnRate = Math.floor(180 / (state.speed / 3.5)); 
        if (state.frame % spawnRate === 0) {
            const minPipe = 60;
            const maxPipe = canvas.height - PIPE_GAP - minPipe;
            const topH = Math.random() * (maxPipe - minPipe) + minPipe;
            
            state.pipes.push({ x: canvas.width, topH, gap: PIPE_GAP, passed: false });
        }

        // Physics & Collision
        state.pipes.forEach(p => {
            p.x -= state.speed * dt;

            // Define Tighter Bird Hitbox
            const birdHitbox = { 
                x: state.bird.x + BIRD_HITBOX_PADDING, 
                y: state.bird.y + BIRD_HITBOX_PADDING, 
                w: state.bird.w - (BIRD_HITBOX_PADDING * 2), 
                h: state.bird.h - (BIRD_HITBOX_PADDING * 2) 
            };

            // Pipe Hitbox (The logic wall)
            const pipeLeft = p.x; 
            const pipeRight = p.x + PIPE_HITBOX_WIDTH;

            const hitTop = birdHitbox.y < p.topH;
            const hitBot = birdHitbox.y + birdHitbox.h > p.topH + p.gap;
            
            // X-Axis Overlap
            const hitPipeX = (birdHitbox.x + birdHitbox.w > pipeLeft) && (birdHitbox.x < pipeRight);

            if (hitPipeX && (hitTop || hitBot)) handleDeath();
            
            // Score Logic
            if (!p.passed && p.x + PIPE_HITBOX_WIDTH < state.bird.x) {
                p.passed = true;
                state.score += 1;
                setScore(state.score); 
            }
        });

        // Floor/Ceiling Collision
        if (state.bird.y > canvas.height - state.bird.h || state.bird.y < -50) handleDeath();
        
        // Cleanup old pipes
        state.pipes = state.pipes.filter(p => p.x + PIPE_IMAGE_WIDTH > -50);
        state.frame++;
      }

      // --- RENDERING ---
      state.pipes.forEach(p => {
          const drawX = p.x - PIPE_IMAGE_OFFSET;
          
          // Draw Top Pipe
          // We assume the asset is a "candle" or "pillar" that can stretch vertically
          // without looking too weird. 
          drawPipe(ctx, state.sprites.pipe, drawX, 0, PIPE_IMAGE_WIDTH, p.topH);
          
          // Draw Bottom Pipe
          drawPipe(ctx, state.sprites.pipe, drawX, p.topH + p.gap, PIPE_IMAGE_WIDTH, canvas.height - (p.topH + p.gap));
          
          if (DEBUG_MODE) {
              // Hitbox (Red)
              ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
              ctx.lineWidth = 2;
              ctx.strokeRect(p.x, 0, PIPE_HITBOX_WIDTH, p.topH); 
              ctx.strokeRect(p.x, p.topH + p.gap, PIPE_HITBOX_WIDTH, canvas.height);

              // Image Box (Blue - to see the offset)
              ctx.strokeStyle = "rgba(0, 0, 255, 0.3)";
              ctx.strokeRect(drawX, 0, PIPE_IMAGE_WIDTH, p.topH);
          }
      });

      // Draw Bird
      drawSprite(ctx, state.sprites.doge, state.bird.x, state.bird.y, state.bird.w, state.bird.h);
      
      if (DEBUG_MODE) {
          ctx.strokeStyle = "lime";
          ctx.lineWidth = 2;
          ctx.strokeRect(
              state.bird.x + BIRD_HITBOX_PADDING, 
              state.bird.y + BIRD_HITBOX_PADDING, 
              state.bird.w - (BIRD_HITBOX_PADDING * 2), 
              state.bird.h - (BIRD_HITBOX_PADDING * 2)
          );
      }

      animationId = requestAnimationFrame(loop);
    };

    const drawSprite = (ctx, img, x, y, w, h) => {
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, x, y, w, h);
        } else {
            // Fallback
            ctx.fillStyle = 'orange';
            ctx.fillRect(x, y, w, h);
        }
    };

    const drawPipe = (ctx, img, x, y, w, h) => {
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, x, y, w, h);
        } else {
            // Fallback
            ctx.fillStyle = '#44ff44';
            ctx.fillRect(x, y, w, h);
        }
    };

    const handleDeath = () => {
        engine.current.isDead = true;
        engine.current.running = false; 
        setGameOver(true);
        if (username) {
            supabase.from('leaderboards').insert([{ 
                game_id: 'flappy', 
                username, 
                score: engine.current.score, 
                address: address 
            }]).then();
        }
    };

    loop(performance.now());
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]);

  useEffect(() => {
    if (!gameOver) {
      const t = setTimeout(() => { 
          setIsPlaying(true); 
          engine.current.running = true; 
          engine.current.lastTime = performance.now(); 
      }, 3000); // 3 second countdown/delay
      return () => clearTimeout(t);
    }
  }, [resetKey, gameOver]);

  return (
    <div ref={containerRef} className="game-wrapper" tabIndex="0" onClick={() => containerRef.current.focus()}>
      <GameUI 
        score={score} 
        gameOver={gameOver} 
        isPlaying={isPlaying} 
        onRestart={() => { 
            setScore(0); 
            setGameOver(false); 
            setIsPlaying(false); 
            setResetKey(p => p + 1); 
        }} 
        onExit={onExit} 
        gameId="flappy" 
      />
      <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default FlappyDoge;