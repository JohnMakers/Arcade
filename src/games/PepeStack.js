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
  const INITIAL_SPEED = 5;
  const SPEED_INCREMENT = 0.5; 
  const MAX_SPEED = 25; 
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 800;

  const gameState = useRef({
    blocks: [], 
    current: null, 
    cameraY: 0,
    targetCameraY: 0,
    direction: 1, 
    speed: INITIAL_SPEED,
    mode: 'IDLE', 
    sprites: {},
    particles: [], 
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

    // Load Backgrounds
    loadSprite('bg_start', ASSETS.STACK_BG_START);
    loadSprite('bg_space', ASSETS.STACK_BG_SPACE);

    // Load Block Variations
    loadSprite('block_1', ASSETS.STACK_BLOCK_1);
    loadSprite('block_2', ASSETS.STACK_BLOCK_2);
    loadSprite('block_3', ASSETS.STACK_BLOCK_3);
    loadSprite('block_4', ASSETS.STACK_BLOCK_4);

    loadSprite('moon', ASSETS.ROCKET); 
  }, []);

  // Input Handling
  useEffect(() => {
    const handleInput = (e) => {
      if (e.target.closest('button') || e.target.closest('.interactive')) return;
      if (e.cancelable && e.type === 'touchstart') e.preventDefault();
      placeBlock();
    };

    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('mousedown', handleInput);
      wrapper.addEventListener('touchstart', handleInput, { passive: false });
      window.addEventListener('keydown', (e) => {
        if(e.code === 'Space') placeBlock();
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
    
    gameState.current.mode = 'PLAYING';
    gameState.current.speed = INITIAL_SPEED;
    gameState.current.blocks = [];
    gameState.current.score = 0;
    gameState.current.cameraY = 0;
    gameState.current.targetCameraY = 0;
    
    // Base Block
    gameState.current.blocks.push({
      x: (CANVAS_WIDTH - INITIAL_WIDTH) / 2,
      y: CANVAS_HEIGHT - 100,
      w: INITIAL_WIDTH,
      h: BLOCK_HEIGHT,
      texture: 'block_1' // Default base
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

      // --- BACKGROUND LOGIC ---
      let bgKey = 'bg_start';
      if (state.score > 50) bgKey = 'bg_space';

      if (state.sprites[bgKey]) {
         const bgH = CANVAS_HEIGHT;
         // Parallax effect
         const parallaxY = (state.cameraY * 0.5) % bgH;
         
         // Draw two copies for seamless loop
         ctx.drawImage(state.sprites[bgKey], 0, parallaxY, CANVAS_WIDTH, bgH);
         ctx.drawImage(state.sprites[bgKey], 0, parallaxY - bgH, CANVAS_WIDTH, bgH);
      }

      ctx.save();
      // Smooth Camera
      state.cameraY += (state.targetCameraY - state.cameraY) * 0.1;
      ctx.translate(0, state.cameraY);

      // --- LOGIC ---
      if (state.mode === 'PLAYING') {
         if (state.current) {
             state.current.x += state.speed * state.direction * dt;
             
             if (state.current.x <= 0) {
                 state.current.x = 0;
                 state.direction = 1;
             } else if (state.current.x + state.current.w >= CANVAS_WIDTH) {
                 state.current.x = CANVAS_WIDTH - state.current.w;
                 state.direction = -1;
             }
         }
      } else if (state.mode === 'RUGPULL') {
         state.blocks.forEach(b => {
             b.y += (b.vy || 0) * dt;
             b.vy = (b.vy || 0) + 0.5 * dt; 
             b.x += (b.vx || 0) * dt;
         });
         
         if (state.current) {
             state.current.y += 10 * dt;
         }
      }

      // --- RENDER BLOCKS ---
      [...state.blocks, state.current].forEach(b => {
          if (!b) return;
          
          // Use specific texture if available, otherwise cycle based on y-position/score logic fallback
          const sprite = state.sprites[b.texture] || state.sprites['block_1'];

          if (sprite) {
              ctx.drawImage(sprite, b.x, b.y, b.w, b.h);
          } else {
              ctx.fillStyle = '#00ff00';
              ctx.fillRect(b.x, b.y, b.w, b.h);
              ctx.strokeStyle = '#004400';
              ctx.lineWidth = 2;
              ctx.strokeRect(b.x, b.y, b.w, b.h);
          }
          
          // "Wick" detail
          ctx.beginPath();
          ctx.moveTo(b.x + b.w/2, b.y);
          ctx.lineTo(b.x + b.w/2, b.y - 10);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
      });

      // --- PARTICLES ---
      state.particles.forEach((p, i) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 0.5 * dt;
          p.life -= dt;
          
          ctx.fillStyle = `rgba(0, 255, 0, ${p.life / 30})`;
          ctx.fillRect(p.x, p.y, p.w, p.h);
      });
      state.particles = state.particles.filter(p => p.life > 0);

      // --- MILESTONES ---
      if (state.score > 0 && state.score % 10 === 0 && state.mode === 'PLAYING') {
          ctx.fillStyle = 'yellow';
          ctx.font = '20px "Press Start 2P"';
          ctx.fillText("MOON SOON 🚀", CANVAS_WIDTH/2 - 100, state.blocks[state.blocks.length-1].y - 50);
      }

      ctx.restore();

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]);

  // Game Actions
  const spawnNextBlock = () => {
      const state = gameState.current;
      const prev = state.blocks[state.blocks.length - 1];
      
      // Cycle through 4 block textures
      // We use score + 1 because this is for the *next* block
      const textureIndex = (state.score % 4) + 1; 
      const textureKey = `block_${textureIndex}`;

      state.current = {
          x: 0, 
          y: prev.y - BLOCK_HEIGHT,
          w: prev.w,
          h: BLOCK_HEIGHT,
          texture: textureKey // Assign the texture
      };
      
      if (state.score % 2 === 0) {
          state.current.x = -state.current.w;
          state.direction = 1; 
      } else {
          state.current.x = CANVAS_WIDTH;
          state.direction = -1; 
      }
  };

  const placeBlock = async () => {
      const state = gameState.current;
      if (state.mode !== 'PLAYING' || !state.current) return;

      const curr = state.current;
      const prev = state.blocks[state.blocks.length - 1];

      const dist = curr.x - prev.x;
      const overlap = prev.w - Math.abs(dist);

      if (overlap > 0) {
          let newW = overlap;
          let newX = curr.x;

          if (dist > 0) {
              newX = curr.x; 
              spawnDebris(curr.x + newW, curr.y, curr.w - newW, BLOCK_HEIGHT);
          } else {
              newX = prev.x;
              spawnDebris(curr.x, curr.y, prev.x - curr.x, BLOCK_HEIGHT);
          }

          const placedBlock = {
              x: dist > 0 ? curr.x : prev.x,
              y: curr.y,
              w: newW,
              h: BLOCK_HEIGHT,
              texture: curr.texture // Preserve the texture chosen during spawn
          };
          
          state.blocks.push(placedBlock);
          state.current = null;
          state.score += 1;
          setScore(state.score);

          if (state.score % 5 === 0) {
              state.speed = Math.min(state.speed + SPEED_INCREMENT, MAX_SPEED);
          }

          state.targetCameraY = (state.score * BLOCK_HEIGHT) - 200;
          if (state.targetCameraY < 0) state.targetCameraY = 0;

          spawnNextBlock();
      } else {
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

  const triggerRugPull = async () => {
      const state = gameState.current;
      state.mode = 'RUGPULL';
      
      state.blocks.forEach(b => {
          b.vx = (Math.random() - 0.5) * 20;
          b.vy = 5 + Math.random() * 10;
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
                TAP TO STACK<br/><br/>
                DON'T GET RUGGED
            </div>
        )}
    </div>
  );
};

export default PepeStack;