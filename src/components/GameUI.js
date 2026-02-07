import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const GameUI = ({ score, gameOver, onRestart, onExit, gameId }) => {
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [countdown, setCountdown] = useState(3);
  const [gameStarted, setGameStarted] = useState(false);

  // Countdown Logic
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setGameStarted(true);
    }
  }, [countdown]);

  // Fetch Leaderboard when requested
  useEffect(() => {
    if (showLeaderboard) {
      const fetchScores = async () => {
        const { data } = await supabase
          .from('leaderboards')
          .select('*')
          .eq('game_id', gameId)
          .order('score', { ascending: false })
          .limit(5);
        setLeaderboard(data || []);
      };
      fetchScores();
    }
  }, [showLeaderboard, gameId]);

  // Render Countdown
  if (!gameStarted) {
    return (
      <div className="overlay-container">
        <h1 className="countdown-text">{countdown === 0 ? "GO!" : countdown}</h1>
      </div>
    );
  }

  // Render Game Over Menu
  if (gameOver) {
    return (
      <div className="overlay-container game-over-bg">
        <h1 className="meme-text shake">YOU DIED</h1>
        <h2 style={{ color: 'yellow' }}>SCORE: {score}</h2>
        
        {!showLeaderboard ? (
          <div className="menu-buttons">
            <button className="btn-meme" onClick={onRestart}>AGANE (Restart)</button>
            <button className="btn-meme" onClick={() => setShowLeaderboard(true)}>WHO IS CHAD? (Scores)</button>
            <button className="btn-meme red" onClick={onExit}>RAGE QUIT (Exit)</button>
          </div>
        ) : (
          <div className="leaderboard-panel">
            <h3>CHAD LIST</h3>
            <ul>
              {leaderboard.map((entry, i) => (
                <li key={i}>
                  <span>#{i + 1} {entry.username}</span>
                  <span>{entry.score}</span>
                </li>
              ))}
            </ul>
            <button className="btn-meme" onClick={() => setShowLeaderboard(false)}>BACK</button>
          </div>
        )}
      </div>
    );
  }

  // Render HUD (Score Tracker)
  return (
    <div className="hud-container">
      <div className="score-badge">SCORE: {score}</div>
    </div>
  );
};

export default GameUI;