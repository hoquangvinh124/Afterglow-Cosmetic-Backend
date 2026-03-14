const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { AccessToken } = require('livekit-server-sdk');

const JWT_SECRET = process.env.JWT_SECRET || 'afterglow_luxury_secret_key_2026';

// ── JWT Auth Middleware ──────────────────────────────────────────────────────
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ success: false, message: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
}

// ── POST /api/agent/token ────────────────────────────────────────────────────
// Generate a LiveKit participant token (TTL: 10m)
router.post('/token', requireAuth, async (req, res) => {
    const { roomName, participantName, participantIdentity } = req.body;

    const room     = roomName          || 'quickstart-room';
    const name     = participantName   || req.user.name || 'quickstart-username';
    const identity = participantIdentity || String(req.user.id) || 'quickstart-identity';

    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
        return res.status(500).json({ success: false, message: 'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set' });
    }

    const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity,
        name,
        ttl: '10m',
    });

    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

    const participantToken = await at.toJwt();

    res.json({ serverUrl: process.env.LIVEKIT_URL, participantToken });
});

// ── POST /api/agent/connection-details ──────────────────────────────────────
// Generate a LiveKit participant token with optional agent dispatch (TTL: 15m)
router.post('/connection-details', requireAuth, async (req, res) => {
    const { roomName, participantName, participantIdentity, agentName } = req.body;

    const room     = roomName          || 'voice_agent_room_' + Math.random().toString(36).substring(2, 8);
    const name     = participantName   || req.user.name || 'User';
    const identity = participantIdentity || `user_${req.user.id || Math.random().toString(36).substring(2, 8)}`;

    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
        return res.status(500).json({ success: false, message: 'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set' });
    }

    const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity,
        name,
        ttl: '15m',
    });

    at.addGrant({
        roomJoin: true,
        room,
        canPublish: true,
        canPublishData: true,
        canSubscribe: true,
    });

    if (agentName) {
        at.roomConfig = {
            agents: [{ agentName }],
        };
    }

    const participantToken = await at.toJwt();

    res.json({
        serverUrl: process.env.LIVEKIT_URL,
        participantToken,
        participantName: name,
        roomName: room,
    });
});

module.exports = router;
