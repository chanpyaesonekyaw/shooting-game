// Game constants
const PLAYER_SIZE = 30;
const BULLET_SIZE = 5;
const BULLET_SPEED = 7;
const PLAYER_SPEED = 5;

// Game variables
let canvas, ctx;
let players = {};
let bullets = [];
let localPlayerId = null;
let keys = {};
let socket;
let gameStarted = false;

// DOM Elements
const gameCanvas = document.getElementById('gameCanvas');
const startMenu = document.getElementById('startMenu');
const playerNameInput = document.getElementById('playerNameInput');
const startButton = document.getElementById('startButton');
const scoreBoard = document.getElementById('scoreBoard');

// Initialize the game
function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Set up event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('click', handleShoot);
    startButton.addEventListener('click', startGame);
    
    // Connect to the real server
    connectToServer();
}

// Connect to the real Socket.io server
function connectToServer() {
    // Connect to the server with explicit configuration for Vercel deployment
    const options = {
        transports: ['websocket'],
        upgrade: false,
        reconnection: true,
        reconnectionAttempts: 5
    };
    
    socket = io(options);
    
    // Set up socket event handlers
    socket.on('game-state', handleGameState);
    socket.on('player-new', handleNewPlayer);
    socket.on('player-moved', handlePlayerMoved);
    socket.on('player-left', handlePlayerLeft);
    socket.on('bullet-new', handleNewBullet);
    socket.on('player-hit', handlePlayerHit);
    socket.on('player-respawn', handlePlayerRespawn);
    
    // Add connection error handling
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        // You could display an error message to the user here
    });
}

// Handle initial game state
function handleGameState(data) {
    players = data.players;
    bullets = data.bullets;
    localPlayerId = data.yourId;
}

// Handle new player joining
function handleNewPlayer(player) {
    players[player.id] = player;
}

// Handle player movement
function handlePlayerMoved(data) {
    if (players[data.id]) {
        players[data.id].x = data.x;
        players[data.id].y = data.y;
    }
}

// Handle player disconnection
function handlePlayerLeft(playerId) {
    if (players[playerId]) {
        delete players[playerId];
    }
}

// Handle new bullet
function handleNewBullet(bullet) {
    bullets.push(bullet);
}

// Handle player hit
function handlePlayerHit(data) {
    if (players[data.id]) {
        players[data.id].health = data.health;
    }
}

// Handle player respawn
function handlePlayerRespawn(data) {
    if (players[data.id]) {
        players[data.id].x = data.x;
        players[data.id].y = data.y;
        players[data.id].health = data.health;
    }
}

// Handle score update
function handleScoreUpdate(data) {
    if (players[data.id]) {
        players[data.id].score = data.score;
    }
}

// Start the game
function startGame() {
    const playerName = playerNameInput.value.trim() || 'Player';
    
    // Join the game
    socket.emit('player-join', { name: playerName });
    
    // Hide start menu and show scoreboard
    startMenu.style.display = 'none';
    scoreBoard.style.display = 'block';
    
    gameStarted = true;
    
    // Start the game loop
    gameLoop();
}

// Game loop
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

// Update game state
function update() {
    if (!gameStarted) return;
    
    // Move local player based on key presses
    moveLocalPlayer();
    
    // Update bullets
    updateBullets();
    
    // Check for collisions
    checkCollisions();
    
    // Update scoreboard
    updateScoreboard();
}

// Move the local player based on key presses
function moveLocalPlayer() {
    if (!localPlayerId || !players[localPlayerId]) return;
    
    const player = players[localPlayerId];
    let moved = false;
    
    if (keys['ArrowUp'] || keys['w']) {
        player.y = Math.max(PLAYER_SIZE, player.y - PLAYER_SPEED);
        moved = true;
    }
    if (keys['ArrowDown'] || keys['s']) {
        player.y = Math.min(canvas.height - PLAYER_SIZE, player.y + PLAYER_SPEED);
        moved = true;
    }
    if (keys['ArrowLeft'] || keys['a']) {
        player.x = Math.max(PLAYER_SIZE, player.x - PLAYER_SPEED);
        moved = true;
    }
    if (keys['ArrowRight'] || keys['d']) {
        player.x = Math.min(canvas.width - PLAYER_SIZE, player.x + PLAYER_SPEED);
        moved = true;
    }
    
    if (moved) {
        // Emit player movement to server
        socket.emit('player-move', {
            id: localPlayerId,
            x: player.x,
            y: player.y
        });
    }
}

