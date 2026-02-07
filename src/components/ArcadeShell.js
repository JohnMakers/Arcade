import React, { useContext, useState } from 'react';
import { UserContext } from '../context/UserContext';

const ArcadeShell = ({ onSelectGame }) => {
  const { username, saveUser, clearUser } = useContext(UserContext);
  const [inputName, setInputName] = useState('');
  const [inputAddr, setInputAddr] = useState('');

  if (!username) {
    return (
      <div className="arcade-container">
        <h1 className="meme-text pulse">WHO ARE YOU?</h1>
        
        <div style={{display:'flex', flexDirection:'column', gap: 15, marginBottom: 20}}>
            <input 
              className="meme-input"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="ENTER NAME (REQUIRED)"
              maxLength={15}
            />
            <input 
              className="meme-input"
              value={inputAddr}
              onChange={(e) => setInputAddr(e.target.value)}
              placeholder="WALLET ADDRESS (OPTIONAL)"
            />
        </div>

        <button 
            className="btn-meme" 
            onClick={() => {
                if(inputName.trim().length > 0) saveUser(inputName, inputAddr);
            }}
        >
          LET ME IN
        </button>
      </div>
    );
  }

  return (
    <div className="arcade-container">
      <h1 className="meme-text">McPEPE ARCADE</h1>
      
      <div style={{marginBottom: 30, textAlign:'center'}}>
          <h3 style={{color:'yellow', textShadow:'2px 2px black'}}>WELCOME, {username}</h3>
          <button 
            className="btn-meme" 
            style={{fontSize: '0.8rem', padding: '10px', background: '#333'}}
            onClick={clearUser}
          >
            CHANGE IDENTITY
          </button>
      </div>

      <div className="game-grid">
        <button className="btn-meme" onClick={() => onSelectGame('flappy')}>TO THE MOON (Doge)</button>
        <button className="btn-meme" onClick={() => onSelectGame('frogger')}>PEPE CROSSING</button>
        <button className="btn-meme" onClick={() => onSelectGame('doodle')}>STONKS JUMP</button>
        <button className="btn-meme" onClick={() => onSelectGame('chadrun')}>CHAD RUN</button>
      </div>
    </div>
  );
};

export default ArcadeShell;