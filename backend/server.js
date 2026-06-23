const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Enable CORS so your Netlify website link is authorized to communicate over this socket
const io = new Server(server, {
    cors: {
        origin: "*", // Allows any domain (like Netlify) to connect
        methods: ["GET", "POST"]
    }
});

let waitingQueue = [];

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. Matchmaking Logic
    socket.on('find_match', () => {
        if (waitingQueue.length > 0) {
            // Someone is waiting, match them together
            const opponent = waitingQueue.shift();
            const roomId = `match-${opponent.id}-${socket.id}`;
            
            socket.join(roomId);
            opponent.join(roomId);
            socket.roomId = roomId;
            opponent.roomId = roomId;

            // Randomly decide who starts first
            const player1Starts = Math.random() > 0.5;

            // Tell both players the match is found and start the game
            io.to(socket.id).emit('match_found', { opponentId: opponent.id, startsFirst: player1Starts });
            io.to(opponent.id).emit('match_found', { opponentId: socket.id, startsFirst: !player1Starts });
            
            console.log(`Match created in room ${roomId}`);
        } else {
            // No one is waiting, add this player to the queue
            waitingQueue.push(socket);
            console.log(`User ${socket.id} is waiting for a match.`);
        }
    });

    // 2. Relay Game Actions to Opponent
    socket.on('player_action', (data) => {
        // When a player makes a move, send it ONLY to the opponent in the same room
        if (socket.roomId) {
            socket.to(socket.roomId).emit('opponent_action', data);
        }
    });

    // 3. Handle Disconnects
    socket.on('disconnect', () => {
        // Remove them from the queue if they leave while searching
        waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
        
        // If they were in a match, tell their opponent they left
        if (socket.roomId) {
            socket.to(socket.roomId).emit('opponent_disconnect');
            console.log(`User ${socket.id} disconnected from room ${socket.roomId}`);
        }
    });
});

// Use Railway environment variables to assign host port pipelines dynamically
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Network logic backend spinning on port assignment ${PORT}`);
});
    console.log(`Network logic backend spinning on port assignment ${PORT}`);
});
