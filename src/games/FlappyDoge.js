import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const FlappyDoge = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username } = useContext(UserContext);
  
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Mutable State
  const gameState = useRef({
    bird: { x: 50, y: 300, vy: 0 },
    pipes: [],
    sprites: {},
    frame: 0
  });

  // Asset Loader
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

  // Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Reset
    gameState.current.bird = { x: 50, y: 300, vy: 0 };
    gameState.current.pipes = [];
    
    let animId;
    const GRAVITY = 0.5;

    // Helper Draw
    const drawObj = (key, x, y, w, h, color) => {
        const img = gameState.current.sprites[key];
        if (img && img.complete && img.naturalWidth !== 0) ctx.drawImage(img, x, y, w, h);
        else { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
    };

    const loop = () => {
        const state = gameState.current;
        
        ctx.fillStyle = score > 10 ? "#000033" : "#f0f0f0";
        ctx.fillRect(0,0, canvas.width, canvas.height);

        if (isPlaying && !gameOver) {
            state.bird.vy += GRAVITY;
            state.bird.y += state.bird.vy;
            
            if (state.frame % 100 === 0) {
                const gap = 150;
                const topH = Math.random() * (canvas.height - gap - 100) + 50;
                state.pipes.push({ x: canvas.width, topH, gap });
            }

            state.pipes.forEach(p => {
                p.x -= 3;
                if (state.bird.x + 30 > p.x && state.bird.x < p.x + 50 &&
                   (state.bird.y < p.topH || state.bird.y + 30 > p.topH + p.gap)) {
                       setGameOver(true);
                       if(username) supabase.from('leaderboards').insert([{game_id:'flappy', username, score}]);
                   }
                if (p.x + 50 < state.bird.x && !p.passed) {
                    p.passed = true;
                    setScore(s => s + 1);
                }
            });

            if (state.bird.y > canvas.height || state.bird.y < 0) setGameOver(true);
            state.frame++;
        }

        state.pipes.forEach(p => {
            drawObj('pipe', p.x, 0, 50, p.topH, 'red');
            drawObj('pipe', p.x, p.topH + p.gap, 50, canvas.height, 'red');
        });
        
        drawObj('doge', state.bird.x, state.bird.y, 40, 40, 'orange');

        animId = requestAnimationFrame(loop);
    };

    const jump = (e) => {
        if (!isPlaying || gameOver) return;
        if (e.type === 'keydown' || e.type === 'touchstart' || e.type === 'mousedown') {
            gameState.current.bird.vy = -8;
        }
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

  useEffect(() => {
    if(!gameOver) setTimeout(() => setIsPlaying(true), 3000);
  }, [resetKey, gameOver]);

  return (
    <div className="game-wrapper">
        <GameUI score={score} gameOver={gameOver} isPlaying={isPlaying} onRestart={() => { setGameOver(false); setIsPlaying(false); setScore(0); setResetKey(k=>k+1); }} onExit={onExit} gameId="flappy" />
        <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};
export default FlappyDoge;