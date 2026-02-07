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
    
    // Hero
    hero: { 
        x: 50, y: 0, w: 40, h: 60, 
        vy: 0, 
        isGrounded: true, 
        isDucking: false 
    },
    
    // World
    groundY: 500,
    obstacles: [], // { x, y, w, h, type }
    clouds: [],
    
    sprites: {}
  });

  const GRAVITY = 0.6;
  const JUMP_FORCE = -12;

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

        if (isDown) {
            if ((e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w') && state.hero.isGrounded) {
                state.hero.vy = JUMP_FORCE;
                state.hero.isGrounded = false;
            }
            if (e.key === 'ArrowDown' || e.key === 's') {
                state.hero.isDucking = true;
                // Fast fall if in air
                if (!state.hero.isGrounded) state.hero.vy += 5;
            }
        } else {
            if (e.key === 'ArrowDown' || e.key === 's') {
                state.hero.isDucking = false;
            }
        }
    };

    const down = (e) => handleInput(e, true);
    const up = (e) => handleInput(e, false);
    
    const touchStart = () => {
        // Simple tap to jump
        handleInput({ key: ' ', preventDefault: ()=>{} }, true);
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('touchstart', touchStart);

    return () => {
        window.removeEventListener('keydown', down);
        window.removeEventListener('keyup', up);
        window.removeEventListener('touchstart', touchStart);
    };
  }, [gameOver]);

  // --- 3. GENERATION ---
  const spawnObstacle = () => {
      const state = engine.current;
      const type = Math.random() < 0.3 && state.score > 300 ? 'bird' : 'soyjak';
      
      let w = 40, h = 40, y = state.groundY - 40;
      
      if (type === 'soyjak') {
          // Can be small (single) or wide (double)
          if (Math.random() < 0.3) { w = 70; } 
          else { w = 35; }
          h = 50;
          y = state.groundY - h;
      } else {
          // Bird (High or Low)
          w = 40; h = 30;
          // Low bird (duck under) or High bird (jump warning)
          y = state.groundY - (Math.random() < 0.5 ? 60 : 100); 
      }

      state.obstacles.push({ x: 800 + Math.random() * 100, y, w, h, type });
  };

  const spawnCloud = () => {
      engine.current.clouds.push({
          x: 800, 
          y: Math.random() * 300, 
          w: 60 + Math.random() * 40, 
          speed: 0.5 + Math.random()
      });
  };

  // --- 4. GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    // Reset
    engine.current.running = false;
    engine.current.hero.y = 500 - 60;
    engine.current.hero.vy = 0;
    engine.current.speed = 6;
    engine.current.score = 0;
    engine.current.obstacles = [];
    
    const loop = () => {
        const state = engine.current;
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, w, h);

        // Ground Line
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, state.groundY, w, 2);

        if (state.running && !gameOver) {
            state.frames++;
            
            // Physics
            state.hero.vy += GRAVITY;
            state.hero.y += state.hero.vy;

            // Ground Check
            if (state.hero.y + (state.hero.isDucking ? 30 : 60) >= state.groundY) {
                state.hero.y = state.groundY - (state.hero.isDucking ? 30 : 60);
                state.hero.vy = 0;
                state.hero.isGrounded = true;
            } else {
                state.hero.isGrounded = false;
            }

            // Move Obstacles
            state.obstacles.forEach(ob => {
                ob.x -= state.speed;
                // Collision
                const heroH = state.hero.isDucking ? 30 : 60;
                const heroY = state.hero.isDucking ? state.hero.y + 30 : state.hero.y;
                
                // AABB Collision (Forgiving padding)
                if (
                    state.hero.x + 30 > ob.x + 5 && 
                    state.hero.x + 10 < ob.x + ob.w - 5 &&
                    heroY + heroH > ob.y + 5 &&
                    heroY < ob.y + ob.h - 5
                ) {
                    die();
                }
            });
            state.obstacles = state.obstacles.filter(ob => ob.x > -100);

            // Move Clouds
            state.clouds.forEach(c => c.x -= c.speed);
            state.clouds = state.clouds.filter(c => c.x > -100);

            // Spawning Logic
            if (state.frames % Math.floor(100 - Math.min(60, state.score/20)) === 0) {
                 if(Math.random() > 0.3) spawnObstacle();
            }
            if (state.frames % 120 === 0) spawnCloud();

            // Score & Speed
            if (state.frames % 5 === 0) {
                state.score++;
                setScore(state.score);
                if (state.score % 100 === 0) state.speed += 0.5;
            }
        }

        // --- DRAWING ---
        // Clouds
        ctx.fillStyle = '#444';
        state.clouds.forEach(c => ctx.fillRect(c.x, c.y, c.w, 20));

        // Obstacles
        state.obstacles.forEach(ob => {
            const img = state.sprites[ob.type];
            if (img) ctx.drawImage(img, ob.x, ob.y, ob.w, ob.h);
            else {
                ctx.fillStyle = ob.type === 'bird' ? 'red' : 'green';
                ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
            }
        });

        // Hero
        const hH = state.hero.isDucking ? 30 : 60;
        const hY = state.hero.isDucking ? state.hero.y + 30 : state.hero.y; // Shift Y down visually if ducking logic requires
        // Actually for ducking, usually we just shrink height from top or center. 
        // Simple logic: Draw rect at hero.y. If ducking, draw short rect.
        
        const imgChad = state.sprites['chad'];
        if (imgChad) {
            // Draw sprite
            ctx.drawImage(imgChad, state.hero.x, state.hero.y + (state.hero.isDucking?30:0), 40, hH);
        } else {
            ctx.fillStyle = 'cyan';
            ctx.fillRect(state.hero.x, state.hero.y + (state.hero.isDucking?30:0), 40, hH);
        }

        animationId = requestAnimationFrame(loop);
    };

    const die = () => {
        engine.current.running = false;
        setGameOver(true);
        if(username) supabase.from('leaderboards').insert([{game_id:'chadrun', username, score: engine.current.score}]);
    };

    loop();
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]);

  useEffect(() => {
    if(!gameOver) setTimeout(() => {
        setIsPlaying(true);
        engine.current.running = true;
    }, 1000); // Shorter countdown for runner
  }, [resetKey, gameOver]);

  return (
    <div 
        ref={containerRef} 
        className="game-wrapper" 
        tabIndex="0" 
        style={{outline:'4px solid cyan'}}
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
        <canvas ref={canvasRef} width={800} height={600} /> {/* Wider canvas for runner */}
    </div>
  );
};

export default ChadRun;