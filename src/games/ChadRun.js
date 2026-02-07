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
  const MAX_SPEED = 18;

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
                if (state.hero.vy < JUMP_CUTOFF) {
                    state.hero.vy = JUMP_CUTOFF;
                }
                state.hero.isJumping = false;
            }
        }

        // Duck
        if (isDuckKey) state.hero.isDucking = isDown;
    };

    const down = (e) => handleInput(e, true);
    const up = (e) => handleInput(e, false);
    
    // Touch
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

  // --- 3. GENERATION (With Variance) ---
  const spawnObstacle = () => {
      const state = engine.current;
      
      // Calculate Safe Gap
      const minGap = state.speed * 35;
      const lastOb = state.obstacles[state.obstacles.length - 1];
      if (lastOb && (800 - (lastOb.x + lastOb.w) < minGap)) return;

      const canSpawnBird = state.score > 5;
      const type = (Math.random() < 0.3 && canSpawnBird) ? 'bird' : 'soyjak';
      
      let w = 40, h = 40, y = state.groundY - 40;
      
      if (type === 'soyjak') {
          const doubleChance = Math.min(0.5, state.score * 0.02);
          if (Math.random() < doubleChance) w = 70; 
          else w = 35; 
          h = 50;
          y = state.groundY - h;
      } else {
          w = 40; h = 30;
          y = state.groundY - (Math.random() < 0.3 ? 50 : 90); 
      }

      state.obstacles.push({ x: 800, y, w, h, type, passed: false });
  };

  const spawnCloud = (forceX = null) => {
      engine.current.clouds.push({
          x: forceX !== null ? forceX : 800, 
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
        
        // VARIANCE FIX: Start at a random frame count (0-100)
        // This ensures the first obstacle doesn't always spawn at the exact same moment
        engine.current.frames = Math.floor(Math.random() * 100); 

        // PRE-POPULATE CLOUDS
        for(let i=0; i<5; i++) {
            spawnCloud(Math.random() * 800);
        }
    };
    resetGame();
    
    const loop = () => {
        const state = engine.current;
        const w = canvas.width;
        const h = canvas.height;

        // Render Background
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

            // Ground Collision
            const normalH = 60;
            const duckH = 30;
            const currentH = state.hero.isDucking ? duckH : normalH;
            
            if (state.hero.y + currentH >= state.groundY) {
                state.hero.y = state.groundY - currentH;
                state.hero.vy = 0;
                state.hero.isGrounded = true;
            }

            // Speed Scaling
            const targetSpeed = BASE_SPEED + (state.score * 0.2);
            state.speed = Math.min(MAX_SPEED, targetSpeed);

            // Obstacles Logic
            state.obstacles.forEach(ob => {
                ob.x -= state.speed;

                const heroHitbox = {
                    x: state.hero.x + 10,
                    y: state.hero.isDucking ? state.hero.y + 10 : state.hero.y + 5,
                    w: 20,
                    h: (state.hero.isDucking ? duckH : normalH) - 10
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
            
            // Spawning (With Variance from initial frame offset)
            if (state.frames % 10 === 0) spawnObstacle(); 
            
            state.clouds.forEach(c => c.x -= c.speed * 0.5);
            state.clouds = state.clouds.filter(c => c.x > -100);
            if (state.frames % 120 === 0) spawnCloud();
        }

        // Render
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

        const hH = state.hero.isDucking ? 30 : 60;
        const imgChad = state.sprites['chad'];
        if (imgChad) ctx.drawImage(imgChad, state.hero.x, state.hero.y + (state.hero.isDucking?30:0), 40, hH);
        else {
            ctx.fillStyle = 'cyan';
            ctx.fillRect(state.hero.x, state.hero.y + (state.hero.isDucking?30:0), 40, hH);
        }

        animationId = requestAnimationFrame(loop);
    };

    const die = async () => {
        engine.current.running = false;
        setGameOver(true);
        // LEADERBOARD FIX: Explicitly handle the promise and ensure matching game_id
        if(username) {
            try {
                await supabase.from('leaderboards').insert([
                    { game_id: 'chadrun', username: username, score: engine.current.score }
                ]);
            } catch (error) {
                console.error("Leaderboard Error:", error);
            }
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