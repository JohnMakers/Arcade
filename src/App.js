import React, { useState } from 'react';
import { UserProvider } from './context/UserContext';
import ArcadeShell from './components/ArcadeShell';
import FlappyDoge from './games/FlappyDoge';
import PepeFrogger from './games/PepeFrogger';
import StonksJump from './games/StonksJump';
import ChadRun from './games/ChadRun'; // CHANGED

function App() {
  const [activeGame, setActiveGame] = useState(null);

  const renderGame = () => {
    switch(activeGame) {
      case 'flappy': return <FlappyDoge onExit={() => setActiveGame(null)} />;
      case 'frogger': return <PepeFrogger onExit={() => setActiveGame(null)} />;
      case 'doodle': return <StonksJump onExit={() => setActiveGame(null)} />;
      case 'chadrun': return <ChadRun onExit={() => setActiveGame(null)} />; // CHANGED
      default: return <ArcadeShell onSelectGame={setActiveGame} />;
    }
  };

  return (
    <UserProvider>
      <div className="App">
        {renderGame()}
      </div>
    </UserProvider>
  );
}

export default App;