import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const BagsGrowth = ({ onExit }) => {
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
  const PLAYER_SIZE = 80;
  const BASE_SPEED = 8;
  const BASE_FALL_SPEED = 4;

  const gameState = useRef({
    player: { x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2, y: CANVAS_HEIGHT - 100, w: PLAYER_SIZE, h: PLAYER_SIZE, vx: 0, chadTimer: 0, heavyTimer: 0 },
    items: [],
    particles: [],
    emojis: [],
    wind: 0,
    windTime: 0,
    difficultyMultiplier: 1,
    spawnTimer: 0,
    keys: {},
    sprites: {},
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

    loadSprite('hero', ASSETS.BG_HERO);
    loadSprite('chad', ASSETS.BG_CHAD);
    loadSprite('gem', ASSETS.BG_GEM);
    loadSprite('alpha', ASSETS.BG_ALPHA);
    loadSprite('heavy', ASSETS.BG_HEAVY);
    loadSprite('fud', ASSETS.BG_FUD);
  }, []);

    // Input Handling (Keyboard & Touch)
  useEffect(() => {
    const handleKeyDown = (e) => { 
        gameState.current.keys[e.code] = true; 
        
        // Start game on Space, Enter, or moving if idle
        if (!isPlaying && !gameOver && (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
            setIsPlaying(true);
        }
    };
    const handleKeyUp = (e) => { gameState.current.keys[e.code] = false; };

    // Mobile specific pointer tracking
    const handlePointerMove = (e) => {
      if (!isPlaying || gameOver) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const scaleX = CANVAS_WIDTH / rect.width;
      const x = (clientX - rect.left) * scaleX;
      
      gameState.current.player.x = Math.max(0, Math.min(x - gameState.current.player.w / 2, CANVAS_WIDTH - gameState.current.player.w));
    };

    // Ignition switch for touch/mouse
    const handleStartClick = (e) => {
        if (e.target.closest('button') || e.target.closest('.interactive')) return;
        if (e.cancelable && e.type === 'touchstart') e.preventDefault();
        
        if (!isPlaying && !gameOver) {
            setIsPlaying(true);
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('touchmove', handlePointerMove, { passive: false });
      wrapper.addEventListener('mousemove', handlePointerMove);
      wrapper.addEventListener('mousedown', handleStartClick);
      wrapper.addEventListener('touchstart', handleStartClick, { passive: false });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (wrapper) {
        wrapper.removeEventListener('touchmove', handlePointerMove);
        wrapper.removeEventListener('mousemove', handlePointerMove);
        wrapper.removeEventListener('mousedown', handleStartClick);
        wrapper.removeEventListener('touchstart', handleStartClick);
      }
    };
  }, [isPlaying, gameOver]);

  // Core Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Reset State
    gameState.current.player = { x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2, y: CANVAS_HEIGHT - 120, w: PLAYER_SIZE, h: PLAYER_SIZE, vx: 0, chadTimer: 0, heavyTimer: 0 };
    gameState.current.items = [];
    gameState.current.particles = [];
    gameState.current.emojis = [];
    gameState.current.score = 0;
    gameState.current.difficultyMultiplier = 1;
    gameState.current.wind = 0;
    gameState.current.windTime = 0;

    gameState.current.lastTime = performance.now();
    let animationId;

    const loop = (time) => {
      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // Clear Screen
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (!isPlaying || gameOver) {
        drawScene(ctx, state);
        animationId = requestAnimationFrame(loop);
        return;
      }

      // --- LOGIC ---
      
      // 1. Difficulty & Wind Math
      state.difficultyMultiplier = 1 + (state.score / 50); // Scales up as score increases
      state.windTime += 0.01 * dt;
      // Sine wave wind, peaks at +/- 3 * difficulty
      state.wind = Math.sin(state.windTime) * (2 + state.difficultyMultiplier * 0.5);

      // 2. Player Movement (Keyboard fallback)
      let currentSpeed = BASE_SPEED;
      if (state.player.heavyTimer > 0) {
          currentSpeed *= 0.4; // 60% slow down
          state.player.heavyTimer -= dt;
      }
      
      let isChad = false;
      if (state.player.chadTimer > 0) {
          isChad = true;
          state.player.chadTimer -= dt;
          state.player.w = PLAYER_SIZE * 1.5; // Bigger hitbox
      } else {
          state.player.w = PLAYER_SIZE;
      }

      if (state.keys['ArrowLeft']) state.player.x -= currentSpeed * dt;
      if (state.keys['ArrowRight']) state.player.x += currentSpeed * dt;
      
      // Clamp player
      state.player.x = Math.max(0, Math.min(state.player.x, CANVAS_WIDTH - state.player.w));

      // 3. Spawning
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
          spawnItem(state);
          // Spawn rate increases with difficulty
          state.spawnTimer = Math.max(30, 100 - (state.difficultyMultiplier * 5)); 
      }

      // 4. Update Items & Collisions
      for (let i = state.items.length - 1; i >= 0; i--) {
          const item = state.items[i];
          
          // Terminal Velocity + Wind
          item.y += item.vy * dt;
          item.x += state.wind * dt;

          // Always Possible Rule: Clamp items to screen X
          item.x = Math.max(0, Math.min(item.x, CANVAS_WIDTH - item.w));

          // AABB Collision Detection
          const hit = (
              item.x < state.player.x + state.player.w &&
              item.x + item.w > state.player.x &&
              item.y < state.player.y + state.player.h &&
              item.y + item.h > state.player.y
          );

          if (hit) {
              handleCollision(state, item, isChad);
              state.items.splice(i, 1);
              continue;
          }

          // Missed Item Logic
          if (item.y > CANVAS_HEIGHT) {
              if (item.type === 'GEM' || item.type === 'ALPHA') {
                  spawnEmojis(state, item.x, CANVAS_HEIGHT - 50, '😢'); // Sad Pepe substitute
              }
              state.items.splice(i, 1);
          }
      }

      // Update Particles
      state.emojis.forEach((e) => {
        e.y += e.vy * dt;
        e.life -= dt;
        e.alpha -= 0.02;
      });
      state.emojis = state.emojis.filter(e => e.life > 0);

      drawScene(ctx, state);
      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, gameOver, resetKey]);

  // --- HELPERS ---
  const spawnItem = (state) => {
      const rand = Math.random();
      let type = 'GEM';
      let w = 40, h = 40;
      
      if (rand > 0.95) type = 'ALPHA';
      else if (rand > 0.80) type = 'FUD';
      else if (rand > 0.65) type = 'HEAVY';

      state.items.push({
          x: Math.random() * (CANVAS_WIDTH - w),
          y: -50,
          w, h,
          type,
          vy: BASE_FALL_SPEED * state.difficultyMultiplier * (Math.random() * 0.5 + 0.8) // Slight speed variance
      });
  };

  const handleCollision = (state, item, isChad) => {
      if (item.type === 'GEM') {
          state.score += isChad ? 2 : 1; 
          setScore(state.score);
          spawnEmojis(state, item.x, item.y, '💎');
      } 
      else if (item.type === 'ALPHA') {
          state.player.chadTimer = 300; // ~5 seconds at 60fps
          state.score += 5;
          setScore(state.score);
          spawnEmojis(state, state.player.x + state.player.w/2, state.player.y, '🔥');
      }
      else if (item.type === 'HEAVY') {
          state.player.heavyTimer = 180; // ~3 seconds
          spawnEmojis(state, item.x, item.y, '🗿');
      }
      else if (item.type === 'FUD') {
          if (isChad) {
              // GigaChad ignores FUD and destroys it
              spawnEmojis(state, item.x, item.y, '💥');
              state.score += 1;
              setScore(state.score);
          } else {
              triggerGameOver(state);
          }
      }
  };

  const spawnEmojis = (state, x, y, char) => {
      state.emojis.push({ x, y, vy: -2, char, life: 60, alpha: 1.0, size: 30 });
  };

  const triggerGameOver = async (state) => {
      setGameOver(true);
      if (username) {
        await supabase.from('leaderboards').insert([{
            game_id: 'bagsgrowth', 
            username, 
            score: state.score, 
            address: address
        }]);
      }
  };

  const drawScene = (ctx, state) => {
      // Draw Wind Indicator (Background effect)
      if (state.wind !== 0) {
          ctx.fillStyle = `rgba(255, 255, 255, 0.05)`;
          for(let i=0; i<5; i++) {
              ctx.fillRect((Date.now() / 10 * state.wind + i * 100) % CANVAS_WIDTH, i * 160, 50, 2);
          }
      }

      // Draw Items
      state.items.forEach(item => {
          let spriteKey = item.type.toLowerCase();
          const sprite = state.sprites[spriteKey];
          if (sprite) {
              ctx.drawImage(sprite, item.x, item.y, item.w, item.h);
          } else {
              // Fallbacks if images don't load
              ctx.fillStyle = item.type === 'FUD' ? 'red' : item.type === 'HEAVY' ? 'gray' : item.type === 'ALPHA' ? 'orange' : 'cyan';
              ctx.fillRect(item.x, item.y, item.w, item.h);
          }
      });

      // Draw Player
      const isChad = state.player.chadTimer > 0;
      const isHeavy = state.player.heavyTimer > 0;
      const heroSprite = state.sprites[isChad ? 'chad' : 'hero'];
      
      if (heroSprite) {
          ctx.globalAlpha = isHeavy ? 0.5 : 1.0; // Visual indicator for heavy penalty
          ctx.drawImage(heroSprite, state.player.x, state.player.y, state.player.w, state.player.h);
          ctx.globalAlpha = 1.0;
      } else {
          ctx.fillStyle = isChad ? 'gold' : '#00ff00';
          ctx.fillRect(state.player.x, state.player.y, state.player.w, state.player.h);
      }

      // Draw Emojis/Particles
      state.emojis.forEach((e) => {
          ctx.globalAlpha = Math.max(0, e.alpha);
          ctx.font = `${e.size}px serif`;
          ctx.textAlign = 'center';
          ctx.fillText(e.char, e.x, e.y);
          ctx.globalAlpha = 1.0;
      });
  };

  return (
    <div ref={containerRef} className="game-wrapper" tabIndex="0" style={{ position: 'relative', outline: 'none' }}>
        <GameUI 
            score={score} 
            gameOver={gameOver} 
            isPlaying={isPlaying} 
            onRestart={() => { 
                setGameOver(false); 
                setIsPlaying(true); 
                setScore(0); 
                setResetKey(prev => prev + 1); 
            }} 
            onExit={onExit} 
            gameId="bagsgrowth" 
        />
        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT} 
            style={{ width: '100%', maxWidth: '500px', height: 'auto', display: 'block' }} 
        />
        {!isPlaying && !gameOver && (
            <div style={{
                position: 'absolute', top: '35%', width: '100%', textAlign: 'center', 
                pointerEvents: 'none', color: 'lime', textShadow: '2px 2px #000',
                fontFamily: '"Press Start 2P"'
            }}>
                CATCH THE GEMS<br/><br/>
                AVOID THE FUD<br/><br/>
                WATCH THE WIND!<br/><br/><br/>
                <span className="pulse" style={{color: 'yellow', fontSize: '0.9rem'}}>TAP OR PRESS SPACE TO START</span>
            </div>
        )}
    </div>
  );
};

export default BagsGrowth;