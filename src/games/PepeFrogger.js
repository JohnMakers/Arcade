import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const PepeFrogger = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null); // Reference for focusing
  const { username } = useContext(UserContext);

  // --- REACT STATE ---
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- ENGINE STATE ---
  const engine = useRef({
    running: false,
    hero: { x: 180, y: 500, w: 35, h: 35, vx: 0, vy: 0 },
    cameraY: 0,
    lanes: [],
    score: 0,
    sprites: {},
    patterns: {}, // Store repeating textures
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
    
    // Load Textures
    load('tex_grass', ASSETS.TEXTURE_GRASS);
    load('tex_road', ASSETS.TEXTURE_ROAD);
    load('tex_water', ASSETS.TEXTURE_WATER);
  }, []);

  // --- 2. INPUT HANDLERS (With Focus Fix) ---
  useEffect(() => {
    // Force focus on mount so keyboard works immediately
    if (containerRef.current) containerRef.current.focus();

    const handleKey = (e, isDown) => {
      // Prevent default scrolling
      if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(e.code) > -1) {
          e.preventDefault();
      }

      const k = engine.current.keys;
      if (e.key === 'ArrowUp' || e.key === 'w') k.up = isDown;
      if (e.key === 'ArrowDown' || e.key === 's') k.down = isDown;
      if (e.key === 'ArrowLeft' || e.key === 'a') k.left = isDown;
      if (e.key === 'ArrowRight' || e.key === 'd') k.right = isDown;
    };
    const down = (e) => handleKey(e, true);
    const up = (e) => handleKey(e, false);

    const touchStart = (e) => {
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const k = engine.current.keys;
        
        if (y > h * 0.75) k.down = true;
        else if (y < h * 0.25) k.up = true;
        else if (x < w * 0.5) k.left = true;
        else k.right = true;
    };
    const touchEnd = () => {
        const k = engine.current.keys;
        k.up = k.down = k.left = k.right = false;
    };

    // Attach to WINDOW to catch all key presses globally
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('touchstart', touchStart, { passive: false });
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

    // Initialize Patterns Helper
    const getPattern = (key) => {
        if (engine.current.patterns[key]) return engine.current.patterns[key];
        const img = engine.current.sprites[key];
        if (img && img.complete) {
            const pat = ctx.createPattern(img, 'repeat');
            engine.current.patterns[key] = pat;
            return pat;
        }
        return null;
    };

    // Reset Engine
    engine.current.running = false;
    engine.current.hero = { x: 180, y: 500, w: 35, h: 35, vx: 0, vy: 0 };
    engine.current.cameraY = 0;
    engine.current.score = 0;
    
    // Initial Lanes
    engine.current.lanes = [];
    for(let i=0; i<15; i++) engine.current.lanes.push(generateLane(500 - (i * 40), i < 5 ? 0 : 1)); 

    const GRID = 40;
    const SPEED = 4; // Slightly faster for responsiveness

    function generateLane(y, difficultyLevel) {
        const types = ['grass', 'road', 'water'];
        let type = 'grass';
        const rand = Math.random();
        
        if (difficultyLevel > 0) {
            if (difficultyLevel < 3) type = rand > 0.6 ? 'grass' : 'road'; // More roads
            else {
                if (rand < 0.25) type = 'grass';
                else if (rand < 0.65) type = 'road';
                else type = 'water';
            }
        }

        const elements = [];
        const dir = Math.random() < 0.5 ? 1 : -1;
        const laneSpeed = (Math.random() * 2 + 2 + (difficultyLevel * 0.15)) * dir;

        if (type !== 'grass') {
            const count = Math.floor(Math.random() * 2) + 2;
            for(let i=0; i<count; i++) {
                const w = type === 'water' ? (Math.random() * 60 + 80) : 40; 
                const x = (i * 200) + Math.random() * 50;
                elements.push({ x, w, type: type === 'water' ? 'log' : 'car' });
            }
        }
        return { y, type, speed: laneSpeed, elements };
    }

    const drawSprite = (k, x, y, w, h, c) => {
        const img = engine.current.sprites[k];
        if (img && img.complete) ctx.drawImage(img, x, y, w, h);
        else { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
    };

    const loop = () => {
        const state = engine.current;
        const w = canvas.width;
        const h = canvas.height;

        // 1. CLEAR
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, w, h);

        if (isPlaying && state.running) {
            // MOVEMENT
            if (state.keys.left) state.hero.x -= SPEED;
            if (state.keys.right) state.hero.x += SPEED;
            if (state.keys.up) state.hero.y -= SPEED;
            if (state.keys.down) state.hero.y += SPEED;

            // Clamp X
            if (state.hero.x < 0) state.hero.x = 0;
            if (state.hero.x > w - state.hero.w) state.hero.x = w - state.hero.w;

            // Camera
            const targetCam = state.hero.y - 400;
            if (targetCam < state.cameraY) state.cameraY = targetCam;

            // Score
            const dist = Math.floor((500 - state.hero.y) / 10);
            if (dist > state.score) {
                state.score = dist;
                setScore(state.score);
            }

            // Lanes Logic
            const difficulty = Math.floor(state.score / 50); 
            const lowestY = state.lanes[state.lanes.length - 1].y;
            if (lowestY > state.cameraY - 100) {
                 state.lanes.push(generateLane(lowestY - GRID, difficulty));
            }
            state.lanes = state.lanes.filter(l => l.y < state.cameraY + h + 100);

            // Collision
            let onLog = false;
            let inWater = false;
            let onGrass = false; // Track if we are safely on land

            state.lanes.forEach(lane => {
                // Update Pos
                const visualY = lane.y - state.cameraY;
                if (visualY > h || visualY < -GRID) {
                    // Just update physics for off-screen
                    lane.elements.forEach(el => {
                        el.x += lane.speed;
                        if (lane.speed > 0 && el.x > w) el.x = -el.w;
                        if (lane.speed < 0 && el.x < -el.w) el.x = w;
                    });
                    return;
                }

                // On-Screen Update
                lane.elements.forEach(el => {
                    el.x += lane.speed;
                    if (lane.speed > 0 && el.x > w) el.x = -el.w;
                    if (lane.speed < 0 && el.x < -el.w) el.x = w;
                });

                // Check Lane Intersection
                const hCy = state.hero.y + state.hero.h/2;
                if (hCy >= lane.y && hCy < lane.y + GRID) {
                    if (lane.type === 'water') inWater = true;
                    if (lane.type === 'grass') onGrass = true;

                    lane.elements.forEach(el => {
                        const pad = 8;
                        if (state.hero.x + state.hero.w - pad > el.x &&
                            state.hero.x + pad < el.x + el.w) {
                             if (lane.type === 'water') {
                                 onLog = true;
                                 state.hero.x += lane.speed;
                             } else if (lane.type === 'road') {
                                 handleDeath();
                             }
                        }
                    });
                }
            });

            if (inWater && !onLog) handleDeath();
            if (state.hero.y > state.cameraY + h) handleDeath();
        }

        // 2. RENDER
        ctx.save();
        ctx.translate(0, -state.cameraY);

        state.lanes.forEach(lane => {
            // Draw Ground with Patterns
            let pat = null;
            let fallback = '#333';
            
            if (lane.type === 'grass') {
                pat = getPattern('tex_grass');
                fallback = '#0f380f'; // Matrix Dark Green
            } else if (lane.type === 'road') {
                pat = getPattern('tex_road');
                fallback = '#222';
            } else if (lane.type === 'water') {
                pat = getPattern('tex_water');
                fallback = '#000080'; // Navy
            }

            if (pat) ctx.fillStyle = pat;
            else ctx.fillStyle = fallback;
            
            ctx.fillRect(0, lane.y, w, GRID);

            // Overlay for Water (Vaporwave Grid effect opacity)
            if (lane.type === 'water') {
                ctx.fillStyle = "rgba(255, 0, 255, 0.1)"; // Purple tint
                ctx.fillRect(0, lane.y, w, GRID);
            }
            
            // Lane Markers
            if (lane.type === 'road') {
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillRect(0, lane.y, w, 2);
                ctx.fillRect(0, lane.y + GRID - 2, w, 2);
            }

            // Elements
            lane.elements.forEach(el => {
                if (el.type === 'car') drawSprite('car', el.x, lane.y + 5, el.w, GRID - 10, 'red');
                else drawSprite('log', el.x, lane.y + 5, el.w, GRID - 10, 'brown');
            });
        });

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

  useEffect(() => {
    if(!gameOver) setTimeout(() => {
        setIsPlaying(true);
        engine.current.running = true;
    }, 3000);
  }, [resetKey, gameOver]);

  return (
    <div 
        ref={containerRef}
        tabIndex="0" // Makes div focusable
        className="game-wrapper" 
        style={{outline: 'none'}} // Remove blue outline
        onClick={() => containerRef.current.focus()} // Click to focus
    >
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