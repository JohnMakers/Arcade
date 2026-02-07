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
  const [loading, setLoading] = useState(true);

  // --- GAME STATE REF ---
  const gameState = useRef({
      bird: { x: 50, y: 300, vy: 0 },
      pipes: [],
      sprites: {},
      frame: 0
  });

  // 1. Load Assets
  useEffect(() => {
    const load = async () => {
       const doge = new Image(); doge.src = ASSETS.DOGE_HERO;
       const pipe = new Image(); pipe.src = ASSETS.RED_CANDLE;
       await Promise.all([new Promise(r=>doge.onload=r), new Promise(r=>pipe.onload=r)]);
       gameState.current.sprites = { doge, pipe };
       setLoading(false);
    };
    load();
  }, []);

  // 2. Game Loop
  useEffect(() => {
    if (loading) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Reset State
    gameState.current.bird = { x: 50, y: 300, vy: 0 };
    gameState.current.pipes = [];
    gameState.current.frame = 0;

    let animId;
    const GRAVITY = 0.5;

    const loop = () => {
      const state = gameState.current;
      const { sprites, bird } = state;

      ctx.clearRect(0,0, canvas.width, canvas.height);
      
      // Update Physics ONLY if playing
      if (isPlaying && !gameOver) {
          bird.vy += GRAVITY;
          bird.y += bird.vy;

          if (state.frame % 100 === 0) {
              const gap = 150; 
              const topH = Math.random() * (canvas.height - gap - 100) + 50;
              state.pipes.push({ x: canvas.width, topH, gap, passed: false });
          }

          state.pipes.forEach(p => {
             p.x -= 3;
             // Collision
             if (bird.x + 30 > p.x && bird.x < p.x + 50 && 
                (bird.y < p.topH || bird.y + 30 > p.topH + p.gap)) {
                  handleGameOver(score);
             }
             // Score
             if (p.x + 50 < bird.x && !p.passed) {
                 p.passed = true;
                 setScore(s => s + 1);
             }
          });
          
          if (bird.y > canvas.height || bird.y < 0) handleGameOver(score);
          state.frame++;
      }

      // Draw (Always)
      ctx.fillStyle = score > 10 ? "#000033" : "#f0f0f0";
      ctx.fillRect(0,0, canvas.width, canvas.height);

      state.pipes.forEach(p => {
          ctx.drawImage(sprites.pipe, p.x, 0, 50, p.topH); // Top
          ctx.drawImage(sprites.pipe, p.x, p.topH + p.gap, 50, canvas.height); // Bottom
      });

      ctx.drawImage(sprites.doge, bird.x, bird.y, 40, 40);
      
      if (!gameOver) animId = requestAnimationFrame(loop);
    };

    const handleGameOver = (s) => {
        setGameOver(true);
        if(username) supabase.from('leaderboards').insert([{game_id:'flappy', username, score: s}]);
    };

    loop();
    return () => cancelAnimationFrame(animId);
  }, [loading, isPlaying, resetKey]); 

  // 3. Jump Handler (Uses Ref State directly)
  useEffect(() => {
    const jump = (e) => {
       if ((e.type === 'keydown' && e.code !== 'Space') && e.type !== 'touchstart' && e.type !== 'mousedown') return;
       if (isPlaying && !gameOver) {
           gameState.current.bird.vy = -8;
       }
    };
    window.addEventListener('keydown', jump);
    window.addEventListener('mousedown', jump);
    window.addEventListener('touchstart', jump);
    return () => {
        window.removeEventListener('keydown', jump);
        window.removeEventListener('mousedown', jump);
        window.removeEventListener('touchstart', jump);
    };
  }, [isPlaying, gameOver]);

  // Sync Timer
  useEffect(() => {
      if(!gameOver && !loading) setTimeout(() => setIsPlaying(true), 3000);
  }, [resetKey, gameOver, loading]);

  const handleRestart = () => {
      setGameOver(false);
      setIsPlaying(false);
      setScore(0);
      setResetKey(k => k + 1);
  };

  return (
      <div className="game-wrapper">
         <GameUI score={score} gameOver={gameOver} isPlaying={isPlaying} onRestart={handleRestart} onExit={onExit} gameId="flappy" />
         {loading && <div>LOADING...</div>}
         <canvas ref={canvasRef} width={400} height={600} />
      </div>
  );
};
export default FlappyDoge;