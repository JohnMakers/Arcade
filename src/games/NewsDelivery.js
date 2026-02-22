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
  const [ammo, setAmmo] = useState(10); // Start with 10 papers
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- CONFIGURATION ---
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 800;
  const ROAD_LEFT = 100;
  const ROAD_RIGHT = 400;
  const INITIAL_SPEED = 6;

  const gameState = useRef({
    player: { x: CANVAS_WIDTH / 2, y: 650, w: 50, h: 50, targetX: CANVAS_WIDTH / 2 },
    entities: [], // houses, obstacles, ammo
    papers: [],   // thrown papers
    particles: [], // text floaters or explosions
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
  }, []);

  // Controls: Drag to steer, tap edges to throw
  useEffect(() => {
    const handlePointer = (e) => {
      if (!isPlaying || gameOver) return;
      if (e.target.closest('button')) return;
      
      let clientX;
      if (e.type.includes('touch')) {
        clientX = e.touches[0].clientX;
      } else {
        clientX = e.clientX;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const canvasX = (clientX - rect.left) * scaleX;

      // Determine intent: Steer or Throw?
      // If tap is far left or far right, throw. Otherwise, steer.
      if (e.type === 'mousedown' || e.type === 'touchstart') {
          if (canvasX < ROAD_LEFT + 20) {
              throwPaper(-1); // Throw Left
          } else if (canvasX > ROAD_RIGHT - 20) {
              throwPaper(1);  // Throw Right
          } else {
              gameState.current.player.targetX = canvasX;
          }
      } else if (e.type === 'mousemove' || e.type === 'touchmove') {
          // Continuous steering if dragging in the middle
          if (canvasX >= ROAD_LEFT && canvasX <= ROAD_RIGHT) {
              gameState.current.player.targetX = canvasX;
          }
      }
    };

    const throwPaper = (direction) => {
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
            vx: direction * 8, // Move left/right
            vy: -10, // Move up screen
            active: true
        });
    };

    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('mousedown', handlePointer);
      wrapper.addEventListener('mousemove', handlePointer);
      wrapper.addEventListener('touchstart', handlePointer, { passive: false });
      wrapper.addEventListener('touchmove', handlePointer, { passive: false });
    }

    return () => {
      if (wrapper) {
        wrapper.removeEventListener('mousedown', handlePointer);
        wrapper.removeEventListener('mousemove', handlePointer);
        wrapper.removeEventListener('touchstart', handlePointer);
        wrapper.removeEventListener('touchmove', handlePointer);
      }
    };
  }, [isPlaying, gameOver]);

  // Core Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Reset Game State
    gameState.current = {
      ...gameState.current,
      player: { x: CANVAS_WIDTH / 2, y: 650, w: 40, h: 60, targetX: CANVAS_WIDTH / 2 },
      entities: [], papers: [], particles: [],
      speed: INITIAL_SPEED, score: 0, ammo: 10, distance: 0,
      lastTime: performance.now()
    };

    let animationId;

    const loop = (time) => {
      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      if (!isPlaying || gameOver) {
        animationId = requestAnimationFrame(loop);
        return;
      }

      // --- PHYSICS & SPAWNING ---
      state.distance += state.speed * dt;
      
      // Speed scaling (Level up every 1000 units)
      state.speed = INITIAL_SPEED + Math.floor(state.distance / 1000);

      // Smooth player movement
      state.player.x += (state.player.targetX - state.player.x) * 0.2 * dt;
      // Clamp to road
      state.player.x = Math.max(ROAD_LEFT + state.player.w/2, Math.min(ROAD_RIGHT - state.player.w/2, state.player.x));

      // Spawner logic
      if (Math.random() < 0.03 * dt) { // Entity spawn rate
          spawnEntity(state);
      }

      // Update Entities
      state.entities.forEach(ent => {
          ent.y += state.speed * dt;
          
          // Player collision (Obstacles & Ammo)
          if (ent.y > state.player.y - ent.h && ent.y < state.player.y + state.player.h) {
              if (Math.abs(ent.x - state.player.x) < (ent.w/2 + state.player.w/2)) {
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

      // Update Papers
      state.papers.forEach(p => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;

          // Check Paper vs House collisions
          if (p.active) {
              state.entities.filter(e => e.type === 'HOUSE_GREEN' || e.type === 'HOUSE_RED').forEach(house => {
                  if (p.x > house.x - house.w/2 && p.x < house.x + house.w/2 &&
                      p.y > house.y - house.h/2 && p.y < house.y + house.h/2) {
                      
                      p.active = false;
                      house.hit = true;

                      if (house.type === 'HOUSE_GREEN') {
                          state.score += 10;
                          spawnText(house.x, house.y, "+10 HODL", "lime");
                      } else {
                          state.score += 20;
                          spawnText(house.x, house.y, "FUD REKT!", "red");
                      }
                      setScore(state.score);
                  }
              });
          }
      });

      // Cleanup offscreen
      state.entities = state.entities.filter(e => e.y < CANVAS_HEIGHT + 100 && e.active !== false);
      state.papers = state.papers.filter(p => p.y > -50 && p.x > -50 && p.x < CANVAS_WIDTH + 50 && p.active);

      // --- RENDERING ---
      // Draw Grass
      ctx.fillStyle = '#1e3f20'; 
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Draw Road
      ctx.fillStyle = '#333';
      ctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, CANVAS_HEIGHT);

      // Road markings (scrolling)
      ctx.fillStyle = '#fff';
      for(let i = 0; i < CANVAS_HEIGHT; i += 60) {
          const offset = state.distance % 60;
          ctx.fillRect(CANVAS_WIDTH/2 - 2, i + offset, 4, 30);
      }

      // Draw Entities
      state.entities.forEach(ent => {
          drawSprite(ctx, state, ent.texture, ent.x - ent.w/2, ent.y - ent.h/2, ent.w, ent.h, ent.hit ? 'orange' : ent.color);
      });

      // Draw Papers
      state.papers.forEach(p => {
          drawSprite(ctx, state, 'paper', p.x - p.w/2, p.y - p.h/2, p.w, p.h, 'white');
      });

      // Draw Player
      drawSprite(ctx, state, 'hero', state.player.x - state.player.w/2, state.player.y - state.player.h/2, state.player.w, state.player.h, 'lime');

      // Draw Particles (Text)
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
  }, [isPlaying, resetKey]);

  // --- HELPERS ---

  const drawSprite = (ctx, state, textureKey, x, y, w, h, fallbackColor) => {
      const sprite = state.sprites[textureKey];
      if (sprite) {
          ctx.drawImage(sprite, x, y, w, h);
      } else {
          ctx.fillStyle = fallbackColor;
          ctx.fillRect(x, y, w, h);
      }
  };

  const spawnEntity = (state) => {
      const rand = Math.random();
      let x, type, texture, color, w, h;

      if (rand < 0.4) {
          // Spawn House (Left or Right)
          const isLeft = Math.random() < 0.5;
          x = isLeft ? ROAD_LEFT / 2 : CANVAS_WIDTH - (ROAD_LEFT / 2);
          const isGreen = Math.random() < 0.7;
          type = isGreen ? 'HOUSE_GREEN' : 'HOUSE_RED';
          texture = isGreen ? 'house_green' : 'house_red';
          color = isGreen ? 'lime' : 'red';
          w = 60; h = 60;
      } else if (rand < 0.8) {
          // Spawn Obstacle on road
          x = ROAD_LEFT + 20 + Math.random() * (ROAD_RIGHT - ROAD_LEFT - 40);
          const isVan = Math.random() < 0.5;
          type = isVan ? 'VAN' : 'POTHOLE';
          texture = isVan ? 'van' : 'pothole';
          color = isVan ? 'white' : 'black';
          w = isVan ? 50 : 30;
          h = isVan ? 80 : 30;
      } else {
          // Spawn Ammo on road
          x = ROAD_LEFT + 20 + Math.random() * (ROAD_RIGHT - ROAD_LEFT - 40);
          type = 'AMMO';
          texture = 'ammo';
          color = 'cyan';
          w = 30; h = 30;
      }

      state.entities.push({ x, y: -100, w, h, type, texture, color, hit: false, active: true });
  };

  const spawnText = (x, y, text, color) => {
      gameState.current.particles.push({ x, y, text, color, life: 60 });
  };

  const triggerGameOver = async () => {
      setIsPlaying(false);
      
      if (username) {
        await supabase.from('leaderboards').insert([{
            game_id: 'newsdelivery', 
            username, 
            score: gameState.current.score, 
            address: address
        }]);
      }

      setTimeout(() => { setGameOver(true); }, 500);
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
                setAmmo(10);
                setResetKey(prev => prev + 1); 
            }} 
            onExit={onExit} 
            gameId="newsdelivery" 
        />
        
        {/* HUD for Ammo */}
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
        
        {!isPlaying && !gameOver && (
            <div style={{
                position: 'absolute', top: '40%', width: '100%', textAlign: 'center', 
                pointerEvents: 'none', color: 'lime', textShadow: '2px 2px #000',
                fontFamily: '"Press Start 2P"', lineHeight: '1.5'
            }}>
                DRAG TO STEER<br/>
                TAP EDGES TO THROW<br/><br/>
                DELIVER THE $NEWS!
            </div>
        )}
    </div>
  );
};

export default NewsDelivery;