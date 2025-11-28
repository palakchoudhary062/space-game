/**
 * Neon Apex v9.0 (Bullet Hell Edition)
 * Refactored by ygpydh - 2025
 * Features: Proportional Spread, Multi-stream Linear, Infinite Scaling
 */

const CONFIG = {
    PLAYER_SPEED: 2.5,
    PLAYER_FOCUS_SPEED: 2.0,
    PLAYER_FRICTION: 0.85,
    BULLET_SPEED: 12.0,
    
    // 动态难度配置
    ENEMY_BASE_SPEED: 0.6, 
    
    // 掉落配置
    DROP_RATE_ON_KILL: 0.25, 
    NATURAL_ITEM_CHANCE: 0.05, 

    HITBOX_EXPAND_ENEMY: 10,
    HITBOX_SHRINK_PLAYER: 8,
    MAX_PARTICLES: 80 
};

// --- 音频系统 ---
class SoundSynth {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.2; 
        this.masterGain.connect(this.ctx.destination);
        this.lastShootTime = 0;
        this.lastExplosionTime = 0;
    }
    resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }

    playTone(freq, type, duration) {
        if(this.ctx.state === 'suspended') this.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
        setTimeout(() => { osc.disconnect(); gain.disconnect(); }, duration * 1000 + 100);
    }

    playShoot() {
        const now = Date.now();
        if (now - this.lastShootTime < 60) return;
        this.lastShootTime = now;
        this.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        // 射击音效稍微高频一点，配合高射速
        osc.frequency.setValueAtTime(900, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(400, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.06, this.ctx.currentTime); // 稍微降低单发音量，避免太吵
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);
        setTimeout(() => { osc.disconnect(); gain.disconnect(); }, 100);
    }

    playExplosion() { 
        const now = Date.now();
        if (now - this.lastExplosionTime < 80) return;
        this.lastExplosionTime = now;
        this.playTone(100, 'sawtooth', 0.15); 
    }
    playPowerup() { 
        this.playTone(600, 'sine', 0.1);
        setTimeout(() => this.playTone(1200, 'sine', 0.2), 100);
    }
}

class InputHandler {
    constructor(game) {
        this.game = game;
        this.keys = new Set();
        this.inputType = 'KEYBOARD'; 
        this.mouseX = 0; this.mouseY = 0; this.mouseDown = false;

        window.addEventListener('keydown', e => {
            const key = e.key.toLowerCase();
            const preventKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'];
            if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) this.inputType = 'KEYBOARD';
            if (preventKeys.includes(key) || e.code === 'Space') e.preventDefault();

            if (key === 'arrowup' || key === 'w') this.keys.add('up');
            else if (key === 'arrowdown' || key === 's') this.keys.add('down');
            else if (key === 'arrowleft' || key === 'a') this.keys.add('left');
            else if (key === 'arrowright' || key === 'd') this.keys.add('right');
            else if (key === ' ' || e.code === 'Space') this.keys.add('shoot');
            else if (key === 'shift') this.keys.add('focus');
            else if (key === 'escape') this.game.togglePause();
        });

        window.addEventListener('keyup', e => {
            const key = e.key.toLowerCase();
            if (key === 'arrowup' || key === 'w') this.keys.delete('up');
            else if (key === 'arrowdown' || key === 's') this.keys.delete('down');
            else if (key === 'arrowleft' || key === 'a') this.keys.delete('left');
            else if (key === 'arrowright' || key === 'd') this.keys.delete('right');
            else if (key === ' ' || e.code === 'Space') this.keys.delete('shoot');
            else if (key === 'shift') this.keys.delete('focus');
        });

