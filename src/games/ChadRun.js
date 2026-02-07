import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const ChadRun = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username } = useContext(UserContext);

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
    nextSpawnFrame: 0, // NEW: Tracks exactly when next obstacle appears
    
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
  const BASE_SPEED = 6;
  const MAX_SPEED = 20;

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

  // --- 2. INPUT HANDLER ---
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

        // Jump
        if (isJumpKey) {
            if (isDown) {
                if (state.hero.isGrounded) {
                    state.hero.vy = JUMP_FORCE;
                    state.hero.isGrounded = false;
                    state.hero.isJumping = true;
                }
            } else {
                if (state.hero.vy < JUMP_CUTOFF) state.hero.vy = JUMP_CUTOFF;
                state.hero.isJumping = false;
            }
        }

        // Duck
        if (isDuckKey) state.hero.isDucking = isDown;
    };

    const down = (e) => handleInput(e, true);
    const up = (e) => handleInput(e, false);
    
    // Mobile Touch
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

  // --- 3. DYNAMIC SPAWNING ---
  const scheduleNextSpawn = () => {
      const state = engine.current;
      // Faster speed = Shorter time between spawns, but we need Physics Gaps
      // Min gap is around 40-60 frames at start, drops to 25 at high speed
      // Random variance +20 frames
      const baseGap = Math.max(30, 90 - (state.speed * 2)); 
      const variance = Math.random() * 40; 
      state.nextSpawnFrame = state.frames + baseGap + variance;
  };

  const spawnObstacle = () => {
      const state = engine.current;
      
      // Force randomness at start: 50/50 bird/soyjak even at low score
      // but ensure birds are "High" (duckable) at start so no impossible jumps
      const allowBird = state.score > 2 || Math.random() > 0.5;
      const type = (Math.random() < 0.4 && allowBird) ? 'bird' : 'soyjak';
      
      let w = 40, h = 40, y = state.groundY - 40;
      
      if (type === 'soyjak') {
          const doubleChance = Math.min(0.6, state.score * 0.05); // Increases with score
          if (Math.random() < doubleChance) w = 75; // Double Group
          else w = 35; 
          h = 50;
          y = state.groundY - h;
      } else {
          w = 40; h = 30;
          // Low birds (must jump) only appear after score 10
          const canBeLow = state.score > 10;
          const isLow = canBeLow && Math.random() < 0.4;
          y = state.groundY - (isLow ? 50 : 95); 
      }

      state.obstacles.push({ x: 850, y, w, h, type, passed: false });
      
      // Schedule next
      scheduleNextSpawn();
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

    // Reset Engine
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
        
        // Randomize first spawn time (between 60 and 120 frames)
        engine.current.nextSpawnFrame = 60 + Math.random() * 60;

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
            
            // --- PHYSICS ---
            let gravity = GRAVITY;
            if (state.hero.isDucking && !state.hero.isGrounded) gravity += FAST_DROP;

            state.hero.vy += gravity;
            state.hero.y += state.hero.vy;

            // Hitbox Dimensions
            const normalH = 60;
            const duckH = 30;
            const currentH = state.hero.isDucking ? duckH : normalH;
            
            // Ground Collision
            if (state.hero.y + currentH >= state.groundY) {
                state.hero.y = state.groundY - currentH;
                state.hero.vy = 0;
                state.hero.isGrounded = true;
            }

            // Speed Scaling
            const targetSpeed = BASE_SPEED + (state.score * 0.25);
            state.speed = Math.min(MAX_SPEED, targetSpeed);

            // --- OBSTACLES ---
            state.obstacles.forEach(ob => {
                ob.x -= state.speed;

                // Precision Hitbox
                const heroHitbox = {
                    x: state.hero.x + 10,
                    // FIX: Hitbox Y follows Physics Y exactly
                    y: state.hero.y + 5, 
                    w: 20,
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
            
            // SPAWNING
            if (state.frames >= state.nextSpawnFrame) spawnObstacle();
            
            state.clouds.forEach(c => c.x -= c.speed * 0.5);
            state.clouds = state.clouds.filter(c => c.x > -100);
            if (state.frames % 120 === 0) spawnCloud();
        }

        // --- DRAWING ---
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

        // DRAW HERO
        // FIX: Removed the +30 offset. 
        // Logic: if ducking, physics sets y=470 (ground-30). Draw at 470.
        // If standing, physics sets y=440 (ground-60). Draw at 440.
        // Result: Feet stay planted on ground line (500).
        const currentH = state.hero.isDucking ? 30 : 60;
        const imgChad = state.sprites['chad'];
        
        if (imgChad) {
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
                    { game_id: 'chadrun', username: username, score: engine.current.score }
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