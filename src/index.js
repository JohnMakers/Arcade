import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

.meme-input {
  font-family: 'Press Start 2P', cursive;
  background: #000;
  border: 4px solid #00ff00;
  color: white;
  padding: 15px;
  text-align: center;
  font-size: 1rem;
  width: 300px;
  outline: none;
  box-shadow: 4px 4px 0px #ff00ff;
}
.meme-input:focus {
  border-color: #ff00ff;
  box-shadow: 4px 4px 0px #00ff00;
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
