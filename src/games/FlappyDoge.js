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

  const sprites = useRef({});
  const [loaded, setLoaded] = useState(false);

  // Load Images Once
  useEffect(() => {
    const load = async () => {
      const doge = new Image(); doge.src = ASSETS.DOGE_HERO;
      const pipe = new Image(); pipe.src = ASSETS.RED_CANDLE;
      await Promise.all([new Promise(r=>doge.onload=r), new Promise(r=>pipe.onload=r)]);
      sprites.current = { doge, pipe };
      setLoaded(true);
    };
    load();
  }, []);

  // Game Logic
  useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Variables
    let bird = { x: 50, y: 300, velocity: 0, width: 40, height: 40 };
    let pipes = [];
    let frameCount = 0;
    let localScore = 0;
    let active = true;
    let animId;

    const GRAVITY = 0.5;
    const JUMP = -8;

    const loop = () => {
      ctx.clearRect(0,0, canvas.width, canvas.height);
      
      // Draw Background
      ctx.fillStyle = localScore > 20 ? "#000033" : "#f0f0f0";
      ctx.fillRect(0,0, canvas.width, canvas.height);

      // --- LOGIC (Only when playing) ---
      if (isPlaying && active) {
        bird.velocity += GRAVITY;
        bird.y += bird.velocity;

        // Spawning
        if (frameCount % 100 === 0) {
            const gap = Math.max(120, 200 - localScore * 2);
            const topH = Math.random() * (canvas.height - gap - 100) + 50;
            pipes.push({ x: canvas.width, w: 50, topH, gap, passed: false });
        }

        // Pipe Movement & Collision
        pipes.forEach(p => {
            p.x -= 3;
            // Collision
            if (
                bird.x < p.x + p.w && bird.x + bird.width > p.x &&
                (bird.y < p.topH || bird.y + bird.height > p.topH + p.gap)
            ) {
                active = false;
                setGameOver(true);
                if(username) supabase.from('leaderboards').insert([{game_id:'flappy', username, score:localScore}]);
            }
            // Score
            if (p.x + p.w < bird.x && !p.passed) {
                localScore++;
                setScore(localScore);
                p.passed = true;
            }
        });
        
        // Floor Collision
        if (bird.y > canvas.height) {
            active = false;
            setGameOver(true);
        }
        frameCount++;
      }
      
      // --- DRAWING (Always) ---
      // Pipes
      pipes.forEach(p => {
          ctx.fillStyle = "red";
          ctx.drawImage(sprites.current.pipe, p.x, 0, p.w, p.topH);
          ctx.drawImage(sprites.current.pipe, p.x, p.topH + p.gap, p.w, canvas.height);
      });

      // Bird
      ctx.drawImage(sprites.current.doge, bird.x, bird.y, bird.width, bird.height);

      animId = requestAnimationFrame(loop);
    };

    const jump = () => { if (isPlaying && active) bird.velocity = JUMP; };
    window.addEventListener('touchstart', jump);
    window.addEventListener('mousedown', jump);
    
    loop();

    return () => {
        window.removeEventListener('touchstart', jump);
        window.removeEventListener('mousedown', jump);
        cancelAnimationFrame(animId);
    };

  }, [loaded, resetKey, isPlaying]); // ResetKey restarts this whole block

  // Timer
  useEffect(() => {
      if(!gameOver) {
          const t = setTimeout(() => setIsPlaying(true), 3000);
          return () => clearTimeout(t);
      }
  }, [resetKey, gameOver]);

  const handleRestart = () => {
      setGameOver(false);
      setIsPlaying(false);
      setScore(0);
      setResetKey(k => k + 1); // Instant reset
  };

  return (
    <div className="game-wrapper">
        <GameUI score={score} gameOver={gameOver} isPlaying={isPlaying} onRestart={handleRestart} onExit={onExit} gameId="flappy" />
        {!loaded && <div style={{color:'white'}}>LOADING...</div>}
        <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default FlappyDoge;