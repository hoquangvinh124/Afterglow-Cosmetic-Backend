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
// Generate a LiveKit participant token with agent dispatch (TTL: 15m)
//
// Body params:
//   roomName            (optional) custom room name
//   participantName     (optional) display name
//   participantIdentity (optional) unique identity
//   agentType           "shop-assistant" | "dermatologist" | "makeup-artist"
//                       defaults to "shop-assistant"
router.post('/connection-details', requireAuth, async (req, res) => {
    const { roomName, participantName, participantIdentity, agentType } = req.body;

    const room     = roomName          || 'voice_agent_room_' + Math.random().toString(36).substring(2, 8);
    const name     = participantName   || req.user.name || 'User';
    const identity = participantIdentity || `user_${req.user.id || Math.random().toString(36).substring(2, 8)}`;
    const type     = agentType         || 'shop-assistant';

    const VALID_TYPES = ['shop-assistant', 'dermatologist', 'makeup-artist'];
    if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ success: false, message: `Invalid agentType. Must be one of: ${VALID_TYPES.join(', ')}` });
    }

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

    // Dispatch agent "afterglow-agents" với metadata chứa type để agent Python routing đúng
    at.roomConfig = {
        agents: [{
            agentName: 'afterglow-agents',
            metadata: JSON.stringify({ type }),
        }],
    };

    const participantToken = await at.toJwt();

    res.json({
        serverUrl: process.env.LIVEKIT_URL,
        participantToken,
        participantName: name,
        roomName: room,
        agentType: type,
    });
});

module.exports = router;
