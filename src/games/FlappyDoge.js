import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const FlappyDoge = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username } = useContext(UserContext);
  
  // UI State
  const [score, setScore] = useState(0); // For Display Only
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // --- MUTABLE GAME STATE (No Lag) ---
  const gameState = useRef({
    bird: { x: 50, y: 300, vy: 0 },
    pipes: [],
    sprites: {},
    frame: 0,
    internalScore: 0, // Keeps track of score synchronously
    isDead: false,    // Immediate death flag
    speed: 3.5        // Starting speed
  });

  // --- 1. ROBUST ASSET LOADER ---
  useEffect(() => {
    const load = (k, src) => {
        const img = new Image();
        img.src = src;
        img.crossOrigin = "Anonymous";
        img.onload = () => gameState.current.sprites[k] = img;
    };
    load('doge', ASSETS.DOGE_HERO);
    load('pipe', ASSETS.RED_CANDLE);
  }, []);

  // --- 2. GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Reset State
    gameState.current.bird = { x: 50, y: 300, vy: 0 };
    gameState.current.pipes = [];
    gameState.current.frame = 0;
    gameState.current.internalScore = 0;
    gameState.current.isDead = false;
    gameState.current.speed = 3.5;
    
    let animId;
    const GRAVITY = 0.5;
    const MAX_SPEED = 6.5; // Cap the speed so it's playable

    // Helper: Fault-Tolerant Drawer
    const drawObj = (key, x, y, w, h, color) => {
        const img = gameState.current.sprites[key];
        if (img && img.complete && img.naturalWidth !== 0) ctx.drawImage(img, x, y, w, h);
        else { 
            ctx.fillStyle = color; 
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = "white"; 
            ctx.lineWidth = 2; 
            ctx.strokeRect(x, y, w, h);
        }
    };

    const loop = () => {
        const state = gameState.current;
        
        // 1. Draw Background
        // Darken background as difficulty increases
        const bgLightness = Math.max(10, 95 - state.internalScore); 
        ctx.fillStyle = `hsl(240, 50%, ${bgLightness}%)`;
        ctx.fillRect(0,0, canvas.width, canvas.height);

        // 2. Logic (Only if Playing AND Not Dead)
        if (isPlaying && !state.isDead && !gameOver) {
            
            // Speed Scaling Logic
            // Start at 3.5. Increase by 0.05 per point. Max at 6.5.
            state.speed = Math.min(MAX_SPEED, 3.5 + (state.internalScore * 0.05));

            // Physics
            state.bird.vy += GRAVITY;
            state.bird.y += state.bird.vy;
            
            // Pipe Spawning (Distance based on speed to keep gaps consistent-ish)
            // Spawn roughly every 200px of world travel
            if (state.frame % Math.floor(200 / state.speed) === 0) {
                const gap = 150; // Fixed vertical gap size
                const minPipe = 50;
                const maxPipe = canvas.height - gap - minPipe;
                const topH = Math.random() * (maxPipe - minPipe) + minPipe;
                
                state.pipes.push({ x: canvas.width, topH, gap, passed: false });
            }

            // Pipe Movement & Collision
            state.pipes.forEach(p => {
                p.x -= state.speed;

                // Collision Check
                const hitTop = (state.bird.y < p.topH);
                const hitBot = (state.bird.y + 40 > p.topH + p.gap); // 40 is bird height
                const hitPipeX = (state.bird.x + 30 > p.x && state.bird.x + 10 < p.x + 50); // Adjusted hitbox
                
                if (hitPipeX && (hitTop || hitBot)) {
                   handleDeath();
                }

                // Score Check (Only if not dead)
                if (!state.isDead && p.x + 50 < state.bird.x && !p.passed) {
                    p.passed = true;
                    state.internalScore += 1;
                    setScore(state.internalScore); // Update UI
                }
            });

            // Cleanup off-screen pipes
            state.pipes = state.pipes.filter(p => p.x + 50 > 0);

            // Ground/Ceiling Collision
            if (state.bird.y > canvas.height - 40 || state.bird.y < 0) {
                handleDeath();
            }

            state.frame++;
        }

        // 3. Drawing Objects
        state.pipes.forEach(p => {
            drawObj('pipe', p.x, 0, 50, p.topH, 'red'); // Top
            drawObj('pipe', p.x, p.topH + p.gap, 50, canvas.height, 'red'); // Bottom
        });
        
        drawObj('doge', state.bird.x, state.bird.y, 40, 40, 'orange');

        // Draw Speedometer (Debug/Feedback)
        ctx.fillStyle = "white";
        ctx.font = "10px sans-serif";
        ctx.fillText(`SPEED: ${state.speed.toFixed(1)}`, 10, canvas.height - 10);

        animId = requestAnimationFrame(loop);
    };

    const handleDeath = () => {
        gameState.current.isDead = true; // Stop logic immediately
        setGameOver(true);
        if(username) {
            supabase.from('leaderboards').insert([{
                game_id:'flappy', 
                username, 
                score: gameState.current.internalScore
            }]).then();
        }
    };

    const jump = (e) => {
        if (!isPlaying || gameOver || gameState.current.isDead) return;
        
        // Allow Spacebar, Click, or Tap
        if (e.type === 'keydown' && e.code !== 'Space') return;
        
        gameState.current.bird.vy = -8;
    };

    window.addEventListener('keydown', jump);
    window.addEventListener('touchstart', jump);
    window.addEventListener('mousedown', jump);
    
    loop();
    return () => {
        window.removeEventListener('keydown', jump);
        window.removeEventListener('touchstart', jump);
        window.removeEventListener('mousedown', jump);
        cancelAnimationFrame(animId);
    };
  }, [isPlaying, resetKey]); 

  // Countdown Logic
  useEffect(() => {
    if(!gameOver) {
        const t = setTimeout(() => setIsPlaying(true), 3000);
        return () => clearTimeout(t);
    }
  }, [resetKey, gameOver]);

  return (
    <div className="game-wrapper">
        <GameUI 
            score={score} 
            gameOver={gameOver} 
            isPlaying={isPlaying} 
            onRestart={() => { 
                setGameOver(false); 
                setIsPlaying(false); 
                setScore(0); 
                setResetKey(k=>k+1); 
            }} 
            onExit={onExit} 
            gameId="flappy" 
        />
        <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default FlappyDoge;