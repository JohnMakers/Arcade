import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const ChadRun = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  // --- REACT STATE ---
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- ENGINE STATE ---
  const engine = useRef({
    running: false,
    frames: 0,
    speed: 6,
    score: 0,
    nextSpawnFrame: 0,
    
    // Physics
    hero: { 
        x: 50, y: 0, w: 40, h: 60, 
        vy: 0, 
        isGrounded: true, 
        isDucking: false,
        isJumping: false 
    },
    
    groundY: 500,
    obstacles: [], 
    clouds: [],
    sprites: {}
  });

  // Constants
  const GRAVITY = 0.6;
  const JUMP_FORCE = -13; 
  const JUMP_CUTOFF = -5; 
  const FAST_DROP = 2.5; 
  const BASE_SPEED = 6.5; // Slightly faster start
  const MAX_SPEED = 22; // Higher cap

  // Dimensions
  const STAND_H = 60;
  const DUCK_H = 30;

  // --- 1. ASSET LOADER ---
  useEffect(() => {
    const load = (k, src) => {
        const img = new Image();
        img.src = src;
        img.crossOrigin = "Anonymous";
        img.onload = () => engine.current.sprites[k] = img;
    };
    load('chad', ASSETS.CHAD_HERO);
    load('soyjak', ASSETS.OBSTACLE_SOYJAK);
    load('bird', ASSETS.OBSTACLE_BIRD);
  }, []);

  // --- 2. INPUT HANDLER (Robust Ducking) ---
  useEffect(() => {
    if(containerRef.current) containerRef.current.focus();

    const handleInput = (e, isDown) => {
        if(["ArrowUp","ArrowDown"," "].includes(e.key)) e.preventDefault();
        
        const state = engine.current;
        
        if (!state.running && !gameOver && isDown) {
            state.running = true;
            setIsPlaying(true);
        }

        if (!state.running) return;

        const key = e.key;
        const isJumpKey = key === ' ' || key === 'ArrowUp' || key === 'w';
        const isDuckKey = key === 'ArrowDown' || key === 's';

        // JUMP
        if (isJumpKey) {
            if (isDown) {
                if (state.hero.isGrounded) {
                    state.hero.vy = JUMP_FORCE;
                    state.hero.isGrounded = false;
                    state.hero.isJumping = true;
                    // Auto-stand if jumping
                    state.hero.isDucking = false; 
                }
            } else {
                if (state.hero.vy < JUMP_CUTOFF) state.hero.vy = JUMP_CUTOFF;
                state.hero.isJumping = false;
            }
        }

        // DUCK (Fixing the Float Glitch)
        if (isDuckKey) {
            const wasDucking = state.hero.isDucking;
            state.hero.isDucking = isDown;

            if (isDown && !wasDucking && state.hero.isGrounded) {
                // Instantly snap Y down so feet stay on ground
                // Old Y (Top of Head at 60px) -> New Y (Top of Head at 30px)
                // If we don't move Y, the 30px sprite draws at the top, floating 30px above ground
                state.hero.y += (STAND_H - DUCK_H);
            }
        }
    };

    const down = (e) => handleInput(e, true);
    const up = (e) => handleInput(e, false);
    
    const touchStart = (e) => {
        const y = e.touches[0].clientY;
        if (y > window.innerHeight / 2) handleInput({key: 'ArrowDown', preventDefault:()=>{}}, true);
        else handleInput({key: ' ', preventDefault:()=>{}}, true);
    };
    const touchEnd = () => {
        handleInput({key: ' ', preventDefault:()=>{}}, false);
        handleInput({key: 'ArrowDown', preventDefault:()=>{}}, false);
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
  }, [gameOver]);

  // --- 3. AGGRESSIVE SPAWNING ---
  const spawnObstacle = () => {
      const state = engine.current;
      
      // Minimum gap calculation (Physics based)
      // At speed 6: Gap ~ 200px. At speed 15: Gap ~ 400px.
      const safeGap = state.speed * 30; 
      
      const lastOb = state.obstacles[state.obstacles.length - 1];
      if (lastOb && (850 - (lastOb.x + lastOb.w) < safeGap)) return;

      const type = (state.score > 3 && Math.random() < 0.4) ? 'bird' : 'soyjak';
      let w = 40, h = 40, y = state.groundY - 40;
      
      if (type === 'soyjak') {
          const doubleChance = Math.min(0.6, state.score * 0.05);
          if (Math.random() < doubleChance) w = 75; 
          else w = 35; 
          h = 50;
          y = state.groundY - h;
      } else {
          // BIRD LOGIC FIX
          w = 40; h = 30;
          
          // High Bird (Must Duck)
          // Y needs to be low enough to hit Standing Head (440)
          // But high enough to miss Ducking Head (470)
          // Setting Y to 435. 
          // Hitbox: 440 to 460.
          // Standing Head (440-500) -> Overlaps.
          // Ducking Head (470-500) -> Clears.
          const highBirdY = state.groundY - 65; 
          
          // Low Bird (Must Jump)
          const lowBirdY = state.groundY - 25; 

          const isLow = state.score > 8 && Math.random() < 0.3;
          y = isLow ? lowBirdY : highBirdY;
      }

      state.obstacles.push({ x: 850, y, w, h, type, passed: false });
      
      // Schedule next spawn aggressively
      // Base frequency: 40 frames (0.6s) -> reduces to 25 frames
      const freq = Math.max(25, 50 - state.speed);
      state.nextSpawnFrame = state.frames + freq + (Math.random() * 20);
  };

  const spawnCloud = (forceX = null) => {
      engine.current.clouds.push({
          x: forceX !== null ? forceX : 850, 
          y: Math.random() * 300, 
          w: 60 + Math.random() * 40, 
          speed: 0.5 + Math.random() * 0.5
      });
  };

  // --- 4. GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    const resetGame = () => {
        engine.current.running = false;
        engine.current.hero = { 
            x: 50, y: 500-60, w: 40, h: 60, 
            vy: 0, isGrounded: true, isDucking: false 
        };
        engine.current.speed = BASE_SPEED;
        engine.current.score = 0;
        engine.current.obstacles = [];
        engine.current.clouds = [];
        engine.current.frames = 0;
        
        engine.current.nextSpawnFrame = 30; // Start fast
        for(let i=0; i<5; i++) spawnCloud(Math.random() * 800);
    };
    resetGame();
    
    const loop = () => {
        const state = engine.current;
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff"; 
        ctx.fillRect(0, state.groundY, w, 2);

        if (state.running && !gameOver) {
            state.frames++;
            
            // Physics
            let gravity = GRAVITY;
            if (state.hero.isDucking && !state.hero.isGrounded) gravity += FAST_DROP;

            state.hero.vy += gravity;
            state.hero.y += state.hero.vy;

            // Height Management
            const currentH = state.hero.isDucking ? DUCK_H : STAND_H;
            
            if (state.hero.y + currentH >= state.groundY) {
                state.hero.y = state.groundY - currentH;
                state.hero.vy = 0;
                state.hero.isGrounded = true;
            }

            // Speed Scaling
            const targetSpeed = BASE_SPEED + (state.score * 0.3);
            state.speed = Math.min(MAX_SPEED, targetSpeed);

            // Obstacles
            state.obstacles.forEach(ob => {
                ob.x -= state.speed;

                // Hitboxes (Padded for fairness)
                const heroHitbox = {
                    x: state.hero.x + 12,
                    y: state.hero.y + 5,
                    w: 16,
                    h: currentH - 10
                };

                const obHitbox = {
                    x: ob.x + 5, y: ob.y + 5, w: ob.w - 10, h: ob.h - 10
                };

                if (
                    heroHitbox.x < obHitbox.x + obHitbox.w &&
                    heroHitbox.x + heroHitbox.w > obHitbox.x &&
                    heroHitbox.y < obHitbox.y + obHitbox.h &&
                    heroHitbox.y + heroHitbox.h > obHitbox.y
                ) {
                    die();
                }

                if (!ob.passed && ob.x + ob.w < state.hero.x) {
                    ob.passed = true;
                    state.score++;
                    setScore(state.score);
                }
            });

            state.obstacles = state.obstacles.filter(ob => ob.x > -100);
            
            if (state.frames >= state.nextSpawnFrame) spawnObstacle();
            
            state.clouds.forEach(c => c.x -= c.speed * 0.5);
            state.clouds = state.clouds.filter(c => c.x > -100);
            if (state.frames % 120 === 0) spawnCloud();
        }

        // Draw
        ctx.fillStyle = '#444';
        state.clouds.forEach(c => ctx.fillRect(c.x, c.y, c.w, 20));

        state.obstacles.forEach(ob => {
            const img = state.sprites[ob.type];
            if (img) ctx.drawImage(img, ob.x, ob.y, ob.w, ob.h);
            else {
                ctx.fillStyle = ob.type === 'bird' ? 'red' : 'green';
                ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
            }
        });

        // Draw Hero
        const currentH = state.hero.isDucking ? DUCK_H : STAND_H;
        const imgChad = state.sprites['chad'];
        
        if (imgChad) {
            // If ducking, we stretch/squash sprite or crop it. 
            // Simple: Draw it squeezed.
            ctx.drawImage(imgChad, state.hero.x, state.hero.y, 40, currentH);
        } else {
            ctx.fillStyle = 'cyan';
            ctx.fillRect(state.hero.x, state.hero.y, 40, currentH);
        }

        animationId = requestAnimationFrame(loop);
    };

    const die = async () => {
        engine.current.running = false;
        setGameOver(true);
        if(username) {
            try {
                await supabase.from('leaderboards').insert([
                    { game_id: 'chadrun', username: username, score: engine.current.score, address: address }
                ]);
            } catch(e) { console.error(e); }
        }
    };

    loop();
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]);

  useEffect(() => {
    if(!gameOver) setTimeout(() => {
        setIsPlaying(true);
        engine.current.running = true;
    }, 1500);
  }, [resetKey, gameOver]);

  return (
    <div 
        ref={containerRef} 
        className="game-wrapper" 
        tabIndex="0" 
        style={{outline:'none'}}
        onClick={() => containerRef.current.focus()}
    >
        <GameUI 
            score={score} 
            gameOver={gameOver} 
            isPlaying={isPlaying} 
            onRestart={() => { setGameOver(false); setIsPlaying(false); setScore(0); setResetKey(k=>k+1); }} 
            onExit={onExit} 
            gameId="chadrun" 
        />
        <canvas ref={canvasRef} width={800} height={600} />
    </div>
  );
};

export default ChadRun;