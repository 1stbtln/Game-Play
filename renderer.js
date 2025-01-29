import { ui } from './js/ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await ui.initialize();
        
        // Set up global error handlers
        window.addEventListener('error', event => {
            console.error('Global error:', event.error);
            ui.log(`Error: ${event.message}`);
        });

        window.addEventListener('unhandledrejection', event => {
            console.error('Unhandled rejection:', event.reason);
            ui.log(`Promise error: ${event.reason}`);
        });
    } catch (error) {
        console.error('Application initialization failed:', error);
    }
});



document.getElementById('verify-email').addEventListener('click', async () => {
    const email = document.getElementById('user-email').value.trim();
    const errorMessage = document.getElementById('error-message');
    const pricingLink = 'https://www.game-play.gg/pricing-plans/list'; // Pricing page link
  
    // Clear previous error message
    errorMessage.style.display = 'none';
  
    if (!email) {
      errorMessage.textContent = 'Email is required.';
      errorMessage.style.display = 'block';
      return;
    }
  
    try {
      // Send email to the validation endpoint
      const response = await fetch('https://game-play.gg/_functions/validateSubscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
  
      const result = await response.json();
  
      if (response.ok && result.status === 'active') {
        // Email verified, close the modal
        document.getElementById('email-popup').style.display = 'none';
        console.log('Access granted!');
      } else {
        // Email not verified, show error with link
        errorMessage.innerHTML = `
          No active subscription found. <a href="${pricingLink}" target="_blank" style="color: blue; text-decoration: underline;">Subscribe here</a>.
        `;
        errorMessage.style.display = 'block';
      }
    } catch (error) {
      console.error('Error verifying email:', error);
      errorMessage.textContent = 'An error occurred during verification. Please try again later.';
      errorMessage.style.display = 'block';
    }
  });
  

  window.onload = () => {
    document.getElementById('email-popup').style.display = 'flex';
  };
  