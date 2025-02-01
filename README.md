# GamePlay

GamePlay is a desktop application built with **Electron** that automates the process of creating highlight montages for **PUBG: BATTLEGROUNDS**. By integrating with **OBS Studio's replay buffer**, GamePlay captures in-game moments, applies basic video edits, and allows users to customize their final montage before sharing it. Designed for streamers and content creators, the app ensures fast, efficient, and high-quality highlight generation.

![GamePlay UI Demo](https://github.com/1stbtln/Game-Play/blob/168a06ff518c3e697d83cfa43fd277190ca98eb5/Gameplay%20Demo%20Jif.gif)
---

## Features
- **Automated Clip Collection** – Captures in-game highlights in real-time via **OBS Studio's replay buffer**.
- **Dynamic Session Tracking** – Automatically assigns session IDs to track clips belonging to the same match.
- **Instant Montage Generation** – Concatenates clips into a full highlight video immediately after the game ends.
- **Basic Video Editing** – Users can **rearrange clips, delete unwanted segments, and change background music**.
- **Music Search & Selection** – Built-in search for background music to enhance montages.
- **Kill Validation (Beta)** – Uses OCR to detect kill notifications in-game and prioritize clips based on detected highlights.
- **Fast Processing** – Ensures montages are available within **30 seconds** after a game ends.
- **Streamer-Friendly** – Minimal user input required; optimized for quick sharing.

---

## Screenshots

### **Clip Preview**
![Clip Preview](https://github.com/1stbtln/Game-Play/blob/d27417ff48576c8203b6f1b0603a0f37a845224e/Screenshot%202025-01-28%20205912.png)  
_Description: A preview of collected clips before the montage is generated._

### **Audio Search**
![Audio Search](https://github.com/1stbtln/Game-Play/blob/b50a6eb0d598c862b66308c45fed621271e8432d/Screenshot%202025-01-28%20205939.png)  
_Description: Users can search and select background music for their montage._

### **Simple Editor**
![Simple Editor](https://github.com/1stbtln/Game-Play/blob/78af12e21dee1f107c5b5417ef6c219bbac51a1d/Screenshot%202025-01-28%20210000.png)  
_Description: The basic editor allows users to rearrange, delete, or finalize clips before exporting._

---

## ROI (Region of Interest) Detection

GamePlay uses **Tesseract.js**, an OCR (Optical Character Recognition) library, to extract and analyze in-game text for identifying highlight-worthy moments. **Regions of Interest (ROIs)** are extracted from the screen to determine key events, such as kills and headshots.

### **Kill Notification Example**
![Kill Notification ROI](https://github.com/1stbtln/Game-Play/blob/550903b5a2358de2467e3b99722091ea1d96eb6e/vPhoto_d209c078_1_2025-01-23T07-00-54-824Z.png)  
_Description: A detected "You Knocked Out" notification, which the app recognizes as a highlight-worthy event._

### **Headshot Notification Example**
![Headshot ROI](https://github.com/1stbtln/Game-Play/blob/e4579145902d1386e6535d3cf5cc09a64b72e751/vPhoto_f77fc0c1_1_2025-01-25T01-23-06-041Z.png)  
_Description: An in-game headshot notification that gets prioritized during the highlight detection process._

---

## **Session Tracking & Clip Management**

GamePlay dynamically assigns **session IDs** to track which clips belong to which game session. This is essential for:
- Preventing clips from different matches from being combined incorrectly.
- Ensuring that clips are grouped together in the correct order when creating a montage.
- Allowing users to retrieve past session clips if needed.

### **How Session Tracking Works**
1. When a new game starts, **GamePlay generates a unique session ID**.
2. Every recorded clip from that session is **tagged with the session ID**.
3. At the end of the game, all clips with the same session ID are **concatenated into a highlight montage**.
4. If the session ID changes (indicating a new game), a **new set of clips is stored separately**, preventing overlap.

This **automated tracking system** ensures that each game's clips remain grouped together while allowing users to switch between different game sessions if needed.

---

## **Prerequisites**
Before using GamePlay, ensure you have the following:
- **Windows** OS (currently only supported platform)
- **OBS Studio** with replay buffer enabled
- **Electron** (for development purposes only)

---

## **Installation**

1. **Download and Install**
   - Get the latest release from [Game-Play's website](https://www.game-play.gg/)
   - Install the application on your system.

2. **Set Up OBS Studio**
   - Enable replay buffer in OBS Studio.
   - Configure OBS to save clips to a designated folder.

3. **Run GamePlay**
   - Open the application and link it to your OBS replay buffer folder.
   - Start capturing highlights automatically!

---

## **Usage**
- Launch the GamePlay application.
- Connect to OBS Studio.
- Start Replay Buffer.
- Start Trigger Detection.
- Play a game of **PUBG: BATTLEGROUNDS**.
- Click "Generate Montage"

---

## **Future Plans**
- **Expanded Game Support** – Support for other battle royale or PvP games.
- **Advanced Editing Features** – Transitions, overlays, and customizable templates.
- **Built-in Replay Buffer** – Develop an integrated replay buffer system to make GamePlay a fully standalone application, eliminating the need for OBS Studio's replay buffer dependency.

---

## **Support**
If you encounter any issues, feel free to contact me via **[ewag57dev@gmail.com]** or create an issue in the repository (if open-sourced).

---

## **License**
GamePlay is a proprietary application developed by **Edworx**. All rights reserved.
