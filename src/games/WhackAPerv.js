import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const WhackAPerv = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- CONFIGURATION ---
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 800;
  const HOLE_ROWS = 3;
  const HOLE_COLS = 3;
  const HOLE_WIDTH = 100;
  const HOLE_HEIGHT = 40;
  const MOLE_WIDTH = 80;
  const MOLE_HEIGHT = 90;

  const gameState = useRef({
    lives: 3,
    score: 0,
    moles: [], 
    particles: [],
    sprites: {},
    lastTime: 0,
    lastSpawnTime: 0,
    // Difficulty scaling variables
    spawnInterval: 1200, 
    maxStayTime: 1000,
    riseSpeed: 150, 
    holes: []
  });

  // Load Assets
  useEffect(() => {
    const loadSprite = (key, src) => {
      if (!src) return;
      const img = new Image();
      img.src = src;
      img.crossOrigin = "Anonymous";
      img.onload = () => { gameState.current.sprites[key] = img; };
    };

    loadSprite('bg', ASSETS.WAP_BG);
    loadSprite('diddy', ASSETS.WAP_DIDDY);
    loadSprite('epstein', ASSETS.WAP_EPSTEIN);
    loadSprite('pepe', ASSETS.WAP_PEPE);
    loadSprite('mallet', ASSETS.WAP_MALLET);
  }, []);

  // Define the 3x3 Grid
  useEffect(() => {
    const holes = [];
    const startX = 100;
    const startY = 300;
    const xGap = 150;
    const yGap = 160;

    for (let row = 0; row < HOLE_ROWS; row++) {
      for (let col = 0; col < HOLE_COLS; col++) {
        holes.push({
          x: startX + col * xGap,
          y: startY + row * yGap,
          active: false 
        });
      }
    }
    gameState.current.holes = holes;
  }, []);

  // Input Handling
  useEffect(() => {
    const handleInput = (e) => {
      if (!isPlaying || gameOver || e.target.closest('button') || e.target.closest('.interactive')) return;
      if (e.cancelable && e.type === 'touchstart') e.preventDefault();

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      
      // Calculate scaled coordinates to support responsive sizing
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      let clientX, clientY;
      if (e.type === 'touchstart') {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;

      handleWhack(x, y);
    };

    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('mousedown', handleInput);
      wrapper.addEventListener('touchstart', handleInput, { passive: false });
    }

    return () => {
      if (wrapper) {
        wrapper.removeEventListener('mousedown', handleInput);
        wrapper.removeEventListener('touchstart', handleInput);
      }
    };
  }, [isPlaying, gameOver]);

  const handleWhack = (x, y) => {
    const state = gameState.current;
    
    // Spawn visual tap effect
    spawnParticles(x, y, '#ffffff', 5);

    // Check collision from top to bottom (reverse order to hit foreground first)
    for (let i = state.moles.length - 1; i >= 0; i--) {
      const mole = state.moles[i];
      if (mole.state === 'hit' || mole.state === 'hiding') continue;

      const hole = state.holes[mole.holeIdx];
      
      // Hitbox logic
      const hitX = x >= hole.x - MOLE_WIDTH / 2 && x <= hole.x + MOLE_WIDTH / 2;
      const hitY = y >= hole.y - mole.yOffset && y <= hole.y;

      if (hitX && hitY) {
        mole.state = 'hit';
        
        if (mole.type === 'pepe') {
          // Hit friendly Pepe = Instant Death
          triggerGameOver("YOU HIT A FREN!");
          spawnParticles(x, y, '#ff0000', 20);
        } else {
          // Hit Perv = Score
          state.score += 1;
          setScore(state.score);
          spawnParticles(x, y, '#00ff00', 10);
          spawnText(hole.x, hole.y - 50, "+1", '#00ff00');
          
          // Progressive Difficulty
          state.spawnInterval = Math.max(400, 1200 - state.score * 30);
          state.maxStayTime = Math.max(300, 1000 - state.score * 25);
          state.riseSpeed = Math.min(600, 150 + state.score * 15);
        }
        break; 
      }
    }
  };

  const spawnParticles = (x, y, color, count) => {
    for (let i = 0; i < count; i++) {
      gameState.current.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color,
        text: null
      });
    }
  };

  const spawnText = (x, y, text, color) => {
    gameState.current.particles.push({
      x, y, vx: 0, vy: -2, life: 1.5, color, text
    });
  };

  // Core Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Reset State
    gameState.current = {
      ...gameState.current,
      lives: 3,
      score: 0,
      moles: [],
      particles: [],
      spawnInterval: 1200,
      maxStayTime: 1000,
      riseSpeed: 150,
      lastSpawnTime: performance.now()
    };
    gameState.current.holes.forEach(h => h.active = false);

    let animationId;
    gameState.current.lastTime = performance.now();

    const loop = (time) => {
      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 1000, 0.1); // Delta time in seconds
      state.lastTime = time;

      if (!isPlaying || gameOver) {
        animationId = requestAnimationFrame(loop);
        return;
      }

      // Clear Canvas
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (state.sprites['bg']) {
         ctx.drawImage(state.sprites['bg'], 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
         const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
         grad.addColorStop(0, '#2d1b00');
         grad.addColorStop(1, '#000000');
         ctx.fillStyle = grad;
         ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      // Spawn Logic
      if (time - state.lastSpawnTime > state.spawnInterval) {
        const inactiveHoles = state.holes.map((h, i) => ({...h, idx: i})).filter(h => !h.active);
        
        if (inactiveHoles.length > 0) {
          const randomHole = inactiveHoles[Math.floor(Math.random() * inactiveHoles.length)];
          
          // Determine type (70% Diddy, 20% Epstein, 10% Pepe)
          const roll = Math.random();
          let type = 'diddy';
          if (roll > 0.9) type = 'pepe';
          else if (roll > 0.7) type = 'epstein';

          state.moles.push({
            holeIdx: randomHole.idx,
            type: type,
            state: 'rising', // rising, up, hiding, hit
            yOffset: 0,
            timer: 0
          });
          state.holes[randomHole.idx].active = true;
          state.lastSpawnTime = time;
        }
      }

      // Draw Holes (Back half)
      state.holes.forEach(hole => {
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(hole.x, hole.y, HOLE_WIDTH / 2, HOLE_HEIGHT / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      // Update and Draw Moles
      for (let i = state.moles.length - 1; i >= 0; i--) {
        const mole = state.moles[i];
        const hole = state.holes[mole.holeIdx];

        if (mole.state === 'rising') {
          mole.yOffset += state.riseSpeed * dt;
          if (mole.yOffset >= MOLE_HEIGHT) {
            mole.yOffset = MOLE_HEIGHT;
            mole.state = 'up';
          }
        } else if (mole.state === 'up') {
          mole.timer += dt * 1000;
          if (mole.timer >= state.maxStayTime) mole.state = 'hiding';
        } else if (mole.state === 'hiding') {
          mole.yOffset -= state.riseSpeed * dt;
          if (mole.yOffset <= 0) {
            // Missed a perv!
            if (mole.type !== 'pepe') {
              state.lives -= 1;
              spawnText(hole.x, hole.y - 20, "MISSED!", '#ff0000');
              if (state.lives <= 0) triggerGameOver();
            }
            hole.active = false;
            state.moles.splice(i, 1);
            continue;
          }
        } else if (mole.state === 'hit') {
           mole.yOffset -= (state.riseSpeed * 2) * dt; 
           if (mole.yOffset <= 0) {
             hole.active = false;
             state.moles.splice(i, 1);
             continue;
           }
        }

        // Draw Character with Clipping Mask to hide lower half
        ctx.save();
        ctx.beginPath();
        // Clip area above the hole
        ctx.rect(hole.x - HOLE_WIDTH, hole.y - MOLE_HEIGHT - 20, HOLE_WIDTH * 2, MOLE_HEIGHT + 20);
        ctx.clip();

        const sprite = state.sprites[mole.type];
        if (sprite) {
           ctx.drawImage(sprite, hole.x - MOLE_WIDTH / 2, hole.y - mole.yOffset, MOLE_WIDTH, MOLE_HEIGHT);
        } else {
           // Fallbacks
           ctx.fillStyle = mole.type === 'pepe' ? '#00ff00' : (mole.type === 'diddy' ? '#ff00ff' : '#aa00ff');
           ctx.fillRect(hole.x - MOLE_WIDTH / 2, hole.y - mole.yOffset, MOLE_WIDTH, MOLE_HEIGHT);
        }
        
        // Draw hit flash
        if (mole.state === 'hit') {
           ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
           ctx.fillRect(hole.x - MOLE_WIDTH / 2, hole.y - mole.yOffset, MOLE_WIDTH, MOLE_HEIGHT);
        }
        ctx.restore();
      }

      // Draw Holes (Front lip for depth)
      state.holes.forEach(hole => {
        ctx.beginPath();
        ctx.ellipse(hole.x, hole.y, HOLE_WIDTH / 2, HOLE_HEIGHT / 2, 0, 0, Math.PI);
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 4;
        ctx.stroke();
      });

      // Update and Draw Particles
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= dt;
        
        ctx.globalAlpha = Math.max(0, p.life);
        if (p.text) {
          ctx.font = '20px "Press Start 2P"';
          ctx.fillStyle = p.color;
          ctx.textAlign = 'center';
          ctx.fillText(p.text, p.x, p.y);
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, 4, 4);
        }
        ctx.globalAlpha = 1.0;

        if (p.life <= 0) state.particles.splice(i, 1);
      }

      // Draw HUD (Hearts)
      for(let i=0; i<3; i++) {
         ctx.fillStyle = i < state.lives ? '#ff0000' : '#444444';
         ctx.font = '24px serif';
         ctx.fillText('❤', 30 + i * 35, 40);
      }

      animationId = requestAnimationFrame(loop);
    };

    if (isPlaying && !gameOver) {
      animationId = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, gameOver, resetKey]);

  const triggerGameOver = async (reason = null) => {
    setGameOver(true);
    setIsPlaying(false);
    
    if (reason) {
      // Small delay to allow particle text to show before screen locks
      setTimeout(() => {
        alert(reason); 
      }, 100);
    }

    if (username) {
      await supabase.from('leaderboards').insert([{
          game_id: 'whackaperv', 
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
                setScore(0);
                setResetKey(prev => prev + 1); 
                // Set playing to true immediately to bypass countdown, or let GameUI handle it
                setTimeout(() => setIsPlaying(true), 3000); // 3 sec for countdown sync
            }} 
            onExit={onExit} 
            gameId="whackaperv" 
        />
        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT} 
            style={{ width: '100%', maxWidth: '500px', height: 'auto', display: 'block', cursor: 'url(assets/wap_mallet.png), crosshair' }} 
        />
        {!isPlaying && !gameOver && (
            <div style={{
                position: 'absolute', top: '40%', width: '100%', textAlign: 'center', 
                pointerEvents: 'none', color: '#ff00ff', textShadow: '2px 2px #000',
                fontFamily: '"Press Start 2P"'
            }}>
                WHACK THE PERVS<br/><br/>
                DON'T HIT PEPE
            </div>
        )}
    </div>
  );
};

export default WhackAPerv;