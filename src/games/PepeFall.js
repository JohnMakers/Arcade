import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const PepeFall = ({ onExit }) => {
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
  const GRAVITY = 0.6;
  const MAX_FALL_SPEED = 15;
  const MOVE_SPEED = 6;
  const RECOIL = 8;
  const BLOCK_SIZE = 50;
  
  // Game state reference (mutable without triggering re-renders)
  const gameState = useRef({
    player: { x: 225, y: 100, w: 40, h: 40, vx: 0, vy: 0, ammo: 8, invincible: 0 },
    cameraY: 0,
    platforms: [],
    enemies: [],
    lasers: [],
    particles: [],
    dips: [], // Invincibility pickups
    lastGenY: 200, // Tracks how far down we've generated
    keys: { left: false, right: false, shoot: false },
    score: 0,
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

    loadSprite('hero', ASSETS.FALL_HERO);
    loadSprite('platform', ASSETS.FALL_PLATFORM);
    loadSprite('spike', ASSETS.FALL_SPIKE);
    loadSprite('bear', ASSETS.FALL_BEAR);
    loadSprite('dip', ASSETS.FALL_DIP);
    loadSprite('bg', ASSETS.FALL_BG);
  }, []);

  // Input Handling (Keyboard & Touch Zones)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') gameState.current.keys.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') gameState.current.keys.right = true;
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (!gameState.current.keys.shoot) triggerShoot();
        gameState.current.keys.shoot = true;
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') gameState.current.keys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') gameState.current.keys.right = false;
      if (e.code === 'Space' || e.code === 'ArrowUp') gameState.current.keys.shoot = false;
    };

    const handleTouch = (e) => {
      if (!isPlaying || gameOver) return;
      e.preventDefault();
      gameState.current.keys.left = false;
      gameState.current.keys.right = false;
      
      // Map touches to screen thirds
      for (let i = 0; i < e.touches.length; i++) {
        const touchX = e.touches[i].clientX;
        const screenW = window.innerWidth;
        if (touchX < screenW / 3) gameState.current.keys.left = true;
        else if (touchX > (screenW / 3) * 2) gameState.current.keys.right = true;
        else triggerShoot(); // Middle tap to shoot
      }
    };

    const handleTouchEnd = (e) => {
        handleTouch(e); // Re-evaluate active touches
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('touchstart', handleTouch, { passive: false });
      wrapper.addEventListener('touchmove', handleTouch, { passive: false });
      wrapper.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (wrapper) {
        wrapper.removeEventListener('touchstart', handleTouch);
        wrapper.removeEventListener('touchmove', handleTouch);
        wrapper.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [isPlaying, gameOver]);

  // Action: Shoot Laser
  const triggerShoot = () => {
      const state = gameState.current;
      if (!isPlaying || state.player.ammo <= 0) {
          if (!isPlaying && !gameOver) setIsPlaying(true);
          return;
      }

      state.player.ammo -= 1;
      state.player.vy = -RECOIL; // Push player up slightly

      state.lasers.push({
          x: state.player.x + state.player.w / 2 - 5,
          y: state.player.y + state.player.h,
          w: 10, h: 30, vy: 20
      });

      // Simple muzzle flash particle
      spawnDebris(state.player.x + state.player.w/2, state.player.y + state.player.h, '#00ffff');
  };

  // --- PROCEDURAL GENERATION ---
  const generateLevel = (cameraY) => {
      const state = gameState.current;
      // Generate chunks ahead of the camera
      while (state.lastGenY < cameraY + CANVAS_HEIGHT + 500) {
          const y = state.lastGenY;
          const isSpikeRow = Math.random() < 0.2; // 20% chance of red candle spikes
          
          // "Always Possible" Rule: Ensure at least a 2-block wide gap
          const gapIndex = Math.floor(Math.random() * ((CANVAS_WIDTH / BLOCK_SIZE) - 1));
          
          for (let x = 0; x < CANVAS_WIDTH; x += BLOCK_SIZE) {
              const currentIdx = x / BLOCK_SIZE;
              // Create gap
              if (currentIdx === gapIndex || currentIdx === gapIndex + 1) continue;

              if (Math.random() < 0.7) { // 70% fill rate for platforms
                  state.platforms.push({
                      x, y, w: BLOCK_SIZE, h: 20,
                      isSpike: isSpikeRow
                  });

                  // Spawn Enemy on platform?
                  if (!isSpikeRow && Math.random() < 0.1) {
                      state.enemies.push({ x, y: y - 40, w: 40, h: 40, vx: 2, dir: 1 });
                  }
                  // Spawn Invincibility Dip?
                  else if (!isSpikeRow && Math.random() < 0.02) {
                      state.dips.push({ x: x+10, y: y - 30, w: 30, h: 30 });
                  }
              }
          }
          // Space between platform rows gets tighter as you go deeper
          const spacing = Math.max(120, 300 - (state.score * 0.5)); 
          state.lastGenY += spacing;
      }
  };

  // --- COLLISION HELPER ---
  const checkCollision = (r1, r2) => {
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x &&
           r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
  };

  const spawnDebris = (x, y, color) => {
      for(let i=0; i<5; i++) {
          gameState.current.particles.push({
              x, y, vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10, life: 20, color
          });
      }
  };

  const die = async () => {
      setGameOver(true);
      const state = gameState.current;
      if (username) {
        await supabase.from('leaderboards').insert([{
            game_id:'pepefall', username, score: state.score, address
        }]);
      }
  };

  // Core Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Reset Logic
    gameState.current.player = { x: 225, y: 100, w: 40, h: 40, vx: 0, vy: 0, ammo: 8, invincible: 0 };
    gameState.current.cameraY = 0;
    gameState.current.platforms = [];
    gameState.current.enemies = [];
    gameState.current.lasers = [];
    gameState.current.dips = [];
    gameState.current.particles = [];
    gameState.current.lastGenY = 300;
    gameState.current.score = 0;
    gameState.current.lastTime = performance.now();

    let animationId;

    const loop = (time) => {
      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      if (!isPlaying || gameOver) {
          animationId = requestAnimationFrame(loop);
          return;
      }

      // --- PHYSICS & MOVEMENT ---
      const p = state.player;
      p.vy += GRAVITY * dt;
      if (p.vy > MAX_FALL_SPEED) p.vy = MAX_FALL_SPEED;

      if (state.keys.left) p.x -= MOVE_SPEED * dt;
      if (state.keys.right) p.x += MOVE_SPEED * dt;

      // Screen wrap
      if (p.x < -p.w) p.x = CANVAS_WIDTH;
      if (p.x > CANVAS_WIDTH) p.x = -p.w;

      p.y += p.vy * dt;

      // Update Invincibility
      if (p.invincible > 0) p.invincible -= dt;

      // --- COLLISIONS ---
      let grounded = false;

      // Player vs Platforms
      state.platforms.forEach(plat => {
          if (p.vy > 0 && p.y + p.h >= plat.y && p.y + p.h - p.vy * dt <= plat.y && 
              p.x + p.w > plat.x && p.x < plat.x + plat.w) {
              
              if (plat.isSpike) {
                  if (p.invincible <= 0) die();
                  else {
                      // Destroy spike if invincible
                      plat.markedForDeletion = true;
                      spawnDebris(plat.x, plat.y, 'red');
                  }
              } else {
                  p.y = plat.y - p.h;
                  p.vy = 0;
                  grounded = true;
                  p.ammo = 8; // Reload on ground
              }
          }
      });
      state.platforms = state.platforms.filter(plat => !plat.markedForDeletion);

      // Player vs Enemies
      state.enemies.forEach(enemy => {
          if (checkCollision(p, enemy)) {
              if (p.invincible > 0 || (p.vy > 0 && p.y + p.h < enemy.y + 20)) {
                  // Goomba stomp or invincible kill
                  enemy.dead = true;
                  p.vy = -10; // bounce
                  p.ammo = 8;
                  spawnDebris(enemy.x, enemy.y, 'brown');
              } else {
                  die();
              }
          }
      });

      // Player vs Dips (Invincibility)
      state.dips.forEach(dip => {
          if (checkCollision(p, dip)) {
              dip.collected = true;
              p.invincible = 300; // Frames of invincibility
              spawnDebris(dip.x, dip.y, 'lime');
          }
      });
      state.dips = state.dips.filter(d => !d.collected);

      // Lasers Logic
      state.lasers.forEach(l => {
          l.y += l.vy * dt;
          
          // Laser vs Platforms
          state.platforms.forEach(plat => {
              if (checkCollision(l, plat)) {
                  l.dead = true;
                  if (!plat.isSpike) plat.markedForDeletion = true; // Destroy normal blocks
                  spawnDebris(l.x, l.y, '#00ffff');
              }
          });

          // Laser vs Enemies
          state.enemies.forEach(enemy => {
             if (checkCollision(l, enemy)) {
                 l.dead = true;
                 enemy.dead = true;
                 spawnDebris(enemy.x, enemy.y, 'red');
             }
          });
      });
      state.lasers = state.lasers.filter(l => !l.dead && l.y < state.cameraY + CANVAS_HEIGHT + 100);
      state.enemies = state.enemies.filter(e => !e.dead);
      state.platforms = state.platforms.filter(p => p.y > state.cameraY - 100 && !p.markedForDeletion);

      // Enemy AI
      state.enemies.forEach(enemy => {
          enemy.x += enemy.vx * enemy.dir * dt;
          // Simple patrol boundary check (could map to platform bounds, but screen edge works)
          if (enemy.x <= 0 || enemy.x + enemy.w >= CANVAS_WIDTH) enemy.dir *= -1;
      });

      // Update Score & Camera
      // Score based on depth fallen
      const depthScore = Math.floor(p.y / 100);
      if (depthScore > state.score) {
          state.score = depthScore;
          setScore(state.score);
      }

      // Camera smoothly follows player falling
      const targetCamY = p.y - CANVAS_HEIGHT / 3;
      if (targetCamY > state.cameraY) {
          state.cameraY += (targetCamY - state.cameraY) * 0.1 * dt;
      } else {
          // Camera forces player down (Auto-scroll effect like market crash)
          state.cameraY += (2 + (state.score / 100)) * dt; 
      }

      // Death by scrolling off top
      if (p.y < state.cameraY - p.h) die();

      // Generation
      generateLevel(state.cameraY);

      // --- RENDER ---
      // Background 
      if (state.sprites['bg']) {
          ctx.drawImage(state.sprites['bg'], 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
          // Grid fallback
          ctx.fillStyle = '#111';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 1;
          for(let i=0; i<CANVAS_WIDTH; i+=50) {
              ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,CANVAS_HEIGHT); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(0, i - (state.cameraY%50)); ctx.lineTo(CANVAS_WIDTH, i - (state.cameraY%50)); ctx.stroke();
          }
      }

      ctx.save();
      ctx.translate(0, -state.cameraY);

      // Draw Platforms
      state.platforms.forEach(plat => {
          if (plat.isSpike) {
              ctx.fillStyle = 'red';
              ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
          } else {
              if (state.sprites['platform']) ctx.drawImage(state.sprites['platform'], plat.x, plat.y, plat.w, plat.h);
              else { ctx.fillStyle = 'lime'; ctx.fillRect(plat.x, plat.y, plat.w, plat.h); }
          }
      });

      // Draw Dips
      state.dips.forEach(dip => {
          if (state.sprites['dip']) ctx.drawImage(state.sprites['dip'], dip.x, dip.y, dip.w, dip.h);
          else { ctx.fillStyle = 'gold'; ctx.beginPath(); ctx.arc(dip.x+dip.w/2, dip.y+dip.h/2, dip.w/2, 0, Math.PI*2); ctx.fill(); }
      });

      // Draw Enemies
      state.enemies.forEach(enemy => {
          if (state.sprites['bear']) ctx.drawImage(state.sprites['bear'], enemy.x, enemy.y, enemy.w, enemy.h);
          else { ctx.fillStyle = 'brown'; ctx.fillRect(enemy.x, enemy.y, enemy.w, enemy.h); }
      });

      // Draw Lasers
      ctx.fillStyle = '#00ffff';
      state.lasers.forEach(l => { ctx.fillRect(l.x, l.y, l.w, l.h); });

      // Draw Particles
      state.particles.forEach(p => {
          p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.life / 20);
          ctx.fillRect(p.x, p.y, 4, 4);
          ctx.globalAlpha = 1;
      });
      state.particles = state.particles.filter(p => p.life > 0);

      // Draw Player
      if (p.invincible > 0 && Math.floor(time / 100) % 2 === 0) {
          ctx.globalAlpha = 0.5; // Blink if invincible
      }
      if (state.sprites['hero']) ctx.drawImage(state.sprites['hero'], p.x, p.y, p.w, p.h);
      else { ctx.fillStyle = p.invincible > 0 ? 'yellow' : 'cyan'; ctx.fillRect(p.x, p.y, p.w, p.h); }
      ctx.globalAlpha = 1.0;

      ctx.restore();

      // Draw UI HUD (Ammo)
      ctx.fillStyle = 'white';
      ctx.font = '16px "Press Start 2P"';
      ctx.fillText(`AMMO: ${p.ammo}`, 20, 40);

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [resetKey, isPlaying]);

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
            gameId="pepefall" 
        />
        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT} 
            style={{ width: '100%', maxWidth: '500px', height: 'auto', display: 'block', cursor: 'crosshair' }} 
        />
        {!isPlaying && !gameOver && (
            <div style={{
                position: 'absolute', top: '40%', width: '100%', textAlign: 'center', 
                pointerEvents: 'none', color: 'lime', textShadow: '2px 2px #000',
                fontFamily: '"Press Start 2P"'
            }}>
                MARKET CRASH!<br/><br/>
                <span style={{fontSize: '0.6em', color: 'white'}}>
                Desktop: ARROWS to move, SPACE to shoot<br/>
                Mobile: Tap Left/Right to move, Middle to shoot
                </span>
            </div>
        )}
    </div>
  );
};

export default PepeFall;