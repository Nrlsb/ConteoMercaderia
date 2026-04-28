const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, verifyAdmin, verifySuperAdmin } = require('../middleware/auth');

router.get('/', verifyToken, verifyAdmin, userController.getAllUsers);
router.post('/', verifyToken, verifySuperAdmin, userController.createUser);
router.put('/:id', verifyToken, verifyAdmin, userController.updateUser);
router.delete('/:id', verifyToken, verifySuperAdmin, userController.deleteUser);

module.exports = router;
