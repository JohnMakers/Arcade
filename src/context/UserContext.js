import React, { createContext, useState, useEffect } from 'react';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [username, setUsername] = useState(localStorage.getItem('mcpepe_user') || '');

  const saveUser = (name) => {
    localStorage.setItem('mcpepe_user', name);
    setUsername(name);
  };

  return (
    <UserContext.Provider value={{ username, saveUser }}>
      {children}
    </UserContext.Provider>
  );
};