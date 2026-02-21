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
  
  // Handles the auto-start countdown
  const [countdownStatus, setCountdownStatus] = useState(3);

  // --- CONFIGURATION ---
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 800;
  const GRAVITY = 0.6;
  const MAX_FALL_SPEED = 15;
  const MOVE_SPEED = 6;
  const RECOIL = 8;
  const BLOCK_SIZE = 50;
  
  const gameState = useRef({
    player: { x: 225, y: 50, w: 40, h: 40, vx: 0, vy: 0, ammo: 8, invincible: 0 },
    cameraY: 0,
    platforms: [],
    enemies: [],
    lasers: [],
    particles: [],
    dips: [], 
    lastGenY: 400, 
    keys: { left: false, right: false, shoot: false },
    score: 0,
    isDead: false, 
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
    loadSprite('laser', ASSETS.FALL_LASER);
    loadSprite('platform', ASSETS.FALL_PLATFORM);
    loadSprite('spike', ASSETS.FALL_SPIKE);
    loadSprite('bear', ASSETS.FALL_BEAR);
    loadSprite('dip', ASSETS.FALL_DIP);
    loadSprite('bg', ASSETS.FALL_BG);
  }, []);

  // --- AUTO-START COUNTDOWN ---
  useEffect(() => {
    if (!gameOver && !isPlaying) {
        if (countdownStatus > 0) {
            const timer = setTimeout(() => setCountdownStatus(prev => prev - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            setIsPlaying(true); 
        }
    }
  }, [countdownStatus, gameOver, isPlaying]);

  // Input Handling 
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isPlaying || gameState.current.isDead) return; 
      
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
      if (gameOver) return;
      e.preventDefault(); 
      if (!isPlaying || gameState.current.isDead) return; 
      
      gameState.current.keys.left = false;
      gameState.current.keys.right = false;
      
      let isShootingTouch = false;
      
      for (let i = 0; i < e.touches.length; i++) {
        const touchX = e.touches[i].clientX;
        const screenW = window.innerWidth;
        if (touchX < screenW / 3) {
            gameState.current.keys.left = true;
        } else if (touchX > (screenW / 3) * 2) {
            gameState.current.keys.right = true;
        } else {
            isShootingTouch = true;
        }
      }

      if (isShootingTouch) {
          if (!gameState.current.keys.shoot) triggerShoot();
          gameState.current.keys.shoot = true;
      } else {
          gameState.current.keys.shoot = false;
      }
    };

    const handleTouchEnd = (e) => {
        handleTouch(e); 
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

  const triggerShoot = () => {
      const state = gameState.current;
      if (!isPlaying || state.isDead || state.player.ammo <= 0) return;

      state.player.ammo -= 1;
      state.player.vy = -RECOIL; 

      state.lasers.push({
          x: state.player.x + state.player.w / 2 - 5,
          // FIX: Spawn laser slightly higher inside the player so it immediately overlaps the floor
          y: state.player.y + state.player.h - 10, 
          w: 10, h: 30, vy: 20
      });

      spawnDebris(state.player.x + state.player.w/2, state.player.y + state.player.h, '#00ffff');
  };

  const generateLevel = (cameraY) => {
      const state = gameState.current;
      while (state.lastGenY < cameraY + CANVAS_HEIGHT + 500) {
          const y = state.lastGenY;
          const isSpikeRow = Math.random() < 0.2; 
          
          const gapIndex = Math.floor(Math.random() * ((CANVAS_WIDTH / BLOCK_SIZE) - 1));
          
          for (let x = 0; x < CANVAS_WIDTH; x += BLOCK_SIZE) {
              const currentIdx = x / BLOCK_SIZE;
              if (currentIdx === gapIndex || currentIdx === gapIndex + 1) continue;

              if (Math.random() < 0.7) { 
                  state.platforms.push({ x, y, w: BLOCK_SIZE, h: 20, isSpike: isSpikeRow });

                  if (!isSpikeRow && Math.random() < 0.1) {
                      state.enemies.push({ x, y: y - 40, w: 40, h: 40, vx: 2, dir: 1 });
                  }
                  else if (!isSpikeRow && Math.random() < 0.02) {
                      state.dips.push({ x: x+10, y: y - 30, w: 30, h: 30 });
                  }
              }
          }
          const spacing = Math.max(120, 300 - (state.score * 0.5)); 
          state.lastGenY += spacing;
      }
  };

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
      const state = gameState.current;
      if (state.isDead) return; 
      
      state.isDead = true; 
      setGameOver(true);
      
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
    gameState.current.player = { x: 225, y: 50, w: 40, h: 40, vx: 0, vy: 0, ammo: 8, invincible: 0 };
    gameState.current.cameraY = 0;
    gameState.current.platforms = [];
    gameState.current.enemies = [];
    gameState.current.lasers = [];
    gameState.current.dips = [];
    gameState.current.particles = [];
    gameState.current.lastGenY = 400; 
    gameState.current.score = 0;
    gameState.current.isDead = false;
    gameState.current.lastTime = performance.now();

    // The Safe Start Zone Platform
    gameState.current.platforms.push({ x: 150, y: 250, w: 200, h: 20, isSpike: false });
    
    // Pre-generate the starting screen
    generateLevel(0);

    let animationId;

    const loop = (time) => {
      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // --- 1. PHYSICS & UPDATES ---
      if (isPlaying && !state.isDead) {
          const p = state.player;
          p.vy += GRAVITY * dt;
          if (p.vy > MAX_FALL_SPEED) p.vy = MAX_FALL_SPEED;

          if (state.keys.left) p.x -= MOVE_SPEED * dt;
          if (state.keys.right) p.x += MOVE_SPEED * dt;

          if (p.x < -p.w) p.x = CANVAS_WIDTH;
          if (p.x > CANVAS_WIDTH) p.x = -p.w;

          p.y += p.vy * dt;

          if (p.invincible > 0) p.invincible -= dt;

          let grounded = false;

          state.platforms.forEach(plat => {
              if (p.vy > 0 && p.y + p.h >= plat.y && p.y + p.h - p.vy * dt <= plat.y && 
                  p.x + p.w > plat.x && p.x < plat.x + plat.w) {
                  
                  if (plat.isSpike) {
                      if (p.invincible <= 0) die();
                      else {
                          plat.markedForDeletion = true;
                          spawnDebris(plat.x, plat.y, 'red');
                      }
                  } else {
                      p.y = plat.y - p.h;
                      p.vy = 0;
                      grounded = true;
                      p.ammo = 8; 
                  }
              }
          });
          state.platforms = state.platforms.filter(plat => !plat.markedForDeletion);

          state.enemies.forEach(enemy => {
              if (checkCollision(p, enemy)) {
                  if (p.invincible > 0 || (p.vy > 0 && p.y + p.h < enemy.y + 20)) {
                      enemy.dead = true;
                      p.vy = -10; 
                      p.ammo = 8;
                      spawnDebris(enemy.x, enemy.y, 'brown');
                  } else {
                      die();
                  }
              }
          });

          state.dips.forEach(dip => {
              if (checkCollision(p, dip)) {
                  dip.collected = true;
                  p.invincible = 300; 
                  spawnDebris(dip.x, dip.y, 'lime');
              }
          });
          state.dips = state.dips.filter(d => !d.collected);

          state.lasers.forEach(l => {
              const prevY = l.y; // Track where the laser was BEFORE moving
              l.y += l.vy * dt;
              
              // FIX: Continuous Collision Detection (Swept AABB)
              state.platforms.forEach(plat => {
                  if (l.x < plat.x + plat.w && l.x + l.w > plat.x &&
                      prevY < plat.y + plat.h && l.y + l.h > plat.y) {
                      l.dead = true;
                      plat.markedForDeletion = true; 
                      spawnDebris(l.x, plat.y, plat.isSpike ? 'red' : 'lime'); 
                  }
              });

              state.enemies.forEach(enemy => {
                 if (l.x < enemy.x + enemy.w && l.x + l.w > enemy.x &&
                     prevY < enemy.y + enemy.h && l.y + l.h > enemy.y) {
                     l.dead = true;
                     enemy.dead = true;
                     spawnDebris(enemy.x, enemy.y, 'red');
                 }
              });
          });
          state.lasers = state.lasers.filter(l => !l.dead && l.y < state.cameraY + CANVAS_HEIGHT + 100);
          state.enemies = state.enemies.filter(e => !e.dead);
          state.platforms = state.platforms.filter(p => p.y > state.cameraY - 100 && !p.markedForDeletion);

          state.enemies.forEach(enemy => {
              enemy.x += enemy.vx * enemy.dir * dt;
              if (enemy.x <= 0 || enemy.x + enemy.w >= CANVAS_WIDTH) enemy.dir *= -1;
          });

          const depthScore = Math.floor(p.y / 100);
          if (depthScore > state.score) {
              state.score = depthScore;
              setScore(state.score);
          }

          const targetCamY = p.y - CANVAS_HEIGHT / 3;
          if (targetCamY > state.cameraY) {
              state.cameraY += (targetCamY - state.cameraY) * 0.1 * dt;
          } else {
              state.cameraY += (2 + (state.score / 100)) * dt; 
          }

          if (p.y < state.cameraY - p.h) die();

          generateLevel(state.cameraY);
      } // --- END PHYSICS BLOCK ---

      // --- 2. RENDER ---
      if (state.sprites['bg']) {
          ctx.drawImage(state.sprites['bg'], 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
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

      state.platforms.forEach(plat => {
          if (plat.isSpike) {
              if (state.sprites['spike']) ctx.drawImage(state.sprites['spike'], plat.x, plat.y, plat.w, plat.h);
              else { ctx.fillStyle = 'red'; ctx.fillRect(plat.x, plat.y, plat.w, plat.h); }
          } else {
              if (state.sprites['platform']) ctx.drawImage(state.sprites['platform'], plat.x, plat.y, plat.w, plat.h);
              else { ctx.fillStyle = 'lime'; ctx.fillRect(plat.x, plat.y, plat.w, plat.h); }
          }
      });

      state.dips.forEach(dip => {
          if (state.sprites['dip']) ctx.drawImage(state.sprites['dip'], dip.x, dip.y, dip.w, dip.h);
          else { ctx.fillStyle = 'gold'; ctx.beginPath(); ctx.arc(dip.x+dip.w/2, dip.y+dip.h/2, dip.w/2, 0, Math.PI*2); ctx.fill(); }
      });

      // RENDER ENEMIES (WITH FLIP LOGIC)
      state.enemies.forEach(enemy => {
          if (state.sprites['bear']) {
              if (enemy.dir < 0) {
                  ctx.save();
                  ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
                  ctx.scale(-1, 1);
                  ctx.drawImage(state.sprites['bear'], -enemy.w / 2, -enemy.h / 2, enemy.w, enemy.h);
                  ctx.restore();
              } else {
                  ctx.drawImage(state.sprites['bear'], enemy.x, enemy.y, enemy.w, enemy.h);
              }
          } else { 
              ctx.fillStyle = 'brown'; ctx.fillRect(enemy.x, enemy.y, enemy.w, enemy.h); 
          }
      });

      ctx.fillStyle = '#00ffff';
      state.lasers.forEach(l => { 
          if (state.sprites['laser']) ctx.drawImage(state.sprites['laser'], l.x, l.y, l.w, l.h);
          else ctx.fillRect(l.x, l.y, l.w, l.h); 
      });

      state.particles.forEach(p => {
          p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.life / 20);
          ctx.fillRect(p.x, p.y, 4, 4);
          ctx.globalAlpha = 1;
      });
      state.particles = state.particles.filter(p => p.life > 0);

      const pState = state.player;
      if (pState.invincible > 0 && Math.floor(time / 100) % 2 === 0) {
          ctx.globalAlpha = 0.5; 
      }
      if (state.sprites['hero']) ctx.drawImage(state.sprites['hero'], pState.x, pState.y, pState.w, pState.h);
      else { ctx.fillStyle = pState.invincible > 0 ? 'yellow' : 'cyan'; ctx.fillRect(pState.x, pState.y, pState.w, pState.h); }
      ctx.globalAlpha = 1.0;

      ctx.restore();

      ctx.fillStyle = 'white';
      ctx.font = '16px "Press Start 2P"';
      ctx.fillText(`AMMO: ${pState.ammo}`, 20, 40);

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
                setIsPlaying(false); 
                setCountdownStatus(3); 
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
                position: 'absolute', bottom: '15%', width: '100%', textAlign: 'center', 
                pointerEvents: 'none', color: 'lime', textShadow: '2px 2px #000',
                fontFamily: '"Press Start 2P"'
            }}>
                MARKET CRASH!<br/><br/>
                <span style={{fontSize: '0.6em', color: 'white', lineHeight: '1.5'}}>
                Desktop: ARROWS to move, SPACE to shoot<br/>
                Mobile: Tap L/R to move, Middle to shoot
                </span>
            </div>
        )}
    </div>
  );
};

export default PepeFall;