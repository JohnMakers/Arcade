import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const StonksJump = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username } = useContext(UserContext);

  // UI State (Score/Over) - separate from Game Loop to prevent re-renders
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  // --- GAME ENGINE STATE (Mutable Refs) ---
  const gameState = useRef({
    hero: { x: 200, y: 400, vx: 0, vy: 0, w: 40, h: 40 },
    cameraY: 0,
    platforms: [],
    keys: { left: false, right: false },
    active: false,
    sprites: {}
  });

  // --- 1. ASSET PRELOADER ---
  useEffect(() => {
    const loadAssets = async () => {
      const loadImg = (src) => new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img); // Fail silently to avoid crash
      });

      const [hero, green, red, blue, rocket] = await Promise.all([
        loadImg(ASSETS.STONKS_MAN),
        loadImg(ASSETS.PLATFORM_GREEN),
        loadImg(ASSETS.PLATFORM_RED),
        loadImg(ASSETS.PLATFORM_BLUE),
        loadImg(ASSETS.ROCKET)
      ]);

      gameState.current.sprites = { hero, green, red, blue, rocket };
      setLoading(false);
    };
    loadAssets();
  }, []);

  // --- 2. INPUT HANDLERS (Directly modify refs) ---
  useEffect(() => {
    const handleDown = (e) => {
      if (e.key === 'ArrowLeft') gameState.current.keys.left = true;
      if (e.key === 'ArrowRight') gameState.current.keys.right = true;
    };
    const handleUp = (e) => {
      if (e.key === 'ArrowLeft') gameState.current.keys.left = false;
      if (e.key === 'ArrowRight') gameState.current.keys.right = false;
    };
    // Mobile Touch
    const handleTouchStart = (e) => {
      const x = e.touches[0].clientX;
      if (x < window.innerWidth / 2) gameState.current.keys.left = true;
      else gameState.current.keys.right = true;
    };
    const handleTouchEnd = () => {
      gameState.current.keys.left = false;
      gameState.current.keys.right = false;
    };

    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // --- 3. GAME LOOP ---
  useEffect(() => {
    if (loading) return;

    // Reset Game State on restart
    gameState.current.active = true;
    gameState.current.hero = { x: 200, y: 400, vx: 0, vy: 0, w: 40, h: 40 };
    gameState.current.cameraY = 0;
    gameState.current.platforms = [
       { x: 150, y: 500, type: 'green', w: 80, h: 15, moving: false },
       { x: 150, y: 350, type: 'green', w: 80, h: 15, moving: false }
    ];

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const GRAVITY = 0.4;
    const JUMP_FORCE = -11;
    const MOVE_SPEED = 6;

    const loop = () => {
      const state = gameState.current;
      const { hero, sprites, keys } = state;

      // 1. CLEAR
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. LOGIC (Only if Playing)
      if (isPlaying && state.active) {
        // Horizontal Move
        if (keys.left) hero.vx = -MOVE_SPEED;
        else if (keys.right) hero.vx = MOVE_SPEED;
        else hero.vx = 0;

        // Physics
        hero.vy += GRAVITY;
        hero.x += hero.vx;
        hero.y += hero.vy;

        // Wrap
        if (hero.x > canvas.width) hero.x = -hero.w;
        if (hero.x < -hero.w) hero.x = canvas.width;

        // Platforms Collision (Falling Only)
        if (hero.vy > 0) {
           state.platforms.forEach(p => {
             if (!p.broken &&
                 hero.x < p.x + p.w && hero.x + hero.w > p.x &&
                 hero.y + hero.h > p.y && hero.y + hero.h < p.y + p.h + 20) {
                   if (p.type === 'red') {
                     p.broken = true;
                     hero.vy = 0;
                   } else if (p.hasRocket) {
                     hero.vy = -30; // ZOOM
                   } else {
                     hero.vy = JUMP_FORCE;
                   }
             }
           });
        }

        // Camera
        if (hero.y < state.cameraY + 300) {
          state.cameraY = hero.y - 300;
          setScore(Math.floor(Math.abs(state.cameraY)));
        }

        // Generator (Infinite & Reachable)
        // Sort by Y (lowest value is highest on screen)
        state.platforms.sort((a,b) => a.y - b.y);
        const highestY = state.platforms[0].y;
        
        if (highestY > state.cameraY - 800) {
           const gap = Math.random() * 80 + 40; // 40-120px gap (Safe)
           const newY = highestY - gap;
           const newX = Math.random() * (canvas.width - 80);
           const typeRand = Math.random();
           
           let type = 'green';
           let moving = false;
           if (typeRand > 0.8) { type = 'blue'; moving = true; }
           
           state.platforms.push({
             x: newX, y: newY, w: 80, h: 15, 
             type, moving, vx: moving ? 2 : 0, 
             hasRocket: Math.random() > 0.95
           });
        }
        
        // Remove old
        state.platforms = state.platforms.filter(p => p.y < state.cameraY + canvas.height + 100);

        // Death
        if (hero.y > state.cameraY + canvas.height) {
          state.active = false;
          setGameOver(true);
          if (username) supabase.from('leaderboards').insert([{ game_id: 'doodle', username, score: Math.floor(Math.abs(state.cameraY)) }]);
        }
      }

      // 3. DRAW
      ctx.save();
      ctx.translate(0, -state.cameraY);

      state.platforms.forEach(p => {
        if (p.broken) return;
        if (p.moving) {
            if(isPlaying) p.x += p.vx;
            if(p.x < 0 || p.x > canvas.width - p.w) p.vx *= -1;
        }

        let img = sprites.green;
        if (p.type === 'red') img = sprites.red;
        if (p.type === 'blue') img = sprites.blue;
        
        ctx.drawImage(img, p.x, p.y, p.w, p.h);
        if (p.hasRocket) ctx.drawImage(sprites.rocket, p.x + 25, p.y - 30, 30, 30);
      });

      // Draw Hero
      ctx.drawImage(sprites.hero, hero.x, hero.y, hero.w, hero.h);
      ctx.restore();

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [loading, isPlaying, resetKey]);

  // Countdown Logic
  useEffect(() => {
    if (!gameOver && !loading) {
      const t = setTimeout(() => setIsPlaying(true), 3000);
      return () => clearTimeout(t);
    }
  }, [loading, gameOver, resetKey]);

  const handleRestart = () => {
    setGameOver(false);
    setIsPlaying(false);
    setScore(0);
    setResetKey(prev => prev + 1);
  };

  return (
    <div className="game-wrapper">
       <GameUI 
         score={score} 
         gameOver={gameOver} 
         isPlaying={isPlaying} 
         onRestart={handleRestart} 
         onExit={onExit} 
         gameId="doodle" 
       />
       {loading && <div style={{color:'white', fontSize:20}}>LOADING ASSETS...</div>}
       <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default StonksJump;