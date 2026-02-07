import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const StonksJump = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username, address } = useContext(UserContext);

  // UI State
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- GAME STATE (Mutable) ---
  const gameState = useRef({
    hero: { x: 185, y: 300, vx: 0, vy: 0, w: 40, h: 40 },
    cameraY: 0,
    platforms: [],
    keys: { left: false, right: false },
    active: true,
    sprites: {} // Stores loaded images
  });

  // --- 1. ROBUST ASSET LOADER ---
  useEffect(() => {
    const loadSprite = (key, src) => {
      const img = new Image();
      img.src = src;
      img.crossOrigin = "Anonymous"; // Fix Tainted Canvas
      img.onload = () => { gameState.current.sprites[key] = img; };
      // No onerror handling needed; renderer checks if sprite exists
    };

    loadSprite('hero', ASSETS.STONKS_MAN);
    loadSprite('green', ASSETS.PLATFORM_GREEN);
    loadSprite('red', ASSETS.PLATFORM_RED);
    loadSprite('blue', ASSETS.PLATFORM_BLUE);
    loadSprite('rocket', ASSETS.ROCKET);
  }, []);

  // --- 2. INPUT HANDLERS (Refs = No Lag) ---
  useEffect(() => {
    const handleKey = (e, isDown) => {
      if (e.key === 'ArrowLeft') gameState.current.keys.left = isDown;
      if (e.key === 'ArrowRight') gameState.current.keys.right = isDown;
    };
    const down = (e) => handleKey(e, true);
    const up = (e) => handleKey(e, false);
    
    // Touch Logic
    const touchStart = (e) => {
        const x = e.touches[0].clientX;
        const w = window.innerWidth;
        if(x < w/2) gameState.current.keys.left = true;
        else gameState.current.keys.right = true;
    };
    const touchEnd = () => {
        gameState.current.keys.left = false;
        gameState.current.keys.right = false;
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('touchstart', touchStart);
    window.addEventListener('touchend', touchEnd);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('touchstart', touchStart);
      window.removeEventListener('touchend', touchEnd);
    };
  }, []);

  // --- 3. GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    // Reset Physics State
    gameState.current.active = true;
    gameState.current.hero = { x: 185, y: 400, vx: 0, vy: 0, w: 30, h: 30 };
    gameState.current.cameraY = 0;
    gameState.current.platforms = [
        { x: 160, y: 550, w: 80, h: 15, type: 'green' },
        { x: 160, y: 400, w: 80, h: 15, type: 'green' }
    ];

    const GRAVITY = 0.45;
    const JUMP = -11;
    const SPEED = 6;

    // --- HELPER: FAULT TOLERANT DRAW ---
    const drawSprite = (spriteKey, x, y, w, h, fallbackColor) => {
        const img = gameState.current.sprites[spriteKey];
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, x, y, w, h);
        } else {
            // Fallback if image failed or loading
            ctx.fillStyle = fallbackColor;
            ctx.fillRect(x, y, w, h);
            // Add border so it looks intentional
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
        }
    };

    const loop = () => {
      const state = gameState.current;
      
      // 1. CLEAR (Dark Grey Background)
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. LOGIC (Only when "isPlaying")
      if (isPlaying && state.active) {
        // Move
        if (state.keys.left) state.hero.vx = -SPEED;
        else if (state.keys.right) state.hero.vx = SPEED;
        else state.hero.vx = 0;

        state.hero.vy += GRAVITY;
        state.hero.x += state.hero.vx;
        state.hero.y += state.hero.vy;

        // Wrap
        if (state.hero.x > canvas.width) state.hero.x = -state.hero.w;
        if (state.hero.x < -state.hero.w) state.hero.x = canvas.width;

        // Collision (Feet only)
        if (state.hero.vy > 0) {
            state.platforms.forEach(p => {
                if (!p.broken &&
                    state.hero.x + 20 > p.x && 
                    state.hero.x + 10 < p.x + p.w &&
                    state.hero.y + state.hero.h > p.y && 
                    state.hero.y + state.hero.h < p.y + p.h + 20
                ) {
                    if (p.type === 'red') {
                        p.broken = true;
                        state.hero.vy = 0;
                    } else if (p.hasRocket) {
                        state.hero.vy = -35; // MOON
                    } else {
                        state.hero.vy = JUMP;
                    }
                }
            });
        }

        // Camera
        if (state.hero.y < state.cameraY + 300) {
            state.cameraY = state.hero.y - 300;
            setScore(Math.floor(Math.abs(state.cameraY)));
        }

        // Generate
        state.platforms.sort((a,b) => a.y - b.y);
        const highest = state.platforms[0].y;
        if (highest > state.cameraY - 700) {
            const gap = Math.random() * 80 + 40; // 40-120px Gap
            const typeR = Math.random();
            let type = 'green';
            if (typeR > 0.8) type = 'blue';
            
            state.platforms.push({
                x: Math.random() * (canvas.width - 80),
                y: highest - gap,
                w: 80, h: 15,
                type: type,
                moving: type === 'blue',
                vx: type === 'blue' ? 2 : 0,
                hasRocket: Math.random() > 0.95
            });
        }
        
        // Cleanup
        state.platforms = state.platforms.filter(p => p.y < state.cameraY + canvas.height + 100);

        // Die
        if (state.hero.y > state.cameraY + canvas.height) {
            state.active = false;
            setGameOver(true);
            if (username) supabase.from('leaderboards').insert([{game_id:'doodle', username, score: Math.floor(Math.abs(state.cameraY)), address: address}]);
        }
      }

      // 3. DRAW (Always render, even if paused)
      ctx.save();
      ctx.translate(0, -state.cameraY);

      state.platforms.forEach(p => {
          if (p.broken) return;
          if (p.moving && isPlaying) {
             p.x += p.vx;
             if (p.x < 0 || p.x > canvas.width - p.w) p.vx *= -1;
          }
          
          let color = '#00ff00';
          if (p.type === 'red') color = 'red';
          if (p.type === 'blue') color = 'cyan';
          
          drawSprite(p.type, p.x, p.y, p.w, p.h, color);
          if (p.hasRocket) drawSprite('rocket', p.x + 20, p.y - 30, 30, 30, 'gold');
      });

      drawSprite('hero', state.hero.x, state.hero.y, state.hero.w, state.hero.h, 'white');
      ctx.restore();

      animationId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, resetKey]); // Only re-run if game status changes hard

  // Countdown
  useEffect(() => {
    if (!gameOver) setTimeout(() => setIsPlaying(true), 3000);
  }, [resetKey, gameOver]);

  const handleRestart = () => {
    setGameOver(false);
    setIsPlaying(false); // Triggers countdown
    setScore(0);
    setResetKey(prev => prev + 1);
  };

  return (
    <div className="game-wrapper">
        <GameUI score={score} gameOver={gameOver} isPlaying={isPlaying} onRestart={handleRestart} onExit={onExit} gameId="doodle" />
        <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default StonksJump;