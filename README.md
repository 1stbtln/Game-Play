# GamePlay

GamePlay is a desktop application built with **Electron** that automates the process of creating highlight montages for **PUBG: BATTLEGROUNDS**. By integrating with **OBS Studio's replay buffer**, GamePlay captures in-game moments, applies basic video edits, and allows users to customize their final montage before sharing it. Designed for streamers and content creators, the app ensures fast, efficient, and high-quality highlight generation.

---

## Features
- **Automated Clip Collection** – Captures in-game highlights in real-time via **OBS Studio's replay buffer**.
- **Instant Montage Generation** – Concatenates clips into a full highlight video immediately after the game ends.
- **Basic Video Editing** – Users can **rearrange clips, delete unwanted segments, and change background music**.
- **Music Search & Selection** – Built-in search for background music to enhance montages.
- **Kill Validation (Beta)** – Experimental feature to prioritize kill-based highlights.
- **Fast Processing** – Ensures montages are available within **30 seconds** after a game ends.
- **Streamer-Friendly** – Minimal user input required; optimized for quick sharing.

---

## Screenshots

Here are some screenshots showcasing GamePlay's interface and functionality.

### **Main Dashboard**
![GamePlay Main Dashboard]([Screenshot 2025-01-28 205912.png](https://github.com/1stbtln/Game-Play/blob/9865da9cad9f08e193ac35081ce9d81026516c65/Screenshot%202025-01-28%20205912.png))  
_Description: The main dashboard where users can manage clips and create montages._

### **Clip Management**
![Clip Management]([path/to/clip_management.png](https://github.com/1stbtln/Game-Play/blob/d27417ff48576c8203b6f1b0603a0f37a845224e/Screenshot%202025-01-28%20205912.png))  
_Description: Users can view, rearrange, or delete individual clips in this section._

### **Exported Montage**
![Exported Montage](path/to/exported_montage.png)  
_Description: A preview of a completed montage ready for sharing._

---

## ROI (Region of Interest) Examples

GamePlay uses in-game kill notifications from PUBG as **Regions of Interest (ROI)** to determine key highlights. Below are examples of extracted ROIs.

### **Kill Notification Example**
![Kill Notification ROI](path/to/kill_notification_roi.png)  
_Description: An example of an in-game kill notification detected by GamePlay._

### **Headshot Notification Example**
![Headshot ROI](path/to/headshot_roi.png)  
_Description: A detected headshot kill notification, which can be prioritized in highlight generation._

---

## Return on Investment (ROI) for Users

GamePlay provides significant value for streamers and content creators:

- **Time-Saving**: Reduces post-game editing time by automating the highlight creation process. Users can get a shareable montage within **30 seconds** of game completion.
- **Increased Engagement**: High-quality, ready-to-share montages keep audiences engaged and increase visibility on platforms like YouTube, Twitch, and TikTok.
- **Cost Efficiency**: Eliminates the need for expensive video editing tools or outsourcing.
- **Ease of Use**: Minimal setup ensures even non-tech-savvy users can generate professional-looking content effortlessly.

---

## Prerequisites
Before using GamePlay, ensure you have the following:
- **Windows** OS (currently only supported platform)
- **OBS Studio** with replay buffer enabled
- **Electron** (for development purposes only)

---

## Installation

1. **Download and Install**
   - Get the latest release from [Edworks' website](https://yourwebsite.com) (replace with actual link).
   - Install the application on your system.

2. **Set Up OBS Studio**
   - Enable replay buffer in OBS Studio.
   - Configure OBS to save clips to a designated folder.

3. **Run GamePlay**
   - Open the application and link it to your OBS replay buffer folder.
   - Start capturing highlights automatically!

---

## Usage
- Launch the GamePlay application.
- Play a game of **PUBG: BATTLEGROUNDS**.
- After the match, the app will generate a highlight montage automatically.
- Edit or rearrange clips (optional).
- Save and share your montage!

---

## Future Plans
- **Expanded Game Support** – Support for other battle royale or PvP games.
- **Advanced Editing Features** – Transitions, overlays, and customizable templates.
- **Cloud Storage & Sharing** – Direct upload to platforms like YouTube or Discord.

---

## Support
If you encounter any issues, feel free to contact us via **[support@yourwebsite.com](mailto:support@yourwebsite.com)** or create an issue in the repository (if open-sourced).

---

## License
GamePlay is a proprietary application developed by **Edworks**. All rights reserved.
