import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const PepeFrogger = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
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

  const GRID_SIZE = 40;
  const COLS = 10;
  const CANVAS_WIDTH = 400;

  // --- ENGINE REF ---
  const engine = useRef({
    running: false,
    frames: 0,
    cameraY: 0,
    autoScrollY: 0, // The "Doom" camera position
    score: 0,
    
    // Mechanics
    multiplier: 1,
    lastMoveTime: 0,
    dashCooldown: 0,
    shield: false,
    
    // Entities
    hero: { 
        gridX: 4, gridY: 13, 
        x: 4 * 40, y: 13 * 40, 
        targetX: 4 * 40, targetY: 13 * 40, 
        isMoving: false 
    },
    lanes: [], // { gridY, type, speed, elements: [] }
    lastLaneType: 'grass', // For preventing double grass
    particles: [],
    
    sprites: {},
    keys: { up: false, down: false, left: false, right: false }
  });

  // --- 1. ASSET LOADER ---
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

  // --- 2. INPUT HANDLER ---
  useEffect(() => {
    if(containerRef.current) containerRef.current.focus();

    const handleInput = (e) => {
        if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","w","a","s","d"].includes(e.key)) {
            e.preventDefault();
        }
        
        const state = engine.current;

        // Instant Start
        if (!state.running && !gameOver) {
            state.running = true;
            setIsPlaying(true);
        }

        if (!state.running || state.hero.isMoving) return;

        let dx = 0; 
        let dy = 0;
        let isDash = e.shiftKey && state.dashCooldown <= 0;
        
        const key = e.key.toLowerCase();

        if (key === 'arrowup' || key === 'w') dy = -1;
        else if (key === 'arrowdown' || key === 's') dy = 1;
        else if (key === 'arrowleft' || key === 'a') dx = -1;
        else if (key === 'arrowright' || key === 'd') dx = 1;
        else return;

        // Apply Dash
        if (isDash) {
            dx *= 2; dy *= 2;
            state.dashCooldown = 180;
            setDashReady(false);
            createParticles(state.hero.x, state.hero.y, 'cyan', 10);
        }

        // Bounds Check
        const targetGX = state.hero.gridX + dx;
        const targetGY = state.hero.gridY + dy;

        if (targetGX >= 0 && targetGX < COLS) {
            state.hero.gridX = targetGX;
            state.hero.gridY = targetGY;
            
            state.hero.targetX = targetGX * GRID_SIZE;
            state.hero.targetY = targetGY * GRID_SIZE;
            state.hero.isMoving = true;

            // COMBO SYSTEM (Improved)
            const now = Date.now();
            const timeDiff = now - state.lastMoveTime;
            
            if (dy === -1 && timeDiff < 1000) { 
                // Only moving UP (Forward) counts for combo
                state.multiplier = Math.min(4, state.multiplier + 0.5);
            } else {
                // Moving sideways, back, or waiting too long resets combo
                state.multiplier = 1;
            }
            
            state.lastMoveTime = now;
            setMultiplier(state.multiplier);
        }
    };

    window.addEventListener('keydown', handleInput, { capture: true });
    
    // Touch Logic
    let touchStartX = 0;
    let touchStartY = 0;
    const handleTouchStart = (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    };
    const handleTouchEnd = (e) => {
        const diffX = e.changedTouches[0].screenX - touchStartX;
        const diffY = e.changedTouches[0].screenY - touchStartY;
        let key = '';
        if (Math.abs(diffX) > Math.abs(diffY)) key = diffX > 0 ? 'ArrowRight' : 'ArrowLeft';
        else key = diffY > 0 ? 'ArrowDown' : 'ArrowUp';
        handleInput({ key, code: key, shiftKey: false, preventDefault: () => {} });
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
        window.removeEventListener('keydown', handleInput, { capture: true });
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [gameOver]);

  // --- 3. GENERATION ---
  const generateLane = (gridY, difficulty, forceSafe = false) => {
      let biome = 'suburbs';
      if (gridY < -20) biome = 'city';
      if (gridY < -80) biome = 'matrix';

      let type = 'grass';
      const rand = Math.random();
      const lastType = engine.current.lastLaneType;

      // START ZONE LOGIC
      if (forceSafe) {
          type = 'grass';
      } 
      // NO FREE PATH LOGIC
      else if (lastType === 'grass') {
          // If last was grass, this MUST be road or water
          type = rand > 0.5 ? 'road' : (biome !== 'suburbs' ? 'water' : 'road');
      } 
      // Standard Generation
      else {
          if (biome === 'suburbs') {
             if (rand > 0.4) type = 'road';
          } else if (biome === 'city') {
             if (rand > 0.3) type = 'road';
             else if (rand > 0.7) type = 'water';
          } else {
             if (rand > 0.2) type = 'road';
             else type = 'water';
          }
      }
      
      engine.current.lastLaneType = type; // Remember for next time

      const elements = [];
      let speed = 0;

      if (type !== 'grass') {
          speed = (Math.random() * 2 + 2 + (difficulty * 0.1)) * (Math.random() < 0.5 ? 1 : -1);
          if (biome === 'matrix') speed *= 1.5;

          const count = Math.floor(Math.random() * 2) + 2;
          for (let i=0; i<count; i++) {
              elements.push({
                  x: i * 180 + Math.random() * 60,
                  w: type === 'water' ? 90 : 40,
                  type: type === 'water' ? 'log' : (biome === 'matrix' ? 'glitch' : 'car'),
                  isPowerup: false
              });
          }
      } else if (Math.random() < 0.08 && !forceSafe) {
          // Rare Powerup (Only on non-start grass)
          elements.push({
              x: Math.random() * 300 + 20, w: 30,
              type: Math.random() < 0.7 ? 'gold' : 'shield',
              isPowerup: true
          });
      }

      return { gridY, type, speed, elements, biome };
  };

  const createParticles = (x, y, color, count) => {
      for(let i=0; i<count; i++) {
          engine.current.particles.push({
              x, y, vx: (Math.random()-0.5)*8, vy: (Math.random()-0.5)*8, life: 20, color
          });
      }
  };

  // --- 4. GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    const resetGame = () => {
        engine.current.running = false;
        // Start at Grid 13
        engine.current.hero = { 
            gridX: 4, gridY: 13, 
            x: 160, y: 520, 
            targetX: 160, targetY: 520, 
            isMoving: false 
        };
        // Reset Camera
        const startCam = (13 * GRID_SIZE) - 400;
        engine.current.cameraY = startCam;
        engine.current.autoScrollY = startCam; // Reset Doom Scroll
        
        engine.current.score = 0;
        engine.current.shield = false;
        engine.current.lanes = [];
        engine.current.lastLaneType = 'grass';
        
        // Init Lanes - SAFE ZONE LOGIC
        // Create 20 lanes. Indices 0-4 (Grid 15-11) are FORCED SAFE.
        for (let i=0; i<20; i++) {
            // i=0 -> Grid 15 (Behind)
            // i=1 -> Grid 14 (Behind)
            // i=2 -> Grid 13 (Start Line)
            // i=3 -> Grid 12 (Front)
            // i=4 -> Grid 11 (Front)
            const isStartZone = i < 5; 
            engine.current.lanes.push(generateLane(15 - i, 0, isStartZone));
        }
    };
    resetGame();

    const loop = () => {
        const state = engine.current;
        const w = canvas.width;
        const h = canvas.height;

        if (state.running && !gameOver) {
            state.frames++;
            if (state.dashCooldown > 0) {
                state.dashCooldown--;
                if (state.dashCooldown === 0) setDashReady(true);
            }

            // Hero Interpolation
            if (state.hero.isMoving) {
                state.hero.x += (state.hero.targetX - state.hero.x) * 0.4;
                state.hero.y += (state.hero.targetY - state.hero.y) * 0.4;
                if (Math.abs(state.hero.x - state.hero.targetX) < 1 && Math.abs(state.hero.y - state.hero.targetY) < 1) {
                    state.hero.x = state.hero.targetX;
                    state.hero.y = state.hero.targetY;
                    state.hero.isMoving = false;
                }
            }

            // AUTO-SCROLL LOGIC ("The Doom Camera")
            // Starts after score 100
            if (state.score > 100) {
                // Scroll speed increases with score
                const scrollSpeed = 0.5 + (state.score * 0.001); 
                state.autoScrollY -= scrollSpeed;
            }

            // Normal Camera Tracking (Follow Hero)
            const heroCam = (state.hero.gridY * GRID_SIZE) - 400;
            
            // Actual Camera is whichever is "Higher" (smaller Y value)
            // This prevents the player from waiting at the bottom
            const targetCam = Math.min(heroCam, state.autoScrollY);
            
            state.cameraY += (targetCam - state.cameraY) * 0.1;

            // Lanes Logic
            state.lanes.forEach(lane => {
                lane.elements.forEach(el => {
                    if (!el.isPowerup) {
                        el.x += lane.speed;
                        if (lane.speed > 0 && el.x > w) el.x = -el.w;
                        if (lane.speed < 0 && el.x < -el.w) el.x = w;
                    }
                });

                // Collision
                if (lane.gridY === state.hero.gridY && !state.hero.isMoving) {
                    let onLog = false;
                    
                    lane.elements.forEach(el => {
                        if (state.hero.x + 25 > el.x + 5 && state.hero.x + 10 < el.x + el.w - 5) {
                            if (el.isPowerup) {
                                if (el.type === 'gold') { setScore(s => s + 500); state.score += 500; }
                                if (el.type === 'shield') { setHasShield(true); state.shield = true; }
                                el.x = -9999; 
                            } else if (lane.type === 'water') {
                                onLog = true;
                                state.hero.x += lane.speed;
                                state.hero.targetX = state.hero.x; 
                            } else {
                                hitObstacle();
                            }
                        }
                    });

                    if (lane.type === 'water' && !onLog) hitObstacle();
                }
            });

            // Lane Gen
            const topLane = state.lanes[state.lanes.length - 1];
            if (topLane.gridY > state.hero.gridY - 15) {
                state.lanes.push(generateLane(topLane.gridY - 1, Math.floor(state.score/500)));
            }
            state.lanes = state.lanes.filter(l => l.gridY < state.hero.gridY + 10);
            
            // Score
            const dist = (13 - state.hero.gridY) * 10;
            if (dist > state.score) { state.score = dist; setScore(dist); }
            
            // DEATH BY CAMERA (Doom Scroll)
            // If hero is below the camera view + canvas height
            if (state.hero.y > state.cameraY + h + GRID_SIZE) {
                hitObstacle();
            }
        }

        // B. RENDER
        ctx.fillStyle = "#111";
        ctx.fillRect(0,0,w,h);
        
        ctx.save();
        ctx.translate(0, -state.cameraY);

        state.lanes.forEach(lane => {
            const y = lane.gridY * GRID_SIZE;
            
            // Textures
            let color = '#333';
            if (lane.type === 'grass') color = lane.biome === 'matrix' ? '#003300' : '#2e7d32';
            if (lane.type === 'water') color = '#1565c0';
            if (lane.type === 'road') color = '#212121';
            ctx.fillStyle = color;
            ctx.fillRect(0, y, w, GRID_SIZE);

            if (lane.type === 'road') {
                ctx.fillStyle = '#666'; 
                ctx.fillRect(0, y, w, 2); 
                ctx.fillRect(0, y+38, w, 2);
            }

            // Sprites
            lane.elements.forEach(el => {
                let sKey = 'car';
                if (el.type === 'log') sKey = 'log';
                if (el.type === 'glitch') sKey = 'glitch';
                if (el.type === 'gold') sKey = 'gold';
                if (el.type === 'shield') sKey = 'shield';

                const img = engine.current.sprites[sKey];
                if (img) ctx.drawImage(img, el.x, y+5, el.w, 30);
                else {
                    ctx.fillStyle = el.isPowerup ? 'gold' : 'red';
                    ctx.fillRect(el.x, y+5, el.w, 30);
                }
            });
        });

        // Doom Line (Visual Warning)
        if (state.score > 80) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            const dangerY = state.cameraY + h;
            ctx.fillRect(0, dangerY - 20, w, 20);
            ctx.fillStyle = 'red';
            ctx.font = '10px monospace';
            ctx.fillText("! RUN !", 10, dangerY - 5);
        }

        // Hero
        const pepe = engine.current.sprites['pepe'];
        if (state.shield) {
            ctx.strokeStyle = 'cyan';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(state.hero.x + 17, state.hero.y + 17, 25, 0, Math.PI*2);
            ctx.stroke();
        }
        if (pepe) ctx.drawImage(pepe, state.hero.x, state.hero.y, 35, 35);
        else { ctx.fillStyle = 'lime'; ctx.fillRect(state.hero.x, state.hero.y, 35, 35); }

        // Particles
        state.particles.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.life--;
            ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4);
        });
        state.particles = state.particles.filter(p => p.life > 0);

        ctx.restore();
        animationId = requestAnimationFrame(loop);
    };

    const hitObstacle = () => {
        if (engine.current.shield) {
            engine.current.shield = false;
            setHasShield(false);
            createParticles(engine.current.hero.x, engine.current.hero.y, 'white', 20);
            return;
        }
        engine.current.running = false;
        setGameOver(true);
        if(username) supabase.from('leaderboards').insert([{game_id:'frogger', username, score: engine.current.score}]);
    };

    loop();
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]);

  useEffect(() => {
      if(!gameOver) setTimeout(() => {
          setIsPlaying(true);
          engine.current.running = true;
      }, 3000);
  }, [resetKey, gameOver]);

  return (
    <div 
        ref={containerRef}
        className="game-wrapper" 
        tabIndex="0" 
        style={{outline: '4px solid #00ff00'}} 
        onClick={() => containerRef.current.focus()}
    >
        <GameUI 
            score={score} 
            gameOver={gameOver} 
            isPlaying={isPlaying} 
            onRestart={() => { 
                setGameOver(false); setIsPlaying(false); setScore(0);
                setMultiplier(1); setHasShield(false); setDashReady(true);
                setResetKey(k => k + 1); 
            }} 
            onExit={onExit} 
            gameId="frogger" 
        />
        
        {isPlaying && !gameOver && (
            <div style={{position: 'absolute', top: 60, left: 10, pointerEvents:'none'}}>
                <div style={{color: dashReady?'cyan':'gray', fontFamily:'monospace', fontSize:16, textShadow:'1px 1px black'}}>
                    DASH: {dashReady ? 'READY (SHIFT)' : 'WAIT'}
                </div>
                <div style={{color: multiplier > 1 ? 'yellow' : 'white', fontFamily:'monospace', fontSize:16, textShadow:'1px 1px black'}}>
                    COMBO: {multiplier.toFixed(1)}x
                </div>
                {hasShield && <div style={{color:'cyan', fontSize:16, textShadow:'1px 1px black'}}>SHIELD ON</div>}
            </div>
        )}

        <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default PepeFrogger;