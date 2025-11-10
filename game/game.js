// Initialize Telegram Web App
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();
}

// Game constants
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Load Pedro sprite frames
const runFrames = [];
const jumpFrames = [];
let spritesLoaded = 0;
const totalSprites = 8;

// Load run animation frames
['run0001.png', 'run0003.png', 'run0009.png', 'run0011.png'].forEach((filename, index) => {
    const img = new Image();
    img.onload = () => {
        spritesLoaded++;
        console.log(`Loaded ${filename}, total: ${spritesLoaded}/${totalSprites}`);
    };
    img.onerror = (e) => {
        console.error(`Failed to load ${filename}:`, e);
    };
    img.src = filename;
    runFrames.push(img);
});

// Load jump animation frames
['jump0001.png', 'jump0003.png', 'jump0009.png', 'jump0011.png'].forEach((filename, index) => {
    const img = new Image();
    img.onload = () => {
        spritesLoaded++;
        console.log(`Loaded ${filename}, total: ${spritesLoaded}/${totalSprites}`);
    };
    img.onerror = (e) => {
        console.error(`Failed to load ${filename}:`, e);
    };
    img.src = filename;
    jumpFrames.push(img);
});

// Audio setup
const sounds = {
    pedro: new Audio('pedro.mp3'), // Pedro pedro pedro pe sound (relative path)
    jump: null,
    gameOver: null,
    muted: false
};

// Function to play sound
function playSound(soundName) {
    if (!sounds.muted && sounds[soundName]) {
        sounds[soundName].currentTime = 0;
        sounds[soundName].play().catch(e => console.log('Audio play failed:', e));
    }
}

// Toggle sound
function toggleSound() {
    sounds.muted = !sounds.muted;
    return sounds.muted;
}

// Set canvas size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 60; // Account for header
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Game state
const game = {
    state: 'start', // 'start', 'playing', 'gameover'
    score: 0,
    tokens: 0,
    highscore: localStorage.getItem('pedroHighscore') || 0,
    speed: 3, // Reduced from 5 to make it easier
    gravity: 0.8,
    frameCount: 0
};

// Player (Pedro) - Sprite-based animated character
const player = {
    x: 100,
    y: 0,
    width: 60,  // Reduced from 120 to match actual raccoon body size
    height: 80, // Reduced from 160 to match actual raccoon body size
    velocityY: 0,
    jumping: false,
    animationFrame: 0,
    currentFrame: 0,
    frameTimer: 0,
    frameRate: 8, // Change frame every 8 game ticks
    
    jump() {
        if (!this.jumping) {
            this.velocityY = -18; // Increased from -15 for higher jumps
            this.jumping = true;
            playSound('jump'); // Play jump sound
        }
    },
    
    update() {
        this.velocityY += game.gravity;
        this.y += this.velocityY;
        
        // Ground collision
        const groundY = canvas.height - this.height - 50;
        if (this.y >= groundY) {
            this.y = groundY;
            this.velocityY = 0;
            this.jumping = false;
        }
        
        // Sprite animation
        this.frameTimer++;
        if (this.frameTimer >= this.frameRate) {
            this.frameTimer = 0;
            const frames = this.jumping ? jumpFrames : runFrames;
            this.currentFrame = (this.currentFrame + 1) % frames.length;
        }
    },
    
    draw() {
        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.ellipse(this.x + this.width / 2, this.y + this.height + 5, this.width * 0.4, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw sprite frame (visual size larger than hitbox)
        if (spritesLoaded === totalSprites) {
            const frames = this.jumping ? jumpFrames : runFrames;
            const currentSprite = frames[this.currentFrame];
            
            if (currentSprite && currentSprite.complete) {
                // Render sprite at 120x160 (visual size) while hitbox is 60x80
                const visualWidth = 120;
                const visualHeight = 160;
                const offsetX = (visualWidth - this.width) / 2; // Center sprite over hitbox
                const offsetY = visualHeight - this.height; // Align bottom
                
                ctx.drawImage(
                    currentSprite,
                    this.x - offsetX,
                    this.y - offsetY,
                    visualWidth,
                    visualHeight
                );
            } else {
                // Fallback: Draw a colored rectangle if sprite not ready
                ctx.fillStyle = '#ff6b35';
                ctx.fillRect(this.x, this.y, this.width, this.height);
            }
        } else {
            // Fallback: Draw a colored rectangle if sprites not loaded
            ctx.fillStyle = '#ff6b35';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
        
        // Debug: Draw hitbox (press 'D' to toggle)
        if (window.debugMode) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        }
    }
};

// Obstacles array
const obstacles = [];
const obstacleTypes = [
    { type: 'fud', color: '#e74c3c', label: 'FUD', flying: false },
    { type: 'bear', color: '#c0392b', label: 'BEAR', flying: false },
    { type: 'fomo', color: '#9b59b6', label: '📈', flying: true },
    { type: 'rug', color: '#e67e22', label: '🚨', flying: true }
];

function spawnObstacle() {
    const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
    
    let y, width, height;
    
    if (type.flying) {
        // Flying obstacles at varying heights
        const heights = [
            canvas.height - 180, // High
            canvas.height - 140, // Mid-high
            canvas.height - 100  // Mid
        ];
        y = heights[Math.floor(Math.random() * heights.length)];
        width = 40; // Reduced from 50
        height = 30; // Reduced from 40
    } else {
        // Ground obstacles
        y = canvas.height - 100;
        width = 35; // Reduced from 40
        height = 50; // Reduced from 60
    }
    
    obstacles.push({
        x: canvas.width,
        y: y,
        width: width,
        height: height,
        ...type,
        passed: false
    });
}

// Tokens array
const tokens = [];

function spawnToken() {
    tokens.push({
        x: canvas.width,
        y: canvas.height - 150 - Math.random() * 100,
        width: 30,
        height: 30,
        collected: false
    });
}

// Collision detection
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Draw ground
function drawGround() {
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
    
    // Ground line
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 50);
    ctx.lineTo(canvas.width, canvas.height - 50);
    ctx.stroke();
}

