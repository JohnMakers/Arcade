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

  // --- CONFIGURATION ---
  const DEBUG_MODE = true;    // Red Box = Hitbox. Green Box = Bird Core.
  
  const CHARACTER_SIZE = 60;
  
  // LOGIC WIDTH (The invisible wall you hit)
  const PIPE_HITBOX_WIDTH = 120; 
  
  // VISUAL WIDTH (The art you see)
  // We make this LARGER than the hitbox so the art looks good but gameplay is fair
  const PIPE_IMAGE_WIDTH = 180; 
  
  // CALCULATED OFFSET: Centers the image over the hitbox
  const PIPE_IMAGE_OFFSET = (PIPE_IMAGE_WIDTH - PIPE_HITBOX_WIDTH) / 2;

  const PIPE_GAP = 240; // Wide gap for the big pipes

  // Shrink Bird Hitbox (The "Heart" of the Doge)
  const BIRD_HITBOX_PADDING = 20; 

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

      // Draw Background
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

        const spawnRate = Math.floor(180 / (state.speed / 3)); 
        if (state.frame % spawnRate === 0) {
            const minPipe = 60;
            const maxPipe = canvas.height - PIPE_GAP - minPipe;
            const topH = Math.random() * (maxPipe - minPipe) + minPipe;
            // x represents the start of the HITBOX, not the image
            state.pipes.push({ x: canvas.width, topH, gap: PIPE_GAP, passed: false });
        }

        state.pipes.forEach(p => {
            p.x -= state.speed * dt;

            // --- COLLISION LOGIC (Uses Tighter Hitbox) ---
            const birdHitbox = { 
                x: state.bird.x + BIRD_HITBOX_PADDING, 
                y: state.bird.y + BIRD_HITBOX_PADDING, 
                w: state.bird.w - (BIRD_HITBOX_PADDING * 2), 
                h: state.bird.h - (BIRD_HITBOX_PADDING * 2) 
            };

            // Pipe Hitbox (The red box logic)
            const pipeLeft = p.x; 
            const pipeRight = p.x + PIPE_HITBOX_WIDTH;

            const hitTop = birdHitbox.y < p.topH;
            const hitBot = birdHitbox.y + birdHitbox.h > p.topH + p.gap;
            const hitPipeX = (birdHitbox.x + birdHitbox.w > pipeLeft) && (birdHitbox.x < pipeRight);

            if (hitPipeX && (hitTop || hitBot)) handleDeath();
            
            // Score based on passing the HITBOX
            if (!p.passed && p.x + PIPE_HITBOX_WIDTH < state.bird.x) {
                p.passed = true;
                state.score += 1;
                setScore(state.score); 
            }
        });

        if (state.bird.y > canvas.height - state.bird.h || state.bird.y < -50) handleDeath();
        state.pipes = state.pipes.filter(p => p.x + PIPE_IMAGE_WIDTH > 0);
        state.frame++;
      }

      state.pipes.forEach(p => {
          // --- DRAW IMAGES (Wider than hitbox) ---
          // We shift the image LEFT by PIPE_IMAGE_OFFSET so it centers over the hitbox
          const drawX = p.x - PIPE_IMAGE_OFFSET;
          
          // Top Pipe
          drawPipe(ctx, state.sprites.pipe, drawX, 0, PIPE_IMAGE_WIDTH, p.topH);
          
          // Bottom Pipe
          drawPipe(ctx, state.sprites.pipe, drawX, p.topH + p.gap, PIPE_IMAGE_WIDTH, canvas.height - (p.topH + p.gap));
          
          // --- DEBUG HITBOX (The Real Wall) ---
          if (DEBUG_MODE) {
              ctx.strokeStyle = "red";
              ctx.lineWidth = 2;
              // Drawn exactly where collision logic thinks it is
              ctx.strokeRect(p.x, 0, PIPE_HITBOX_WIDTH, p.topH); 
              ctx.strokeRect(p.x, p.topH + p.gap, PIPE_HITBOX_WIDTH, canvas.height);
          }
      });

      // Draw Bird
      drawSprite(ctx, state.sprites.doge, state.bird.x, state.bird.y, state.bird.w, state.bird.h);
      
      // --- DEBUG BIRD CORE ---
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
            ctx.fillStyle = 'orange';
            ctx.fillRect(x, y, w, h);
        }
    };

    const drawPipe = (ctx, img, x, y, w, h) => {
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, x, y, w, h);
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