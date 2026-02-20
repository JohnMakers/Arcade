import React, { useState, useEffect, useRef, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const NormieInvaders = ({ onExit }) => {
  const { username } = useContext(UserContext);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // UI State
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [scoreUI, setScoreUI] = useState(0);

  // Mutable Game State 
  const gameState = useRef({
    score: 0,
    wave: 1,
    stage: 1,
    isLooping: false,
    player: { x: 375, y: 530, width: 50, height: 50, speed: 5 },
    bullets: [],
    enemies: [],
    enemyBullets: [],
    enemyDirection: 1, 
    enemySpeed: 1,
    enemyFireRate: 0.0005, 
    maxEnemyBullets: 3,    
    lastShotFrame: 0,
    frameCount: 0,
    sprites: {} // <-- New: Object to hold loaded image assets
  });

  const keys = useRef({ ArrowLeft: false, ArrowRight: false, a: false, d: false });

  // --- PRELOAD ASSETS ---
  useEffect(() => {
    const load = (key, src) => {
      if (!src) return; // Skip if URL isn't defined yet
      const img = new Image();
      img.src = src;
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        gameState.current.sprites[key] = img;
      };
    };
    
    load('bg', ASSETS.INVADER_BG);
    load('pepe', ASSETS.INVADER_PEPE);
    load('normie', ASSETS.INVADER_NORMIE);
    load('boss', ASSETS.INVADER_BOSS);
    load('bolt', ASSETS.INVADER_BOLT);
    load('fud', ASSETS.INVADER_FUD);
  }, []);

  const initWave = (waveNum) => {
    const stage = Math.ceil(waveNum / 3);
    const cols = Math.min(5 + Math.floor(waveNum / 2), 11); 
    const rows = Math.min(3 + Math.floor(waveNum / 3), 6);  
    
    const spacingX = 55;
    const startX = (800 - (cols * spacingX)) / 2;
    const startY = 50 + (stage * 10); 

    let newEnemies = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newEnemies.push({
          x: c * spacingX + startX,
          y: r * 45 + startY,
          width: 35,
          height: 35,
          isBoss: r === 0 && waveNum >= 3 
        });
      }
    }

    gameState.current.stage = stage;
    gameState.current.enemies = newEnemies;
    gameState.current.enemySpeed = 0.8 + (waveNum * 0.15);
    gameState.current.enemyFireRate = 0.0005 + (waveNum * 0.0002); 
    gameState.current.maxEnemyBullets = 2 + Math.floor(waveNum * 0.8); 
    gameState.current.player.speed = 5 + (waveNum * 0.2); 
  };

  const startGame = () => {
    setGameOver(false);
    setIsPlaying(false);
    setScoreUI(0);
    
    gameState.current = {
      ...gameState.current,
      score: 0,
      wave: 1,
      stage: 1,
      bullets: [],
      enemyBullets: [],
      enemyDirection: 1,
      frameCount: 0,
      lastShotFrame: 0, 
      player: { ...gameState.current.player, x: 375 }
    };

    initWave(1);

    setTimeout(() => {
      setIsPlaying(true);
      gameState.current.isLooping = true;
      if (containerRef.current) containerRef.current.focus();
      requestAnimationFrame(gameLoop);
    }, 3000);
  };

  const submitScore = async (finalScore) => {
    if (!username) return;
    try {
      await supabase.from('leaderboards').insert([
        { username, game_id: 'normies', score: finalScore }
      ]);
    } catch (err) {
      console.error("Error saving score:", err);
    }
  };

  const triggerGameOver = () => {
    gameState.current.isLooping = false;
    setGameOver(true);
    setIsPlaying(false);
    submitScore(gameState.current.score);
  };

  const gameLoop = () => {
    if (!gameState.current.isLooping) return;
    const state = gameState.current;
    state.frameCount++;

    if (keys.current.ArrowLeft || keys.current.a) state.player.x -= state.player.speed;
    if (keys.current.ArrowRight || keys.current.d) state.player.x += state.player.speed;
    
    if (state.player.x < 0) state.player.x = 0;
    if (state.player.x + state.player.width > 800) state.player.x = 800 - state.player.width;

    if (state.frameCount - state.lastShotFrame > 15) { 
      state.bullets.push({ x: state.player.x + state.player.width / 2 - 5, y: state.player.y, width: 10, height: 20, speed: 8 });
      state.lastShotFrame = state.frameCount;
    }

    state.bullets.forEach(b => b.y -= b.speed);
    state.bullets = state.bullets.filter(b => b.y > 0);

    state.enemyBullets.forEach(eb => eb.y += eb.speed);
    state.enemyBullets = state.enemyBullets.filter(eb => eb.y < 600);

    let hitWall = false;
    state.enemies.forEach(enemy => {
      enemy.x += state.enemySpeed * state.enemyDirection;
      if (enemy.x <= 0 || enemy.x + enemy.width >= 800) hitWall = true;
      
      if (Math.random() < state.enemyFireRate && state.enemyBullets.length < state.maxEnemyBullets) {
        state.enemyBullets.push({ 
          x: enemy.x + enemy.width / 2 - 4, 
          y: enemy.y + enemy.height, 
          width: 8, 
          height: 16, 
          speed: 3 + (state.wave * 0.3) 
        });
      }
    });

    if (hitWall) {
      state.enemyDirection *= -1;
      state.enemies.forEach(enemy => enemy.y += 20); 
    }

    state.bullets.forEach((b, bIdx) => {
      state.enemies.forEach((e, eIdx) => {
        if (b.x < e.x + e.width && b.x + b.width > e.x && b.y < e.y + e.height && b.y + b.height > e.y) {
          state.score += e.isBoss ? 50 : 10;
          setScoreUI(state.score);
          state.enemies.splice(eIdx, 1);
          state.bullets.splice(bIdx, 1);
        }
      });
    });

    state.enemyBullets.forEach(eb => {
      const p = state.player;
      if (eb.x < p.x + p.width && eb.x + eb.width > p.x && eb.y < p.y + p.height && eb.y + eb.height > p.y) {
        triggerGameOver();
      }
    });

    state.enemies.forEach(e => {
      if (e.y + e.height >= state.player.y) triggerGameOver();
    });

    if (state.enemies.length === 0) {
      state.wave++;
      initWave(state.wave);
    }

    draw();

    if (state.isLooping) {
      requestAnimationFrame(gameLoop);
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const state = gameState.current;
    const sprites = state.sprites;

    // --- DRAW BACKGROUND ---
    if (sprites['bg']) {
      ctx.drawImage(sprites['bg'], 0, 0, 800, 600);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 800, 600);
    }

    // Stage/Wave text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // Made slightly more transparent to blend with BG
    ctx.font = 'bold 80px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`STAGE ${state.stage}`, 400, 300);
    ctx.font = 'bold 30px monospace';
    ctx.fillText(`WAVE ${state.wave}`, 400, 350);

    // --- DRAW PLAYER ---
    if (sprites['pepe']) {
      ctx.drawImage(sprites['pepe'], state.player.x, state.player.y, state.player.width, state.player.height);
    } else {
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
    }

    // --- DRAW PLAYER BULLETS ---
    state.bullets.forEach(b => {
      if (sprites['bolt']) {
        ctx.drawImage(sprites['bolt'], b.x, b.y, b.width, b.height);
      } else {
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(b.x, b.y, b.width, b.height);
      }
    });

    // --- DRAW ENEMY BULLETS ---
    state.enemyBullets.forEach(eb => {
      if (sprites['fud']) {
        ctx.drawImage(sprites['fud'], eb.x, eb.y, eb.width, eb.height);
      } else {
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(eb.x, eb.y, eb.width, eb.height);
      }
    });

    // --- DRAW ENEMIES ---
    state.enemies.forEach(e => {
      const spriteKey = e.isBoss ? 'boss' : 'normie';
      if (sprites[spriteKey]) {
        ctx.drawImage(sprites[spriteKey], e.x, e.y, e.width, e.height);
      } else {
        ctx.fillStyle = e.isBoss ? '#ff00ff' : '#aaaaaa';
        ctx.fillRect(e.x, e.y, e.width, e.height);
      }
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target && e.target.closest('button')) return;
      if(["ArrowLeft","ArrowRight","a","d"].includes(e.key)) e.preventDefault();
      if (keys.current.hasOwnProperty(e.key)) keys.current[e.key] = true; 
    };
    const handleKeyUp = (e) => { 
      if (keys.current.hasOwnProperty(e.key)) keys.current[e.key] = false; 
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp);

    startGame();

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp);
      gameState.current.isLooping = false; 
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="game-wrapper" 
      tabIndex="0" 
      style={{ position: 'relative', width: 800, height: 600, margin: '0 auto', outline: '4px solid #00ff00' }}
      onClick={() => containerRef.current && containerRef.current.focus()}
    >
      <GameUI 
        score={scoreUI} 
        gameOver={gameOver} 
        isPlaying={isPlaying} 
        onRestart={startGame} 
        onExit={onExit} 
        gameId="normies" 
      />
      <canvas ref={canvasRef} width={800} height={600} />
    </div>
  );
};

export default NormieInvaders;