        window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
        const canvas = game.canvas;
        canvas.style.cursor = 'crosshair';
        canvas.addEventListener('mousemove', e => {
            if (this.game.paused || this.game.gameOver) return;
            if (Math.abs(e.movementX) > 0 || Math.abs(e.movementY) > 0) {
                this.inputType = 'MOUSE';
                this.updateMousePos(e);
            }
        });
        canvas.addEventListener('mousedown', e => { this.inputType = 'MOUSE'; this.mouseDown = true; this.updateMousePos(e); });
        canvas.addEventListener('mouseup', () => { this.mouseDown = false; });
    }
    updateMousePos(e) {
        const rect = this.game.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
    }
    has(action) { return this.keys.has(action); }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false }); 
        this.audio = new SoundSynth();
        this.score = 0;
        this.difficulty = 1;
        this.gameOver = true;
        this.paused = false;

        this.player = new Player(this);
        this.bullets = [];
        this.enemies = [];
        this.items = [];
        this.particles = [];
        this.stars = [];

        this.ui = {
            score: document.getElementById('score'),
            weaponLv: document.getElementById('weapon-level'),
            finalScore: document.getElementById('final-score'),
            startScreen: document.getElementById('start-screen'),
            pauseScreen: document.getElementById('pause-screen'),
            gameOverScreen: document.getElementById('game-over-screen'),
            startBtn: document.getElementById('start-btn'),
            restartBtn: document.getElementById('restart-btn'),
            resumeBtn: document.getElementById('resume-btn')
        };

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.input = new InputHandler(this);
        this.bindEvents();
        this.initStars();
        this.loop();
    }

    resize() {
        this.width = this.canvas.width = this.canvas.parentElement.clientWidth;
        this.height = this.canvas.height = this.canvas.parentElement.clientHeight;
        if(this.stars) this.initStars();
    }

    initStars() {
        this.stars = [];
        for(let i=0; i<60; i++) {
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: Math.random() * 2,
                speed: Math.random() * 0.5 + 0.1
            });
        }
    }

    bindEvents() {
        const startGame = () => { this.audio.resume(); this.start(); };
        this.ui.startBtn.addEventListener('click', startGame);
        this.ui.restartBtn.addEventListener('click', startGame);
        this.ui.resumeBtn.addEventListener('click', () => this.togglePause());
    }

    start() {
        this.score = 0;
        this.difficulty = 1;
        this.gameOver = false;
        this.paused = false;
        this.player.reset();
        this.bullets = [];
        this.enemies = [];
        this.items = [];
        this.particles = [];
        
        this.ui.startScreen.classList.add('hidden');
        this.ui.gameOverScreen.classList.add('hidden');
        this.ui.pauseScreen.classList.add('hidden');
        this.updateUI();
        
        this.spawnTimer = 0;
        requestAnimationFrame(ts => this.animate(ts));
    }

    togglePause() {
        if(this.gameOver) return;
        this.paused = !this.paused;
        if(this.paused) this.ui.pauseScreen.classList.remove('hidden');
        else {
            this.ui.pauseScreen.classList.add('hidden');
            requestAnimationFrame(ts => this.animate(ts));
        }
    }

    endGame() {
        this.gameOver = true;
        this.audio.playExplosion();
        this.ui.finalScore.innerText = this.score;
        this.ui.gameOverScreen.classList.remove('hidden');
    }

    updateUI() {
        this.ui.score.innerText = this.score;
        const lv = this.player.weaponLevel;
        this.ui.weaponLv.innerText = 'LV.' + lv;
        if (lv < 5) this.ui.weaponLv.style.color = '#fff';
        else if (lv < 10) this.ui.weaponLv.style.color = '#0ff';
        else if (lv < 20) this.ui.weaponLv.style.color = '#d0f';
        else this.ui.weaponLv.style.color = '#ff0';
    }

    shakeScreen(intensity) {
        if (Math.random() > 0.5) return;
        const x = (Math.random() - 0.5) * intensity;
        const y = (Math.random() - 0.5) * intensity;
        this.canvas.style.transform = `translate(${x}px, ${y}px)`;
        setTimeout(() => this.canvas.style.transform = 'none', 50);
    }

    spawnSystem() {
        const lv = this.player.weaponLevel;
        let spawnRate = 120 - (this.difficulty * 2) - (lv * 4);
        spawnRate = Math.max(15, spawnRate); // 即使等级很高，也限制最高刷新率，防止卡死

        if (this.spawnTimer > spawnRate) {
            const x = Math.random() * (this.width - 30);
            if (Math.random() < CONFIG.NATURAL_ITEM_CHANCE) {
                this.items.push(new Item(this, x, true));
            } else {
                this.enemies.push(new Enemy(this, x));
            }
            this.spawnTimer = 0;
        }
        this.spawnTimer++;
    }

    animate(timestamp) {
        if (this.gameOver || this.paused) return;
        this.difficulty += 0.0002;

        this.ctx.fillStyle = 'rgba(5, 5, 5, 0.6)'; 
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.ctx.fillStyle = '#fff';
        this.stars.forEach(star => {
            this.ctx.fillRect(star.x, star.y, star.size, star.size);
            star.y += star.speed * (this.difficulty + 2);
            if(star.y > this.height) { star.y = 0; star.x = Math.random() * this.width; }
        });

        this.spawnSystem();
        this.player.update();
        this.player.draw(this.ctx);

        for(let i = this.bullets.length - 1; i >= 0; i--) {
            let b = this.bullets[i];
            b.update();
            if(b.markedForDeletion) { this.bullets.splice(i, 1); continue; }
            b.draw(this.ctx);
        }

        for(let i = this.enemies.length - 1; i >= 0; i--) {
            let e = this.enemies[i];
            e.update();
            if(e.markedForDeletion) { this.enemies.splice(i, 1); continue; }
            
            for (let j = 0; j < this.bullets.length; j++) {
                let b = this.bullets[j];
                if (!b.markedForDeletion && this.checkCollision(b, e, CONFIG.HITBOX_EXPAND_ENEMY)) {
                    b.markedForDeletion = true;
                    e.hp -= b.damage; 
                    e.takeDamage(); 
                    
                    if(e.hp <= 0) {
                        e.markedForDeletion = true;
                        this.createParticles(e.x+15, e.y+15, 6, e.color, 'CIRCLE');
                        this.createParticles(e.x+15, e.y+15, 1, '#fff', 'RING');
                        this.audio.playExplosion();
                        this.score += 10 + (this.player.weaponLevel * 2); 
                        this.updateUI();
                        if(Math.random() < CONFIG.DROP_RATE_ON_KILL) {
                            this.items.push(new Item(this, e.x, false));
                        }
                    } else {
                        this.createParticles(b.x, b.y, 1, '#fff', 'CIRCLE');
                    }
                    break; 
                }
            }

            if(!e.markedForDeletion && this.checkCollision(e, this.player, -CONFIG.HITBOX_SHRINK_PLAYER)) {
                if(this.player.isShielded) {
                    e.markedForDeletion = true;
                    this.player.deactivateShield();
                    this.createParticles(e.x, e.y, 8, '#fff', 'CIRCLE');
                    this.createParticles(e.x, e.y, 1, '#fff', 'RING'); 
                    this.shakeScreen(5);
                } else {
                    this.createParticles(this.player.x, this.player.y, 20, '#0ff', 'CIRCLE');
                    this.endGame();
                }
            }
            if(!e.markedForDeletion) e.draw(this.ctx);
        }

        for(let i = this.items.length - 1; i >= 0; i--) {
            let item = this.items[i];
            item.update();
            if(item.markedForDeletion) { this.items.splice(i, 1); continue; }
            if(this.checkCollision(this.player, item, 5)) {
                item.applyEffect(this.player);
                item.markedForDeletion = true;
                this.createParticles(item.x, item.y, 4, item.color, 'CIRCLE');
                this.score += 5;
                this.updateUI();
                this.audio.playPowerup();
            }
            item.draw(this.ctx);
        }

        for(let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.update();
            if(p.markedForDeletion) { this.particles.splice(i, 1); continue; }
            p.draw(this.ctx);
        }

        requestAnimationFrame(ts => this.animate(ts));
    }

    checkCollision(r1, r2, expand = 0) {
        return (
            r1.x < r2.x + r2.width + expand &&
            r1.x + r1.width > r2.x - expand &&
            r1.y < r2.y + r2.height + expand &&
            r1.y + r1.height > r2.y - expand
        );
    }

    createParticles(x, y, count, color, type = 'CIRCLE') {
        if (this.particles.length > CONFIG.MAX_PARTICLES) return;
        const realCount = type === 'RING' ? 1 : Math.min(count, 4);
        for(let i=0; i<realCount; i++) this.particles.push(new Particle(this, x, y, color, type));
    }
}