// Move AI players
function moveAIPlayers() {
    for (const id in players) {
        if (players[id].ai) {
            const ai = players[id];
            
            // Simple AI movement - random direction changes
            if (Math.random() < 0.02) {
                ai.dx = (Math.random() - 0.5) * PLAYER_SPEED;
                ai.dy = (Math.random() - 0.5) * PLAYER_SPEED;
            }
            
            // Move AI player
            ai.x += ai.dx || 0;
            ai.y += ai.dy || 0;
            
            // Keep AI within bounds
            if (ai.x < PLAYER_SIZE || ai.x > canvas.width - PLAYER_SIZE) {
                ai.dx = -ai.dx;
            }
            if (ai.y < PLAYER_SIZE || ai.y > canvas.height - PLAYER_SIZE) {
                ai.dy = -ai.dy;
            }
            
            ai.x = Math.max(PLAYER_SIZE, Math.min(canvas.width - PLAYER_SIZE, ai.x));
            ai.y = Math.max(PLAYER_SIZE, Math.min(canvas.height - PLAYER_SIZE, ai.y));
            
            // AI shooting
            if (Math.random() < 0.01 && localPlayerId && players[localPlayerId]) {
                const target = players[localPlayerId];
                const angle = Math.atan2(target.y - ai.y, target.x - ai.x);
                
                socket.emit('player-shoot', {
                    id: Math.random().toString(36).substr(2, 9),
                    x: ai.x,
                    y: ai.y,
                    dx: Math.cos(angle) * BULLET_SPEED,
                    dy: Math.sin(angle) * BULLET_SPEED,
                    playerId: id
                });
            }
        }
    }
}

// Update bullets position (only for visual rendering)
function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].x += bullets[i].dx;
        bullets[i].y += bullets[i].dy;
        
        // Remove bullets that are out of bounds (server will handle this too)
        if (bullets[i].x < 0 || bullets[i].x > canvas.width ||
            bullets[i].y < 0 || bullets[i].y > canvas.height) {
            bullets.splice(i, 1);
        }
    }
}

// Remove the checkCollisions function as the server will handle this
function checkCollisions() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        
        for (const id in players) {
            // Skip the player who shot the bullet
            if (id === bullet.playerId) continue;
            
            const player = players[id];
            const dx = bullet.x - player.x;
            const dy = bullet.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Check if bullet hit a player
            if (distance < PLAYER_SIZE) {
                // Player hit
                player.health -= 10;
                
                // Remove the bullet
                bullets.splice(i, 1);
                
                // Check if player is defeated
                if (player.health <= 0) {
                    // Increase score of the shooter
                    if (players[bullet.playerId]) {
                        players[bullet.playerId].score += 1;
                    }
                    
                    // Respawn the player
                    respawnPlayer(id);
                }
                
                break;
            }
        }
    }
}

// Respawn a player
function respawnPlayer(id) {
    const player = players[id];
    player.x = Math.random() * (canvas.width - PLAYER_SIZE * 2) + PLAYER_SIZE;
    player.y = Math.random() * (canvas.height - PLAYER_SIZE * 2) + PLAYER_SIZE;
    player.health = 100;
}

// Update the scoreboard
function updateScoreboard() {
    let html = '<h3>Scoreboard</h3>';
    
    // Sort players by score
    const sortedPlayers = Object.values(players).sort((a, b) => b.score - a.score);
    
    for (const player of sortedPlayers) {
        const isLocal = player.id === localPlayerId ? ' (You)' : '';
        html += `<div>${player.name}${isLocal}: ${player.score} - Health: ${player.health}</div>`;
    }
    
    scoreBoard.innerHTML = html;
}

// Render the game
function render() {
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw players
    for (const id in players) {
        const player = players[id];
        
        // Draw player body
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_SIZE, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw player name
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, player.x, player.y - PLAYER_SIZE - 5);
        
        // Draw health bar
        const healthBarWidth = PLAYER_SIZE * 2;
        const healthBarHeight = 5;
        const healthPercentage = player.health / 100;
        
        ctx.fillStyle = 'red';
        ctx.fillRect(player.x - healthBarWidth / 2, player.y + PLAYER_SIZE + 5, healthBarWidth, healthBarHeight);
        
        ctx.fillStyle = 'green';
        ctx.fillRect(player.x - healthBarWidth / 2, player.y + PLAYER_SIZE + 5, healthBarWidth * healthPercentage, healthBarHeight);
    }
    
    // Draw bullets
    ctx.fillStyle = 'yellow';
    for (const bullet of bullets) {
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, BULLET_SIZE, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Handle key down events
function handleKeyDown(e) {
    keys[e.key] = true;
}

// Handle key up events
function handleKeyUp(e) {
    keys[e.key] = false;
}

// Handle shooting
function handleShoot(e) {
    if (!gameStarted || !localPlayerId || !players[localPlayerId]) return;
    
    const player = players[localPlayerId];
    
    // Calculate direction vector from player to click position
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const dx = clickX - player.x;
    const dy = clickY - player.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Normalize and scale by bullet speed
    const bulletDx = (dx / length) * BULLET_SPEED;
    const bulletDy = (dy / length) * BULLET_SPEED;
    
    // Emit shoot event
    socket.emit('player-shoot', {
        id: Math.random().toString(36).substr(2, 9),
        x: player.x,
        y: player.y,
        dx: bulletDx,
        dy: bulletDy,
        playerId: localPlayerId
    });
}

// Get a random color
function getRandomColor() {
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3', '#33FFF3'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Initialize the game when the page loads
window.onload = init;