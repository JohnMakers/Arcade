import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const PepeFrogger = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [hasShield, setHasShield] = useState(false);

  const GRID_SIZE = 40;
  const COLS = 10;

  const engine = useRef({
    running: false,
    isDead: false, // NEW GUARD FLAG
    frames: 0,
    cameraY: 0,
    autoScrollY: 0,
    score: 0,
    lastInputTime: 0,
    consecutiveUpMoves: 0,
    shield: false,
    invulnerable: 0,
    hero: { gridX: 4, gridY: 13, x: 160, y: 520, targetX: 160, targetY: 520, isMoving: false },
    lanes: [], 
    lastLaneType: 'grass',
    particles: [],
    sprites: {},
    lastTime: 0
  });

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
  }, []);

  useEffect(() => {
    if(containerRef.current) containerRef.current.focus();

    const handleInput = (e) => {
        // IGNORE INPUT IF DEAD
        if (engine.current.isDead) return;

        if (e.target && (e.target.closest('button') || e.target.closest('.interactive'))) return;

        if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","w","a","s","d"].includes(e.key)) {
            e.preventDefault();
        }
        
        const state = engine.current;
        const now = performance.now();

        if (!state.running && !gameOver) {
            // Wait for 3s timer via useEffect below, don't start manually on keypress anymore
            // OR if you want keypress to skip timer, keep this, but user asked for 3s start.
            // We will let the timer handle the start to match GameUI countdown.
            return; 
        }

        if (!state.running || state.hero.isMoving) return;

        let dx = 0; let dy = 0;
        const key = e.key ? e.key.toLowerCase() : '';

        if (key === 'arrowup' || key === 'w') {
            dy = -1;
            state.consecutiveUpMoves++;
            if (state.consecutiveUpMoves >= 2) state.lastInputTime = now;
        } else {
            state.consecutiveUpMoves = 0;
            if (key === 'arrowdown' || key === 's') dy = 1;
            else if (key === 'arrowleft' || key === 'a') dx = -1;
            else if (key === 'arrowright' || key === 'd') dx = 1;
            else return;
        }

        const currentVisualGridX = Math.round(state.hero.x / GRID_SIZE);
        const targetGX = currentVisualGridX + dx;
        const targetGY = state.hero.gridY + dy;

        if (targetGX >= 0 && targetGX < COLS) {
            state.hero.gridX = targetGX;
            state.hero.gridY = targetGY;
            state.hero.targetX = targetGX * GRID_SIZE;
            state.hero.targetY = targetGY * GRID_SIZE;
            state.hero.isMoving = true;
        }
    };

    window.addEventListener('keydown', handleInput, { capture: true });
    
    const wrapper = containerRef.current;
    let touchStartX = 0;
    let touchStartY = 0;

    const onTouchStart = (e) => {
        if (e.target.closest('button') || e.target.closest('.interactive')) return;
        if(e.cancelable) e.preventDefault();
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    };
    
    const onTouchMove = (e) => {
        if (e.target.closest('button')) return;
        if(e.cancelable) e.preventDefault();
    };

    const onTouchEnd = (e) => {
        if (e.target.closest('button')) return;
        if(e.cancelable) e.preventDefault();
        const diffX = e.changedTouches[0].screenX - touchStartX;
        const diffY = e.changedTouches[0].screenY - touchStartY;
        let key = '';
        if (Math.abs(diffX) > Math.abs(diffY)) key = diffX > 0 ? 'ArrowRight' : 'ArrowLeft';
        else key = diffY > 0 ? 'ArrowDown' : 'ArrowUp';
        
        handleInput({ key, code: key, shiftKey: false, preventDefault: () => {} });
    };

    if(wrapper) {
        wrapper.addEventListener('touchstart', onTouchStart, { passive: false });
        wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
        wrapper.addEventListener('touchend', onTouchEnd, { passive: false });
    }

    return () => {
        window.removeEventListener('keydown', handleInput, { capture: true });
        if(wrapper) {
            wrapper.removeEventListener('touchstart', onTouchStart);
            wrapper.removeEventListener('touchmove', onTouchMove);
            wrapper.removeEventListener('touchend', onTouchEnd);
        }
    };
  }, [gameOver]);

  // Helpers
  const generateLane = (gridY, difficulty, forceSafe = false) => {
      let biome = 'suburbs';
      if (gridY < -20) biome = 'city';
      if (gridY < -80) biome = 'matrix';
      let type = 'grass';
      const rand = Math.random();
      const lastType = engine.current.lastLaneType;
      if (forceSafe) { type = 'grass'; } 
      else if (lastType === 'grass') { type = rand > 0.5 ? 'road' : (biome !== 'suburbs' ? 'water' : 'road'); } 
      else {
          if (biome === 'suburbs') { if (rand > 0.4) type = 'road'; } 
          else if (biome === 'city') { if (rand > 0.3) type = 'road'; else if (rand > 0.7) type = 'water'; } 
          else { if (rand > 0.2) type = 'road'; else type = 'water'; }
      }
      engine.current.lastLaneType = type;
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
          elements.push({ x: Math.random() * 300 + 20, w: 30, type: Math.random() < 0.7 ? 'gold' : 'shield', isPowerup: true });
      }
      return { gridY, type, speed, elements, biome };
  };

  const createParticles = (x, y, color, count) => {
      for(let i=0; i<count; i++) {
          engine.current.particles.push({ x, y, vx: (Math.random()-0.5)*8, vy: (Math.random()-0.5)*8, life: 20, color });
      }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    const resetGame = () => {
        engine.current.running = false;
        engine.current.isDead = false; // RESET FLAG
        engine.current.hero = { gridX: 4, gridY: 13, x: 160, y: 520, targetX: 160, targetY: 520, isMoving: false };
        const startCam = (13 * GRID_SIZE) - 400;
        engine.current.cameraY = startCam;
        engine.current.autoScrollY = startCam; 
        engine.current.score = 0;
        engine.current.shield = false;
        engine.current.invulnerable = 0;
        engine.current.consecutiveUpMoves = 0;
        engine.current.lanes = [];
        engine.current.lastLaneType = 'grass';
        engine.current.lastTime = performance.now();
        engine.current.lastInputTime = performance.now();
        for (let i=0; i<20; i++) { engine.current.lanes.push(generateLane(15 - i, 0, i < 5)); }
    };
    resetGame();

    const loop = (time) => {
        const state = engine.current;
        const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
        state.lastTime = time;

        const w = canvas.width;
        const h = canvas.height;

        // STOP LOGIC IF DEAD
        if (state.running && !state.isDead && !gameOver) {
            state.frames++;
            if (state.invulnerable > 0) { state.invulnerable -= 1 * dt; }

            let scrollSpeed = 0.5 + (state.score * 0.001);
            if (time - state.lastInputTime > 4000 && state.score > 500) {
                scrollSpeed += 2.5; 
            }

            if (state.score > 100) { state.autoScrollY -= scrollSpeed * dt; }
            
            const heroCam = (state.hero.gridY * GRID_SIZE) - 400;
            const targetCam = Math.min(heroCam, state.autoScrollY);
            state.cameraY += (targetCam - state.cameraY) * 0.1 * dt;

            if (state.hero.isMoving) {
                const lerpSpeed = 0.4 * dt; 
                state.hero.x += (state.hero.targetX - state.hero.x) * lerpSpeed;
                state.hero.y += (state.hero.targetY - state.hero.y) * lerpSpeed;
                
                if (Math.abs(state.hero.x - state.hero.targetX) < 1 && Math.abs(state.hero.y - state.hero.targetY) < 1) {
                    state.hero.x = state.hero.targetX; state.hero.y = state.hero.targetY; state.hero.isMoving = false;
                }
            }

            state.lanes.forEach(lane => {
                lane.elements.forEach(el => {
                    if (!el.isPowerup) {
                        el.x += lane.speed * dt;
                        if (lane.speed > 0 && el.x > w) el.x = -el.w;
                        if (lane.speed < 0 && el.x < -el.w) el.x = w;
                    }
                });
                
                if (lane.gridY === state.hero.gridY && !state.hero.isMoving) {
                    let onLog = false;
                    lane.elements.forEach(el => {
                        if (state.hero.x + 25 > el.x + 5 && state.hero.x + 10 < el.x + el.w - 5) {
                            if (el.isPowerup) {
                                if (el.type === 'gold') { setScore(s => s + 100); state.score += 100; }
                                if (el.type === 'shield') { setHasShield(true); state.shield = true; }
                                el.x = -9999; 
                            } else if (lane.type === 'water') {
                                onLog = true; state.hero.x += lane.speed * dt; state.hero.targetX = state.hero.x; 
                            } else { hitObstacle(); }
                        }
                    });
                    if (lane.type === 'water' && !onLog) hitObstacle();
                }
            });

            const topLane = state.lanes[state.lanes.length - 1];
            if (topLane.gridY > state.hero.gridY - 15) { state.lanes.push(generateLane(topLane.gridY - 1, Math.floor(state.score/500))); }
            state.lanes = state.lanes.filter(l => l.gridY < state.hero.gridY + 10);
            
            const dist = (13 - state.hero.gridY) * 10;
            if (dist > state.score) { state.score = dist; setScore(dist); }
            if (state.hero.y > state.cameraY + h + GRID_SIZE) hitObstacle();
        }

        ctx.fillStyle = "#111"; ctx.fillRect(0,0,w,h);
        ctx.save(); ctx.translate(0, -state.cameraY);

        state.lanes.forEach(lane => {
            const y = lane.gridY * GRID_SIZE;
            let color = lane.type === 'grass' ? (lane.biome === 'matrix' ? '#003300' : '#2e7d32') : (lane.type === 'water' ? '#1565c0' : '#212121');
            ctx.fillStyle = color; ctx.fillRect(0, y, w, GRID_SIZE);
            if (lane.type === 'road') { ctx.fillStyle = '#666'; ctx.fillRect(0, y, w, 2); ctx.fillRect(0, y+38, w, 2); }
            lane.elements.forEach(el => {
                let sKey = 'car';
                if (el.type === 'log') sKey = 'log'; if (el.type === 'glitch') sKey = 'glitch';
                if (el.type === 'gold') sKey = 'gold'; if (el.type === 'shield') sKey = 'shield';
                const img = engine.current.sprites[sKey];
                if (img) ctx.drawImage(img, el.x, y+5, el.w, 30);
                else { ctx.fillStyle = el.isPowerup ? 'gold' : 'red'; ctx.fillRect(el.x, y+5, el.w, 30); }
            });
        });

        if (state.score > 80) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'; const dangerY = state.cameraY + h;
            ctx.fillRect(0, dangerY - 20, w, 20); ctx.fillStyle = 'red'; ctx.font = '10px monospace'; ctx.fillText("! RUN !", 10, dangerY - 5);
        }

        const pepe = engine.current.sprites['pepe'];
        if (state.invulnerable <= 0 || Math.floor(state.frames / 5) % 2 === 0) {
            if (state.shield) { 
                ctx.strokeStyle = 'cyan'; ctx.lineWidth = 3; 
                ctx.beginPath(); ctx.arc(state.hero.x + 17, state.hero.y + 17, 25, 0, Math.PI*2); ctx.stroke(); 
            }
            if (pepe) ctx.drawImage(pepe, state.hero.x, state.hero.y, 35, 35);
            else { ctx.fillStyle = 'lime'; ctx.fillRect(state.hero.x, state.hero.y, 35, 35); }
        }

        state.particles.forEach(p => { 
            p.x += p.vx * dt; 
            p.y += p.vy * dt; 
            p.life -= 1 * dt; 
            ctx.fillStyle = p.color; 
            ctx.fillRect(p.x, p.y, 4, 4); 
        });
        state.particles = state.particles.filter(p => p.life > 0);
        ctx.restore();
        animationId = requestAnimationFrame(loop);
    };

    const hitObstacle = async () => {
        // --- GUARD: PREVENT DOUBLE DEATH / INPUT AFTER DEATH ---
        if (engine.current.isDead) return;

        if (engine.current.invulnerable > 0) return;
        if (engine.current.shield) {
            engine.current.shield = false; 
            setHasShield(false);
            engine.current.invulnerable = 60; 
            createParticles(engine.current.hero.x, engine.current.hero.y, 'white', 20);
            return;
        }

        // 1. FREEZE GAME LOGIC IMMEDIATELY
        engine.current.running = false; 
        engine.current.isDead = true; 
        
        // 2. SAVE SCORE
        if(username) {
            await supabase.from('leaderboards').insert([{
                game_id: 'frogger', 
                username, 
                score: engine.current.score, 
                address: address
            }]);
        }
        
        // 3. SHOW UI
        setGameOver(true);
    };

    loop(performance.now());
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]);

  useEffect(() => { if(!gameOver) setTimeout(() => { setIsPlaying(true); engine.current.running = true; engine.current.lastTime = performance.now(); }, 3000); }, [resetKey, gameOver]);

  return (
    <div ref={containerRef} className="game-wrapper" tabIndex="0" style={{outline: '4px solid #00ff00'}} onClick={() => containerRef.current.focus()}>
        <GameUI score={score} gameOver={gameOver} isPlaying={isPlaying} onRestart={() => { setGameOver(false); setIsPlaying(false); setScore(0); setHasShield(false); setResetKey(k => k + 1); }} onExit={onExit} gameId="frogger" />
        {isPlaying && !gameOver && (
            <div style={{position: 'absolute', top: 60, left: 10, pointerEvents:'none'}}>
                {hasShield && <div style={{color:'cyan', fontSize:16, textShadow:'1px 1px black'}}>SHIELD ON</div>}
            </div>
        )}
        <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default PepeFrogger;