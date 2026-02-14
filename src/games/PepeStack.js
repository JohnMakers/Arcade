import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const PepeStack = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- CONFIGURATION ---
  const INITIAL_WIDTH = 200;
  const BLOCK_HEIGHT = 40;
  const INITIAL_SPEED = 4; // Horizontal speed
  const DROP_SPEED_ACCEL = 0.8; // Gravity
  const MAX_SPEED = 20; 
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 800;
  
  // Visuals
  const DROP_START_Y = 150; // Where the block slides (Screen Coordinates)
  const STACK_TARGET_Y = 600; // Where we want the top of the stack to end up (Screen Coords)

  const gameState = useRef({
    blocks: [], 
    current: null, // The active block
    cameraY: 0,
    targetCameraY: 0,
    direction: 1, 
    speed: INITIAL_SPEED,
    mode: 'IDLE', // IDLE, HOVER, DROPPING, RUGPULL
    sprites: {},
    particles: [], // For slice debris
    emojis: [], // For Rockets/Poops
    lastTime: 0
  });

  // Load Assets
  useEffect(() => {
    const loadSprite = (key, src) => {
      const img = new Image();
      img.src = src;
      img.crossOrigin = "Anonymous";
      img.onload = () => { gameState.current.sprites[key] = img; };
    };

    loadSprite('bg_start', ASSETS.STACK_BG_START);
    loadSprite('bg_space', ASSETS.STACK_BG_SPACE);
    loadSprite('block_1', ASSETS.STACK_BLOCK_1);
    loadSprite('block_2', ASSETS.STACK_BLOCK_2);
    loadSprite('block_3', ASSETS.STACK_BLOCK_3);
    loadSprite('block_4', ASSETS.STACK_BLOCK_4);
    loadSprite('moon', ASSETS.STONKS_ROCKET); 
  }, []);

  // Input Handling
  useEffect(() => {
    const handleInput = (e) => {
      if (e.target.closest('button') || e.target.closest('.interactive')) return;
      if (e.cancelable && e.type === 'touchstart') e.preventDefault();
      
      triggerDrop();
    };

    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('mousedown', handleInput);
      wrapper.addEventListener('touchstart', handleInput, { passive: false });
      window.addEventListener('keydown', (e) => {
        if(e.code === 'Space') triggerDrop();
      });
    }

    return () => {
      if (wrapper) {
        wrapper.removeEventListener('mousedown', handleInput);
        wrapper.removeEventListener('touchstart', handleInput);
      }
      window.removeEventListener('keydown', () => {});
    };
  }, [isPlaying, gameOver]);

  // Core Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Init Game State
    gameState.current.mode = 'HOVER';
    gameState.current.speed = INITIAL_SPEED;
    gameState.current.blocks = [];
    gameState.current.emojis = [];
    gameState.current.particles = [];
    gameState.current.score = 0;
    gameState.current.cameraY = 0;
    
    // Initial Base Block
    gameState.current.blocks.push({
      x: (CANVAS_WIDTH - INITIAL_WIDTH) / 2,
      y: CANVAS_HEIGHT - 100, // Bottom of world
      w: INITIAL_WIDTH,
      h: BLOCK_HEIGHT,
      texture: 'block_1'
    });

    spawnNextBlock();

    gameState.current.lastTime = performance.now();
    let animationId;

    const loop = (time) => {
      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // Clear
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // --- 1. BACKGROUND ---
      let bgKey = 'bg_start';
      if (state.score > 50) bgKey = 'bg_space';
      if (state.sprites[bgKey]) {
         const bgH = CANVAS_HEIGHT;
         // Background moves slower than camera for parallax
         const parallaxY = (state.cameraY * 0.5) % bgH;
         ctx.drawImage(state.sprites[bgKey], 0, parallaxY, CANVAS_WIDTH, bgH);
         ctx.drawImage(state.sprites[bgKey], 0, parallaxY - bgH, CANVAS_WIDTH, bgH);
      }

      ctx.save();
      
      // --- 2. CAMERA LERP ---
      // We want the top block to eventually sit at STACK_TARGET_Y (Screen Coords)
      // World Y of top block = blocks[last].y
      // Screen Y = World Y + cameraY
      // Target Camera Y = STACK_TARGET_Y - blocks[last].y
      if (state.blocks.length > 0) {
          const topBlockY = state.blocks[state.blocks.length-1].y;
          const idealCameraY = STACK_TARGET_Y - topBlockY;
          // Only move camera "up" (increasing Y value in this coord system)
          if (idealCameraY > state.targetCameraY) {
              state.targetCameraY = idealCameraY;
          }
      }
      
      state.cameraY += (state.targetCameraY - state.cameraY) * 0.1;
      ctx.translate(0, state.cameraY);

      // --- 3. PHYSICS & LOGIC ---
      
      // HOVER MODE: Block slides at top of screen
      if (state.mode === 'HOVER' && state.current) {
         // Keep current Y fixed relative to SCREEN, so it moves in World
         // Screen Y = DROP_START_Y
         // World Y = DROP_START_Y - state.cameraY
         state.current.y = DROP_START_Y - state.cameraY;

         state.current.x += state.speed * state.direction * dt;
         if (state.current.x <= 0) {
             state.current.x = 0;
             state.direction = 1;
         } else if (state.current.x + state.current.w >= CANVAS_WIDTH) {
             state.current.x = CANVAS_WIDTH - state.current.w;
             state.direction = -1;
         }
      } 
      
      // DROPPING MODE: Block falls
      else if (state.mode === 'DROPPING' && state.current) {
          state.current.vy += DROP_SPEED_ACCEL * dt;
          state.current.y += state.current.vy * dt;

          // Check Collision with Top Block
          const prev = state.blocks[state.blocks.length - 1];
          
          // Predicted position next frame (for tunneling prevention)
          if (state.current.y + state.current.h >= prev.y) {
              handleLanding(prev);
          }
      }

      // RUGPULL MODE: Everything falls
      else if (state.mode === 'RUGPULL') {
         state.blocks.forEach(b => {
             b.y += (b.vy || 0) * dt;
             b.vy = (b.vy || 0) + 0.5 * dt; 
             b.x += (b.vx || 0) * dt;
         });
         if (state.current) {
             state.current.y += 15 * dt; // Drop faster
         }
      }

      // --- 4. RENDER ---

      // Draw Stacked Blocks
      state.blocks.forEach(b => drawBlock(ctx, state, b));

      // Draw Current Block & Chain
      if (state.current) {
          // Draw Chain (Visual only)
          const chainEndX = state.current.x + state.current.w/2;
          const chainEndY = state.current.y;
          const chainStartY = chainEndY - 1000; // Go way up

          ctx.beginPath();
          ctx.moveTo(chainEndX, chainStartY);
          ctx.lineTo(chainEndX, chainEndY);
          ctx.strokeStyle = '#888';
          ctx.lineWidth = 4;
          ctx.setLineDash([10, 10]); // Industrial chain look
          ctx.stroke();
          ctx.setLineDash([]);

          drawBlock(ctx, state, state.current);
      }

      // Draw Particles (Debris)
      state.particles.forEach((p) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 0.5 * dt;
          p.life -= dt;
          ctx.fillStyle = `rgba(0, 255, 0, ${p.life / 30})`;
          ctx.fillRect(p.x, p.y, p.w, p.h);
      });
      state.particles = state.particles.filter(p => p.life > 0);

      // Draw Emojis (Rockets/Poop)
      state.emojis.forEach((e) => {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          e.life -= dt;
          e.alpha -= 0.01;
          
          ctx.globalAlpha = Math.max(0, e.alpha);
          ctx.font = `${e.size}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(e.char, e.x, e.y);
          ctx.globalAlpha = 1.0;
      });
      state.emojis = state.emojis.filter(e => e.life > 0);

      ctx.restore();
      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]);

  // --- HELPERS ---

  const drawBlock = (ctx, state, b) => {
      const sprite = state.sprites[b.texture] || state.sprites['block_1'];
      if (sprite) {
          ctx.drawImage(sprite, b.x, b.y, b.w, b.h);
      } else {
          ctx.fillStyle = '#00ff00';
          ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      
      // Wick
      ctx.beginPath();
      ctx.moveTo(b.x + b.w/2, b.y);
      ctx.lineTo(b.x + b.w/2, b.y - 10);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
  };

  const spawnNextBlock = () => {
      const state = gameState.current;
      const prev = state.blocks[state.blocks.length - 1];
      
      const textureIndex = (state.score % 4) + 1; 
      
      state.current = {
          x: 0, 
          // Y is managed by the loop in HOVER mode
          y: 0, 
          w: prev.w, // Inherit width
          h: BLOCK_HEIGHT,
          vx: 0,
          vy: 0,
          texture: `block_${textureIndex}`
      };
      
      // Randomize start side
      if (Math.random() > 0.5) {
          state.current.x = -state.current.w;
          state.direction = 1; 
      } else {
          state.current.x = CANVAS_WIDTH;
          state.direction = -1; 
      }
      
      state.mode = 'HOVER';
  };

  const triggerDrop = () => {
      if (gameState.current.mode === 'HOVER') {
          gameState.current.mode = 'DROPPING';
          gameState.current.current.vy = 5; // Initial push
      }
  };

  const handleLanding = async (prev) => {
      const state = gameState.current;
      const curr = state.current;

      // Calculate Overlap
      const dist = curr.x - prev.x;
      const absDist = Math.abs(dist);
      const overlap = prev.w - absDist;

      if (overlap > 0) {
          // HIT!
          let newW = overlap;
          let finalX = curr.x;

          // SNAP LOGIC (Perfect Stack)
          const isPerfect = absDist < 6; // 6px tolerance
          
          if (isPerfect) {
              // Snap to exact position
              finalX = prev.x;
              newW = prev.w;
              spawnEmojis(finalX + newW/2, curr.y, '🚀');
          } else {
              // Standard Logic (Slice)
              if (dist > 0) {
                  // Overhang Right
                  finalX = curr.x; 
                  spawnDebris(curr.x + newW, curr.y, curr.w - newW, BLOCK_HEIGHT);
              } else {
                  // Overhang Left
                  finalX = prev.x;
                  spawnDebris(curr.x, curr.y, prev.x - curr.x, BLOCK_HEIGHT);
              }

              // Bad Stack Logic (Sloppy)
              const percentLost = (curr.w - newW) / curr.w;
              if (percentLost > 0.3) {
                   spawnEmojis(finalX + newW/2, curr.y, '💩');
              }
          }

          // Place the block
          const placedBlock = {
              x: finalX,
              y: prev.y - BLOCK_HEIGHT, // Stack physically on top
              w: newW,
              h: BLOCK_HEIGHT,
              texture: curr.texture
          };
          
          state.blocks.push(placedBlock);
          state.current = null;
          state.score += 1;
          setScore(state.score);

          // Speed Ramp
          if (state.score % 5 === 0) {
              state.speed = Math.min(state.speed + 0.5, MAX_SPEED);
          }

          spawnNextBlock();

      } else {
          // MISS (Rug Pull)
          state.current.y = prev.y; // Visually sync for the slide off
          triggerRugPull();
      }
  };

  const spawnDebris = (x, y, w, h) => {
      gameState.current.particles.push({
          x, y, w, h,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          life: 60
      });
  };

  const spawnEmojis = (x, y, char) => {
      // Spawn a burst of emojis
      for(let i=0; i<8; i++) {
          gameState.current.emojis.push({
              x: x,
              y: y,
              vx: (Math.random() - 0.5) * 15,
              vy: -5 - Math.random() * 10, // Upward burst
              char: char,
              life: 100,
              alpha: 1.0,
              size: 20 + Math.random() * 20
          });
      }
  };

  const triggerRugPull = async () => {
      const state = gameState.current;
      state.mode = 'RUGPULL';
      
      // Random chaotic velocity for collapse
      state.blocks.forEach(b => {
          b.vx = (Math.random() - 0.5) * 15;
          b.vy = 5 + Math.random() * 5;
      });

      if (username) {
        await supabase.from('leaderboards').insert([{
            game_id:'stack', 
            username, 
            score: state.score, 
            address: address
        }]);
      }

      setTimeout(() => {
          setGameOver(true);
      }, 1500);
  };

  return (
    <div ref={containerRef} className="game-wrapper" tabIndex="0" style={{ position: 'relative', outline: 'none' }}>
        <GameUI 
            score={score} 
            gameOver={gameOver} 
            isPlaying={isPlaying} 
            onRestart={() => { 
                setGameOver(false); 
                setIsPlaying(true); 
                setScore(0); 
                setResetKey(prev => prev + 1); 
            }} 
            onExit={onExit} 
            gameId="stack" 
        />
        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT} 
            style={{ width: '100%', maxWidth: '500px', height: 'auto', display: 'block', cursor: 'pointer' }} 
        />
        {!isPlaying && !gameOver && (
            <div style={{
                position: 'absolute', top: '40%', width: '100%', textAlign: 'center', 
                pointerEvents: 'none', color: 'lime', textShadow: '2px 2px #000',
                fontFamily: '"Press Start 2P"'
            }}>
                TAP TO DROP<br/><br/>
                TIME IT RIGHT!
            </div>
        )}
    </div>
  );
};

export default PepeStack;