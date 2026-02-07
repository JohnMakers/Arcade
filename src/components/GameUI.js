import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const GameUI = ({ score, gameOver, onRestart, onExit, gameId, isPlaying }) => {
  const [countdown, setCountdown] = useState(3);
  const [showScores, setShowScores] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);

  // Reset countdown when game starts or restarts
  useEffect(() => {
    if (!isPlaying && !gameOver) {
      setCountdown(3);
    }
  }, [isPlaying, gameOver]);

  // Countdown Logic
  useEffect(() => {
    if (countdown > 0 && !isPlaying && !gameOver) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, isPlaying, gameOver]);

  const fetchScores = async () => {
    setShowScores(true);
    const { data } = await supabase
      .from('leaderboards')
      .select('username, score')
      .eq('game_id', gameId)
      .order('score', { ascending: false })
      .limit(5);
    setLeaderboard(data || []);
  };

  // 1. HUD (Always visible during play)
  if (isPlaying && !gameOver) {
    return <div className="hud-score">SCORE: {score}</div>;
  }

  // 2. Countdown (Transparent Overlay)
  if (countdown > 0 && !gameOver) {
    return (
      <div className="overlay-layer">
        <h1 className="countdown-number">{countdown}</h1>
        <p style={{color:'white', marginTop: 20}}>GET READY</p>
      </div>
    );
  }

  // 3. Game Over Menu
  if (gameOver) {
    return (
      <div className="overlay-layer interactive">
        <h1 style={{color: 'red', fontSize: '3rem', margin: 0}}>REKT</h1>
        <h2 style={{color: 'yellow'}}>FINAL SCORE: {score}</h2>

        {!showScores ? (
          <>
            <button className="btn-meme" onClick={onRestart}>AGANE (Restart)</button>
            <button className="btn-meme" style={{background:'#ff00ff', color:'white'}} onClick={fetchScores}>LEADERBOARD</button>
            <button className="btn-meme" style={{background:'#333', color:'white'}} onClick={onExit}>RAGE QUIT</button>
          </>
        ) : (
          <div style={{background: '#222', padding: 20, border: '4px solid gold'}}>
            <h3>CHAD LIST</h3>
            <ul style={{listStyle:'none', padding:0, textAlign:'left', color:'white'}}>
              {leaderboard.map((p, i) => (
                <li key={i} style={{borderBottom:'1px dashed #555', padding:'5px 0'}}>
                  #{i+1} {p.username}: <span style={{color:'gold'}}>{p.score}</span>
                </li>
              ))}
            </ul>
            <button className="btn-meme" onClick={() => setShowScores(false)}>BACK</button>
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default GameUI;