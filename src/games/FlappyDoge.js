import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from './components/GameUI';

const FlappyDoge = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- CONFIGURATION ---
  const DEBUG_MODE = false;    
  const PIPE_IMAGE_WIDTH = 85; 
  const PIPE_HITBOX_WIDTH = 50; 
  const PIPE_IMAGE_OFFSET = (PIPE_IMAGE_WIDTH - PIPE_HITBOX_WIDTH) / 2;
  const CHARACTER_SIZE = 45; 
  const BIRD_HITBOX_PADDING = 12; 
  const PIPE_GAP = 160; // Slightly tighter gap for higher difficulty

  // NEW: Spawn Logic
  // instead of frames, we use pixels.
  // 220px means there will always be ~2 pipes on screen (400px width / 220 = 1.8)
  const SPAWN_DISTANCE = 220; 

  const engine = useRef({
    running: false,
    bird: { x: 50, y: 300, vy: 0, w: CHARACTER_SIZE, h: CHARACTER_SIZE },
    pipes: [],
    sprites: {},
    frame: 0,
    score: 0,
    speed: 3.5,
    distanceTraveled: 0, // NEW: Tracks total pixels moved
    bgOffset: 0,         // NEW: Tracks background scroll
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
    load('bg', ASSETS.FLAPPY_BACKGROUND); 
  }, []);

  useEffect(() => {
    const handleInput = (e) => {
      if (e.target.closest('button') || e.target.closest('.interactive')) return;
      if (e.type === 'keydown' && (e.code === 'Space' || e.code === 'ArrowUp')) {
          e.preventDefault();
      } else if (e.type === 'keydown') {
          return;
      }

      const state = engine.current;
      if (state.running && !state.isDead && !gameOver) {
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

    engine.current.running = false; 
    engine.current.isDead = false;
    engine.current.score = 0;
    engine.current.speed = 3.5;
    engine.current.distanceTraveled = 0;
    engine.current.bird = { x: 50, y: 300, vy: 0, w: CHARACTER_SIZE, h: CHARACTER_SIZE };
    engine.current.pipes = [];
    engine.current.frame = 0;
    engine.current.lastTime = performance.now();

    // Pre-spawn the first pipe so the user doesn't wait
    engine.current.pipes.push({ 
        x: 400 + 100, // Start just off screen
        topH: 200, 
        gap: PIPE_GAP, 
        passed: false 
    });

    const GRAVITY = 0.5;
    const MAX_SPEED = 6.5;

    const loop = (time) => {
      const state = engine.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // 1. Update Game State
      if (state.running && !state.isDead) {
        // Speed scaling
        if (state.score > 0 && state.score % 5 === 0) {
           const targetSpeed = 3.5 + (state.score * 0.15); 
           state.speed = Math.min(MAX_SPEED, targetSpeed);
        }
        
        state.bird.vy += GRAVITY * dt;
        state.bird.y += state.bird.vy * dt;

        // Move Everything
        const moveStep = state.speed * dt;
        state.distanceTraveled += moveStep;
        
        // Background Parallax (Moves at 50% speed of pipes)
        state.bgOffset += (moveStep * 0.5); 
        if (state.bgOffset >= canvas.width) state.bgOffset = 0; // Loop it

        // Pipe Spawning Logic (Distance Based)
        // We look at the LAST pipe. If it has moved SPAWN_DISTANCE away from the right edge, spawn a new one.
        const lastPipe = state.pipes[state.pipes.length - 1];
        const rightEdge = canvas.width;
        
        // If the last pipe is at X, and the screen edge is at 400.
        // We want (400 - lastPipe.x) >= SPAWN_DISTANCE? No.
        // We want: When the last pipe has moved SPAWN_DISTANCE pixels to the left.
        // New Logic: If (CanvasWidth - LastPipeX) > SPAWN_DISTANCE
        if (lastPipe && (canvas.width - lastPipe.x >= SPAWN_DISTANCE)) {
            const minPipe = 60;
            const maxPipe = canvas.height - PIPE_GAP - minPipe;
            const topH = Math.random() * (maxPipe - minPipe) + minPipe;
            
            state.pipes.push({ x: canvas.width, topH, gap: PIPE_GAP, passed: false });
        }

        // Move & Collide Pipes
        state.pipes.forEach(p => {
            p.x -= moveStep;

            const birdHitbox = { 
                x: state.bird.x + BIRD_HITBOX_PADDING, 
                y: state.bird.y + BIRD_HITBOX_PADDING, 
                w: state.bird.w - (BIRD_HITBOX_PADDING * 2), 
                h: state.bird.h - (BIRD_HITBOX_PADDING * 2) 
            };

            const pipeLeft = p.x; 
            const pipeRight = p.x + PIPE_HITBOX_WIDTH;

            const hitTop = birdHitbox.y < p.topH;
            const hitBot = birdHitbox.y + birdHitbox.h > p.topH + p.gap;
            const hitPipeX = (birdHitbox.x + birdHitbox.w > pipeLeft) && (birdHitbox.x < pipeRight);

            if (hitPipeX && (hitTop || hitBot)) handleDeath();
            
            if (!p.passed && p.x + PIPE_HITBOX_WIDTH < state.bird.x) {
                p.passed = true;
                state.score += 1;
                setScore(state.score); 
            }
        });

        if (state.bird.y > canvas.height - state.bird.h || state.bird.y < -50) handleDeath();
        
        // Cleanup off-screen pipes
        state.pipes = state.pipes.filter(p => p.x + PIPE_IMAGE_WIDTH > -100);
        state.frame++;
      }

      // 2. Render
      
      // Draw Background
      if (state.sprites.bg && state.sprites.bg.complete) {
          // Draw two copies of the BG to make it loop seamlessly
          // Image 1: shifting left
          const bgX = -state.bgOffset; 
          ctx.drawImage(state.sprites.bg, bgX, 0, canvas.width, canvas.height);
          
          // Image 2: following right behind
          ctx.drawImage(state.sprites.bg, bgX + canvas.width, 0, canvas.width, canvas.height);
      } else {
          // Fallback Sky
          ctx.fillStyle = "#70c5ce"; 
          ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Draw Pipes
      state.pipes.forEach(p => {
          const drawX = p.x - PIPE_IMAGE_OFFSET;
          
          // Top Pipe
          drawPipe(ctx, state.sprites.pipe, drawX, 0, PIPE_IMAGE_WIDTH, p.topH);
          
          // Bottom Pipe
          drawPipe(ctx, state.sprites.pipe, drawX, p.topH + p.gap, PIPE_IMAGE_WIDTH, canvas.height - (p.topH + p.gap));
          
          if (DEBUG_MODE) {
              ctx.strokeStyle = "red";
              ctx.strokeRect(p.x, 0, PIPE_HITBOX_WIDTH, p.topH); 
              ctx.strokeRect(p.x, p.topH + p.gap, PIPE_HITBOX_WIDTH, canvas.height);
          }
      });

      // Draw Bird
      drawSprite(ctx, state.sprites.doge, state.bird.x, state.bird.y, state.bird.w, state.bird.h);

      animationId = requestAnimationFrame(loop);
    };

    const drawSprite = (ctx, img, x, y, w, h) => {
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, x, y, w, h);
        } else {
            ctx.fillStyle = 'orange';
            ctx.fillRect(x, y, w, h);
        }
    };

    const drawPipe = (ctx, img, x, y, w, h) => {
        if (img && img.complete && img.naturalWidth !== 0) {
            // Apply source clipping here if you kept that change
            const sourceWidth = img.naturalWidth;
            const sourceHeight = img.naturalHeight;
            const cropX = sourceWidth * 0.25; 
            const cropWidth = sourceWidth * 0.50; 
            
            ctx.drawImage(
                img, 
                cropX, 0, cropWidth, sourceHeight,
                x, y, w, h
            );
        } else {
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
      }, 3000); 
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