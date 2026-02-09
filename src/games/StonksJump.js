import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const StonksJump = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- SENIOR DEV TUNING (ZOOMED IN MODE) ---
  // Increased Scale from 2.0 -> 2.4 to make everything look "closer" and bigger
  const SCALE = 2.4; 
  
  const HERO_SIZE = 55 * SCALE; // ~132px (Big & Clear)
  const PLAT_W = 100 * SCALE;   // ~240px (30% of screen width)
  const PLAT_H = 20 * SCALE;    

  // Physics retuned for the heavier mass
  const GRAVITY = 0.65 * SCALE; 
  const JUMP = -15.5 * SCALE;   
  const SPEED = 8.5 * SCALE;      
  const BOUNCE_ROCKET = -42 * SCALE;

  const gameState = useRef({
    hero: { x: 300, y: 600, vx: 0, vy: 0, w: HERO_SIZE, h: HERO_SIZE },
    cameraY: 0,
    platforms: [],
    keys: { left: false, right: false },
    touchX: null,
    active: true,
    sprites: {},
    lastTime: 0
  });

  useEffect(() => {
    const loadSprite = (key, src) => {
      const img = new Image();
      img.src = src;
      img.crossOrigin = "Anonymous";
      img.onload = () => { gameState.current.sprites[key] = img; };
    };
    loadSprite('hero', ASSETS.STONKS_MAN);
    loadSprite('green', ASSETS.PLATFORM_GREEN);
    loadSprite('red', ASSETS.PLATFORM_RED);
    loadSprite('blue', ASSETS.PLATFORM_BLUE);
    loadSprite('rocket', ASSETS.ROCKET);
    loadSprite('bg1', ASSETS.STONKS_BG_1 || ASSETS.FLAPPY_BACKGROUND); 
    loadSprite('bg2', ASSETS.STONKS_BG_2 || ASSETS.FLAPPY_BACKGROUND);
    loadSprite('bg3', ASSETS.STONKS_BG_3 || ASSETS.CHAD_BG);
  }, []);

  useEffect(() => {
    const handleKey = (e, isDown) => {
      if (e.key === 'ArrowLeft') gameState.current.keys.left = isDown;
      if (e.key === 'ArrowRight') gameState.current.keys.right = isDown;
    };
    const down = (e) => handleKey(e, true);
    const up = (e) => handleKey(e, false);
    
    const wrapper = containerRef.current;
    
    const handleTouch = (e) => {
        if (e.target.closest('button') || e.target.closest('.interactive')) return;
        if (e.cancelable) e.preventDefault(); 
        
        const touch = e.touches[0];
        if (touch) {
            const rect = wrapper.getBoundingClientRect();
            const relativeX = touch.clientX - rect.left;
            // Map screen tap to HD canvas coordinates
            const scaleX = 800 / rect.width; 
            gameState.current.touchX = relativeX * scaleX;
        }
    };

    const handleTouchEnd = (e) => {
        if (e.cancelable) e.preventDefault();
        gameState.current.touchX = null;
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    if (wrapper) {
        wrapper.addEventListener('touchstart', handleTouch, { passive: false });
        wrapper.addEventListener('touchmove', handleTouch, { passive: false });
        wrapper.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      if (wrapper) {
          wrapper.removeEventListener('touchstart', handleTouch);
          wrapper.removeEventListener('touchmove', handleTouch);
          wrapper.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clean look
    // ctx.imageSmoothingEnabled = false; 

    let animationId;

    gameState.current.active = true;
    gameState.current.hero = { x: 350, y: 800, vx: 0, vy: 0, w: HERO_SIZE, h: HERO_SIZE };
    gameState.current.cameraY = 0;
    
    // Initial Platforms
    gameState.current.platforms = [
        { x: 300, y: 1100, w: PLAT_W, h: PLAT_H, type: 'green' },
        { x: 300, y: 800, w: PLAT_W, h: PLAT_H, type: 'green' },
        { x: 100, y: 500, w: PLAT_W, h: PLAT_H, type: 'green' },
        { x: 500, y: 250, w: PLAT_W, h: PLAT_H, type: 'green' }
    ];
    gameState.current.lastTime = performance.now();

    const drawSprite = (spriteKey, x, y, w, h, fallbackColor) => {
        const img = gameState.current.sprites[spriteKey];
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, x, y, w, h);
        } else {
            ctx.fillStyle = fallbackColor;
            ctx.fillRect(x, y, w, h);
        }
    };

    const loop = async (time) => { 
      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      const height = Math.abs(state.cameraY);
      
      let bgKey = 'bg1';
      if (height > 10000) bgKey = 'bg2';
      if (height > 100000) bgKey = 'bg3';

      const bgImg = state.sprites[bgKey];
      if (bgImg && bgImg.complete) {
          ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
      } else {
          if (height > 100000) ctx.fillStyle = "#000022"; 
          else if (height > 10000) ctx.fillStyle = "#1a1a40"; 
          else ctx.fillStyle = "#1a1a1a"; 
          ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (isPlaying && state.active) {
        if (state.touchX !== null) {
            const diff = state.touchX - (state.hero.x + state.hero.w/2);
            if (Math.abs(diff) > 10) { 
                state.hero.vx = diff > 0 ? SPEED : -SPEED;
            } else {
                state.hero.vx = 0;
            }
        } else {
            if (state.keys.left) state.hero.vx = -SPEED;
            else if (state.keys.right) state.hero.vx = SPEED;
            else state.hero.vx = 0;
        }

        state.hero.vy += GRAVITY * dt;
        state.hero.x += state.hero.vx * dt;
        state.hero.y += state.hero.vy * dt;

        if (state.hero.x > canvas.width) state.hero.x = -state.hero.w;
        if (state.hero.x < -state.hero.w) state.hero.x = canvas.width;

        if (state.hero.vy > 0) { 
            state.platforms.forEach(p => {
                const footX = state.hero.x + (state.hero.w * 0.25);
                const footW = state.hero.w * 0.5; 
                const footY = state.hero.y + state.hero.h;

                if (!p.broken &&
                    footX + footW > p.x && 
                    footX < p.x + p.w &&
                    footY > p.y && 
                    footY < p.y + p.h + (25 * SCALE) 
                ) {
                    if (p.hasRocket) {
                        state.hero.vy = BOUNCE_ROCKET; 
                    } else {
                        state.hero.vy = JUMP;
                    }

                    if (p.type === 'red') {
                        p.broken = true; 
                    }
                }
            });
        }

        if (state.hero.y < state.cameraY + (canvas.height * 0.4)) {
            state.cameraY = state.hero.y - (canvas.height * 0.4);
            setScore(Math.floor(Math.abs(state.cameraY / SCALE))); 
        }

        state.platforms.sort((a,b) => a.y - b.y);
        const highest = state.platforms[0].y;
        
        if (highest > state.cameraY - 200) { 
            // Wider gaps for bigger scaling
            const gap = (Math.random() * 120 + 80) * SCALE; 
            const y = highest - gap;
            const x = Math.random() * (canvas.width - PLAT_W);

            const currentScore = Math.abs(state.cameraY / SCALE);
            
            let type = 'green';
            let hasRocket = Math.random() > 0.98; 
            
            if (currentScore < 10000) {
                if (Math.random() > 0.9) type = 'blue';
            } else if (currentScore >= 10000 && currentScore < 100000) {
                const r = Math.random();
                if (r > 0.8) type = 'red';      
                else if (r > 0.7) type = 'blue'; 
                else type = 'green';             
            } else {
                const r = Math.random();
                if (r > 0.3) type = 'red';      
                else type = 'blue';             
            }

            state.platforms.push({
                x, y, w: PLAT_W, h: PLAT_H,
                type: type,
                moving: type === 'blue',
                vx: type === 'blue' ? (3.5 * SCALE) : 0, 
                broken: false,
                hasRocket
            });
        }
        
        state.platforms = state.platforms.filter(p => p.y < state.cameraY + canvas.height + 200);

        if (state.hero.y > state.cameraY + canvas.height) {
            state.active = false;
            if (username) {
                 await supabase.from('leaderboards').insert([{
                     game_id:'doodle', 
                     username, 
                     score: Math.floor(Math.abs(state.cameraY / SCALE)), 
                     address: address
                 }]);
            }
            setGameOver(true);
            return;
        }
      }

      ctx.save();
      ctx.translate(0, -state.cameraY);
      
      state.platforms.forEach(p => {
          if (p.broken) return; 
          
          if (p.moving && isPlaying) {
             p.x += p.vx * dt;
             if (p.x < 0 || p.x > canvas.width - p.w) p.vx *= -1;
          }
          
          let color = '#00ff00';
          if (p.type === 'red') color = '#ff4444';
          if (p.type === 'blue') color = '#44ffff';
          
          drawSprite(p.type, p.x, p.y, p.w, p.h, color);
          
          if (p.hasRocket) {
              drawSprite('rocket', p.x + (PLAT_W/2 - 15*SCALE), p.y - (30*SCALE), 30*SCALE, 30*SCALE, 'gold');
          }
      });
      
      drawSprite('hero', state.hero.x, state.hero.y, state.hero.w, state.hero.h, 'white');
      ctx.restore();

      animationId = requestAnimationFrame(loop);
    };

    loop(performance.now());
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, resetKey]); 

  useEffect(() => {
    if (!gameOver) setTimeout(() => { setIsPlaying(true); gameState.current.lastTime = performance.now(); }, 3000);
  }, [resetKey, gameOver]);

  return (
    // FIX: Added position: 'relative' here. This anchors the GameUI so it fits exactly over the canvas.
    <div 
        ref={containerRef} 
        className="game-wrapper" 
        tabIndex="0" 
        onClick={() => containerRef.current.focus()}
        style={{ position: 'relative', width: '100%', maxWidth: '500px', margin: '0 auto' }} 
    >
        <GameUI score={score} gameOver={gameOver} isPlaying={isPlaying} onRestart={() => { setGameOver(false); setIsPlaying(false); setScore(0); setResetKey(prev => prev + 1); }} onExit={onExit} gameId="doodle" />
        {/* We keep the canvas layout simple. maxWidth: 100% ensures it fits in the parent box. */}
        <canvas ref={canvasRef} width={800} height={1200} style={{ width: '100%', height: 'auto', display: 'block' }} />
    </div>
  );
};

export default StonksJump;