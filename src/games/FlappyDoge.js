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
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false); // Controls the 3s countdown

  const sprites = useRef({});

  // 1. Load Images
  useEffect(() => {
    const loadImages = async () => {
      const doge = new Image(); doge.src = ASSETS.DOGE_HERO;
      const pipe = new Image(); pipe.src = ASSETS.RED_CANDLE;
      await Promise.all([new Promise(r => doge.onload = r), new Promise(r => pipe.onload = r)]);
      sprites.current = { doge, pipe };
      setImagesLoaded(true);
    };
    loadImages();
  }, []);

  // 2. Game Loop
  useEffect(() => {
    if (!imagesLoaded || !isPlaying || gameOver) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let bird = { x: 50, y: 150, velocity: 0, width: 40, height: 40 };
    let pipes = [];
    let frameCount = 0;
    let localScore = 0;
    let speed = 3;

    const GRAVITY = 0.5;
    const JUMP = -8;

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background
      ctx.fillStyle = localScore > 20 ? "#000033" : "#f0f0f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Bird Physics
      bird.velocity += GRAVITY;
      bird.y += bird.velocity;
      ctx.drawImage(sprites.current.doge, bird.x, bird.y, bird.width, bird.height);

      // Pipe Logic
      if (frameCount % 100 === 0) {
        const difficulty = Math.min(80, Math.floor(localScore / 10) * 2);
        const gap = 200 - difficulty;
        const minHeight = 50;
        const topHeight = Math.random() * (canvas.height - gap - minHeight) + minHeight;
        pipes.push({ x: canvas.width, width: 50, topHeight, gap, passed: false });
      }

      pipes.forEach(pipe => {
        pipe.x -= speed;
        // Draw Pipes
        ctx.fillStyle = "red";
        ctx.drawImage(sprites.current.pipe, pipe.x, 0, pipe.width, pipe.topHeight);
        ctx.drawImage(sprites.current.pipe, pipe.x, pipe.topHeight + pipe.gap, pipe.width, canvas.height);

        // Collision
        if (
          bird.x < pipe.x + pipe.width &&
          bird.x + bird.width > pipe.x &&
          (bird.y < pipe.topHeight || bird.y + bird.height > pipe.topHeight + pipe.gap)
        ) {
          handleDeath(localScore);
        }

        // Score
        if (pipe.x + pipe.width < bird.x && !pipe.passed) {
          localScore++;
          setScore(localScore);
          pipe.passed = true;
          if (localScore % 10 === 0) speed *= 1.05;
        }
      });

      if (bird.y > canvas.height || bird.y < 0) handleDeath(localScore);

      frameCount++;
      if (!gameOver) animationFrameId = requestAnimationFrame(loop);
    };

    const handleDeath = (finalScore) => {
      setGameOver(true);
      if (username) supabase.from('leaderboards').insert([{ game_id: 'flappy', username, score: finalScore }]).then();
      cancelAnimationFrame(animationFrameId);
    };

    const jump = () => bird.velocity = JUMP;
    window.addEventListener('mousedown', jump);
    window.addEventListener('keydown', jump);
    
    loop();

    return () => {
      window.removeEventListener('mousedown', jump);
      window.removeEventListener('keydown', jump);
      cancelAnimationFrame(animationFrameId);
    };
  }, [imagesLoaded, isPlaying, gameOver, username]); // Dependencies trigger restart

  // 3. Restart Handler
  const handleRestart = () => {
    setScore(0);
    setGameOver(false);
    setIsPlaying(false); // Triggers countdown again
  };

  // 4. Start Handler (From Countdown)
  useEffect(() => {
    if (imagesLoaded && !gameOver) {
      const timer = setTimeout(() => setIsPlaying(true), 3000); // Sync with UI countdown
      return () => clearTimeout(timer);
    }
  }, [imagesLoaded, gameOver]);

  return (
    <div style={{ position: 'relative' }}>
      <GameUI 
        score={score} 
        gameOver={gameOver} 
        onRestart={handleRestart} 
        onExit={onExit} 
        gameId="flappy" 
      />
      {!imagesLoaded && <div style={{color:'white'}}>LOADING MEMES...</div>}
      <canvas ref={canvasRef} width={400} height={600} className="game-canvas" />
    </div>
  );
};

export default FlappyDoge;