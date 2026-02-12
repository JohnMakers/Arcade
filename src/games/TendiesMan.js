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
  const TOWER_X = 200; // Center of canvas (400 width)
  const SEGMENT_HEIGHT = 80;
  const SEGMENT_WIDTH = 100;
  const PLAYER_OFFSET_X = 90; // How far from center player stands
  const TIME_MAX = 100;
  
  // Engine State (Ref to avoid re-renders during loop)
  const engine = useRef({
    running: false,
    score: 0,
    timeLeft: TIME_MAX,
    decayRate: 0.2, // Energy loss per frame
    playerSide: 'left', // 'left' or 'right'
    isChopping: false, // Animation state
    chopFrame: 0,
    sprites: {},
    tower: [], // Array of { hasBone: bool, boneSide: 'left'/'right' }
    particles: [], // For chop effects
    lastTime: 0
  });

  // Load Assets
  useEffect(() => {
    const load = (k, src) => {
      const img = new Image();
      img.src = src;
      engine.current.sprites[k] = img;
    };
    load('hero', ASSETS.TM_PEPE || 'https://via.placeholder.com/100/00FF00?text=Pepe');
    load('tendie', ASSETS.TM_TENDIE || 'https://via.placeholder.com/100/D2691E?text=Tendie');
    load('bone', ASSETS.TM_BONE || 'https://via.placeholder.com/80/FFFFFF?text=Bone');
    load('bg', ASSETS.TM_BG || 'https://via.placeholder.com/400/87CEEB?text=Background');
    load('tomb', ASSETS.TM_TOMB || 'https://via.placeholder.com/100/555555?text=RIP');
  }, []);

  // Input Handling
  useEffect(() => {
    const handleInput = (e) => {
      // Ignore inputs if UI overlay is interactive
      if (e.target.closest('button') || e.target.closest('.interactive')) return;

      const state = engine.current;

      // Restart logic handled by UI, here we only care about active gameplay inputs
      if (state.running && !gameOver) {
        let inputSide = null;

        if (e.type === 'keydown') {
          if (e.code === 'ArrowLeft') inputSide = 'left';
          if (e.code === 'ArrowRight') inputSide = 'right';
        } else if (e.type === 'touchstart' || e.type === 'mousedown') {
          // Determine side based on click X relative to window/canvas
          const rect = containerRef.current.getBoundingClientRect();
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const x = clientX - rect.left;
          inputSide = x < rect.width / 2 ? 'left' : 'right';
        }

        if (inputSide) {
          e.preventDefault(); // Stop scrolling/etc
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

  // Core Game Mechanics
  const initGame = () => {
    const state = engine.current;
    state.running = true;
    state.score = 0;
    state.timeLeft = TIME_MAX;
    state.decayRate = 0.3; // Starting difficulty
    state.playerSide = 'left';
    state.isChopping = false;
    state.tower = [];
    state.particles = [];
    state.lastTime = performance.now();

    // Generate initial tower (no obstacles at very bottom)
    for (let i = 0; i < 10; i++) {
      addTowerSegment(i < 3); // First 3 are safe
    }
  };

  const addTowerSegment = (forceSafe = false) => {
    const state = engine.current;
    
    // Logic for obstacles: 
    // 1. Random chance
    // 2. Can't have bone immediately after another to avoid impossible patterns (optional, but good for flow)
    // 3. 50/50 side if bone exists
    
    let hasBone = false;
    let boneSide = null;

    if (!forceSafe) {
      // 50% chance of a bone normally
      if (Math.random() > 0.5) {
        hasBone = true;
        boneSide = Math.random() > 0.5 ? 'left' : 'right';
      }
    }

    state.tower.push({ hasBone, boneSide });
  };

  const chop = (side) => {
    const state = engine.current;
    
    // 1. Move Player
    state.playerSide = side;
    state.isChopping = true;
    state.chopFrame = 5; // Animation duration frames

    // 2. Process Tower
    // Remove bottom segment
    const removedSegment = state.tower.shift();
    
    // Add new segment at top
    addTowerSegment();

    // 3. Check Death (Collision with the NEW bottom segment)
    // In "Timberman" logic, if the block falling down (now at index 0) has a branch on your side, you die.
    const nextSegment = state.tower[0];
    
    if (nextSegment.hasBone && nextSegment.boneSide === state.playerSide) {
      handleDeath();
    } else {
      // 4. Success: Score & Time
      state.score += 1;
      setScore(state.score);
      
      // Add time (capped at MAX)
      state.timeLeft = Math.min(TIME_MAX, state.timeLeft + 5); // +5 energy per chop
      
      // 5. Difficulty Scaling
      // Increase decay rate every 20 points
      if (state.score % 20 === 0) {
        state.decayRate += 0.05;
      }

      // Add particle effect (visual only)
      state.particles.push({
        x: TOWER_X,
        y: 450,
        vx: side === 'left' ? 10 : -10, // Fly opposite way
        vy: -5,
        rotation: 0,
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

  // Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationId;

    // Reset Engine Data
    initGame();
    // But pause running until UI "Start" is clicked (handled by isPlaying state wrapper technically, but we use internal flag)
    engine.current.running = false; 

    const loop = (time) => {
      const state = engine.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // Clear Screen
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Background
      if (state.sprites.bg && state.sprites.bg.complete) {
        ctx.drawImage(state.sprites.bg, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Floor
        ctx.fillStyle = '#228B22';
        ctx.fillRect(0, 500, canvas.width, 100);
      }

      // Update Logic if Running
      if (state.running && isPlaying) {
        // Time Decay
        state.timeLeft -= state.decayRate * dt;
        if (state.timeLeft <= 0) {
          handleDeath();
        }
        if (state.chopFrame > 0) state.chopFrame--;
      }

      // --- DRAW TOWER ---
      // We draw from bottom (y=420) upwards
      const BASE_Y = 420;
      
      state.tower.forEach((seg, index) => {
        const yPos = BASE_Y - (index * SEGMENT_HEIGHT);
        
        // Draw Tendie Segment
        if (state.sprites.tendie && state.sprites.tendie.complete) {
            ctx.drawImage(state.sprites.tendie, TOWER_X - (SEGMENT_WIDTH/2), yPos, SEGMENT_WIDTH, SEGMENT_HEIGHT);
        } else {
            ctx.fillStyle = '#D2691E'; // Brown
            ctx.fillRect(TOWER_X - (SEGMENT_WIDTH/2), yPos, SEGMENT_WIDTH, SEGMENT_HEIGHT);
            ctx.strokeStyle = '#8B4513';
            ctx.strokeRect(TOWER_X - (SEGMENT_WIDTH/2), yPos, SEGMENT_WIDTH, SEGMENT_HEIGHT);
        }

        // Draw Bone (Obstacle)
        if (seg.hasBone) {
          const boneX = seg.boneSide === 'left' 
            ? TOWER_X - (SEGMENT_WIDTH/2) - 80 
            : TOWER_X + (SEGMENT_WIDTH/2);
          
          if (state.sprites.bone && state.sprites.bone.complete) {
            // Flip bone if on left? (Assumes image points right usually)
            ctx.save();
            if (seg.boneSide === 'left') {
                ctx.translate(boneX + 80, yPos);
                ctx.scale(-1, 1);
                ctx.drawImage(state.sprites.bone, 0, 0, 80, SEGMENT_HEIGHT);
            } else {
                ctx.drawImage(state.sprites.bone, boneX, yPos, 80, SEGMENT_HEIGHT);
            }
            ctx.restore();
          } else {
            ctx.fillStyle = '#FFF';
            ctx.fillRect(boneX, yPos + 20, 80, 20);
          }
        }
      });

      // --- DRAW PLAYER ---
      if (!gameOver) {
        const playerX = state.playerSide === 'left' 
          ? TOWER_X - PLAYER_OFFSET_X - 60 
          : TOWER_X + PLAYER_OFFSET_X;
        
        const playerY = 420; // Standing on ground
        
        // Chop Animation Offset
        const chopAnim = state.chopFrame > 0 ? (state.playerSide === 'left' ? 20 : -20) : 0;

        if (state.sprites.hero && state.sprites.hero.complete) {
          ctx.save();
          if (state.playerSide === 'left') {
            // Standard image
            ctx.drawImage(state.sprites.hero, playerX + chopAnim, playerY, 60, 80);
          } else {
            // Flip for right side
            ctx.translate(playerX + 60 + chopAnim, playerY);
            ctx.scale(-1, 1);
            ctx.drawImage(state.sprites.hero, 0, 0, 60, 80);
          }
          ctx.restore();
        } else {
          ctx.fillStyle = '#00FF00';
          ctx.fillRect(playerX + chopAnim, playerY, 60, 80);
        }
      } else {
        // Draw Tombstone on death
        const tombX = state.playerSide === 'left' ? TOWER_X - 120 : TOWER_X + 60;
        if (state.sprites.tomb && state.sprites.tomb.complete) {
            ctx.drawImage(state.sprites.tomb, tombX, 440, 60, 60);
        }
      }

      // --- DRAW PARTICLES ---
      state.particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.5; // Gravity
        p.life--;
        
        ctx.fillStyle = '#D2691E';
        ctx.fillRect(p.x, p.y, 30, 30);
      });
      state.particles = state.particles.filter(p => p.life > 0);

      // --- DRAW UI (Time Bar) ---
      // Background bar
      ctx.fillStyle = '#333';
      ctx.fillRect(50, 50, 300, 20);
      
      // Fill bar (Red if low, Green if high)
      const fillPct = state.timeLeft / TIME_MAX;
      ctx.fillStyle = fillPct < 0.3 ? '#FF0000' : '#00FF00';
      ctx.fillRect(52, 52, 296 * fillPct, 16);

      // Label
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText("HUNGER", 200, 40);

      animationId = requestAnimationFrame(loop);
    };

    loop(performance.now());
    return () => cancelAnimationFrame(animationId);
  }, [resetKey, isPlaying]); // Re-bind loop if resetKey changes

  // Game Start Timer
  useEffect(() => {
    if (!gameOver && !isPlaying) {
      // Small delay before enabling input so user doesn't accidentally click immediately after restart
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
        instructions="Tap Left/Right or use Arrow Keys to Chop! Watch out for bones!"
      />
      <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default TendiesMan;