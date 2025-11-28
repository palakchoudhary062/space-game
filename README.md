# 🚀 Space Game

A high-performance arcade shooter built with native JavaScript.
Classic gameplay, infinite progression, and zero dependencies.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-v0.1-green.svg)

## 📖 About The Project

**Space Game** is a minimalist STG (Shooting Game) engine designed for the web.
It features a custom-built entity pooling system to ensure smooth 60FPS performance even with hundreds of bullets on screen.

### ✨ Key Features

* **Infinite Scaling:** Weapon levels have no cap. Your firepower grows as long as you survive.
* **Procedural Bullet Patterns:** Projectile spread is calculated algorithmically based on your weapon level.
* **Precision Control:** Pure keyboard input with a dedicated "Focus Mode" (`Shift` key) for precise dodging.
* **High Performance:** Uses Object Pooling and Delta-Time physics to eliminate garbage collection stutters.

## 🕹️ Controls

| Key | Action |
| :--- | :--- |
| **W / A / S / D** | Move Ship |
| **SPACE** | Shoot (Hold) |
| **SHIFT** | Focus Mode (Slow Movement) |
| **ESC** | Pause Game |

## 🚀 Getting Started

### Installation

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/ygpydh/space-game.git](https://github.com/ygpydh/space-game.git)
    ```

2.  **Run the game**
    * Open `index.html` in any modern web browser.
    * No build steps or `npm install` required.

## 📂 Project Structure

```text
space-game/
├── index.html      # Entry point
├── style.css       # Styles & UI
├── script.js       # Game Engine (v0.1)
└── README.md       # Documentation
