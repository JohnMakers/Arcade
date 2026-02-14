import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const TendiesMan = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  // UI State
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Game Constants
  const TOWER_X = 200; 
  const SEGMENT_HEIGHT = 80;
  const SEGMENT_WIDTH = 100;
  const PLAYER_OFFSET_X = 90; 
  const TIME_MAX = 100;
  
  // Engine State
  const engine = useRef({
    running: false,
    score: 0,
    timeLeft: TIME_MAX,
    decayRate: 0.2, 
    playerSide: 'left', 
    isChopping: false, 
    chopFrame: 0,
    sprites: {},
    tower: [], 
    particles: [], 
    lastTime: 0
  });

  // Load Assets
  useEffect(() => {
    const load = (k, src) => {
      const img = new Image();
      img.src = src || 'https://via.placeholder.com/100'; 
      engine.current.sprites[k] = img;
    };
    
    // Using simple placeholders if ASSETS constants are undefined
    load('hero', ASSETS.TM_PEPE);
    load('tendie', ASSETS.TM_TENDIE);
    load('bone', ASSETS.TM_BONE);
    load('bg', ASSETS.TM_BG);
    load('tomb', ASSETS.TM_TOMB);
  }, []);

  // Input Handling
  useEffect(() => {
    const handleInput = (e) => {
      if (e.target.closest('button') || e.target.closest('.interactive')) return;

      const state = engine.current;

      if (state.running && !gameOver) {
        let inputSide = null;

        if (e.type === 'keydown') {
          if (e.code === 'ArrowLeft') inputSide = 'left';
          if (e.code === 'ArrowRight') inputSide = 'right';
        } else if (e.type === 'touchstart' || e.type === 'mousedown') {
          const rect = containerRef.current.getBoundingClientRect();
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const x = clientX - rect.left;
          inputSide = x < rect.width / 2 ? 'left' : 'right';
        }

        if (inputSide) {
          if(e.cancelable) e.preventDefault();
          chop(inputSide);
        }
      }
    };

    const wrapper = containerRef.current;
    window.addEventListener('keydown', handleInput);
    if (wrapper) {
      wrapper.addEventListener('mousedown', handleInput);
      wrapper.addEventListener('touchstart', handleInput, { passive: false });
    }

    return () => {
      window.removeEventListener('keydown', handleInput);
      if (wrapper) {
        wrapper.removeEventListener('mousedown', handleInput);
        wrapper.removeEventListener('touchstart', handleInput);
      }
    };
  }, [gameOver, isPlaying]); // Re-bind when game state changes

  // --- CORE MECHANICS ---

  // 1. Initialization (Separate from Loop!)
  const initGame = () => {
    const state = engine.current;
    state.running = true;
    state.score = 0;
    state.timeLeft = TIME_MAX;
    state.decayRate = 0.3; 
    state.playerSide = 'left';
    state.isChopping = false;
    state.tower = [];
    state.particles = [];
    state.lastTime = performance.now();

    for (let i = 0; i < 10; i++) {
      addTowerSegment(i < 3); 
    }
  };

  // 2. Tower Logic
  const addTowerSegment = (forceSafe = false) => {
    const state = engine.current;
    let hasBone = false;
    let boneSide = null;

    if (!forceSafe) {
      if (Math.random() > 0.5) {
        hasBone = true;
        boneSide = Math.random() > 0.5 ? 'left' : 'right';
      }
    }
    state.tower.push({ hasBone, boneSide });
  };

  // 3. Gameplay Logic
  const chop = (side) => {
    const state = engine.current;
    state.playerSide = side;
    state.isChopping = true;
    state.chopFrame = 5; 

    const removedSegment = state.tower.shift();
    addTowerSegment();

    const nextSegment = state.tower[0];
    if (nextSegment.hasBone && nextSegment.boneSide === state.playerSide) {
      handleDeath();
    } else {
      state.score += 1;
      setScore(state.score);
      state.timeLeft = Math.min(TIME_MAX, state.timeLeft + 5); 
      
      if (state.score % 20 === 0) {
        state.decayRate += 0.05;
      }

      state.particles.push({
        x: TOWER_X,
        y: 450,
        vx: side === 'left' ? 10 : -10,
        vy: -5,
        life: 20
      });
    }
  };

  const handleDeath = () => {
    engine.current.running = false;
    setGameOver(true);
    if (username) {
      supabase.from('leaderboards').insert([{ 
        game_id: 'tendies', 
        username, 
        score: engine.current.score, 
        address: address 
      }]).then();
    }
  };

  // --- RENDER LOOP ---
  
  // Effect 1: Initialize Game State ONLY on Reset
  useEffect(() => {
      initGame();
      // We pause immediately so the user has to wait for the timer
      engine.current.running = false; 
  }, [resetKey]);

  // Effect 2: The Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    // Helper: Safely draw sprite or fallback color (Prevents Crashes!)
    const drawSafe = (img, x, y, w, h, fallbackColor, scaleX = 1) => {
        if (img && img.complete && img.naturalWidth > 0) {
            if (scaleX === 1) {
                ctx.drawImage(img, x, y, w, h);
            } else {
                ctx.save();
                // Translate to center of image to flip correctly
                ctx.translate(x + (w/2), y);
                ctx.scale(scaleX, 1);
                ctx.drawImage(img, -w/2, 0, w, h);
                ctx.restore();
            }
        } else {
            ctx.fillStyle = fallbackColor;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.strokeRect(x, y, w, h);
        }
    };

    const loop = (time) => {
      const state = engine.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // 1. Clear Screen
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 2. Draw Background
      if (state.sprites.bg && state.sprites.bg.complete && state.sprites.bg.naturalWidth > 0) {
        ctx.drawImage(state.sprites.bg, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#87CEEB'; // Sky Blue Fallback
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#228B22'; // Grass
        ctx.fillRect(0, 500, canvas.width, 100);
      }

      // 3. Logic Update
      if (state.running && isPlaying) {
        state.timeLeft -= state.decayRate * dt;
        if (state.timeLeft <= 0) handleDeath();
        if (state.chopFrame > 0) state.chopFrame--;
      }

      // 4. Draw Tower
      const BASE_Y = 420;
      state.tower.forEach((seg, index) => {
        const yPos = BASE_Y - (index * SEGMENT_HEIGHT);
        
        // Draw Tendie
        drawSafe(state.sprites.tendie, TOWER_X - (SEGMENT_WIDTH/2), yPos, SEGMENT_WIDTH, SEGMENT_HEIGHT, '#D2691E');

        // Draw Bone
        if (seg.hasBone) {
          const boneW = 80;
          const boneX = seg.boneSide === 'left' 
            ? TOWER_X - (SEGMENT_WIDTH/2) - boneW 
            : TOWER_X + (SEGMENT_WIDTH/2);
            
          // Flip bone if on left (assuming asset points right)
          const scale = seg.boneSide === 'left' ? -1 : 1;
          drawSafe(state.sprites.bone, boneX, yPos, boneW, SEGMENT_HEIGHT, '#FFFFFF', scale);
        }
      });

      // 5. Draw Player
      if (!gameOver) {
        const playerX = state.playerSide === 'left' 
          ? TOWER_X - PLAYER_OFFSET_X - 60 
          : TOWER_X + PLAYER_OFFSET_X;
        
        const chopAnim = state.chopFrame > 0 ? (state.playerSide === 'left' ? 20 : -20) : 0;
        const scale = state.playerSide === 'left' ? 1 : -1;
        
        drawSafe(state.sprites.hero, playerX + chopAnim, 420, 60, 80, '#00FF00', scale);
      } else {
        // Draw Tombstone
        const tombX = state.playerSide === 'left' ? TOWER_X - 120 : TOWER_X + 60;
        drawSafe(state.sprites.tomb, tombX, 440, 60, 60, '#555');
      }

      // 6. Draw Particles
      state.particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.5;
        p.life--;
        ctx.fillStyle = '#D2691E';
        ctx.fillRect(p.x, p.y, 10, 10);
      });
      state.particles = state.particles.filter(p => p.life > 0);

      // 7. Draw Time Bar
      ctx.fillStyle = '#333';
      ctx.fillRect(50, 50, 300, 20);
      const fillPct = Math.max(0, state.timeLeft / TIME_MAX);
      ctx.fillStyle = fillPct < 0.3 ? '#FF0000' : '#00FF00';
      ctx.fillRect(52, 52, 296 * fillPct, 16);
      
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText("HUNGER", 200, 40);

      animationId = requestAnimationFrame(loop);
    };

    loop(performance.now());
    return () => cancelAnimationFrame(animationId);
  }, [resetKey, isPlaying, gameOver]); // Added gameOver to ensure proper state reflection

  // Start Timer
  useEffect(() => {
    if (!gameOver && !isPlaying) {
      const t = setTimeout(() => { 
          setIsPlaying(true); 
          engine.current.running = true; 
      }, 500); 
      return () => clearTimeout(t);
    }
  }, [resetKey, gameOver]); // Only restart timer on full reset or game over toggle

  return (
    <div ref={containerRef} className="game-wrapper" tabIndex="0" onClick={() => containerRef.current?.focus()}>
      <GameUI 
        score={score} 
        gameOver={gameOver} 
        isPlaying={isPlaying} 
        onRestart={() => { 
            setScore(0); 
            setGameOver(false); 
            setIsPlaying(false); 
            setResetKey(p => p + 1); 
        }} 
        onExit={onExit} 
        gameId="tendies"
        instructions="Tap Left/Right or Arrows!"
      />
      <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default TendiesMan;