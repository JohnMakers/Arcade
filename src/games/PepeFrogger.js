import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const PepeFrogger = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username } = useContext(UserContext);

  // --- REACT UI STATE ---
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  // Mechanics UI
  const [multiplier, setMultiplier] = useState(1);
  const [hasShield, setHasShield] = useState(false);
  const [dashReady, setDashReady] = useState(true);

  // --- ENGINE REF (The Source of Truth) ---
  const engine = useRef({
    running: false,
    frames: 0,
    cameraY: 0,
    score: 0,
    
    // Mechanics
    multiplier: 1,
    lastMoveTime: 0,
    dashCooldown: 0,
    shield: false,
    
    // Entities
    hero: { 
        gridX: 5, gridY: 15, // Grid Coordinates (Cols 0-9)
        x: 200, y: 600,      // Pixel Coordinates (Visual)
        targetX: 200, targetY: 600, // Where we are moving to
        isMoving: false
    },
    lanes: [], // { gridY, type, speed, elements: [] }
    particles: [], // { x, y, vx, vy, life, color }
    
    // Assets
    sprites: {},
    patterns: {}
  });

  const GRID_SIZE = 40;
  const COLS = 10;
  const CANVAS_WIDTH = 400;

  // --- 1. ROBUST ASSET LOADER ---
  useEffect(() => {
    const load = (k, src) => {
        const img = new Image();
        img.src = src;
        img.crossOrigin = "Anonymous";
        img.onload = () => engine.current.sprites[k] = img;
    };
    load('pepe', ASSETS.PEPE_HERO);
    load('car', ASSETS.NORMIE_CAR);
    load('bus', ASSETS.TROLL_BUS);
    load('log', ASSETS.NYAN_LOG);
    load('glitch', ASSETS.MATRIX_GLITCH);
    load('gold', ASSETS.GOLDEN_PEPE);
    load('shield', ASSETS.TENDIE_SHIELD);
    load('tex_grass', ASSETS.TEXTURE_GRASS);
    load('tex_road', ASSETS.TEXTURE_ROAD);
    load('tex_water', ASSETS.TEXTURE_WATER);
  }, []);

  // --- 2. INPUT HANDLER (Capture Mode) ---
  useEffect(() => {
    const handleInput = (e) => {
        // Prevent scrolling
        if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.code)) e.preventDefault();
        
        const state = engine.current;
        if (!state.running || state.hero.isMoving) return;

        let dx = 0; 
        let dy = 0;
        let isDash = e.shiftKey && state.dashCooldown <= 0;

        if (e.key === 'ArrowUp' || e.key === 'w') dy = -1;
        else if (e.key === 'ArrowDown' || e.key === 's') dy = 1;
        else if (e.key === 'ArrowLeft' || e.key === 'a') dx = -1;
        else if (e.key === 'ArrowRight' || e.key === 'd') dx = 1;
        else return;

        // Apply Dash (2 tiles)
        if (isDash) {
            dx *= 2; dy *= 2;
            state.dashCooldown = 180; // 3 seconds @ 60fps
            setDashReady(false);
            createParticles(state.hero.x, state.hero.y, 'cyan', 10); // Dash effect
        }

        // Check Bounds
        const targetGX = state.hero.gridX + dx;
        const targetGY = state.hero.gridY + dy;

        if (targetGX >= 0 && targetGX < COLS) {
            state.hero.gridX = targetGX;
            state.hero.gridY = targetGY;
            
            // Calculate pixel target
            state.hero.targetX = targetGX * GRID_SIZE;
            state.hero.targetY = targetGY * GRID_SIZE;
            state.hero.isMoving = true;

            // Combo System
            const now = Date.now();
            if (now - state.lastMoveTime < 500) {
                state.multiplier = Math.min(4, state.multiplier + 0.5);
            } else {
                state.multiplier = 1;
            }
            state.lastMoveTime = now;
            setMultiplier(state.multiplier);
        }
    };

    window.addEventListener('keydown', handleInput, { capture: true });
    
    // Mobile Touch (Swipe)
    let touchStartX = 0;
    let touchStartY = 0;
    const handleTouchStart = (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    };
    const handleTouchEnd = (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        
        // Emulate Key Event
        const fakeEvent = { key: '', code: '', shiftKey: false, preventDefault: () => {} };
        if (Math.abs(diffX) > Math.abs(diffY)) {
            fakeEvent.key = diffX > 0 ? 'ArrowRight' : 'ArrowLeft';
        } else {
            fakeEvent.key = diffY > 0 ? 'ArrowDown' : 'ArrowUp';
        }
        handleInput(fakeEvent);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
        window.removeEventListener('keydown', handleInput, { capture: true });
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isPlaying]);

  // --- 3. GENERATION LOGIC ---
  const generateLane = (gridY, difficulty) => {
      // Biomes based on distance (gridY decreases as we go up)
      // 0 to -50: Suburbs (Grass/Road)
      // -50 to -100: City (Road/Water)
      // -100+: Matrix (Glitch/Water)
      
      let biome = 'suburbs';
      if (gridY < -50) biome = 'city';
      if (gridY < -100) biome = 'matrix';

      let type = 'grass';
      const rand = Math.random();

      // Biome Logic
      if (biome === 'suburbs') {
          if (rand > 0.6) type = 'road';
      } else if (biome === 'city') {
          if (rand > 0.3) type = 'road';
          else if (rand > 0.8) type = 'water';
      } else {
          // Matrix: Harder
          if (rand > 0.2) type = 'road'; // "Roads" are glitches
          else type = 'water';
      }

      // Generate Obstacles
      const elements = [];
      let speed = 0;
      
      if (type !== 'grass') {
          speed = (Math.random() * 2 + 2 + (difficulty * 0.1)) * (Math.random() < 0.5 ? 1 : -1);
          if (biome === 'matrix') speed *= 1.5; // Faster in Matrix

          const count = Math.floor(Math.random() * 2) + 2;
          for (let i=0; i<count; i++) {
              elements.push({
                  x: i * 150 + Math.random() * 60,
                  w: type === 'water' ? 90 : 40,
                  type: type === 'water' ? 'log' : (biome === 'matrix' ? 'glitch' : 'car'),
                  isPowerup: false
              });
          }
      } 
      // Powerup Chance (On Logs or Grass)
      else if (Math.random() < 0.1) {
          // Spawn static powerup
          elements.push({
              x: Math.random() * 300 + 20,
              w: 30,
              type: Math.random() < 0.7 ? 'gold' : 'shield',
              isPowerup: true
          });
      }

      return { gridY, type, speed, elements, biome };
  };

  const createParticles = (x, y, color, count) => {
      for(let i=0; i<count; i++) {
          engine.current.particles.push({
              x, y,
              vx: (Math.random() - 0.5) * 8,
              vy: (Math.random() - 0.5) * 8,
              life: 20,
              color
          });
      }
  };

  // --- 4. GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    // Reset
    engine.current.running = false;
    engine.current.hero = { gridX: 5, gridY: 15, x: 200, y: 600, targetX: 200, targetY: 600, isMoving: false };
    engine.current.cameraY = 0;
    engine.current.score = 0;
    engine.current.shield = false;
    engine.current.lanes = [];
    
    // Initial Lanes
    for (let i=0; i<20; i++) {
        engine.current.lanes.push(generateLane(15 - i, 0));
    }

    const loop = () => {
        const state = engine.current;
        const w = canvas.width;
        const h = canvas.height;

        // A. UPDATE STATE
        if (isPlaying && state.running) {
            state.frames++;
            
            // 1. Dash Cooldown
            if (state.dashCooldown > 0) {
                state.dashCooldown--;
                if (state.dashCooldown === 0) setDashReady(true);
            }

            // 2. Smooth Movement (Lerp)
            if (state.hero.isMoving) {
                const speed = 0.3; // Interpolation speed
                state.hero.x += (state.hero.targetX - state.hero.x) * speed;
                state.hero.y += (state.hero.targetY - state.hero.y) * speed;
                
                // Snap if close
                if (Math.abs(state.hero.x - state.hero.targetX) < 1 && Math.abs(state.hero.y - state.hero.targetY) < 1) {
                    state.hero.x = state.hero.targetX;
                    state.hero.y = state.hero.targetY;
                    state.hero.isMoving = false;
                }
            }

            // 3. Camera (Follows Hero GridY)
            // Visual Y is (gridY * 40). We want that to be around screen Y = 400.
            // Camera Y should be (heroGridY * 40) - 400.
            const targetCam = (state.hero.gridY * GRID_SIZE) - 400;
            state.cameraY += (targetCam - state.cameraY) * 0.1; // Smooth cam

            // 4. Update Lanes & Obstacles
            state.lanes.forEach(lane => {
                // Move Elements
                lane.elements.forEach(el => {
                    if (!el.isPowerup) {
                        el.x += lane.speed;
                        if (lane.speed > 0 && el.x > w) el.x = -el.w;
                        if (lane.speed < 0 && el.x < -el.w) el.x = w;
                    }
                });

                // Collision Check
                if (lane.gridY === state.hero.gridY) {
                    let onLog = false;
                    let safe = lane.type === 'grass';
                    
                    lane.elements.forEach(el => {
                        const heroHitbox = { x: state.hero.x + 10, w: 20 }; // Tiny hitbox
                        const elHitbox = { x: el.x + 5, w: el.w - 10 };

                        if (heroHitbox.x < elHitbox.x + elHitbox.w && heroHitbox.x + heroHitbox.w > elHitbox.x) {
                            if (el.isPowerup) {
                                // Collect Powerup
                                if (el.type === 'gold') {
                                    state.score += 500;
                                    setScore(state.score);
                                    createParticles(el.x, lane.gridY*40, 'gold', 10);
                                } else if (el.type === 'shield') {
                                    state.shield = true;
                                    setHasShield(true);
                                    createParticles(el.x, lane.gridY*40, 'blue', 10);
                                }
                                // Remove powerup
                                el.x = -9999; 
                            } else if (lane.type === 'water') {
                                onLog = true;
                                if (!state.hero.isMoving) state.hero.x += lane.speed; // Ride log
                            } else {
                                // Hit Car
                                hitObstacle();
                            }
                        }
                    });

                    if (lane.type === 'water' && !onLog && !state.hero.isMoving) {
                        hitObstacle(); // Drowned
                    }
                }
            });

            // 5. Score & Gen
            const distScore = (15 - state.hero.gridY) * 10;
            if (distScore > state.score) {
                state.score = distScore;
                setScore(state.score);
            }
            
            // Gen new lanes
            const topLane = state.lanes[state.lanes.length - 1];
            if (topLane.gridY > state.hero.gridY - 15) {
                const diff = Math.floor(state.score / 500);
                state.lanes.push(generateLane(topLane.gridY - 1, diff));
            }
            
            // Clean lanes
            state.lanes = state.lanes.filter(l => l.gridY < state.hero.gridY + 10);
        }

        // B. RENDER
        ctx.fillStyle = "#111";
        ctx.fillRect(0,0,w,h);
        
        ctx.save();
        ctx.translate(0, -state.cameraY);

        // Draw Lanes
        state.lanes.forEach(lane => {
            const y = lane.gridY * GRID_SIZE;
            
            // Texture
            let color = '#333';
            if (lane.type === 'grass') color = lane.biome === 'matrix' ? '#003300' : '#4caf50';
            if (lane.type === 'water') color = '#1a237e';
            if (lane.type === 'road') color = '#212121';
            
            ctx.fillStyle = color;
            ctx.fillRect(0, y, w, GRID_SIZE);

            // Matrix Rain Effect
            if (lane.biome === 'matrix' && lane.type === 'grass') {
                ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                ctx.font = '10px monospace';
                ctx.fillText(String.fromCharCode(0x30A0 + Math.random()*96), Math.random()*w, y+20);
            }
            
            // Draw Elements
            lane.elements.forEach(el => {
                if (el.x < -100 || el.x > w + 100) return;
                
                let spriteKey = 'car';
                if (el.type === 'log') spriteKey = 'log';
                if (el.type === 'glitch') spriteKey = 'glitch';
                if (el.type === 'gold') spriteKey = 'gold';
                if (el.type === 'shield') spriteKey = 'shield';
                
                const img = state.sprites[spriteKey];
                if (img) ctx.drawImage(img, el.x, y + 5, el.w, 30);
                else {
                    ctx.fillStyle = 'red';
                    ctx.fillRect(el.x, y+5, el.w, 30);
                }
            });
        });

        // Draw Hero
        ctx.globalAlpha = state.shield ? 0.6 : 1.0; // Ghost mode if shielded
        const imgPepe = state.sprites['pepe'];
        if (imgPepe) ctx.drawImage(imgPepe, state.hero.x, state.hero.y, 35, 35);
        else {
            ctx.fillStyle = 'lime';
            ctx.fillRect(state.hero.x, state.hero.y, 35, 35);
        }
        ctx.globalAlpha = 1.0;

        // Shield Aura
        if (state.shield) {
            ctx.strokeStyle = 'cyan';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(state.hero.x + 17.5, state.hero.y + 17.5, 25, 0, Math.PI*2);
            ctx.stroke();
        }

        // Particles
        state.particles.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.life--;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 4, 4);
        });
        state.particles = state.particles.filter(p => p.life > 0);

        ctx.restore();
        
        animationId = requestAnimationFrame(loop);
    };

    const hitObstacle = () => {
        if (engine.current.shield) {
            engine.current.shield = false;
            setHasShield(false);
            createParticles(engine.current.hero.x, engine.current.hero.y, 'white', 20); // Shield break effect
            return;
        }
        engine.current.running = false;
        setGameOver(true);
        if(username) supabase.from('leaderboards').insert([{game_id:'frogger', username, score: engine.current.score}]);
    };

    loop();
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, resetKey]);

  // Sync Countdown
  useEffect(() => {
      if(!gameOver) setTimeout(() => {
          setIsPlaying(true);
          engine.current.running = true;
      }, 3000);
  }, [resetKey, gameOver]);

  const handleRestart = () => {
      setGameOver(false); setIsPlaying(false); setScore(0);
      setMultiplier(1); setHasShield(false); setDashReady(true);
      setResetKey(k => k + 1);
  };

  return (
    <div className="game-wrapper" tabIndex="0" style={{outline:'none'}}>
        <GameUI 
            score={score} 
            gameOver={gameOver} 
            isPlaying={isPlaying} 
            onRestart={handleRestart} 
            onExit={onExit} 
            gameId="frogger" 
        />
        
        {/* HUD Extras */}
        {isPlaying && !gameOver && (
            <div style={{position: 'absolute', top: 60, left: 10, pointerEvents:'none'}}>
                <div style={{color: dashReady ? 'cyan' : 'gray', fontSize: 14, fontFamily:'Press Start 2P'}}>
                    DASH: {dashReady ? 'READY (SHIFT)' : 'COOLDOWN'}
                </div>
                <div style={{color: multiplier > 1 ? 'yellow' : 'white', fontSize: 14, marginTop: 5, fontFamily:'Press Start 2P'}}>
                    COMBO: {multiplier.toFixed(1)}x
                </div>
                {hasShield && <div style={{color: 'cyan', fontSize: 14, marginTop: 5, fontFamily:'Press Start 2P'}}>SHIELD ACTIVE</div>}
            </div>
        )}

        <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default PepeFrogger;