import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';

const FlappyDoge = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username } = useContext(UserContext);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  // Load Assets Hook
  const sprites = useRef({});
  useEffect(() => {
    const loadImages = async () => {
      const doge = new Image(); doge.src = ASSETS.DOGE_HERO;
      const pipe = new Image(); pipe.src = ASSETS.RED_CANDLE;
      
      await Promise.all([
        new Promise(r => doge.onload = r),
        new Promise(r => pipe.onload = r)
      ]);
      
      sprites.current = { doge, pipe };
      setImagesLoaded(true);
    };
    loadImages();
  }, []);

  useEffect(() => {
    if (!imagesLoaded) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let bird = { x: 50, y: 150, velocity: 0, width: 40, height: 40 };
    let pipes = [];
    let frameCount = 0;
    let gameScore = 0;
    let speed = 3;
    let isRunning = true;

    // Constants
    const GRAVITY = 0.5;
    const JUMP = -8;

    const spawnPipe = () => {
       // Requirement: Scaling Gap (Start 200px, Cap at 120px)
       const difficulty = Math.min(80, Math.floor(gameScore / 10) * 2);
       const gap = 200 - difficulty; 
       
       const minHeight = 50;
       const maxHeight = canvas.height - gap - minHeight;
       const topHeight = Math.floor(Math.random() * (maxHeight - minHeight)) + minHeight;

       pipes.push({
         x: canvas.width,
         width: 50,
         topHeight,
         gap,
         passed: false
       });
    };

    const loop = () => {
      if (!isRunning) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background
      ctx.fillStyle = gameScore > 20 ? "#000033" : "#f0f0f0"; // Office to Space transition
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Bird
      bird.velocity += GRAVITY;
      bird.y += bird.velocity;
      ctx.drawImage(sprites.current.doge, bird.x, bird.y, bird.width, bird.height);

      // Pipes
      if (frameCount % 100 === 0) spawnPipe();

      pipes.forEach(pipe => {
        pipe.x -= speed;
        
        // Draw Red Candles
        ctx.fillStyle = "red";
        // Top Pipe
        ctx.drawImage(sprites.current.pipe, pipe.x, 0, pipe.width, pipe.topHeight);
        // Bottom Pipe
        ctx.drawImage(sprites.current.pipe, pipe.x, pipe.topHeight + pipe.gap, pipe.width, canvas.height);

        // Collision (Precise Box)
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
          // Speed Scaling: Increase by 5% every 10 points
          if (gameScore % 10 === 0) speed = speed * 1.05; 
        }
      });

      if (bird.y > canvas.height || bird.y < 0) endGame();

      frameCount++;
      if (isRunning) animationFrameId = requestAnimationFrame(loop);
    };

    const endGame = () => {
      isRunning = false;
      setGameOver(true);
      if (username) {
          supabase.from('leaderboards').insert([{ game_id: 'flappy', username, score: gameScore }]).then(console.log);
      }
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
  }, [imagesLoaded, username]);

  return (
    <div>
      <div style={{position: 'absolute', top: 10, left: 10, color: 'white', fontFamily: 'Impact'}}>
        SCORE: {score}
      </div>
      {gameOver && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.9)', color: 'red', padding: '20px', textAlign: 'center', border: '2px solid red'
        }}>
          <h1>SKILL ISSUE</h1>
          <button className="btn-meme" onClick={onExit}>MAIN MENU</button>
        </div>
      )}
      {!imagesLoaded && <h1 style={{color:'white'}}>LOADING MEMES...</h1>}
      <canvas ref={canvasRef} width={400} height={600} className="game-canvas" />
    </div>
  );
};

export default FlappyDoge;