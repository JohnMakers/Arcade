import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const FUD_HEADLINES = [
    "Crypto is Dead Again",
    "Government Bans Frogs",
    "SEC Investigates Memes",
    "Dev Sold the Bag",
    "Rugpull Imminent!",
    "Binance Delists Everything",
    "Taxes Raised to 99%",
    "Internet to be Shutdown",
    "Bear Market Extended 10 Yrs"
];

const BULL_HEADLINES = [
    "Pepe to the Moon!",
    "Stakers Getting Rich",
    "Elon Tweets Pepe",
    "New ATH Reached!",
    "Massive Burn Announced",
    "ETF Approved",
    "Institutions Buying the Dip",
    "Normies Fomo In",
    "Lambos Sold Out Everywhere"
];

const NewsCheck = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Constants
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 800;
  const WARMUP_SCORE = 10; // Headlines turn black after this score
  const SWIPE_THRESHOLD = 120; // How far to drag to trigger a decision
  const PAPER_WIDTH = 300;
  const PAPER_HEIGHT = 350;

  const gameState = useRef({
    score: 0,
    sprites: {},
    currentPaper: null,
    particles: [],
    timer: 100, // Percentage of time left to decide
    timerDrainRate: 0.15, // Speeds up as game progresses
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    offsetX: 0,
    offsetY: 0,
    lastTapTime: 0,
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

    loadSprite('bg', ASSETS.NC_BG);
    loadSprite('paper', ASSETS.NC_PAPER);
    loadSprite('paper_gold', ASSETS.NC_PAPER_GOLD);
    loadSprite('trash', ASSETS.NC_TRASH);
    loadSprite('print', ASSETS.NC_PRINT);
    loadSprite('pepe', ASSETS.NC_PEPE_BOSS);
  }, []);

  const spawnPaper = () => {
    const state = gameState.current;
    const isBull = Math.random() > 0.5;
    const list = isBull ? BULL_HEADLINES : FUD_HEADLINES;
    const text = list[Math.floor(Math.random() * list.length)];
    
    // Golden papers start appearing after score 5 (15% chance)
    const isGolden = state.score >= 5 && Math.random() < 0.15;

    state.currentPaper = {
        text,
        type: isBull ? 'BULL' : 'FUD',
        isGolden,
        isVerified: false, // For golden double-taps
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT / 2,
        rotation: (Math.random() - 0.5) * 0.2
    };

    // Reset timer, slightly faster based on score
    state.timer = 100;
    state.timerDrainRate = Math.min(0.15 + (state.score * 0.015), 0.8);
    state.offsetX = 0;
    state.offsetY = 0;
  };

  const wrapText = (ctx, text, x, y, maxWidth, lineHeight) => {
    const words = text.split(' ');
    let line = '';
    let testLine = '';
    let lineArray = [];

    for (let n = 0; n < words.length; n++) {
        testLine += `${words[n]} `;
        let metrics = ctx.measureText(testLine);
        let testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            lineArray.push(line);
            line = `${words[n]} `;
            testLine = `${words[n]} `;
        } else {
            line += `${words[n]} `;
        }
    }
    lineArray.push(line);

    // Draw lines centered vertically
    const startY = y - ((lineArray.length - 1) * lineHeight) / 2;
    lineArray.forEach((l, i) => {
        ctx.fillText(l.trim(), x, startY + (i * lineHeight));
    });
  };

  // Input Handling
  useEffect(() => {
    const handlePointerDown = (e) => {
      if (!isPlaying || gameOver) return;
      const state = gameState.current;
      
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      const touchX = (clientX - rect.left) * scaleX;
      
      // Double Tap Detection
      const now = Date.now();
      if (now - state.lastTapTime < 300) {
          if (state.currentPaper && state.currentPaper.isGolden && !state.currentPaper.isVerified) {
              state.currentPaper.isVerified = true;
              createParticles(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 'yellow');
          }
      }
      state.lastTapTime = now;

      state.isDragging = true;
      state.dragStartX = touchX;
    };

    const handlePointerMove = (e) => {
      if (!isPlaying || gameOver || !gameState.current.isDragging) return;
      if (e.cancelable) e.preventDefault(); // Prevent scrolling while swiping
      
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const touchX = (clientX - rect.left) * scaleX;
      
      gameState.current.offsetX = touchX - gameState.current.dragStartX;
    };

    const handlePointerUp = () => {
      const state = gameState.current;
      if (!state.isDragging || !state.currentPaper) return;
      state.isDragging = false;

      const p = state.currentPaper;

      // Evaluate Swipe
      if (Math.abs(state.offsetX) > SWIPE_THRESHOLD) {
          const swipedRight = state.offsetX > 0;
          const guessType = swipedRight ? 'BULL' : 'FUD';

          // Golden check
          if (p.isGolden && !p.isVerified) {
              triggerGameOver(); // Swiped a golden without verifying!
              return;
          }

          if (p.type === guessType) {
              // Correct!
              state.score += 1;
              setScore(state.score);
              createParticles(
                  swipedRight ? CANVAS_WIDTH : 0, 
                  CANVAS_HEIGHT/2, 
                  swipedRight ? '#00ff00' : '#ff0000'
              );
              spawnPaper();
          } else {
              // Wrong!
              triggerGameOver();
          }
      } else {
          // Snap back to center if swipe wasn't far enough
          state.offsetX = 0;
      }
    };

    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('mousedown', handlePointerDown);
      wrapper.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      
      wrapper.addEventListener('touchstart', handlePointerDown, { passive: false });
      wrapper.addEventListener('touchmove', handlePointerMove, { passive: false });
      window.addEventListener('touchend', handlePointerUp);
    }

    return () => {
      if (wrapper) {
        wrapper.removeEventListener('mousedown', handlePointerDown);
        wrapper.removeEventListener('mousemove', handlePointerMove);
        wrapper.removeEventListener('touchstart', handlePointerDown);
        wrapper.removeEventListener('touchmove', handlePointerMove);
      }
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isPlaying, gameOver]);

  // Core Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Reset Game State
    gameState.current.score = 0;
    gameState.current.particles = [];
    spawnPaper();
    gameState.current.lastTime = performance.now();

    let animationId;

    const loop = (time) => {
      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 1. Draw Background
      if (state.sprites['bg']) {
          ctx.drawImage(state.sprites['bg'], 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
          ctx.fillStyle = '#222';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          // Conveyor belt placeholder
          ctx.fillStyle = '#111';
          ctx.fillRect(CANVAS_WIDTH/2 - 160, 0, 320, CANVAS_HEIGHT);
      }

      // Draw UI indicators (Left Trash, Right Print)
      ctx.globalAlpha = 0.5;
      if (state.sprites['trash']) ctx.drawImage(state.sprites['trash'], 20, CANVAS_HEIGHT/2 - 40, 80, 80);
      else { ctx.fillStyle = 'red'; ctx.fillText("🗑️ FUD", 60, CANVAS_HEIGHT/2); }
      
      if (state.sprites['print']) ctx.drawImage(state.sprites['print'], CANVAS_WIDTH - 100, CANVAS_HEIGHT/2 - 40, 80, 80);
      else { ctx.fillStyle = 'green'; ctx.fillText("🖨️ PRINT", CANVAS_WIDTH - 60, CANVAS_HEIGHT/2); }
      ctx.globalAlpha = 1.0;

      // 2. Game Logic
      if (isPlaying && !gameOver) {
          // Drain Timer
          if (!state.isDragging) {
             state.timer -= state.timerDrainRate * dt;
             if (state.timer <= 0) {
                 triggerGameOver();
             }
          }

          // Draw Paper
          const p = state.currentPaper;
          if (p) {
              ctx.save();
              ctx.translate(p.x + state.offsetX, p.y + state.offsetY);
              
              // Rotate slightly based on swipe direction
              ctx.rotate(p.rotation + (state.offsetX * 0.002));

              // Draw Paper Sprite
              const paperKey = p.isGolden ? 'paper_gold' : 'paper';
              if (state.sprites[paperKey]) {
                  ctx.drawImage(state.sprites[paperKey], -PAPER_WIDTH/2, -PAPER_HEIGHT/2, PAPER_WIDTH, PAPER_HEIGHT);
              } else {
                  ctx.fillStyle = p.isGolden ? '#ffd700' : '#f4f4f4';
                  ctx.fillRect(-PAPER_WIDTH/2, -PAPER_HEIGHT/2, PAPER_WIDTH, PAPER_HEIGHT);
                  ctx.strokeStyle = '#000';
                  ctx.strokeRect(-PAPER_WIDTH/2, -PAPER_HEIGHT/2, PAPER_WIDTH, PAPER_HEIGHT);
              }

              // Verification stamp
              if (p.isGolden && p.isVerified) {
                  ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
                  ctx.fillRect(-PAPER_WIDTH/2, -PAPER_HEIGHT/2, PAPER_WIDTH, PAPER_HEIGHT);
              }

              // Draw Text
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.font = '24px "Press Start 2P", cursive';
              
              // WARMUP MECHANIC: Colors change to black after WARMUP_SCORE
              if (state.score < WARMUP_SCORE) {
                  ctx.fillStyle = p.type === 'FUD' ? '#cc0000' : '#009900';
              } else {
                  ctx.fillStyle = '#111'; // Force the user to read!
              }

              wrapText(ctx, p.text, 0, 0, PAPER_WIDTH - 40, 35);

              // Golden warning
              if (p.isGolden && !p.isVerified) {
                  ctx.fillStyle = 'blue';
                  ctx.font = '14px "Press Start 2P"';
                  ctx.fillText("DOUBLE TAP!", 0, -PAPER_HEIGHT/2 + 30);
              } else if (p.isGolden && p.isVerified) {
                  ctx.fillStyle = 'green';
                  ctx.font = '16px "Press Start 2P"';
                  ctx.fillText("VERIFIED", 0, -PAPER_HEIGHT/2 + 30);
              }

              // Swipe visual feedback (Red/Green overlay based on drag)
              if (Math.abs(state.offsetX) > 20) {
                 ctx.globalAlpha = Math.min(Math.abs(state.offsetX) / SWIPE_THRESHOLD, 0.5);
                 ctx.fillStyle = state.offsetX > 0 ? '#00ff00' : '#ff0000';
                 ctx.fillRect(-PAPER_WIDTH/2, -PAPER_HEIGHT/2, PAPER_WIDTH, PAPER_HEIGHT);
                 ctx.globalAlpha = 1.0;
              }

              ctx.restore();
          }

          // Draw Conveyor Timer Bar
          ctx.fillStyle = '#333';
          ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20);
          ctx.fillStyle = state.timer > 30 ? '#00ff00' : '#ff0000';
          ctx.fillRect(0, CANVAS_HEIGHT - 20, (state.timer / 100) * CANVAS_WIDTH, 20);
      }

      // Draw Particles
      state.particles.forEach((p) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          ctx.globalAlpha = p.life / 30;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
      });
      state.particles = state.particles.filter(p => p.life > 0);

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [resetKey, isPlaying]);

  const createParticles = (x, y, color) => {
      for(let i=0; i<15; i++) {
          gameState.current.particles.push({
              x, y, 
              vx: (Math.random() - 0.5) * 15,
              vy: (Math.random() - 0.5) * 15,
              life: 30,
              size: Math.random() * 6 + 2,
              color: color
          });
      }
  };

  const triggerGameOver = async () => {
      if (gameOver) return;
      const state = gameState.current;
      
      // Fall animation for current paper
      if (state.currentPaper) {
         state.currentPaper.y += 200;
         state.currentPaper.rotation += 1;
      }

      if (username) {
        await supabase.from('leaderboards').insert([{
            game_id: 'newscheck', 
            username, 
            score: state.score, 
            address: address
        }]);
      }

      setGameOver(true);
  };

  const startGame = () => {
      setIsPlaying(true);
  };

  return (
    <div ref={containerRef} className="game-wrapper" style={{ touchAction: 'none' }}>
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
            gameId="newscheck" 
        />
        
        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT} 
            style={{ width: '100%', maxWidth: '500px', height: 'auto', display: 'block', cursor: 'grab' }} 
        />
        
        {!isPlaying && !gameOver && (
            <div style={{
                position: 'absolute', top: '25%', width: '100%', textAlign: 'center', 
                pointerEvents: 'none', color: '#fff', textShadow: '2px 2px #000',
                fontFamily: '"Press Start 2P"', background: 'rgba(0,0,0,0.6)', padding: '20px 0'
            }}>
                <div style={{color: 'yellow', marginBottom: 15, fontSize: '1.2rem'}}>$NEWS CHECK FRENZY</div>
                <div style={{fontSize: '0.8rem', lineHeight: '2'}}>
                    Swipe Left = <span style={{color: 'red'}}>FUD 🗑️</span><br/>
                    Swipe Right = <span style={{color: '#00ff00'}}>PRINT 🖨️</span><br/><br/>
                    Golden Papers = DOUBLE TAP!<br/><br/>
                    (Read fast, they turn black...)
                </div>
                <button className="btn-meme" style={{pointerEvents: 'auto', marginTop: 20}} onClick={startGame}>
                    START SHIFT
                </button>
            </div>
        )}
    </div>
  );
};

export default NewsCheck;