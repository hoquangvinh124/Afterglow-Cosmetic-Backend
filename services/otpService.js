const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class OTPService {
    /**
     * Generate a 6-digit numeric OTP
     * Uses crypto.randomInt for cryptographically secure random generation
     * @returns {string} 6-digit OTP code
     */
    generateOTP() {
        return crypto.randomInt(100000, 999999).toString();
    }

    /**
     * Hash OTP code using bcrypt
     * @param {string} code - Plain OTP code
     * @returns {Promise<string>} Hashed OTP
     */
    async hashOTP(code) {
        return await bcrypt.hash(code, 10);
    }

    /**
     * Verify OTP code against hashed version
     * @param {object} user - User document with otp field
     * @param {string} inputCode - OTP code to verify
     * @returns {Promise<boolean>} True if OTP matches
     */
    async verifyOTP(user, inputCode) {
        if (!user.otp || !user.otp.code) {
            return false;
        }
        return await bcrypt.compare(inputCode, user.otp.code);
    }

    /**
     * Check if OTP has expired (10 minutes)
     * @param {object} user - User document with otp field
     * @returns {boolean} True if expired
     */
    isExpired(user) {
        if (!user.otp || !user.otp.createdAt) {
            return true;
        }
        const now = new Date();
        const expirationTime = new Date(user.otp.createdAt.getTime() + 10 * 60 * 1000); // 10 minutes
        return now > expirationTime;
    }

    /**
     * Check if user can request new OTP (rate limiting: max 3 per hour)
     * @param {object} user - User document with otpAttempts field
     * @returns {boolean} True if user can request OTP
     */
    canRequestOTP(user) {
        if (!user.otpAttempts || user.otpAttempts.length === 0) {
            return true;
        }

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentAttempts = user.otpAttempts.filter(
            attempt => new Date(attempt.requestedAt) > oneHourAgo
        );

        return recentAttempts.length < 3;
    }

    /**
     * Get remaining time until user can request OTP again
     * @param {object} user - User document with otpAttempts field
     * @returns {number} Remaining time in minutes, or 0 if can request now
     */
    getRateLimitRemainingTime(user) {
        if (!user.otpAttempts || user.otpAttempts.length === 0) {
            return 0;
        }

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentAttempts = user.otpAttempts.filter(
            attempt => new Date(attempt.requestedAt) > oneHourAgo
        );

        if (recentAttempts.length < 3) {
            return 0;
        }

        // Find the oldest recent attempt
        const oldestAttempt = recentAttempts.reduce((oldest, current) => {
            return new Date(current.requestedAt) < new Date(oldest.requestedAt) ? current : oldest;
        });

        const canRequestAt = new Date(new Date(oldestAttempt.requestedAt).getTime() + 60 * 60 * 1000);
        const now = new Date();
        const remainingMs = canRequestAt - now;

        return Math.ceil(remainingMs / 60000); // Convert to minutes
    }

    /**
     * Clean up expired OTP data
     * @param {object} user - User document with otp field
     */
    cleanupExpiredOTP(user) {
        if (this.isExpired(user)) {
            user.otp = undefined;
        }
    }

    /**
     * Add OTP attempt timestamp
     * @param {object} user - User document with otpAttempts field
     */
    addAttempt(user) {
        if (!user.otpAttempts) {
            user.otpAttempts = [];
        }

        // Add new attempt
        user.otpAttempts.push({ requestedAt: new Date() });

        // Keep only last 20 attempts to prevent array from growing indefinitely
        if (user.otpAttempts.length > 20) {
            user.otpAttempts = user.otpAttempts.slice(-20);
        }
    }

    /**
     * Clear all OTP data from user
     * @param {object} user - User document
     */
    clearOTP(user) {
        user.otp = undefined;
    }
}

module.exports = new OTPService();
