import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const PepeRunner = ({ onExit }) => {
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
  const LANES = [80, 250, 420]; // X-coordinates for Left, Center, Right lanes
  const HERO_SIZE = 60;
  const OBSTACLE_SIZE = 60;
  const INITIAL_SPEED = 6;
  const MAX_SPEED = 20;
  const MOON_METER_MAX = 10;

  const gameState = useRef({
    playerLane: 1, // 0: Left, 1: Center, 2: Right
    playerX: LANES[1], // Actual X for smooth interpolation
    speed: INITIAL_SPEED,
    score: 0,
    moonMeter: 0,
    isMoonMode: false,
    moonTimer: 0,
    entities: [], // Obstacles and coins
    particles: [],
    sprites: {},
    lastTime: 0,
    distanceTraveled: 0,
    nextSpawnDist: 300,
  });

  // --- ASSET LOADING ---
  useEffect(() => {
    const loadSprite = (key, src) => {
      const img = new Image();
      img.src = src;
      img.crossOrigin = "Anonymous";
      img.onload = () => { gameState.current.sprites[key] = img; };
    };

    // Preload placeholders/assets
    loadSprite('hero', ASSETS.RUNNER_HERO || 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/SNice.svg/120px-SNice.svg.png');
    loadSprite('sec', ASSETS.RUNNER_SEC || 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Red_x.svg/120px-Red_x.svg.png');
    loadSprite('candle', ASSETS.RUNNER_CANDLE || 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Error.svg/120px-Error.svg.png');
    loadSprite('coin', ASSETS.RUNNER_COIN || 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Ethereum-icon-purple.svg/120px-Ethereum-icon-purple.svg.png');
  }, []);

  // --- INPUT HANDLING (Swipe & Keyboard) ---
  useEffect(() => {
    let touchStartX = 0;

    const movePlayer = (direction) => {
      if (!isPlaying || gameOver) return;
      const state = gameState.current;
      if (direction === 'left' && state.playerLane > 0) state.playerLane -= 1;
      if (direction === 'right' && state.playerLane < 2) state.playerLane += 1;
    };

    const handleKeyDown = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') movePlayer('left');
      if (e.code === 'ArrowRight' || e.code === 'KeyD') movePlayer('right');
    };

    const handleTouchStart = (e) => { touchStartX = e.changedTouches[0].screenX; };
    const handleTouchEnd = (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      if (touchEndX < touchStartX - 40) movePlayer('left');
      if (touchEndX > touchStartX + 40) movePlayer('right');
    };

    // Mouse click support for lanes
    const handleMouseClick = (e) => {
      if (!isPlaying || gameOver) return;
      const wrapper = containerRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = clickX / rect.width;
      
      if (ratio < 0.33) gameState.current.playerLane = 0;
      else if (ratio > 0.66) gameState.current.playerLane = 2;
      else gameState.current.playerLane = 1;
    };

    window.addEventListener('keydown', handleKeyDown);
    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('touchstart', handleTouchStart, { passive: true });
      wrapper.addEventListener('touchend', handleTouchEnd);
      wrapper.addEventListener('click', handleMouseClick);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (wrapper) {
        wrapper.removeEventListener('touchstart', handleTouchStart);
        wrapper.removeEventListener('touchend', handleTouchEnd);
        wrapper.removeEventListener('click', handleMouseClick);
      }
    };
  }, [isPlaying, gameOver]);

  // --- CORE GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Reset state
    gameState.current = {
      ...gameState.current,
      playerLane: 1, playerX: LANES[1], speed: INITIAL_SPEED,
      score: 0, moonMeter: 0, isMoonMode: false, moonTimer: 0,
      entities: [], particles: [], distanceTraveled: 0, nextSpawnDist: 300
    };
    gameState.current.lastTime = performance.now();
    let animationId;

    const loop = (time) => {
      if (!isPlaying || gameOver) {
        animationId = requestAnimationFrame(loop);
        return;
      }

      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // 1. Update Engine
      state.distanceTraveled += state.speed * dt;
      if (state.score > 0 && state.score % 1000 === 0) {
        state.speed = Math.min(state.speed + 0.5, MAX_SPEED);
      }

      // Smooth Lane Interpolation
      const targetX = LANES[state.playerLane];
      state.playerX += (targetX - state.playerX) * 0.3 * dt;

      // Spawner Logic (The "Always Possible" Rule)
      if (state.distanceTraveled > state.nextSpawnDist) {
        spawnRow(state);
        // Decrease gap as speed increases to raise difficulty
        const gap = Math.max(250, 450 - (state.speed * 10)); 
        state.nextSpawnDist = state.distanceTraveled + gap;
      }

      // Moon Mode Logic
      if (state.isMoonMode) {
        state.moonTimer -= dt;
        if (state.moonTimer <= 0) {
          state.isMoonMode = false;
          state.moonMeter = 0;
        }
      }

      // 2. Clear & Draw Background
      ctx.fillStyle = state.isMoonMode ? '#1a0033' : '#0a192f';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Chart Lines (Lanes)
      ctx.strokeStyle = state.isMoonMode ? '#ff00ff' : '#00ff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([20, 20]);
      LANES.forEach(x => {
        ctx.beginPath();
        // Offset dash to create moving effect
        ctx.lineDashOffset = -(state.distanceTraveled % 40);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // 3. Update & Draw Entities
      const playerRect = { x: state.playerX - HERO_SIZE/2, y: CANVAS_HEIGHT - 150, w: HERO_SIZE, h: HERO_SIZE };

      for (let i = state.entities.length - 1; i >= 0; i--) {
        const ent = state.entities[i];
        ent.y += state.speed * dt;

        // Collision Check
        if (
          !ent.collected &&
          playerRect.x < ent.x + OBSTACLE_SIZE/2 &&
          playerRect.x + playerRect.w > ent.x - OBSTACLE_SIZE/2 &&
          playerRect.y < ent.y + OBSTACLE_SIZE/2 &&
          playerRect.y + playerRect.h > ent.y - OBSTACLE_SIZE/2
        ) {
          if (ent.type === 'coin') {
            ent.collected = true;
            state.score += 100;
            if (!state.isMoonMode) {
              state.moonMeter += 1;
              if (state.moonMeter >= MOON_METER_MAX) activateMoonMode(state);
            }
            createParticles(state, ent.x, ent.y, '#00ff00');
          } else if (ent.type === 'obstacle' && !state.isMoonMode) {
            triggerGameOver(state);
          } else if (ent.type === 'obstacle' && state.isMoonMode) {
             // Destroy obstacle in moon mode
             ent.collected = true;
             state.score += 50;
             createParticles(state, ent.x, ent.y, '#ff00ff');
          }
        }

        if (ent.y > CANVAS_HEIGHT || ent.collected) {
          state.entities.splice(i, 1);
          if(!ent.collected && ent.type === 'obstacle') {
            state.score += 10; // Point for surviving
          }
        } else {
          // Draw Entity
          const sprite = state.sprites[ent.spriteKey];
          if (sprite) {
            ctx.drawImage(sprite, ent.x - OBSTACLE_SIZE/2, ent.y - OBSTACLE_SIZE/2, OBSTACLE_SIZE, OBSTACLE_SIZE);
          } else {
            ctx.fillStyle = ent.type === 'coin' ? 'gold' : 'red';
            ctx.beginPath();
            ctx.arc(ent.x, ent.y, OBSTACLE_SIZE/2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Update & Draw Particles
      state.particles.forEach((p, idx) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        ctx.globalAlpha = Math.max(0, p.life / 30);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.globalAlpha = 1.0;
        if (p.life <= 0) state.particles.splice(idx, 1);
      });

      // 4. Draw Player
      const heroSprite = state.sprites['hero'];
      ctx.save();
      ctx.translate(state.playerX, CANVAS_HEIGHT - 150);
      
      // Rocket wobble effect
      if (isPlaying && !gameOver) {
          ctx.rotate(Math.sin(time / 100) * 0.05);
      }

      if (heroSprite) {
        ctx.drawImage(heroSprite, -HERO_SIZE/2, -HERO_SIZE/2, HERO_SIZE, HERO_SIZE);
      } else {
        ctx.fillStyle = state.isMoonMode ? 'cyan' : '#00ff00';
        ctx.fillRect(-HERO_SIZE/2, -HERO_SIZE/2, HERO_SIZE, HERO_SIZE);
      }
      
      // Draw engine thrust
      if (isPlaying && !gameOver) {
          ctx.fillStyle = state.isMoonMode ? '#ff00ff' : 'orange';
          ctx.beginPath();
          ctx.moveTo(-15, HERO_SIZE/2);
          ctx.lineTo(15, HERO_SIZE/2);
          ctx.lineTo(0, HERO_SIZE/2 + 20 + Math.random() * 20);
          ctx.fill();
      }
      ctx.restore();

      // 5. Draw Moon Meter UI
      ctx.fillStyle = '#333';
      ctx.fillRect(20, 20, 200, 20);
      ctx.fillStyle = state.isMoonMode ? '#ff00ff' : '#00ff00';
      const meterWidth = state.isMoonMode ? 200 : (state.moonMeter / MOON_METER_MAX) * 200;
      ctx.fillRect(20, 20, meterWidth, 20);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(20, 20, 200, 20);
      
      ctx.fillStyle = '#fff';
      ctx.font = '10px "Press Start 2P"';
      ctx.fillText(state.isMoonMode ? 'MOON MODE ACTIVE' : 'MOON METER', 25, 15);

      if (state.score % 5 === 0) setScore(state.score); // Throttle React state updates

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, gameOver, resetKey]);


  // --- HELPERS ---
  const spawnRow = (state) => {
    // Guaranteed passable patterns (1 = Obstacle, 0 = Safe)
    const patterns = [
      [1, 0, 0], [0, 1, 0], [0, 0, 1], 
      [1, 1, 0], [1, 0, 1], [0, 1, 1]
    ];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    
    pattern.forEach((isObstacle, index) => {
      const x = LANES[index];
      if (isObstacle) {
        const isSEC = Math.random() > 0.5;
        state.entities.push({
          x, y: -50, type: 'obstacle', spriteKey: isSEC ? 'sec' : 'candle', collected: false
        });
      } else {
        // 30% chance to spawn a coin in an empty slot
        if (Math.random() < 0.3) {
          state.entities.push({
            x, y: -50, type: 'coin', spriteKey: 'coin', collected: false
          });
        }
      }
    });
  };

  const activateMoonMode = (state) => {
    state.isMoonMode = true;
    state.moonTimer = 300; // Frames (approx 5 seconds)
    // Clear existing obstacles
    state.entities.forEach(ent => {
       if(ent.type === 'obstacle') {
           ent.collected = true; 
           createParticles(state, ent.x, ent.y, '#ff00ff');
       }
    });
  };

  const createParticles = (state, x, y, color) => {
    for(let i=0; i<10; i++) {
      state.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 30,
        size: Math.random() * 8 + 2,
        color
      });
    }
  };

  const triggerGameOver = async (state) => {
    if (username) {
      await supabase.from('leaderboards').insert([{
        game_id: 'peperunner',
        username,
        score: state.score,
        address: address
      }]);
    }
    setGameOver(true);
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
        gameId="peperunner" 
      />
      <canvas 
        ref={canvasRef} 
        width={CANVAS_WIDTH} 
        height={CANVAS_HEIGHT} 
        style={{ width: '100%', maxWidth: '500px', height: 'auto', display: 'block' }} 
      />
      {!isPlaying && !gameOver && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          textAlign: 'center', pointerEvents: 'none', color: '#00ff00', textShadow: '2px 2px #000',
          fontFamily: '"Press Start 2P"', width: '100%'
        }}>
          SWIPE OR CLICK<br/>TO CHANGE LANES<br/><br/>
          DODGE THE FEDS!
        </div>
      )}
    </div>
  );
};

export default PepeRunner;