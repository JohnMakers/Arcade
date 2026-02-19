import React, { useState, useEffect, useRef, useContext } from 'react';
import GameUI from './GameUI';
import { UserContext } from '../context/UserContext';
import { supabase } from '../lib/supabaseClient';
import { ASSETS } from '../config/AssetConfig';

const NormieInvaders = ({ onExit }) => {
  const { username } = useContext(UserContext);
  const canvasRef = useRef(null);
  
  // UI State
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [scoreUI, setScoreUI] = useState(0);

  // Mutable Game State (Kept in refs for the animation loop)
  const gameState = useRef({
    score: 0,
    wave: 1,
    isLooping: false,
    player: { x: 375, y: 530, width: 50, height: 50, speed: 5, dx: 0 },
    bullets: [],
    enemies: [],
    enemyBullets: [],
    enemyDirection: 1, // 1 for right, -1 for left
    enemySpeed: 1,
    enemyFireRate: 0.01, // Probability of FUD per frame
    lastShotFrame: 0,
    frameCount: 0
  });

  // Keys tracking
  const keys = useRef({ ArrowLeft: false, ArrowRight: false, a: false, d: false });

  // Initialize a wave
  const initWave = (waveNum) => {
    const rows = 3 + Math.floor(waveNum / 3); // More rows later on
    const cols = 8;
    const startY = 50 + (waveNum * 15); // Starts lower every wave
    let newEnemies = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newEnemies.push({
          x: c * 60 + 50,
          y: r * 50 + startY,
          width: 40,
          height: 40,
          isBoss: r === 0 && waveNum % 3 === 0 // Top row are bosses every 3rd wave
        });
      }
    }

    gameState.current.enemies = newEnemies;
    gameState.current.enemySpeed = 1 + (waveNum * 0.2);
    gameState.current.enemyFireRate = 0.01 + (waveNum * 0.005);
    // Player speeds up slightly to keep it "Always Possible"
    gameState.current.player.speed = 5 + (waveNum * 0.5); 
  };

  const startGame = () => {
    setGameOver(false);
    setIsPlaying(false);
    setScoreUI(0);
    
    gameState.current = {
      ...gameState.current,
      score: 0,
      wave: 1,
      bullets: [],
      enemyBullets: [],
      enemyDirection: 1,
      frameCount: 0,
      player: { ...gameState.current.player, x: 375 }
    };

    initWave(1);

    // Wait for the GameUI 3-second countdown
    setTimeout(() => {
      setIsPlaying(true);
      gameState.current.isLooping = true;
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

    // --- PLAYER MOVEMENT ---
    if (keys.current.ArrowLeft || keys.current.a) {
      state.player.x -= state.player.speed;
    }
    if (keys.current.ArrowRight || keys.current.d) {
      state.player.x += state.player.speed;
    }
    // Clamp to screen
    if (state.player.x < 0) state.player.x = 0;
    if (state.player.x + state.player.width > 800) state.player.x = 800 - state.player.width;

    // --- AUTO FIRE ALPHA BOLTS ---
    if (state.frameCount - state.lastShotFrame > 15) { // Shoot every 15 frames
      state.bullets.push({ x: state.player.x + state.player.width / 2 - 5, y: state.player.y, width: 10, height: 20, speed: 8 });
      state.lastShotFrame = state.frameCount;
    }

    // --- UPDATE BULLETS ---
    state.bullets.forEach(b => b.y -= b.speed);
    state.bullets = state.bullets.filter(b => b.y > 0);

    state.enemyBullets.forEach(eb => eb.y += eb.speed);
    state.enemyBullets = state.enemyBullets.filter(eb => eb.y < 600);

    // --- UPDATE ENEMIES ---
    let hitWall = false;
    state.enemies.forEach(enemy => {
      enemy.x += state.enemySpeed * state.enemyDirection;
      if (enemy.x <= 0 || enemy.x + enemy.width >= 800) hitWall = true;
      
      // Randomly fire FUD
      if (Math.random() < state.enemyFireRate) {
        state.enemyBullets.push({ x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height, width: 8, height: 16, speed: 4 + (state.wave * 0.5) });
      }
    });

    if (hitWall) {
      state.enemyDirection *= -1;
      state.enemies.forEach(enemy => enemy.y += 20); // Move down
    }

    // --- COLLISIONS ---
    // 1. Alpha Bolts hitting Normies
    state.bullets.forEach((b, bIdx) => {
      state.enemies.forEach((e, eIdx) => {
        if (b.x < e.x + e.width && b.x + b.width > e.x && b.y < e.y + e.height && b.y + b.height > e.y) {
          // Play REEE sound logic here if you add it to SOUNDS config
          state.score += e.isBoss ? 50 : 10;
          setScoreUI(state.score);
          state.enemies.splice(eIdx, 1);
          state.bullets.splice(bIdx, 1);
        }
      });
    });

    // 2. FUD hitting Player
    state.enemyBullets.forEach(eb => {
      const p = state.player;
      if (eb.x < p.x + p.width && eb.x + eb.width > p.x && eb.y < p.y + p.height && eb.y + eb.height > p.y) {
        triggerGameOver();
      }
    });

    // 3. Normies reaching the Base
    state.enemies.forEach(e => {
      if (e.y + e.height >= state.player.y) {
        triggerGameOver();
      }
    });

    // --- WAVE PROGRESSION ---
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

    // Clear Screen
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 800, 600);

    // Draw Player
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
    // Note: Swap fillRect with ctx.drawImage once your ASSETS are loaded into HTML Image objects

    // Draw Alpha Bolts
    ctx.fillStyle = '#00ffff';
    state.bullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));

    // Draw FUD Bullets
    ctx.fillStyle = '#ff0000';
    state.enemyBullets.forEach(eb => ctx.fillRect(eb.x, eb.y, eb.width, eb.height));

    // Draw Normies
    state.enemies.forEach(e => {
      ctx.fillStyle = e.isBoss ? '#ff00ff' : '#aaaaaa';
      ctx.fillRect(e.x, e.y, e.width, e.height);
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => { if (keys.current.hasOwnProperty(e.key)) keys.current[e.key] = true; };
    const handleKeyUp = (e) => { if (keys.current.hasOwnProperty(e.key)) keys.current[e.key] = false; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    startGame();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      gameState.current.isLooping = false; // Cleanup loop on unmount
    };
  }, []);

  return (
    <div className="game-wrapper" style={{ position: 'relative', width: 800, height: 600, margin: '0 auto' }}>
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={600} 
        style={{ border: '4px solid #333', borderRadius: '8px', background: '#000' }}
      />
      
      <GameUI 
        score={scoreUI} 
        gameOver={gameOver} 
        isPlaying={isPlaying} 
        onRestart={startGame} 
        onExit={onExit} 
        gameId="normies" 
      />
    </div>
  );
};

export default NormieInvaders;