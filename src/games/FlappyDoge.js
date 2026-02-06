import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';

const FlappyDoge = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username } = useContext(UserContext);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [feedback, setFeedback] = useState(null); // "WOW", "MUCH SCORE"

  // Game Constants
  const GRAVITY = 0.6;
  const JUMP = -8; // Doge Jump power
  const PIPE_SPEED_BASE = 3;
  
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    // Assets
    const heroImg = new Image(); heroImg.src = ASSETS.DOGE_HERO;
    const pipeImg = new Image(); pipeImg.src = ASSETS.RED_CANDLE;

    // State
    let bird = { x: 50, y: 150, velocity: 0, width: 30, height: 30 };
    let pipes = [];
    let frameCount = 0;
    let gameScore = 0;
    let speed = PIPE_SPEED_BASE;
    let isRunning = true;

    const spawnPipe = () => {
      // Scaling Logic [cite: 8, 9]
      const difficultyMultiplier = Math.floor(gameScore / 10);
      let gap = Math.max(120, 200 - (difficultyMultiplier * 2)); // Hard Cap at 120px
      
      const minPipeHeight = 50;
      const maxPipeHeight = canvas.height - gap - minPipeHeight;
      const topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1)) + minPipeHeight;

      pipes.push({
        x: canvas.width,
        width: 50,
        topHeight: topHeight,
        gap: gap,
        passed: false,
        // Oscillation Logic [cite: 11]
        isMoving: gameScore >= 50,
        moveDir: 1,
        baseY: topHeight
      });
    };

    const loop = () => {
      if (!isRunning) return;

      // Update Difficulty Speed [cite: 8]
      speed = PIPE_SPEED_BASE * (1 + (Math.floor(gameScore / 10) * 0.05));

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background Transition [cite: 51]
      ctx.fillStyle = gameScore > 20 ? "#000033" : "#f0f0f0"; // Simple color switch for now
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Bird Physics
      bird.velocity += GRAVITY;
      bird.y += bird.velocity;
      ctx.drawImage(heroImg, bird.x, bird.y, bird.width, bird.height);

      // Pipe Logic
      if (frameCount % 100 === 0) spawnPipe();

      pipes.forEach(pipe => {
        // Oscillation [cite: 11]
        if (pipe.isMoving) {
            pipe.topHeight += pipe.moveDir;
            if (Math.abs(pipe.topHeight - pipe.baseY) > 30) pipe.moveDir *= -1;
        }

        pipe.x -= speed;

        // Draw Top Pipe (Upside down candle)
        ctx.save();
        ctx.translate(pipe.x + pipe.width/2, pipe.topHeight/2);
        ctx.scale(1, -1);
        ctx.drawImage(pipeImg, -pipe.width/2, -pipe.topHeight/2, pipe.width, pipe.topHeight);
        ctx.restore();

        // Draw Bottom Pipe
        ctx.drawImage(pipeImg, pipe.x, pipe.topHeight + pipe.gap, pipe.width, canvas.height - (pipe.topHeight + pipe.gap));

        // Collision
        if (
          bird.x < pipe.x + pipe.width &&
          bird.x + bird.width > pipe.x &&
          (bird.y < pipe.topHeight || bird.y + bird.height > pipe.topHeight + pipe.gap)
        ) {
          endGame();
        }

        // Score
        if (pipe.x + pipe.width < bird.x && !pipe.passed) {
          gameScore++;
          setScore(gameScore);
          pipe.passed = true;
          // Visual Feedback [cite: 44]
          if(gameScore % 5 === 0) setFeedback("STONKS!");
          setTimeout(() => setFeedback(null), 1000);
        }
      });

      // Remove off-screen pipes
      pipes = pipes.filter(p => p.x + p.width > 0);

      // Floor/Ceiling collision
      if (bird.y + bird.height > canvas.height || bird.y < 0) endGame();

      frameCount++;
      if (isRunning) animationFrameId = requestAnimationFrame(loop);
    };

    const endGame = async () => {
      isRunning = false;
      setGameOver(true);
      // Save Score to Supabase 
      await supabase.from('leaderboards').insert([{ game_id: 'flappy', username: username, score: gameScore }]);
    };

    const handleInput = () => {
        bird.velocity = JUMP;
    };

    window.addEventListener('keydown', handleInput);
    window.addEventListener('mousedown', handleInput);
    
    loop();

    return () => {
        window.removeEventListener('keydown', handleInput);
        window.removeEventListener('mousedown', handleInput);
        cancelAnimationFrame(animationFrameId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
       {/* UI Overlay */}
       <div style={{position: 'absolute', top: 10, left: 10, color: 'white'}}>SCORE: {score}</div>
       {feedback && <div className="floating-text" style={{top: '40%', left: '40%'}}>{feedback}</div>}
       
       {gameOver && (
           <div className="game-over-overlay" style={{position: 'absolute', top: '30%', left: '30%', background: 'rgba(0,0,0,0.8)', padding: 20}}>
               <h1 style={{color: 'red'}}>SKILL ISSUE [cite: 45]</h1>
               <button className="btn-meme" onClick={onExit}>MENU</button>
           </div>
       )}
       <canvas ref={canvasRef} width={400} height={600} className="game-canvas" />
    </div>
  );
};

export default FlappyDoge;