class Player {
    constructor(game) {
        this.game = game;
        this.width = 36; this.height = 36;
        this.x = 0; this.y = 0;
        this.speedX = 0; this.speedY = 0;
        this.weaponLevel = 1;
        this.shootTimer = 0;
        this.isShielded = false;
        this.shieldTimer = 0;
    }
    
    reset() {
        this.x = this.game.width/2 - this.width/2;
        this.y = this.game.height - 100;
        this.weaponLevel = 1;
        this.isShielded = false;
        this.speedX = 0; this.speedY = 0;
    }

    update() {
        const input = this.game.input;
        if (input.inputType === 'MOUSE') {
            const targetX = input.mouseX - this.width / 2;
            const targetY = input.mouseY - this.height / 2;
            this.x += (targetX - this.x) * 0.2;
            this.y += (targetY - this.y) * 0.2;
            this.speedX = 0; this.speedY = 0;
        } else {
            const maxSpeed = input.has('focus') ? CONFIG.PLAYER_FOCUS_SPEED : CONFIG.PLAYER_SPEED;
            let dx = 0; let dy = 0;
            if (input.has('left')) dx -= 1;
            if (input.has('right')) dx += 1;
            if (input.has('up')) dy -= 1;
            if (input.has('down')) dy += 1;

            if (dx !== 0 || dy !== 0) {
                const length = Math.sqrt(dx*dx + dy*dy);
                dx /= length; dy /= length;
                this.speedX = dx * maxSpeed;
                this.speedY = dy * maxSpeed;
            } else {
                this.speedX *= CONFIG.PLAYER_FRICTION;
                this.speedY *= CONFIG.PLAYER_FRICTION;
            }
            if (Math.abs(this.speedX) < 0.1) this.speedX = 0;
            if (Math.abs(this.speedY) < 0.1) this.speedY = 0;
            this.x += this.speedX;
            this.y += this.speedY;
        }

        this.x = Math.max(0, Math.min(this.game.width - this.width, this.x));
        this.y = Math.max(0, Math.min(this.game.height - this.height, this.y));

        const isShooting = input.has('shoot') || (input.inputType === 'MOUSE' && input.mouseDown);
        if (isShooting) {
            if (this.shootTimer <= 0) {
                this.fire();
                this.shootTimer = Math.max(6, 10 - Math.floor(this.weaponLevel / 5));
            }
        }
        if (this.shootTimer > 0) this.shootTimer--;
        if (this.isShielded) {
            this.shieldTimer--;
            if (this.shieldTimer <= 0) this.isShielded = false;
        }
    }

