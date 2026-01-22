import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../api';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
    // Default to 'pre_remito' (safe default)
    const [countMode, setCountModeState] = useState('pre_remito');
    const [loadingSettings, setLoadingSettings] = useState(true);

    // Fetch settings on mount
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await api.get('/api/settings');
                if (res.data && res.data.count_mode) {
                    setCountModeState(res.data.count_mode);
                    localStorage.setItem('countMode', res.data.count_mode); // Sync local
                } else if (res.data && res.data.countMode) { // Handle snake_case vs camelCase mismatch if any
                    setCountModeState(res.data.countMode);
                }
            } catch (error) {
                console.error('Error fetching settings:', error);
                // Fallback to localStorage if API fails
                const local = localStorage.getItem('countMode');
                if (local) setCountModeState(local);
            } finally {
                setLoadingSettings(false);
            }
        };

        fetchSettings();
    }, []);

    // Wrapper to update state and backend
    const setCountMode = async (mode) => {
        // Optimistic update
        setCountModeState(mode);
        localStorage.setItem('countMode', mode);

        try {
            await api.put('/api/settings', { countMode: mode });
        } catch (error) {
            console.error('Error saving settings:', error);
            // Optionally revert or notify user
            // toast.error('Error saving setting');
        }
    };

    return (
        <SettingsContext.Provider value={{ countMode, setCountMode, loadingSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};
