import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const NewsDelivery = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [ammo, setAmmo] = useState(10); 
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- CONFIGURATION ---
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 800;
  const ROAD_LEFT = 100;
  const ROAD_RIGHT = 400;
  const INITIAL_SPEED = 6;
  const MAX_SPEED = 20;

  const keys = useRef({ left: false, right: false });

  const gameState = useRef({
    player: { x: CANVAS_WIDTH / 2, y: 650, w: 50, h: 75, targetX: CANVAS_WIDTH / 2 },
    entities: [], 
    papers: [],   
    particles: [], 
    speed: INITIAL_SPEED,
    score: 0,
    ammo: 10,
    distance: 0,
    sprites: {},
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

    loadSprite('hero', ASSETS.ND_HERO);
    loadSprite('house_green', ASSETS.ND_HOUSE_GREEN);
    loadSprite('house_red', ASSETS.ND_HOUSE_RED);
    loadSprite('paper', ASSETS.ND_PAPER);
    loadSprite('van', ASSETS.ND_VAN);
    loadSprite('pothole', ASSETS.ND_POTHOLE);
    loadSprite('ammo', ASSETS.ND_AMMO);
    
    // Using the new custom textures
    loadSprite('grass', ASSETS.ND_GRASS);
    loadSprite('road', ASSETS.ND_ROAD);
  }, []);

  // Timer for Instructions (Waits for GameUI's 3-second countdown)
  useEffect(() => {
    let timer;
    if (!isPlaying && !gameOver) {
        timer = setTimeout(() => {
            setShowInstructions(true);
        }, 3000); 
    } else {
        setShowInstructions(false);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, gameOver]);

  // Controls: Keyboard/Touch for movement, Mouse/Tap for throwing
  useEffect(() => {
    const handlePointerDown = (e) => {
      // FIX: Prevent double-firing on mobile by stopping the synthetic mousedown event
      if (e.cancelable && e.type === 'touchstart') e.preventDefault();

      if (gameOver) return;
      if (e.target.closest('button')) return;

      if (!isPlaying) {
          if (showInstructions) setIsPlaying(true);
          return;
      }
      
      let clientX, clientY;
      if (e.type.includes('touch')) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;
      const canvasX = (clientX - rect.left) * scaleX;
      const canvasY = (clientY - rect.top) * scaleY;

      if (e.type.includes('touch')) {
          // Mobile: Tap edges to throw left/right. 
          // Widened tap zones slightly to 60px for better reliability.
          if (canvasX < ROAD_LEFT + 60) {
              throwPaper(-8, -10); 
          } else if (canvasX > ROAD_RIGHT - 60) {
              throwPaper(8, -10);  
          } else {
              gameState.current.player.targetX = canvasX;
          }
      } else {
          // Desktop: True mouse vector aiming
          const dx = canvasX - gameState.current.player.x;
          const dy = canvasY - gameState.current.player.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const speed = 15; // Projectile speed
          throwPaper((dx / dist) * speed, (dy / dist) * speed);
      }
    };

    // Mobile swipe/drag movement
    const handleTouchMove = (e) => {
      if (!isPlaying || gameOver) return;
      let clientX = e.touches[0].clientX;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const canvasX = (clientX - rect.left) * scaleX;
      
      if (canvasX >= ROAD_LEFT && canvasX <= ROAD_RIGHT) {
          gameState.current.player.targetX = canvasX;
      }
    };

    // Desktop Keyboard Movement & Start
    const handleKeyDown = (e) => {
        if (!isPlaying && showInstructions && !gameOver) {
            if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) {
                setIsPlaying(true);
            }
        }
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.current.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.current.right = true;
    };

    const handleKeyUp = (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.current.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.current.right = false;
    };

    const throwPaper = (vx, vy) => {
        const state = gameState.current;
        if (state.ammo <= 0) {
            spawnText(state.player.x, state.player.y - 20, "NO AMMO!", "red");
            return;
        }
        
        state.ammo -= 1;
        setAmmo(state.ammo);
        
        state.papers.push({
            x: state.player.x,
            y: state.player.y,
            w: 20, h: 20,
            vx: vx, 
            vy: vy, 
            active: true
        });
    };

    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('mousedown', handlePointerDown);
      wrapper.addEventListener('touchstart', handlePointerDown, { passive: false });
      wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      if (wrapper) {
        wrapper.removeEventListener('mousedown', handlePointerDown);
        wrapper.removeEventListener('touchstart', handlePointerDown);
        wrapper.removeEventListener('touchmove', handleTouchMove);
      }
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPlaying, gameOver, showInstructions]);

  // Core Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Reset Game State on mount or restart
    gameState.current = {
      ...gameState.current,
      player: { x: CANVAS_WIDTH / 2, y: 650, w: 50, h: 75, targetX: CANVAS_WIDTH / 2 },
      entities: [], papers: [], particles: [],
      speed: INITIAL_SPEED, score: 0, ammo: 10, distance: 0,
      lastTime: performance.now()
    };
    keys.current = { left: false, right: false };

    let animationId;

    const loop = (time) => {
      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      // --- 1. PHYSICS & SPAWNING (ONLY WHEN PLAYING) ---
      if (isPlaying && !gameOver) {
          state.distance += state.speed * dt;
          
          state.speed = INITIAL_SPEED + (state.score * 0.05);
          state.speed = Math.min(state.speed, MAX_SPEED);

          if (keys.current.left) state.player.targetX -= 12 * dt;
          if (keys.current.right) state.player.targetX += 12 * dt;

          state.player.targetX = Math.max(ROAD_LEFT + state.player.w/2, Math.min(ROAD_RIGHT - state.player.w/2, state.player.targetX));
          state.player.x += (state.player.targetX - state.player.x) * 0.2 * dt;

          if (Math.random() < 0.03 * dt) { 
              spawnEntity(state);
          }

          state.entities.forEach(ent => {
              ent.y += state.speed * dt;
              
              // Hitbox logic (forgiving inner box)
              const ew = ent.hitW || ent.w;
              const eh = ent.hitH || ent.h;

              if (ent.y > state.player.y - eh && ent.y < state.player.y + state.player.h) {
                  if (Math.abs(ent.x - state.player.x) < (ew/2 + state.player.w/2)) {
                      if (ent.type === 'VAN' || ent.type === 'POTHOLE') {
                          triggerGameOver();
                      } else if (ent.type === 'AMMO' && ent.active) {
                          ent.active = false;
                          state.ammo += 5;
                          setAmmo(state.ammo);
                          spawnText(ent.x, ent.y, "+5 $NEWS", "cyan");
                      }
                  }
              }
          });

          state.papers.forEach(p => {
              p.x += p.vx * dt;
              p.y += p.vy * dt;

              if (p.active) {
                  state.entities.filter(e => e.type === 'HOUSE_GREEN' || e.type === 'HOUSE_RED').forEach(house => {
                      if (p.x > house.x - house.w/2 && p.x < house.x + house.w/2 &&
                          p.y > house.y - house.h/2 && p.y < house.y + house.h/2) {
                          
                          p.active = false;
                          house.hit = true;

                          if (house.type === 'HOUSE_GREEN') {
                              state.score += 10;
                              spawnText(house.x, house.y, "+10 HODL", "lime");
                              setScore(state.score);
                          } else {
                              spawnText(house.x, house.y, "RUG PULLED!", "red");
                              triggerGameOver();
                          }
                      }
                  });
              }
          });

          state.entities = state.entities.filter(e => e.y < CANVAS_HEIGHT + 100 && e.active !== false);
          state.papers = state.papers.filter(p => p.y > -50 && p.x > -50 && p.x < CANVAS_WIDTH + 50 && p.active);
      }

      // --- 2. RENDERING (ALWAYS RUNS) ---
      
      const drawTiled = (img, dx, dWidth) => {
          if (!img || !img.complete || img.width === 0) return false;
          const imgRatio = img.height / img.width;
          const dHeight = dWidth * imgRatio;
          const offset = state.distance % dHeight;
          
          for(let i = -dHeight + offset; i < CANVAS_HEIGHT; i += dHeight) {
              ctx.drawImage(img, dx, i, dWidth, dHeight);
          }
          return true;
      };

      // Draw Grass Base
      if (!drawTiled(state.sprites['grass'], 0, CANVAS_WIDTH)) {
          ctx.fillStyle = '#1e3f20'; 
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
      
      // Draw Road Base
      if (!drawTiled(state.sprites['road'], ROAD_LEFT, ROAD_RIGHT - ROAD_LEFT)) {
          ctx.fillStyle = '#333';
          ctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, CANVAS_HEIGHT);
      }

      // Draw Entities
      state.entities.forEach(ent => {
          drawSprite(ctx, state, ent.texture, ent.x - ent.w/2, ent.y - ent.h/2, ent.w, ent.h, ent.hit ? 'orange' : ent.color, ent.flip);
      });

      // Draw Papers
      state.papers.forEach(p => {
          drawSprite(ctx, state, 'paper', p.x - p.w/2, p.y - p.h/2, p.w, p.h, 'white');
      });

      // Draw Player
      drawSprite(ctx, state, 'hero', state.player.x - state.player.w/2, state.player.y - state.player.h/2, state.player.w, state.player.h, 'lime');

      // Draw Particles
      state.particles.forEach(p => {
          p.y -= 2 * dt;
          p.life -= dt;
          ctx.globalAlpha = Math.max(0, p.life / 60);
          ctx.fillStyle = p.color;
          ctx.font = '16px "Press Start 2P"';
          ctx.textAlign = 'center';
          ctx.fillText(p.text, p.x, p.y);
          ctx.globalAlpha = 1.0;
      });
      state.particles = state.particles.filter(p => p.life > 0);

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, resetKey, gameOver]);

  // --- HELPERS ---

  const drawSprite = (ctx, state, textureKey, x, y, w, h, fallbackColor, flip = false) => {
      const sprite = state.sprites[textureKey];
      ctx.save();
      if (flip) {
          ctx.translate(x + w / 2, y + h / 2);
          ctx.scale(-1, 1);
          ctx.translate(-(x + w / 2), -(y + h / 2));
      }

      if (sprite) {
          ctx.drawImage(sprite, x, y, w, h);
      } else {
          ctx.fillStyle = fallbackColor;
          ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
  };

  const spawnEntity = (state) => {
      const rand = Math.random();
      let x, type, texture, color, w, h, hitW, hitH, flip = false;

      if (rand < 0.4) {
          // HOUSES
          const isLeft = Math.random() < 0.5;
          x = isLeft ? ROAD_LEFT / 2 : CANVAS_WIDTH - (ROAD_LEFT / 2);
          flip = !isLeft; 
          const isGreen = Math.random() < 0.7;
          type = isGreen ? 'HOUSE_GREEN' : 'HOUSE_RED';
          texture = isGreen ? 'house_green' : 'house_red';
          color = isGreen ? 'lime' : 'red';
          // Increased House size to 80x80
          w = 80; h = 80; hitW = 70; hitH = 70;
      } else if (rand < 0.8) {
          // OBSTACLES
          x = ROAD_LEFT + 25 + Math.random() * (ROAD_RIGHT - ROAD_LEFT - 50);
          const isVan = Math.random() < 0.5;
          type = isVan ? 'VAN' : 'POTHOLE';
          texture = isVan ? 'van' : 'pothole';
          color = isVan ? 'white' : 'black';
          
          w = isVan ? 50 : 70; 
          h = isVan ? 80 : 70; 
          hitW = isVan ? 45 : 30; 
          hitH = isVan ? 75 : 30;
      } else {
          // AMMO
          x = ROAD_LEFT + 25 + Math.random() * (ROAD_RIGHT - ROAD_LEFT - 50);
          type = 'AMMO';
          texture = 'ammo';
          color = 'cyan';
          w = 30; h = 30; hitW = 30; hitH = 30;
      }

      const proposedY = -100;
      const buffer = 30; // 30px mandatory safety gap

      // Overlap Prevention Logic
      const hasOverlap = state.entities.some(e => {
          const verticalOverlap = Math.abs(e.y - proposedY) < (e.h/2 + h/2 + buffer);
          const horizontalOverlap = Math.abs(e.x - x) < (e.w/2 + w/2 + buffer);
          return verticalOverlap && horizontalOverlap;
      });

      // If this random spawn overlaps with anything already calculated, skip spawning it this frame
      if (hasOverlap) return; 

      state.entities.push({ x, y: proposedY, w, h, hitW, hitH, type, texture, color, hit: false, active: true, flip });
  };

  const spawnText = (x, y, text, color) => {
      gameState.current.particles.push({ x, y, text, color, life: 60 });
  };

  const triggerGameOver = async () => {
      setGameOver(true); 
      setIsPlaying(false);
      
      if (username) {
        await supabase.from('leaderboards').insert([{
            game_id: 'newsdelivery', 
            username, 
            score: gameState.current.score, 
            address: address
        }]);
      }
  };

  return (
    <div ref={containerRef} className="game-wrapper" tabIndex="0" style={{ position: 'relative', outline: 'none' }}>
        <GameUI 
            score={score} 
            gameOver={gameOver} 
            isPlaying={isPlaying} 
            onRestart={() => { 
                setGameOver(false); 
                setIsPlaying(false); 
                setShowInstructions(false);
                setScore(0); 
                setAmmo(10);
                setResetKey(prev => prev + 1); 
            }} 
            onExit={onExit} 
            gameId="newsdelivery" 
        />
        
        {isPlaying && !gameOver && (
            <div style={{ position: 'absolute', top: 20, right: 20, color: 'cyan', textShadow: '2px 2px #000', fontSize: '1.2rem', zIndex: 10 }}>
                AMMO: {ammo}
            </div>
        )}

        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT} 
            style={{ width: '100%', maxWidth: '500px', height: 'auto', display: 'block', cursor: 'crosshair' }} 
        />
        
        {showInstructions && !isPlaying && !gameOver && (
            <div className="pulse" style={{
                position: 'absolute', top: '40%', width: '100%', textAlign: 'center', 
                pointerEvents: 'none', color: 'lime', textShadow: '2px 2px #000',
                fontFamily: '"Press Start 2P"', lineHeight: '1.5', zIndex: 30
            }}>
                USE ARROWS / DRAG TO STEER<br/><br/>
                CLICK / TAP EDGES TO THROW<br/><br/>
                TAP TO START!
            </div>
        )}
    </div>
  );
};

export default NewsDelivery;