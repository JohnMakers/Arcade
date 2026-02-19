import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from './components/GameUI';

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
    
    load('hero', ASSETS.TM_PEPE);
    load('heroStrike', ASSETS.TM_PEPE_STRIKE); 
    load('tendie', ASSETS.TM_TENDIE);
    load('bone', ASSETS.TM_BONE);
    
    // Backgrounds & Grass
    load('bgDay', ASSETS.TM_BG_DAY);
    load('bgNight', ASSETS.TM_BG_NIGHT);
    load('grass1', ASSETS.TM_GRASS_1);
    load('grass2', ASSETS.TM_GRASS_2);
    
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
  }, [gameOver, isPlaying]);

  // --- CORE MECHANICS ---

  const initGame = () => {
    const state = engine.current;
    state.running = true;
    state.score = 0;
    state.timeLeft = TIME_MAX;
    state.decayRate = 0.3; 
    state.playerSide = 'left';
    state.isChopping = false;
    state.chopFrame = 0;
    state.tower = [];
    state.particles = [];
    state.lastTime = performance.now();

    for (let i = 0; i < 10; i++) {
      addTowerSegment(i < 3); 
    }
  };

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

  const chop = (side) => {
    const state = engine.current;
    state.playerSide = side;
    state.isChopping = true;
    
    // INCREASED ANIMATION DURATION (15 frames = ~0.25s)
    state.chopFrame = 15; 

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
        vx: side === 'left' ? 12 : -12, 
        vy: -8,
        life: 25,
        w: 40, 
        h: 40
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
  
  useEffect(() => {
      initGame();
      engine.current.running = false; 
  }, [resetKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    const drawSafe = (img, x, y, w, h, fallbackColor, scaleX = 1) => {
        if (img && img.complete && img.naturalWidth > 0) {
            if (scaleX === 1) {
                ctx.drawImage(img, x, y, w, h);
            } else {
                ctx.save();
                ctx.translate(x + (w/2), y);
                ctx.scale(scaleX, 1);
                ctx.drawImage(img, -w/2, 0, w, h);
                ctx.restore();
            }
        } else {
            ctx.fillStyle = fallbackColor;
            ctx.fillRect(x, y, w, h);
        }
    };

    const loop = (time) => {
      const state = engine.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // --- 1. DYNAMIC BACKGROUND ---
      const isNight = state.score >= 100;
      const bgSprite = isNight ? state.sprites.bgNight : state.sprites.bgDay;
      const grassSprite = isNight ? state.sprites.grass2 : state.sprites.grass1;
      
      // Draw Sky
      if (bgSprite && bgSprite.complete && bgSprite.naturalWidth > 0) {
        ctx.drawImage(bgSprite, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = isNight ? '#000033' : '#87CEEB'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Draw Grass (Bottom 100px)
      if (grassSprite && grassSprite.complete && grassSprite.naturalWidth > 0) {
        ctx.drawImage(grassSprite, 0, 500, canvas.width, 100);
      } else {
        ctx.fillStyle = isNight ? '#006400' : '#228B22'; 
        ctx.fillRect(0, 500, canvas.width, 100);
      }

      // --- 2. THE BLACK LINE ---
      ctx.beginPath();
      ctx.moveTo(0, 500);
      ctx.lineTo(canvas.width, 500);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      // Logic Update
      if (state.running && isPlaying) {
        state.timeLeft -= state.decayRate * dt;
        if (state.timeLeft <= 0) handleDeath();
        if (state.chopFrame > 0) state.chopFrame--;
      }

      // Draw Tower
      const BASE_Y = 420; // Player Y
      state.tower.forEach((seg, index) => {
        const yPos = BASE_Y - (index * SEGMENT_HEIGHT);
        
        // Draw Tendie
        drawSafe(state.sprites.tendie, TOWER_X - (SEGMENT_WIDTH/2), yPos, SEGMENT_WIDTH, SEGMENT_HEIGHT, '#D2691E');

        // Draw Bone
        if (seg.hasBone && index !== 0) {
          const boneW = 80;
          const boneX = seg.boneSide === 'left' 
            ? TOWER_X - (SEGMENT_WIDTH/2) - boneW 
            : TOWER_X + (SEGMENT_WIDTH/2);
            
          const scale = seg.boneSide === 'left' ? -1 : 1;
          drawSafe(state.sprites.bone, boneX, yPos, boneW, SEGMENT_HEIGHT, '#FFFFFF', scale);
        }
      });

      // Draw Player
      if (!gameOver) {
        const playerX = state.playerSide === 'left' 
          ? TOWER_X - PLAYER_OFFSET_X - 60 
          : TOWER_X + PLAYER_OFFSET_X;
        
        const scale = state.playerSide === 'left' ? 1 : -1;
        
        // Use Strike Sprite if chopping
        const isStriking = state.chopFrame > 0;
        const activeSprite = isStriking ? state.sprites.heroStrike : state.sprites.hero;

        drawSafe(activeSprite, playerX, 420, 60, 80, '#00FF00', scale);
      } else {
        const tombX = state.playerSide === 'left' ? TOWER_X - 120 : TOWER_X + 60;
        drawSafe(state.sprites.tomb, tombX, 440, 60, 60, '#555');
      }

      // Draw Particles
      state.particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.5;
        p.life--;
        ctx.fillStyle = '#D2691E'; 
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = '#654321';
        ctx.strokeRect(p.x, p.y, p.w, p.h);
      });
      state.particles = state.particles.filter(p => p.life > 0);

      // Draw Time Bar
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
  }, [resetKey, isPlaying, gameOver]);

  useEffect(() => {
    if (!gameOver && !isPlaying) {
      const t = setTimeout(() => { 
          setIsPlaying(true); 
          engine.current.running = true; 
      }, 500); 
      return () => clearTimeout(t);
    }
  }, [resetKey, gameOver]);

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