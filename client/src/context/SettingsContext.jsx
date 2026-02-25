import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../api';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
    // Hardcoded to 'pre_remito' as requested (Desde carga)
    const countMode = 'pre_remito';
    const loadingSettings = false;

    // Dummy setter to prevent errors if called elsewhere
    const setCountMode = async (mode) => {
        console.log('countMode is locked to pre_remito, ignoring change request to', mode);
    };

    return (
        <SettingsContext.Provider value={{ countMode, setCountMode, loadingSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};
