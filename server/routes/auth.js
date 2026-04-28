const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

// Rate limiter: max 10 intentos por 15 minutos en login/register
const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Intente nuevamente en 15 minutos.' }
});

router.get('/user', verifyToken, authController.getUserData);
router.put('/active-count', verifyToken, authController.updateActiveCount);
router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);
router.post('/logout', verifyToken, authController.logout);
router.post('/heartbeat', verifyToken, authController.heartbeat);

module.exports = router;
