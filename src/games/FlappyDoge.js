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

  // Constants for better visuals and gameplay
  const CHARACTER_SIZE = 60; // Increased size to highlight your art
  const PIPE_WIDTH = 70;      // Wider pipes to prevent "thin/squished" look
  const PIPE_GAP = 160;       // Slightly wider gap for the larger character

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

  // Improved Image Loading logic for local assets
  useEffect(() => {
    const load = (k, src) => {
        const img = new Image();
        img.onload = () => {
            console.log(`Loaded ${k} successfully`);
            engine.current.sprites[k] = img;
        };
        img.onerror = () => console.error(`Failed to load ${k} from ${src}`);
        // No crossOrigin needed for local public folder files
        img.src = src;
    };
    load('doge', ASSETS.DOGE_HERO);
    load('pipe', ASSETS.RED_CANDLE);
  }, []);

  useEffect(() => {
    const handleInput = (e) => {
      if (e.target.closest('button') || e.target.closest('.interactive')) return;
      if (e.cancelable && e.type !== 'keydown') e.preventDefault();
      if (e.type === 'keydown' && e.code !== 'Space' && e.code !== 'ArrowUp') return;
      if (e.type === 'keydown') e.preventDefault();

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
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // Dynamic Background
      const bgLevel = Math.min(1, state.score / 50);
      const r = Math.floor(240 * (1 - bgLevel)); 
      const g = Math.floor(240 * (1 - bgLevel)); 
      const b = Math.floor(240 - (180 * bgLevel)); 
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (state.running && !state.isDead) {
        if (state.score > 0 && state.score % 5 === 0) {
           const targetSpeed = 3.5 + (state.score * 0.1); 
           state.speed = Math.min(MAX_SPEED, targetSpeed);
        }
        
        state.bird.vy += GRAVITY * dt;
        state.bird.y += state.bird.vy * dt;

        // Pipe Spawning
        const spawnRate = Math.floor(180 / (state.speed / 3)); 
        if (state.frame % spawnRate === 0) {
            const minPipe = 60;
            const maxPipe = canvas.height - PIPE_GAP - minPipe;
            const topH = Math.random() * (maxPipe - minPipe) + minPipe;
            state.pipes.push({ x: canvas.width, topH, gap: PIPE_GAP, passed: false });
        }

        state.pipes.forEach(p => {
            p.x -= state.speed * dt;

            // --- IMPROVED COLLISION ---
            // Bird hitbox is slightly smaller than the image (padding) to feel more fair
            const birdHitbox = { 
                x: state.bird.x + 10, 
                y: state.bird.y + 10, 
                w: state.bird.w - 20, 
                h: state.bird.h - 20 
            };

            const hitTop = birdHitbox.y < p.topH;
            const hitBot = birdHitbox.y + birdHitbox.h > p.topH + p.gap;
            const hitPipeX = birdHitbox.x + birdHitbox.w > p.x && birdHitbox.x < p.x + PIPE_WIDTH;

            if (hitPipeX && (hitTop || hitBot)) handleDeath();
            
            if (!p.passed && p.x + PIPE_WIDTH < state.bird.x) {
                p.passed = true;
                state.score += 1;
                setScore(state.score); 
            }
        });

        if (state.bird.y > canvas.height - state.bird.h || state.bird.y < -50) handleDeath();
        state.pipes = state.pipes.filter(p => p.x + PIPE_WIDTH > 0);
        state.frame++;
      }

      // --- IMPROVED DRAWING ---
      state.pipes.forEach(p => {
          // Top Pipe (Flipped)
          drawScaledPipe(ctx, state.sprites.pipe, p.x, 0, PIPE_WIDTH, p.topH, true);
          // Bottom Pipe (Normal)
          drawScaledPipe(ctx, state.sprites.pipe, p.x, p.topH + p.gap, PIPE_WIDTH, canvas.height - (p.topH + p.gap), false);
      });

      // Draw Character
      drawSprite(ctx, state.sprites.doge, state.bird.x, state.bird.y, state.bird.w, state.bird.h, 'orange');
      
      animationId = requestAnimationFrame(loop);
    };

    // Helper for character and basic sprites
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

    // Special helper for pipes to handle flipping/scaling without squishing
    const drawScaledPipe = (ctx, img, x, y, w, h, isTop) => {
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.save();
            if (isTop) {
                // Flip top pipe so the "head" of your obstacle art faces the gap
                ctx.translate(x + w / 2, y + h / 2);
                ctx.rotate(Math.PI);
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
            } else {
                ctx.drawImage(img, x, y, w, h);
            }
            ctx.restore();
        } else {
            ctx.fillStyle = isTop ? '#ff4444' : '#44ff44';
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