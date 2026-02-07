import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const PepeFrogger = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username } = useContext(UserContext);

  // --- REACT STATE ---
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- ENGINE STATE (Mutable Ref) ---
  const engine = useRef({
    running: false,
    hero: { x: 180, y: 500, w: 35, h: 35, vx: 0, vy: 0 },
    cameraY: 0,
    lanes: [], // { y, type, speed, elements: [{x, w, type}] }
    score: 0,
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
  }, []);

  // --- 2. INPUT HANDLERS (No Lag) ---
  useEffect(() => {
    const handleKey = (e, isDown) => {
      const k = engine.current.keys;
      if (e.key === 'ArrowUp') k.up = isDown;
      if (e.key === 'ArrowDown') k.down = isDown;
      if (e.key === 'ArrowLeft') k.left = isDown;
      if (e.key === 'ArrowRight') k.right = isDown;
    };
    const down = (e) => handleKey(e, true);
    const up = (e) => handleKey(e, false);

    // Mobile Touch D-Pad Logic
    const touchStart = (e) => {
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const k = engine.current.keys;
        
        // Simple Touch Zones
        if (y > h * 0.75) k.down = true;
        else if (y < h * 0.25) k.up = true;
        else if (x < w * 0.5) k.left = true;
        else k.right = true;
    };
    const touchEnd = () => {
        const k = engine.current.keys;
        k.up = k.down = k.left = k.right = false;
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('touchstart', touchStart);
    window.addEventListener('touchend', touchEnd);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('touchstart', touchStart);
      window.removeEventListener('touchend', touchEnd);
    };
  }, []);

  // --- 3. GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    // Reset Engine
    engine.current.running = false;
    engine.current.hero = { x: 180, y: 500, w: 35, h: 35, vx: 0, vy: 0 };
    engine.current.cameraY = 0;
    engine.current.score = 0;
    
    // Initial Lanes (Safe Start)
    engine.current.lanes = [];
    for(let i=0; i<15; i++) {
        // Start with grass for first 5 lanes, then mix
        engine.current.lanes.push(generateLane(500 - (i * 40), i < 5 ? 0 : 1)); 
    }

    const GRID = 40;
    const SPEED = 3;

    function generateLane(y, difficultyLevel) {
        // Difficulty 0 = Grass
        // Difficulty 1 = Easy Road
        // Difficulty 2 = Water starts appearing
        // Difficulty 5 = Chaos
        
        const types = ['grass', 'road', 'water'];
        let type = 'grass';
        
        const rand = Math.random();
        if (difficultyLevel > 0) {
            if (difficultyLevel < 3) {
                // Mostly road, rare water
                type = rand > 0.7 ? 'grass' : 'road';
            } else {
                // Mix of all
                if (rand < 0.3) type = 'grass';
                else if (rand < 0.6) type = 'road';
                else type = 'water';
            }
        }

        // Generate Elements (Cars/Logs)
        const elements = [];
        // Random speed: 1.5 to 4.5 based on difficulty
        const dir = Math.random() < 0.5 ? 1 : -1;
        const laneSpeed = (Math.random() * 2 + 1.5 + (difficultyLevel * 0.1)) * dir;

        if (type !== 'grass') {
            const count = Math.floor(Math.random() * 2) + 2; // 2-3 items
            for(let i=0; i<count; i++) {
                // Gap logic to ensure playability
                const w = type === 'water' ? (Math.random() * 60 + 80) : 40; // Logs are wider
                const x = (i * 200) + Math.random() * 50;
                elements.push({ x, w, type: type === 'water' ? 'log' : 'car' });
            }
        }

        return { y, type, speed: laneSpeed, elements };
    }

    // Helper: Draw Sprite or Rect
    const drawSprite = (k, x, y, w, h, c) => {
        const img = engine.current.sprites[k];
        if (img && img.complete) ctx.drawImage(img, x, y, w, h);
        else { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
    };

    const loop = () => {
        const state = engine.current;
        const w = canvas.width;
        const h = canvas.height;

        // 1. CLEAR & BACKGROUND
        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, w, h);

        if (isPlaying && state.running) {
            // 2. INPUT MOVEMENT
            if (state.keys.left) state.hero.x -= SPEED;
            if (state.keys.right) state.hero.x += SPEED;
            if (state.keys.up) state.hero.y -= SPEED;
            if (state.keys.down) state.hero.y += SPEED;

            // Clamp Screen X
            if (state.hero.x < 0) state.hero.x = 0;
            if (state.hero.x > w - state.hero.w) state.hero.x = w - state.hero.w;

            // 3. CAMERA FOLLOW (Infinite Scroll Up)
            // Ideally camera keeps hero in lower 1/3rd, but let's just center him vertically or push up
            const targetCam = state.hero.y - 400; // Keep hero at y=400 visual
            // Smooth lerp or hard lock? Hard lock for frogger precision is better visually
            if (targetCam < state.cameraY) {
                state.cameraY = targetCam;
            }

            // Score = Distance Traveled Upwards (Inverted Y)
            const dist = Math.floor((500 - state.hero.y) / 10); // 1 pt per 10px
            if (dist > state.score) {
                state.score = dist;
                setScore(state.score); // Sync UI
            }

            // 4. LANE LOGIC
            // Difficulty increases with score (dist)
            const difficulty = Math.floor(state.score / 50); 

            // Add new lanes at top
            const lowestY = state.lanes[state.lanes.length - 1].y; // Actually "highest" visually (lowest number)
            if (lowestY > state.cameraY - 100) {
                 state.lanes.push(generateLane(lowestY - GRID, difficulty));
            }
            
            // Remove old lanes
            state.lanes = state.lanes.filter(l => l.y < state.cameraY + h + 100);

            // 5. UPDATE ELEMENTS & COLLISION
            let onLog = false;
            let inWater = false;

            state.lanes.forEach(lane => {
                // Draw Ground
                const visualY = lane.y - state.cameraY;
                if (visualY > h || visualY < -GRID) return; // Optimization

                // Move Elements
                lane.elements.forEach(el => {
                    el.x += lane.speed;
                    // Wrap around
                    if (lane.speed > 0 && el.x > w) el.x = -el.w;
                    if (lane.speed < 0 && el.x < -el.w) el.x = w;
                });

                // Check Lane Collision
                // Hero center point
                const hCy = state.hero.y + state.hero.h/2;
                if (hCy >= lane.y && hCy < lane.y + GRID) {
                    if (lane.type === 'water') inWater = true;

                    lane.elements.forEach(el => {
                        // HITBOX PADDING (The Fix)
                        // Make collision box smaller than visual box
                        const pad = 8;
                        if (
                            state.hero.x + state.hero.w - pad > el.x &&
                            state.hero.x + pad < el.x + el.w
                        ) {
                             if (lane.type === 'water') {
                                 onLog = true;
                                 state.hero.x += lane.speed; // Ride log
                             } else if (lane.type === 'road') {
                                 handleDeath();
                             }
                        }
                    });
                }
            });

            // Water Death
            if (inWater && !onLog) handleDeath();
            
            // Bottom Screen Death (Camera scroll kills you if you stay back)
            if (state.hero.y > state.cameraY + h) handleDeath();
        }

        // 6. RENDER PHASE (Always Draw)
        ctx.save();
        ctx.translate(0, -state.cameraY);

        state.lanes.forEach(lane => {
            // Draw Ground
            ctx.fillStyle = lane.type === 'grass' ? '#4caf50' : lane.type === 'water' ? '#2196f3' : '#333';
            ctx.fillRect(0, lane.y, w, GRID);
            
            // Draw Lane Markers
            if (lane.type === 'road') {
                ctx.fillStyle = '#555';
                ctx.fillRect(0, lane.y, w, 2); // Top line
                ctx.fillRect(0, lane.y + GRID - 2, w, 2); // Bottom line
                // Dashed line center
                ctx.setLineDash([10, 10]);
                ctx.beginPath();
                ctx.moveTo(0, lane.y + GRID/2);
                ctx.lineTo(w, lane.y + GRID/2);
                ctx.strokeStyle = '#555';
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Draw Elements
            lane.elements.forEach(el => {
                if (el.type === 'car') drawSprite('car', el.x, lane.y + 5, el.w, GRID - 10, 'red');
                else drawSprite('log', el.x, lane.y + 5, el.w, GRID - 10, 'brown');
            });
        });

        // Draw Hero
        drawSprite('pepe', state.hero.x, state.hero.y, state.hero.w, state.hero.h, 'lime');

        ctx.restore();

        animationId = requestAnimationFrame(loop);
    };

    const handleDeath = () => {
        engine.current.running = false;
        setGameOver(true);
        if(username) supabase.from('leaderboards').insert([{game_id:'frogger', username, score: engine.current.score}]);
    };

    loop();
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, resetKey]);

  // Countdown & Restart
  useEffect(() => {
    if(!gameOver) setTimeout(() => {
        setIsPlaying(true);
        engine.current.running = true;
    }, 3000);
  }, [resetKey, gameOver]);

  return (
    <div className="game-wrapper">
        <GameUI 
            score={score} 
            gameOver={gameOver} 
            isPlaying={isPlaying} 
            onRestart={() => { setGameOver(false); setIsPlaying(false); setScore(0); setResetKey(k=>k+1); }} 
            onExit={onExit} 
            gameId="frogger" 
        />
        <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default PepeFrogger;