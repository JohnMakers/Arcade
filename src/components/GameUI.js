import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const GameUI = ({ score, gameOver, onRestart, onExit, gameId, isPlaying }) => {
  const [countdown, setCountdown] = useState(3);
  const [showScores, setShowScores] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' or 'daily'

  // Reset countdown
  useEffect(() => {
    if (!isPlaying && !gameOver) setCountdown(3);
  }, [isPlaying, gameOver]);

  // Timer Logic
  useEffect(() => {
    if (countdown > 0 && !isPlaying && !gameOver) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, isPlaying, gameOver]);

  // Fetch Scores Logic
  useEffect(() => {
    if (showScores) {
        const fetchScores = async () => {
            let query = supabase
              .from('leaderboards')
              .select('username, score, created_at')
              .eq('game_id', gameId)
              .order('score', { ascending: false })
              .limit(10);

            if (timeFilter === 'daily') {
                const today = new Date();
                today.setHours(0,0,0,0); // Midnight today
                query = query.gte('created_at', today.toISOString());
            }

            const { data } = await query;
            setLeaderboard(data || []);
        };
        fetchScores();
    }
  }, [showScores, timeFilter, gameId]);

  // 1. HUD
  if (isPlaying && !gameOver) {
    return <div className="hud-score">SCORE: {score}</div>;
  }

  // 2. Countdown
  if (countdown > 0 && !gameOver) {
    return (
      <div className="overlay-layer">
        <h1 className="meme-countdown">{countdown}</h1>
        <h2 className="meme-subtitle">GET READY BOI</h2>
      </div>
    );
  }

  // 3. Game Over & Leaderboard
  if (gameOver) {
    return (
      <div className="overlay-layer interactive">
        {!showScores ? (
          <>
            <h1 style={{color: 'red', fontSize: '3rem', margin: 0, textShadow:'4px 4px black'}}>REKT</h1>
            <h2 style={{color: 'yellow', textShadow:'2px 2px black'}}>SCORE: {score}</h2>
            
            <div style={{display:'flex', gap:10}}>
                <button className="btn-meme" onClick={onRestart}>AGANE</button>
                <button className="btn-meme" style={{background:'#ff00ff'}} onClick={() => setShowScores(true)}>SCORES</button>
                <button className="btn-meme" style={{background:'#333'}} onClick={onExit}>EXIT</button>
            </div>
          </>
        ) : (
          <div className="leaderboard-panel">
            <h3 style={{color:'gold', marginTop:0}}>CHAD LIST</h3>
            
            {/* Tabs */}
            <div style={{display:'flex', justifyContent:'center', marginBottom:15}}>
                <button 
                    style={{
                        background: timeFilter === 'daily' ? '#00ff00' : '#333',
                        color: timeFilter === 'daily' ? 'black' : 'white',
                        border: '2px solid white', padding: '5px 10px', cursor:'pointer', fontFamily:'inherit'
                    }}
                    onClick={() => setTimeFilter('daily')}
                >
                    DAILY
                </button>
                <button 
                    style={{
                        background: timeFilter === 'all' ? '#00ff00' : '#333',
                        color: timeFilter === 'all' ? 'black' : 'white',
                        border: '2px solid white', borderLeft:'none', padding: '5px 10px', cursor:'pointer', fontFamily:'inherit'
                    }}
                    onClick={() => setTimeFilter('all')}
                >
                    ALL TIME
                </button>
            </div>

            <ul style={{listStyle:'none', padding:0, textAlign:'left', color:'white', maxHeight:'300px', overflowY:'auto'}}>
              {leaderboard.length === 0 ? <li style={{textAlign:'center'}}>NO CHADS YET</li> : 
               leaderboard.map((p, i) => (
                <li key={i} style={{borderBottom:'1px dashed #555', padding:'8px 0', display:'flex', justifyContent:'space-between'}}>
                  <span>#{i+1} {p.username}</span>
                  <span style={{color:'gold'}}>{p.score}</span>
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