// Particle system
const particles = [];

function createParticles(x, y, count = 10, color = '#ffd700') {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 1,
            color: color
        });
    }
}

function updateParticles() {
    particles.forEach((p, index) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; // Gravity
        p.life -= 0.02;
        
        if (p.life <= 0) {
            particles.splice(index, 1);
        }
    });
}

function drawParticles() {
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    });
}

// Screen shake
let screenShake = {
    x: 0,
    y: 0,
    intensity: 0
};

function shakeScreen(intensity = 10) {
    screenShake.intensity = intensity;
}

function updateScreenShake() {
    if (screenShake.intensity > 0) {
        screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.intensity *= 0.9;
        
        if (screenShake.intensity < 0.5) {
            screenShake.intensity = 0;
            screenShake.x = 0;
            screenShake.y = 0;
        }
    }
}

// Background Pedro images
const pedroBgImg = new Image();
pedroBgImg.src = 'pedro.jpg'; // Relative path for Flask static serving

// Draw background
function drawBackground() {
    // Runway track lines (parallel lines on the ground)
    const trackY = canvas.height - 50; // Ground level
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.lineWidth = 3;
    
    // Draw 3 parallel track lines
    for (let i = 0; i < 3; i++) {
        const lineY = trackY - 30 - (i * 40);
        ctx.setLineDash([20, 15]); // Dashed line pattern
        ctx.beginPath();
        ctx.moveTo((game.frameCount * game.speed * 2) % 35 - 35, lineY);
        ctx.lineTo(canvas.width, lineY);
        ctx.stroke();
    }
    ctx.setLineDash([]); // Reset dash pattern
    
    // Pedro silhouettes on the walls (background decorations)
    if (pedroBgImg.complete) {
        ctx.globalAlpha = 0.15; // Very transparent for wall art effect
        
        // Draw Pedro images at different positions
        const positions = [
            { x: 200, y: 50 },
            { x: 500, y: 100 },
            { x: 800, y: 70 }
        ];
        
        positions.forEach(pos => {
            // Normalize scroll offset to keep silhouettes visible throughout the loop
            const offset = pos.x - (game.frameCount * 1.5);
            const scrollX = ((offset % (canvas.width + 150)) + (canvas.width + 150)) % (canvas.width + 150) - 100;
            if (scrollX > -100 && scrollX < canvas.width) {
                ctx.drawImage(pedroBgImg, scrollX, pos.y, 80, 80);
            }
        });
        
        ctx.globalAlpha = 1; // Reset opacity
    }
    
    // Stars (moving faster for speed effect)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let i = 0; i < 50; i++) {
        const x = (i * 137 + game.frameCount * 2) % canvas.width;
        const y = (i * 97) % canvas.height;
        ctx.fillRect(x, y, 2, 2);
    }
    
    // Speed lines for motion effect
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        const y = (i * 80 + game.frameCount * 3) % canvas.height;
        ctx.beginPath();
        ctx.moveTo(canvas.width, y);
        ctx.lineTo(canvas.width - 100, y);
        ctx.stroke();
    }
}

// Update game objects
function updateGame() {
    game.frameCount++;
    
    // Update player
    player.update();
    
    // Update particles and screen shake
    updateParticles();
    updateScreenShake();
    
    // Spawn obstacles
    if (game.frameCount % 180 === 0) { // Increased from 120 to give more time between obstacles
        spawnObstacle();
    }
    
    // Spawn tokens
    if (game.frameCount % 100 === 0) { // Increased from 80 to match obstacle spacing
        spawnToken();
    }
    
    // Update obstacles
    obstacles.forEach((obstacle, index) => {
        obstacle.x -= game.speed;
        
        // Check collision with player
        if (checkCollision(player, obstacle)) {
            shakeScreen(15);
            createParticles(player.x + player.width/2, player.y + player.height/2, 20, '#ff0000');
            gameOver();
        }
        
        // Score point when passing obstacle
        if (!obstacle.passed && obstacle.x + obstacle.width < player.x) {
            obstacle.passed = true;
            game.score += 10;
            updateScoreDisplay();
        }
        
        // Remove off-screen obstacles
        if (obstacle.x + obstacle.width < 0) {
            obstacles.splice(index, 1);
        }
    });
    
    // Update tokens
    tokens.forEach((token, index) => {
        token.x -= game.speed;
        
        // Check collection
        if (!token.collected && checkCollision(player, token)) {
            token.collected = true;
            game.tokens++;
            game.score += 50;
            createParticles(token.x + token.width/2, token.y + token.height/2, 15, '#ffd700');
            updateScoreDisplay();
            tokens.splice(index, 1);
        }
        
        // Remove off-screen tokens
        if (token.x + token.width < 0) {
            tokens.splice(index, 1);
        }
    });
    
    // Increase difficulty gradually
    if (game.frameCount % 800 === 0 && game.speed < 8) { // Slower speed increase and lower max speed
        game.speed += 0.3; // Reduced from 0.5
    }
}

