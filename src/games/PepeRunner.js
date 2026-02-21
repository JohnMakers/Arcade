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
  const [countdownFinished, setCountdownFinished] = useState(false);

  // --- CONFIGURATION ---
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 800;
  const LANES = [80, 250, 420];
  const HERO_SIZE = 60;
  const OBSTACLE_SIZE = 60;
  const HITBOX_MARGIN = 15; // Shave 15px off all sides for tighter, fairer collisions
  const INITIAL_SPEED = 6;
  const MAX_SPEED = 24; // Upped slightly to accommodate the smooth scaling
  const MOON_METER_MAX = 10;

  const gameState = useRef({
    playerLane: 1, 
    playerX: LANES[1], 
    speed: INITIAL_SPEED,
    score: 0,
    lastReportedScore: 0, // Used to smartly update React UI
    moonMeter: 0,
    isMoonMode: false,
    moonTimer: 0,
    entities: [], 
    particles: [],
    sprites: {},
    lastTime: 0,
    distanceTraveled: 0,
    nextSpawnDist: 300,
    isDead: false // Prevents duplicate death triggers
  });

  // --- WAIT FOR COUNTDOWN ---
  useEffect(() => {
    if (!isPlaying && !gameOver) {
      setCountdownFinished(false);
      const timer = setTimeout(() => {
        setCountdownFinished(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, gameOver, resetKey]);

  // --- ASSET LOADING ---
  useEffect(() => {
    const loadSprite = (key, src) => {
      const img = new Image();
      img.src = src;
      img.crossOrigin = "Anonymous";
      img.onload = () => { gameState.current.sprites[key] = img; };
    };
    
    loadSprite('bg', ASSETS.RUNNER_BG);
    loadSprite('hero', ASSETS.RUNNER_HERO || 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/SNice.svg/120px-SNice.svg.png');
    loadSprite('sec', ASSETS.RUNNER_SEC || 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Red_x.svg/120px-Red_x.svg.png');
    loadSprite('candle', ASSETS.RUNNER_CANDLE || 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Error.svg/120px-Error.svg.png');
    loadSprite('coin', ASSETS.RUNNER_COIN || 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Ethereum-icon-purple.svg/120px-Ethereum-icon-purple.svg.png');
  }, []);

  // --- INPUT HANDLING ---
  useEffect(() => {
    let touchStartX = 0;

    const attemptStart = () => {
      if (!isPlaying && !gameOver && countdownFinished) {
        setIsPlaying(true);
        return true;
      }
      return false;
    };

    const movePlayer = (direction) => {
      if (attemptStart()) return;
      if (!isPlaying || gameOver || gameState.current.isDead) return;
      
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
      if (attemptStart()) return;
      const touchEndX = e.changedTouches[0].screenX;
      if (touchEndX < touchStartX - 40) movePlayer('left');
      if (touchEndX > touchStartX + 40) movePlayer('right');
    };

    const handleMouseClick = (e) => {
      if (attemptStart()) return;
      if (!isPlaying || gameOver || gameState.current.isDead) return;
      
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
  }, [isPlaying, gameOver, countdownFinished]);

  // --- CORE GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Reset State
    gameState.current = {
      ...gameState.current,
      playerLane: 1, playerX: LANES[1], speed: INITIAL_SPEED,
      score: 0, lastReportedScore: 0, moonMeter: 0, isMoonMode: false, moonTimer: 0,
      entities: [], particles: [], distanceTraveled: 0, nextSpawnDist: 300, isDead: false
    };
    gameState.current.lastTime = performance.now();
    let animationId;

    const loop = (time) => {
      const state = gameState.current;
      if (!state.lastTime) state.lastTime = time;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // --- 1. ENGINE LOGIC ---
      if (isPlaying && !gameOver && !state.isDead) {
        state.distanceTraveled += state.speed * dt;
        
        // PROGRESSIVE SPEED: Smoothly and slowly increase speed over time
        state.speed = Math.min(state.speed + 0.0015 * dt, MAX_SPEED);

        const targetX = LANES[state.playerLane];
        state.playerX += (targetX - state.playerX) * 0.3 * dt;

        if (state.distanceTraveled > state.nextSpawnDist) {
          spawnRow(state);
          const gap = Math.max(200, 450 - (state.speed * 12)); 
          state.nextSpawnDist = state.distanceTraveled + gap;
        }

        if (state.isMoonMode) {
          state.moonTimer -= dt;
          if (state.moonTimer <= 0) {
            state.isMoonMode = false;
            state.moonMeter = 0;
          }
        }

        // Tighter Player Hitbox
        const pLeft = state.playerX - HERO_SIZE/2 + HITBOX_MARGIN;
        const pRight = state.playerX + HERO_SIZE/2 - HITBOX_MARGIN;
        const pTop = (CANVAS_HEIGHT - 150) - HERO_SIZE/2 + HITBOX_MARGIN;
        const pBottom = (CANVAS_HEIGHT - 150) + HERO_SIZE/2 - HITBOX_MARGIN;

        for (let i = state.entities.length - 1; i >= 0; i--) {
          const ent = state.entities[i];
          ent.y += state.speed * dt;

          // Tighter Obstacle Hitbox
          const oLeft = ent.x - OBSTACLE_SIZE/2 + HITBOX_MARGIN;
          const oRight = ent.x + OBSTACLE_SIZE/2 - HITBOX_MARGIN;
          const oTop = ent.y - OBSTACLE_SIZE/2 + HITBOX_MARGIN;
          const oBottom = ent.y + OBSTACLE_SIZE/2 - HITBOX_MARGIN;

          if (
            !ent.collected &&
            pLeft < oRight && pRight > oLeft && pTop < oBottom && pBottom > oTop
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
               ent.collected = true;
               state.score += 50;
               createParticles(state, ent.x, ent.y, '#ff00ff');
            }
          }

          if (ent.y > CANVAS_HEIGHT || ent.collected) {
            state.entities.splice(i, 1);
            if(!ent.collected && ent.type === 'obstacle') {
              state.score += 10; 
            }
          }
        }
      }

      state.particles.forEach((p, idx) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      });
      state.particles = state.particles.filter(p => p.life > 0);

      // --- 2. RENDER PIPELINE ---
      const bgSprite = state.sprites['bg'];
      
      if (bgSprite && !state.isMoonMode) {
        // STEADY BACKGROUND LOGIC
        // Draw the image exactly once, covering the entire canvas
        ctx.drawImage(bgSprite, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
        // Fallback or Moon Mode background
        ctx.fillStyle = state.isMoonMode ? '#1a0033' : '#0a192f';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      state.entities.forEach(ent => {
        const sprite = state.sprites[ent.spriteKey];
        if (sprite) {
          ctx.drawImage(sprite, ent.x - OBSTACLE_SIZE/2, ent.y - OBSTACLE_SIZE/2, OBSTACLE_SIZE, OBSTACLE_SIZE);
        } else {
          ctx.fillStyle = ent.type === 'coin' ? 'gold' : 'red';
          ctx.beginPath();
          ctx.arc(ent.x, ent.y, OBSTACLE_SIZE/2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      state.particles.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / 30);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.globalAlpha = 1.0;
      });

      const heroSprite = state.sprites['hero'];
      ctx.save();
      ctx.translate(state.playerX, CANVAS_HEIGHT - 150);
      
      if (isPlaying && !gameOver && !state.isDead) {
          ctx.rotate(Math.sin(time / 100) * 0.05);
      }

      if (heroSprite) {
        ctx.drawImage(heroSprite, -HERO_SIZE/2, -HERO_SIZE/2, HERO_SIZE, HERO_SIZE);
      } else {
        ctx.fillStyle = state.isMoonMode ? 'cyan' : '#00ff00';
        ctx.fillRect(-HERO_SIZE/2, -HERO_SIZE/2, HERO_SIZE, HERO_SIZE);
      }
      
      if (isPlaying && !gameOver && !state.isDead) {
          ctx.fillStyle = state.isMoonMode ? '#ff00ff' : 'orange';
          ctx.beginPath();
          ctx.moveTo(-15, HERO_SIZE/2);
          ctx.lineTo(15, HERO_SIZE/2);
          ctx.lineTo(0, HERO_SIZE/2 + 20 + Math.random() * 20);
          ctx.fill();
      }
      ctx.restore();

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

      // Smart UI Sync: Only update React state if the score changes (prevents missed scores!)
      if (state.score !== state.lastReportedScore) {
          state.lastReportedScore = state.score;
          setScore(state.score); 
      }

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, gameOver, resetKey]);

  // --- HELPERS ---
  const spawnRow = (state) => {
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
    state.moonTimer = 300; 
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
    if (state.isDead) return; // Prevent duplicate triggers!
    state.isDead = true;
    
    setScore(state.score); // Guarantee the final score syncs to the game over screen

    if (username) {
      await supabase.from('leaderboards').insert([{
        game_id: 'peperunner',
        username,
        score: state.score,
        address: address
      }]);
    }
    
    setTimeout(() => {
        setGameOver(true);
    }, 500); // Give it a half-second pause so the player sees what killed them
  };

  return (
    <div ref={containerRef} className="game-wrapper" tabIndex="0" style={{ position: 'relative', outline: 'none' }}>
      <GameUI 
        score={score} 
        gameOver={gameOver} 
        isPlaying={isPlaying} 
        onRestart={() => { 
          setGameOver(false); 
          setIsPlaying(false); 
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
        style={{ width: '100%', maxWidth: '500px', height: 'auto', display: 'block', cursor: 'pointer' }} 
      />
      
      {!isPlaying && !gameOver && countdownFinished && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          textAlign: 'center', pointerEvents: 'none', color: '#00ff00', textShadow: '2px 2px #000',
          fontFamily: '"Press Start 2P"', width: '100%'
        }}>
          TAP OR SWIPE TO START<br/><br/>
          DODGE THE FEDS!
        </div>
      )}
    </div>
  );
};

export default PepeRunner;