    // --- 核心重构：直线+分散 等比增长系统 ---
    fire() {
        this.game.audio.playShoot();
        const cx = this.x + this.width/2; 
        const cy = this.y;
        
        // 1. 伤害计算：
        // 视觉子弹数量有上限 (防止卡死)，但伤害无上限
        // 超过 LV.12 后，所有数值都加到伤害里
        const visualLevel = Math.min(this.weaponLevel, 12);
        let baseDamage = 1;
        if (this.weaponLevel > 12) {
            baseDamage += (this.weaponLevel - 12) * 1.5;
        }

        // 2. 直线射击 (Main Stream)
        // 随着等级增加，主炮数量增加。每3级多一条主炮线
        // Lv 1-2: 1条
        // Lv 3-5: 2条
        // Lv 6+:  3条 (上限)
        const mainStreamCount = Math.min(3, 1 + Math.floor(visualLevel / 3));
        
        for(let i=0; i<mainStreamCount; i++) {
            // 计算偏移量，让多条直线并排
            let offset = (i - (mainStreamCount-1)/2) * 8; 
            this.game.bullets.push(new Bullet(this.game, cx + offset, cy, 0, baseDamage));
        }

        // 3. 分散射击 (Spread)
        // 随着等级增加，散射的角度和数量等比增加
        // 每一级增加一对散射子弹
        // 限制：最多 5 对散射 (防止变成全屏白色)
        const spreadPairs = Math.min(5, Math.floor(visualLevel / 2));
        
        for (let i = 1; i <= spreadPairs; i++) {
            // 角度计算：每层散射增加 0.1 弧度 (约5度)
            let angle = 0.1 * i; 
            this.game.bullets.push(new Bullet(this.game, cx, cy, -angle, baseDamage)); // 左边
            this.game.bullets.push(new Bullet(this.game, cx, cy, angle, baseDamage));  // 右边
        }
    }

