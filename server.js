const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state
let players = {};
let bullets = [];

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Player joins the game
    socket.on('player-join', (data) => {
        console.log('Player joined:', data.name);
        
        // Create a new player
        players[socket.id] = {
            id: socket.id,
            name: data.name,
            x: Math.random() * 740 + 30,
            y: Math.random() * 540 + 30,
            color: getRandomColor(),
            score: 0,
            health: 100
        };
        
        // Send current game state to the new player
        socket.emit('game-state', {
            players,
            bullets,
            yourId: socket.id
        });
        
        // Notify other players about the new player
        socket.broadcast.emit('player-new', players[socket.id]);
    });
    
    // Player movement
    socket.on('player-move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            
            // Broadcast player movement to all other players
            socket.broadcast.emit('player-moved', {
                id: socket.id,
                x: data.x,
                y: data.y
            });
        }
    });
    
    // Player shooting
    socket.on('player-shoot', (data) => {
        const bullet = {
            id: data.id,
            x: data.x,
            y: data.y,
            dx: data.dx,
            dy: data.dy,
            playerId: socket.id
        };
        
        bullets.push(bullet);
        
        // Broadcast the new bullet to all players
        io.emit('bullet-new', bullet);
    });
    
    // Player disconnects
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        if (players[socket.id]) {
            // Remove the player
            delete players[socket.id];
            
            // Notify all other players
            io.emit('player-left', socket.id);
        }
    });
});

// Update game state (bullet movement, collisions, etc.)
function updateGameState() {
    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].x += bullets[i].dx;
        bullets[i].y += bullets[i].dy;
        
        // Check if bullet is out of bounds
        if (bullets[i].x < 0 || bullets[i].x > 800 ||
            bullets[i].y < 0 || bullets[i].y > 600) {
            bullets.splice(i, 1);
            continue;
        }
        
        // Check for collisions with players
        for (const id in players) {
            // Skip the player who shot the bullet
            if (id === bullets[i].playerId) continue;
            
            const player = players[id];
            const dx = bullets[i].x - player.x;
            const dy = bullets[i].y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Check if bullet hit a player
            if (distance < 30) { // Player size is 30
                // Player hit
                player.health -= 10;
                
                // Notify all players about the hit
                io.emit('player-hit', {
                    id,
                    health: player.health
                });
                
                // Remove the bullet
                bullets.splice(i, 1);
                
                // Check if player is defeated
                if (player.health <= 0) {
                    // Increase score of the shooter
                    if (players[bullets[i].playerId]) {
                        players[bullets[i].playerId].score += 1;
                        
                        // Notify all players about the score update
                        io.emit('score-update', {
                            id: bullets[i].playerId,
                            score: players[bullets[i].playerId].score
                        });
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
    if (players[id]) {
        players[id].x = Math.random() * 740 + 30;
        players[id].y = Math.random() * 540 + 30;
        players[id].health = 100;
        
        // Notify all players about the respawn
        io.emit('player-respawn', {
            id,
            x: players[id].x,
            y: players[id].y,
            health: players[id].health
        });
    }
}

// Get a random color
function getRandomColor() {
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3', '#33FFF3'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Run game loop (60 FPS)
setInterval(updateGameState, 1000 / 60);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});