import React, { useContext, useState } from 'react';
import { UserContext } from '../context/UserContext';

const ArcadeShell = ({ onSelectGame }) => {
  const { username, saveUser } = useContext(UserContext);
  const [inputName, setInputName] = useState('');

  if (!username) {
    return (
      <div className="arcade-container">
        <h1>WHO ARE YOU?</h1>
        <input 
          style={{ fontSize: '2rem', textAlign: 'center' }}
          value={inputName}
          onChange={(e) => setInputName(e.target.value)}
          placeholder="ENTER NAME PLZ"
        />
        <button className="btn-meme" onClick={() => saveUser(inputName)}>
          LET ME IN
        </button>
      </div>
    );
  }

  return (
    <div className="arcade-container">
      <h1>McPEPE ARCADE</h1>
      <h3>WELCOME, {username}</h3>
      <div className="game-grid">
        <button className="btn-meme" onClick={() => onSelectGame('flappy')}>TO THE MOON (Doge)</button>
        <button className="btn-meme" onClick={() => onSelectGame('frogger')}>PEPE CROSSING</button>
        <button className="btn-meme" onClick={() => onSelectGame('doodle')}>STONKS JUMP</button>
        <button className="btn-meme" onClick={() => onSelectGame('angry')}>KEYBOARD WARRIOR</button>
      </div>
    </div>
  );
};

export default ArcadeShell;