// Draw game objects
function drawGame() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply screen shake
    ctx.save();
    ctx.translate(screenShake.x, screenShake.y);
    
    // Draw background
    drawBackground();
    
    // Draw ground
    drawGround();
    
    // Draw obstacles
    obstacles.forEach(obstacle => {
        ctx.fillStyle = obstacle.color;
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        
        // Debug: Draw hitbox
        if (window.debugMode) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        }
        
        // Label
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(obstacle.label, obstacle.x + obstacle.width/2, obstacle.y - 5);
    });
    
    // Draw tokens
    tokens.forEach(token => {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(token.x + token.width/2, token.y + token.height/2, token.width/2, 0, Math.PI * 2);
        ctx.fill();
        
        // $ symbol
        ctx.fillStyle = '#000';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('$', token.x + token.width/2, token.y + token.height/2 + 5);
    });
    
    // Draw player
    player.draw();
    
    // Draw particles
    drawParticles();
    
    // Restore canvas (end screen shake)
    ctx.restore();
}

// Game loop
function gameLoop() {
    if (game.state === 'playing') {
        updateGame();
        drawGame();
    }
    requestAnimationFrame(gameLoop);
}

// Start game
function startGame() {
    console.log('🎮 Game starting! Sprites loaded:', spritesLoaded, '/', totalSprites);
    game.state = 'playing';
    game.score = 0;
    game.tokens = 0;
    game.speed = 3; // Reduced from 5 for easier gameplay
    game.frameCount = 0;
    obstacles.length = 0;
    tokens.length = 0;
    player.y = canvas.height - player.height - 50;
    player.velocityY = 0;
    player.jumping = false;
    
    // Play Pedro sound when starting
    playSound('pedro');
    
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    
    updateScoreDisplay();
}

// Game over
function gameOver() {
    game.state = 'gameover';
    
    // Update high score
    if (game.score > game.highscore) {
        game.highscore = game.score;
        localStorage.setItem('pedroHighscore', game.highscore);
        document.getElementById('highscore').textContent = game.highscore;
    }
    
    // Show game over screen
    document.getElementById('final-score').textContent = game.score;
    document.getElementById('final-tokens').textContent = game.tokens;
    document.getElementById('game-over-screen').classList.remove('hidden');
    
    // Send score to Telegram
    if (tg) {
        tg.MainButton.text = `Score: ${game.score} | $PEDRO: ${game.tokens}`;
        tg.MainButton.show();
    }
}

// Update score display
function updateScoreDisplay() {
    document.getElementById('score').textContent = game.score;
    document.getElementById('tokens').textContent = game.tokens;
    document.getElementById('highscore').textContent = game.highscore;
}

// Event listeners
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

document.getElementById('share-btn').addEventListener('click', () => {
    if (tg) {
        const message = `🦝 I scored ${game.score} points and collected ${game.tokens} $PEDRO tokens in Pedro's Groove Run! 💎\n\nCan you beat my score? 🚀`;
        tg.switchInlineQuery(message, ['users', 'groups']);
    }
});

// Sound toggle button
document.getElementById('sound-toggle').addEventListener('click', () => {
    const muted = toggleSound();
    document.getElementById('sound-toggle').textContent = muted ? '🔇' : '🔊';
});

// Jump on tap/click
canvas.addEventListener('click', () => {
    if (game.state === 'playing') {
        player.jump();
    }
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (game.state === 'playing') {
        player.jump();
    }
});

// Keyboard support (spacebar and debug toggle)
window.debugMode = false; // Initialize debug mode
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && game.state === 'playing') {
        e.preventDefault();
        player.jump();
    }
    if (e.code === 'KeyD') {
        window.debugMode = !window.debugMode; // Toggle debug mode with 'D' key
        console.log('Debug mode:', window.debugMode ? 'ON' : 'OFF');
    }
});

// Apply Telegram theme
if (tg) {
    const themeParams = tg.themeParams;
    if (themeParams.bg_color) {
        document.body.style.background = themeParams.bg_color;
    }
    
    // Get user info
    const user = tg.initDataUnsafe?.user;
    if (user) {
        console.log(`Player: ${user.first_name} (${user.id})`);
    }
}

// Initialize
updateScoreDisplay();
gameLoop();
