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
    enemyFireRate: 0.0005, // Drastically reduced base fire rate
    maxEnemyBullets: 3,    // Cap the number of bullets to ensure it's always dodgeable
    lastShotFrame: 0,
    frameCount: 0
  });

  const keys = useRef({ ArrowLeft: false, ArrowRight: false, a: false, d: false });

  const initWave = (waveNum) => {
    // Stage logic: Stages level up every 3 waves
    const stage = Math.ceil(waveNum / 3);
    
    // Scale enemies slowly based on wave
    const cols = Math.min(5 + Math.floor(waveNum / 2), 11); // Max 11 columns
    const rows = Math.min(3 + Math.floor(waveNum / 3), 6);  // Max 6 rows
    
    // Center the enemies on screen based on how many columns there are
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
          isBoss: r === 0 && waveNum >= 3 // Bosses appear from wave 3 onwards
        });
      }
    }

    gameState.current.stage = stage;
    gameState.current.enemies = newEnemies;
    
    // Slow, infinite scaling
    gameState.current.enemySpeed = 0.8 + (waveNum * 0.15);
    gameState.current.enemyFireRate = 0.0005 + (waveNum * 0.0002); // Much gentler increase
    gameState.current.maxEnemyBullets = 2 + Math.floor(waveNum * 0.8); // Always leaves gaps to dodge
    
    // Player speeds up slightly to match the pace, staying "always possible"
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
      lastShotFrame: 0, // <-- THE BUG FIX: Reset the shot timer on restart
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

    // Player Movement
    if (keys.current.ArrowLeft || keys.current.a) state.player.x -= state.player.speed;
    if (keys.current.ArrowRight || keys.current.d) state.player.x += state.player.speed;
    
    if (state.player.x < 0) state.player.x = 0;
    if (state.player.x + state.player.width > 800) state.player.x = 800 - state.player.width;

    // Auto Fire
    if (state.frameCount - state.lastShotFrame > 15) { 
      state.bullets.push({ x: state.player.x + state.player.width / 2 - 5, y: state.player.y, width: 10, height: 20, speed: 8 });
      state.lastShotFrame = state.frameCount;
    }

    // Update Bullets
    state.bullets.forEach(b => b.y -= b.speed);
    state.bullets = state.bullets.filter(b => b.y > 0);

    state.enemyBullets.forEach(eb => eb.y += eb.speed);
    state.enemyBullets = state.enemyBullets.filter(eb => eb.y < 600);

    // Update Enemies
    let hitWall = false;
    state.enemies.forEach(enemy => {
      enemy.x += state.enemySpeed * state.enemyDirection;
      if (enemy.x <= 0 || enemy.x + enemy.width >= 800) hitWall = true;
      
      // Enemy Fire Logic (with limits)
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

    // Collisions: Player Bullets -> Enemies
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

    // Collisions: Enemy Bullets -> Player
    state.enemyBullets.forEach(eb => {
      const p = state.player;
      if (eb.x < p.x + p.width && eb.x + eb.width > p.x && eb.y < p.y + p.height && eb.y + eb.height > p.y) {
        triggerGameOver();
      }
    });

    // Enemies reaching the bottom
    state.enemies.forEach(e => {
      if (e.y + e.height >= state.player.y) triggerGameOver();
    });

    // Next Wave Trigger
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

    // Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 800, 600);

    // Stage/Wave text in background
    ctx.fillStyle = '#222';
    ctx.font = 'bold 80px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`STAGE ${state.stage}`, 400, 300);
    ctx.font = 'bold 30px monospace';
    ctx.fillText(`WAVE ${state.wave}`, 400, 350);

    // Player
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);

    // Player Bullets
    ctx.fillStyle = '#00ffff';
    state.bullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));

    // Enemy Bullets
    ctx.fillStyle = '#ff0000';
    state.enemyBullets.forEach(eb => ctx.fillRect(eb.x, eb.y, eb.width, eb.height));

    // Enemies
    state.enemies.forEach(e => {
      ctx.fillStyle = e.isBoss ? '#ff00ff' : '#aaaaaa';
      ctx.fillRect(e.x, e.y, e.width, e.height);
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