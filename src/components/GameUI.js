import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const GameUI = ({ score, gameOver, isPlaying, onRestart, onExit, gameId }) => {
  const [dailyLeaders, setDailyLeaders] = useState([]);
  const [allTimeLeaders, setAllTimeLeaders] = useState([]);

  useEffect(() => {
    if (gameOver && gameId) {
      fetchLeaderboards();
    }
  }, [gameOver, gameId]);

  const fetchLeaderboards = async () => {
    // 1. Fetch ALL TIME (Top 5 by Score)
    const { data: allTime } = await supabase
      .from('leaderboards')
      .select('username, score')
      .eq('game_id', gameId)
      .order('score', { ascending: false })
      .limit(5);

    if (allTime) setAllTimeLeaders(allTime);

    // 2. Fetch DAILY (Top 5 by Score, Filtered by Today)
    const today = new Date().toISOString().split('T')[0];
    const { data: daily } = await supabase
      .from('leaderboards')
      .select('username, score')
      .eq('game_id', gameId)
      .gte('created_at', today) 
      .order('score', { ascending: false })
      .limit(5);

    if (daily) setDailyLeaders(daily);
  };

  // --- HUD (Heads Up Display) ---
  if (!gameOver) {
    return (
      <div className="overlay-layer">
        <div className="hud-score">{score}</div>
        {!isPlaying && (
           <div style={{
               fontSize: '2rem', 
               color: 'cyan', 
               textShadow: '4px 4px 0px #000',
               animation: 'pulse 1.5s infinite alternate'
           }}>
               PRESS TO START
           </div>
        )}
      </div>
    );
  }

  // --- GAME OVER SCREEN ---
  return (
    <div className="overlay-layer interactive">
      <h1 className="meme-text" style={{color: 'red', fontSize: '3rem'}}>WASTED</h1>
      <h2 className="meme-text" style={{marginBottom: 10}}>SCORE: {score}</h2>

      <div style={{display: 'flex', gap: '20px', width: '90%', justifyContent: 'center', flexWrap: 'wrap'}}>
        
        {/* DAILY LEADERBOARD */}
        <div style={{flex: 1, minWidth: '250px', background: 'rgba(0,0,0,0.8)', padding: 15, border: '2px solid #00ff00'}}>
            <h3 style={{color: 'yellow', textAlign: 'center', marginBottom: 10, fontSize: '1rem'}}>TODAY'S CHADS</h3>
            {dailyLeaders.length === 0 ? (
                <div style={{textAlign:'center', color:'gray'}}>No records today</div>
            ) : (
                dailyLeaders.map((p, i) => (
                    <div key={i} style={{display:'flex', justifyContent:'space-between', marginBottom: 5, fontSize:'0.8rem'}}>
                        <span>{i+1}. {p.username}</span>
                        <span style={{color:'cyan'}}>{p.score}</span>
                    </div>
                ))
            )}
        </div>

        {/* ALL TIME LEADERBOARD */}
        <div style={{flex: 1, minWidth: '250px', background: 'rgba(0,0,0,0.8)', padding: 15, border: '2px solid cyan'}}>
            <h3 style={{color: 'cyan', textAlign: 'center', marginBottom: 10, fontSize: '1rem'}}>LEGENDS</h3>
            {allTimeLeaders.length === 0 ? (
                <div style={{textAlign:'center', color:'gray'}}>No legends yet</div>
            ) : (
                allTimeLeaders.map((p, i) => (
                    <div key={i} style={{display:'flex', justifyContent:'space-between', marginBottom: 5, fontSize:'0.8rem'}}>
                        <span>{i+1}. {p.username}</span>
                        <span style={{color:'yellow'}}>{p.score}</span>
                    </div>
                ))
            )}
        </div>

      </div>

      <div style={{display: 'flex', marginTop: 20}}>
        <button className="btn-meme" onClick={onRestart}>AGAIN</button>
        <button className="btn-meme" style={{borderColor: 'red', color: 'red'}} onClick={onExit}>QUIT</button>
      </div>
    </div>
  );
};

export default GameUI;