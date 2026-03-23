const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { AccessToken, AgentDispatchClient } = require('livekit-server-sdk');

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
// Generate a LiveKit participant token AND explicitly dispatch the agent via API.
//
// Accepts: agentName OR agentType (frontend sends one or the other)
// Maps to the unified Python agent worker "afterglow-agents" with metadata.
router.post('/connection-details', requireAuth, async (req, res) => {
    try {
        const { roomName, participantName, participantIdentity } = req.body;
        // Accept both "agentName" and "agentType" from frontend
        const agentType = req.body.agentName || req.body.agentType || 'shop-assistant';

        const room     = roomName          || 'voice_agent_room_' + Math.random().toString(36).substring(2, 8);
        const name     = participantName   || req.user.name || 'User';
        const identity = participantIdentity || `user_${req.user.id || Math.random().toString(36).substring(2, 8)}`;

        if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET || !process.env.LIVEKIT_URL) {
            return res.status(500).json({ success: false, message: 'LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL must be set' });
        }

        // 1. Create participant token (no roomConfig needed — we dispatch explicitly)
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

        const participantToken = await at.toJwt();

        // 2. Explicitly dispatch the agent via AgentDispatchClient API
        //    This is the most reliable method — the agent is dispatched server-side.
        const dispatchClient = new AgentDispatchClient(
            process.env.LIVEKIT_URL,
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
        );

        const dispatch = await dispatchClient.createDispatch(room, 'afterglow-agents', {
            metadata: JSON.stringify({ type: agentType }),
        });
        console.log('[LiveKit] Agent dispatched:', dispatch);

        res.json({
            serverUrl: process.env.LIVEKIT_URL,
            participantToken,
            participantName: name,
            roomName: room,
        });
    } catch (err) {
        console.error('[LiveKit] connection-details error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to create connection' });
    }
});

module.exports = router;
