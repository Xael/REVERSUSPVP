import { initializeUiHandlers } from '../ui/ui-handlers.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { setupPvpRooms } from '../game-controller.js';
import { checkForSavedGame } from './save-load.js';
import { loadAchievements } from './achievements.js';
import { connectToServer } from './network.js';

// This is the main entry point of the application.
document.addEventListener('DOMContentLoaded', () => {
    // Connect to the WebSocket server for real-time communication
    connectToServer();

    // Sets up all the button clicks and other user interactions.
    initializeUiHandlers();

    // Initializes the PvP rooms data structure.
    setupPvpRooms();

    // Load any existing achievements from local storage.
    loadAchievements();

    // Checks if a saved game exists to enable the 'Continue' button.
    checkForSavedGame();
    
    // Displays the initial splash screen.
    showSplashScreen();
});