    upgradeWeapon() {
        this.weaponLevel++;
        this.game.createParticles(this.x+this.width/2, this.y, 10, '#d0f', 'CIRCLE');
    }

    activateShield() { this.isShielded = true; this.shieldTimer = 300; }
    deactivateShield() { this.isShielded = false; }
    
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(this.x+this.width/2, this.y+this.height/2, 24, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = '#0ff';
        if(this.game.input.inputType === 'KEYBOARD' && this.game.input.has('focus')) {
            ctx.beginPath(); ctx.arc(this.x+this.width/2, this.y+this.height/2, 4, 0, Math.PI*2);
            ctx.fillStyle='#f00'; ctx.fill(); ctx.fillStyle='#0ff';
        }
        ctx.beginPath();
        ctx.moveTo(this.x+this.width/2, this.y);
        ctx.lineTo(this.x, this.y+this.height);
        ctx.lineTo(this.x+this.width/2, this.y+this.height-8);
        ctx.lineTo(this.x+this.width, this.y+this.height);
        ctx.closePath(); ctx.fill();
        
        if(this.isShielded) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${Math.abs(Math.sin(Date.now()/100))})`;
            ctx.lineWidth = 2; ctx.beginPath();
            ctx.arc(this.x+this.width/2, this.y+this.height/2, 32, 0, Math.PI*2); ctx.stroke();
        }
        ctx.restore();
    }
}

class Bullet {
    constructor(game, x, y, angle, damage) {
        this.game = game; 
        this.x = x-2; 
        this.y = y;
        this.width = 6; 
        this.height = 14;
        this.speed = CONFIG.BULLET_SPEED; 
        this.vx = angle * 5; 
        this.damage = damage || 1; 
        this.markedForDeletion = false;
    }
    
    update() { 
        this.y -= this.speed; 
        this.x += this.vx; 
        if(this.y < 0) this.markedForDeletion = true; 
    }
    
    draw(ctx) { 
        // 颜色随伤害变化
        if (this.damage > 5) ctx.fillStyle = '#f03';
        else if (this.damage > 2) ctx.fillStyle = '#d0f';
        else ctx.fillStyle = '#ff0'; 
        ctx.fillRect(this.x, this.y, 4, this.height); 
    } 
}

class Enemy {
    constructor(game, x) {
        this.game = game; this.x = x; this.y = -40;
        this.width = 30; this.height = 30;
        
        this.speed = (Math.random()*0.3 + CONFIG.ENEMY_BASE_SPEED) + (game.difficulty * 0.1);
        this.speed = Math.min(this.speed, 3.5); 

        this.color = '#f03'; 
        this.markedForDeletion = false;
        
        this.hp = 3 + (game.difficulty * 1.5) + (game.player.weaponLevel * 2);
        this.hitTimer = 0;
    }
    
    takeDamage() { this.hitTimer = 3; }

    update() { 
        this.y += this.speed; 
        if (this.hitTimer > 0) this.hitTimer--;
        if(this.y > this.game.height) this.markedForDeletion = true; 
    }
    
    draw(ctx) {
        if (this.hitTimer > 0) {
            ctx.fillStyle = '#fff'; 
            ctx.shadowBlur = 15;    
            ctx.shadowColor = '#fff';
        } else {
            ctx.fillStyle = this.color;
            ctx.shadowBlur = 0;
        }
        
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        if (this.hitTimer <= 0) {
            ctx.fillStyle = `rgba(0,0,0, ${0.5/Math.max(1, this.hp/5)})`; 
            ctx.fillRect(this.x+5, this.y+5, this.width-10, this.height-10);
        }
        ctx.shadowBlur = 0; 
    }
}

class Item {
    constructor(game, x, random) {
        this.game = game; this.x = x; this.y = random ? -30 : game.player.y-50;
        if(!random) { this.x = Math.max(20, Math.min(game.width-20, x)); this.y = Math.max(20, this.y); }
        this.width = 18; this.height = 18;
        this.speed = 1.2; 
        this.markedForDeletion = false;
        
        const r = Math.random();
        const lv = game.player.weaponLevel;
        let upgradeChance = 0.3; 
        if (lv <= 5) upgradeChance = 0.6;
        else if (lv > 15) upgradeChance = 0.15;
        const shieldChance = 0.1;

        if(r < upgradeChance) { this.type = 'UPGRADE'; this.color = '#d0f'; }
        else if(r < upgradeChance + shieldChance) { this.type = 'SHIELD'; this.color = '#fff'; }
        else { this.type = 'SCORE'; this.color = '#0aa'; }
    }
    update() { this.y += this.speed; this.x += Math.sin(this.y*0.05)*0.5; if(this.y > this.game.height) this.markedForDeletion = true; }
    draw(ctx) {
        ctx.save(); 
        ctx.fillStyle = this.color;
        ctx.translate(this.x+this.width/2, this.y+this.height/2); ctx.rotate(Date.now()/150);
        if(this.type === 'UPGRADE') { ctx.fillRect(-8,-8,16,16); ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.strokeRect(-8,-8,16,16); }
        else if(this.type === 'SHIELD') { ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.fill(); }
        else { ctx.rotate(Math.PI/4); ctx.fillRect(-7,-7,14,14); }
        ctx.restore();
    }
    applyEffect(p) { if(this.type === 'UPGRADE') p.upgradeWeapon(); else if(this.type === 'SHIELD') p.activateShield(); }
}

class Particle {
    constructor(game, x, y, color, type = 'CIRCLE') {
        this.game = game; 
        this.x = x; this.y = y; this.color = color; this.type = type;
        this.markedForDeletion = false; this.life = 1.0;
        
        if (this.type === 'CIRCLE') {
            this.size = Math.random()*3+2;
            this.speedX = Math.random()*6-3; 
            this.speedY = Math.random()*6-3;
        } else if (this.type === 'RING') {
            this.size = 1; 
            this.speedX = 0; this.speedY = 0;
        }
    }
    update() { 
        if (this.type === 'CIRCLE') {
            this.x += this.speedX; this.y += this.speedY; this.life -= 0.05; 
        } else if (this.type === 'RING') {
            this.size += 4; this.life -= 0.08; 
        }
        if(this.life<=0) this.markedForDeletion = true; 
    }
    draw(ctx) { 
        ctx.save();
        ctx.globalAlpha = this.life; 
        if (this.type === 'CIRCLE') {
            ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI*2); ctx.fill(); 
        } else if (this.type === 'RING') {
            ctx.strokeStyle = this.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI*2); ctx.stroke();
        }
        ctx.globalAlpha = 1.0; ctx.restore();
    }
}

window.onload = () => { const game = new Game(); };
