const express = require('express');
const router = express.Router();
const colorRegistrationController = require('../controllers/colorRegistrationController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', colorRegistrationController.getAll);
router.post('/', colorRegistrationController.create);
router.delete('/:id', colorRegistrationController.delete);

module.exports = router;
