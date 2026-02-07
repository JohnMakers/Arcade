import React, { createContext, useState, useEffect } from 'react';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [username, setUsername] = useState(localStorage.getItem('mcpepe_user') || '');
  const [address, setAddress] = useState(localStorage.getItem('mcpepe_addr') || '');

  const saveUser = (name, addr) => {
    localStorage.setItem('mcpepe_user', name);
    localStorage.setItem('mcpepe_addr', addr || ''); // Optional
    setUsername(name);
    setAddress(addr || '');
  };

  const clearUser = () => {
    localStorage.removeItem('mcpepe_user');
    localStorage.removeItem('mcpepe_addr');
    setUsername('');
    setAddress('');
  };

  return (
    <UserContext.Provider value={{ username, address, saveUser, clearUser }}>
      {children}
    </UserContext.Provider>
  );
};