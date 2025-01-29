import { api } from './api.js';
import { ui } from './ui.js';
import { logger } from './utils/logger.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        logger.system('Initializing application...');
        
        await ui.initialize();
        await logger.initialize();

        // Load default section
        ui.updateContent('clips');

        // Set up error handlers
        window.addEventListener('error', (event) => {
            logger.error(`Global error: ${event.message}`);
        });

        window.addEventListener('unhandledrejection', (event) => {
            logger.error(`Unhandled rejection: ${event.reason}`);
        });

        // Set up OBS disconnection handler
        api.onOBSDisconnected(() => {
            logger.warning('Disconnected from OBS');
            const connectButton = document.getElementById('connectOBSButton');
            if (connectButton) {
                connectButton.textContent = 'Connect to OBS';
                connectButton.classList.remove('connected');
            }
        });

        logger.success('Application initialized successfully');
    } catch (error) {
        logger.error(`Fatal error during initialization: ${error.message}`);
        ui.showErrorMessage(`Fatal Error: ${error.message}`);
    }
});
