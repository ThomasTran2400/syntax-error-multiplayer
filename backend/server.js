const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Enable CORS so your Netlify website link is authorized to communicate over this socket
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let rooms = {}; // Object cache storing running games

// Helper function to create a clean matrix state
function generateFreshMatrix() {
    let matrix = [];
    for (let i = 0; i < 9; i++) {
        // Randomly assign standard nodes versus system crash traps
        let nodeType = Math.random() > 0.3 ? 'DATA_SECTOR' : 'TRAP_SECTOR';
        matrix.push({ id: i, type: nodeType, cleared: false });
    }
    return matrix;
}

io.on('connection', (socket) => {
    console.log(`Connection established: ${socket.id}`);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);

        // If the room doesn't exist, create it as player 1
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [socket.id],
                hp: { [socket.id]: 8 },
                turn: socket.id,
                matrix: generateFreshMatrix()
            };
            socket.emit('waiting-for-opponent', { msg: "Awaiting terminal handshake..." });
            console.log(`Room ${roomId} initialized by host ${socket.id}`);
        } 
        // If room exists and is open, join as player 2
        else if (rooms[roomId].players.length < 2) {
            rooms[roomId].players.push(socket.id);
            rooms[roomId].hp[socket.id] = 8;
            
            console.log(`Room ${roomId} filled by peer ${socket.id}`);
            // Fire event telling both connected browsers that the game loop can start
            io.to(roomId).emit('game-start', rooms[roomId]);
        }
    });

    socket.on('select-node', (data) => {
        const { roomId, nodeIndex } = data;
        let room = rooms[roomId];

        if (!room || room.turn !== socket.id) return; // Ignore if room doesn't exist or it's not their turn

        let targetNode = room.matrix[nodeIndex];
        if (!targetNode || targetNode.cleared) return;

        targetNode.cleared = true;

        // Apply gameplay rules based on chosen node
        if (targetNode.type === 'TRAP_SECTOR') {
            room.hp[socket.id] = Math.max(0, room.hp[socket.id] - 2); // Take 2 structural memory damage
        }

        // Cycle turn authority to the other player id in the array
        let nextTurnId = room.players.find(id => id !== socket.id);
        if (nextTurnId) {
            room.turn = nextTurnId;
        }

        // Check if all slots are cleared; if so, refresh the matrix field
        if (room.matrix.every(n => n.cleared)) {
            room.matrix = generateFreshMatrix();
        }

        // Broadcast the updated frame state back out to both players instantly
        io.to(roomId).emit('state-updated', room);
    });

    socket.on('disconnect', () => {
        console.log(`Connection terminated: ${socket.id}`);
        // Scrub running data cache if a user closes out their browser tab
        for (let rId in rooms) {
            if (rooms[rId].players.includes(socket.id)) {
                delete rooms[rId];
                io.to(rId).emit('peer-disconnected');
            }
        }
    });
});

// Use Railway environment variables to assign host port pipelines dynamically
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Network logic backend spinning on port assignment ${PORT}`);
});