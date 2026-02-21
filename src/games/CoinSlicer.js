import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const CoinSlicer = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [canStart, setCanStart] = useState(false);

  const CANVAS_WIDTH = window.innerWidth > 800 ? 800 : window.innerWidth;
  const CANVAS_HEIGHT = 800;

  const gameState = useRef({
    items: [],
    particles: [],
    blade: [],
    isSlicing: false,
    score: 0,
    lives: 3,
    multiplier: 1,
    multiplierTimer: 0,
    sprites: {},
    lastTime: 0,
    timeSinceLastSpawn: 0,
    spawnRate: 1000,
    gravity: 0.4,
    lastSpawnX: CANVAS_WIDTH / 2
  });

  useEffect(() => {
    if (!isPlaying && !gameOver) {
      setCanStart(false);
      const timer = setTimeout(() => setCanStart(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, gameOver]);

  useEffect(() => {
    const loadSprite = (key, src) => {
      const img = new Image();
      img.src = src;
      img.crossOrigin = "Anonymous";
      img.onload = () => { gameState.current.sprites[key] = img; };
    };

    loadSprite('bg', ASSETS.CS_BG);
    loadSprite('btc', ASSETS.CS_BTC);
    loadSprite('eth', ASSETS.CS_ETH);
    loadSprite('sol', ASSETS.CS_SOL);
    loadSprite('bomb', ASSETS.CS_BOMB);
    loadSprite('pepe', ASSETS.CS_PEPE);
  }, []);

  const distToSegmentSquared = (p, v, w) => {
    let l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
        y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT
      };
    };

    const handleStart = (e) => {
      e.preventDefault();
      if (!isPlaying && !gameOver) {
        if (!canStart) return; 
        
        setIsPlaying(true);
        spawnItem(gameState.current);
        spawnItem(gameState.current); 
        gameState.current.timeSinceLastSpawn = 0;
      }
      gameState.current.isSlicing = true;
      gameState.current.blade = [getPos(e)];
    };

    const handleMove = (e) => {
      e.preventDefault();
      if (!gameState.current.isSlicing) return;
      const pos = getPos(e);
      gameState.current.blade.push(pos);
      if (gameState.current.blade.length > 10) gameState.current.blade.shift();
    };

    const handleEnd = (e) => {
      e.preventDefault();
      gameState.current.isSlicing = false;
      gameState.current.blade = [];
    };

    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    
    canvas.addEventListener('touchstart', handleStart, { passive: false });
    canvas.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', handleStart);
      canvas.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      canvas.removeEventListener('touchstart', handleStart);
      canvas.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isPlaying, gameOver, CANVAS_WIDTH, canStart]); 

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animationId;
    gameState.current.lastTime = performance.now();

    const loop = (time) => {
      const state = gameState.current;
      
      // Calculate delta time (dtMs) and normalize it to a 60FPS baseline (timeScale)
      const dtMs = time - state.lastTime > 0 ? Math.min((time - state.lastTime), 50) : 16.667; 
      state.lastTime = time;
      const timeScale = dtMs / 16.667;

      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      if (state.sprites['bg']) {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(state.sprites['bg'], 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.globalAlpha = 1.0;
      }

      if (isPlaying && !gameOver) {
        state.gravity = 0.4 + (state.score * 0.015);
        state.spawnRate = Math.max(300, 1000 - (state.score * 25));

        if (state.multiplierTimer > 0) {
          state.multiplierTimer -= dtMs;
          if (state.multiplierTimer <= 0) state.multiplier = 1;
        }

        state.timeSinceLastSpawn += dtMs;
        if (state.timeSinceLastSpawn > state.spawnRate) {
          state.timeSinceLastSpawn = 0;
          spawnItem(state);
        }

        checkSlices(state);

        if (state.lives <= 0 && !gameOver) {
          triggerGameOver(state);
        }
      }

      // Pass timeScale down to the render functions so physics stay consistent regardless of frame rate
      updateAndDrawItems(ctx, state, isPlaying, gameOver, timeScale);
      updateAndDrawParticles(ctx, state, dtMs, isPlaying, gameOver, timeScale);
      drawBlade(ctx, state);

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, gameOver, resetKey, CANVAS_WIDTH]);

  const spawnItem = (state) => {
    const isBomb = Math.random() < Math.min(0.5, 0.15 + (state.score * 0.01));
    const isRarePepe = !isBomb && Math.random() < 0.05;
    
    const types = ['btc', 'eth', 'sol'];
    const type = isBomb ? 'bomb' : isRarePepe ? 'pepe' : types[Math.floor(Math.random() * types.length)];
    
    let x;
    do {
      x = 50 + Math.random() * (CANVAS_WIDTH - 100);
    } while (Math.abs(x - state.lastSpawnX) < 100);
    state.lastSpawnX = x;

    const centerOffset = (CANVAS_WIDTH / 2) - x;
    const arcVelocity = (centerOffset / CANVAS_WIDTH) * 12; 

    state.items.push({
      x: x,
      y: CANVAS_HEIGHT + 50,
      vx: arcVelocity + (Math.random() - 0.5) * 4, 
      vy: -16 - Math.random() * 7, 
      radius: 40,
      type: type,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 0.3
    });
  };

  const updateAndDrawItems = (ctx, state, isPlaying, gameOver, timeScale) => {
    for (let i = state.items.length - 1; i >= 0; i--) {
      let item = state.items[i];
      
      if (isPlaying && !gameOver) {
        // Multiply by timeScale to normalize movement across different monitor refresh rates
        item.x += item.vx * timeScale;
        item.vy += state.gravity * timeScale;
        item.y += item.vy * timeScale;
        item.rotation += item.rotSpeed * timeScale;
      }

      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);
      const sprite = state.sprites[item.type];
      if (sprite) {
        ctx.drawImage(sprite, -item.radius, -item.radius, item.radius * 2, item.radius * 2);
      } else {
        ctx.fillStyle = item.type === 'bomb' ? 'red' : 'gold';
        ctx.beginPath();
        ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (isPlaying && !gameOver && item.y > CANVAS_HEIGHT + 100 && item.vy > 0) {
        if (item.type !== 'bomb' && item.type !== 'pepe') {
          state.lives -= 1;
          setLives(state.lives);
        }
        state.items.splice(i, 1);
      }
    }
  };

  const updateAndDrawParticles = (ctx, state, dtMs, isPlaying, gameOver, timeScale) => {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      let p = state.particles[i];
      
      if (isPlaying && !gameOver) {
        // Normalize particle physics too
        p.x += p.vx * timeScale;
        p.y += p.vy * timeScale;
        p.vy += 0.3 * timeScale; 
        p.life -= dtMs; // Timer naturally uses raw ms
      }

      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      if (p.life <= 0) state.particles.splice(i, 1);
    }
  };

  const checkSlices = (state) => {
    if (state.blade.length < 2) return;
    const p1 = state.blade[state.blade.length - 1];
    const p2 = state.blade[state.blade.length - 2];

    for (let i = state.items.length - 1; i >= 0; i--) {
      let item = state.items[i];
      const distSq = distToSegmentSquared({x: item.x, y: item.y}, p1, p2);
      
      if (distSq < item.radius * item.radius) {
        handleSlice(state, item, i);
      }
    }
  };

  const handleSlice = (state, item, index) => {
    state.items.splice(index, 1);

    if (item.type === 'bomb') {
      triggerGameOver(state);
      return;
    }

    if (item.type === 'pepe') {
      state.multiplier = 2;
      state.multiplierTimer = 5000; 
      state.score += 5; 
      spawnSplatter(state, item.x, item.y, '#00ff00', 50); 
    } else {
      spawnSplatter(state, item.x, item.y, '#ffd700', 20); 
      state.score += 1 * state.multiplier;
    }
    setScore(state.score);
  };

  const spawnSplatter = (state, x, y, color, count) => {
    for(let i=0; i<count; i++) {
      state.particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        life: 500 + Math.random() * 500,
        maxLife: 1000,
        size: 3 + Math.random() * 6,
        color: color
      });
    }
  };

  const drawBlade = (ctx, state) => {
    if (state.blade.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(state.blade[0].x, state.blade[0].y);
    for (let i = 1; i < state.blade.length; i++) {
      ctx.lineTo(state.blade[i].x, state.blade[i].y);
    }
    
    ctx.strokeStyle = state.multiplier > 1 ? '#00ff00' : '#ffffff';
    ctx.lineWidth = state.multiplier > 1 ? 10 : 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 15;
    ctx.shadowColor = state.multiplier > 1 ? '#00ff00' : '#00ffff';
    ctx.stroke();
    ctx.shadowBlur = 0; 
  };

  const triggerGameOver = async (state) => {
    setGameOver(true);
    setIsPlaying(false);
    
    if (username) {
      await supabase.from('leaderboards').insert([{
        game_id: 'coinslicer', 
        username, 
        score: state.score, 
        address: address
      }]);
    }
  };

  const resetGame = () => {
    setGameOver(false); 
    setIsPlaying(true); 
    setScore(0); 
    setLives(3);
    gameState.current.score = 0;
    gameState.current.lives = 3;
    gameState.current.items = [];
    gameState.current.particles = [];
    gameState.current.multiplier = 1;
    gameState.current.gravity = 0.4; 
    setResetKey(prev => prev + 1); 
  };

  return (
    <div ref={containerRef} className="game-wrapper" tabIndex="0" style={{ position: 'relative', outline: 'none' }}>
        <GameUI 
            score={score} 
            gameOver={gameOver} 
            isPlaying={isPlaying} 
            onRestart={resetGame} 
            onExit={onExit} 
            gameId="coinslicer" 
        />
        
        {isPlaying && !gameOver && (
          <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, textAlign: 'right' }}>
            <div style={{ color: 'red', fontSize: '1.5rem', textShadow: '2px 2px #000' }}>
              {'❤️'.repeat(lives)}
            </div>
            {gameState.current.multiplier > 1 && (
              <div style={{ color: '#00ff00', fontSize: '1.2rem', marginTop: 10, animation: 'pulse 0.5s infinite alternate' }}>
                2X MULTIPLIER!
              </div>
            )}
          </div>
        )}

        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT} 
            style={{ width: '100%', maxWidth: `${CANVAS_WIDTH}px`, height: 'auto', display: 'block', cursor: 'crosshair', touchAction: 'none' }} 
        />
        
        {!isPlaying && !gameOver && canStart && (
            <div style={{
                position: 'absolute', top: '40%', width: '100%', textAlign: 'center', 
                pointerEvents: 'none', color: '#00ffff', textShadow: '2px 2px #000',
                fontFamily: '"Press Start 2P"'
            }}>
                SWIPE TO PURGE<br/><br/>
                DODGE RUG PULLS
            </div>
        )}
    </div>
  );
};

export default CoinSlicer;