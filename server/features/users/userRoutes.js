const express = require('express');
const userController = require('./userControllers');

const {
    protect,
    allowRoles
} = require('../../shared/authMiddleware');

const {
    loginLimiter
} = require('../../shared/rateLimit');

const router = express.Router();


//Public login route, throttled by client address: this is the one route an
//attacker may hammer with a password list, and the bcrypt compare makes
//each attempt expensive for us as well as for them.
router.post(
    '/login',
    loginLimiter,
    userController.loginUser
);


//Public on purpose: the login cookie is httpOnly, so only the server can
//clear it, and that has to work even once the token has expired.
router.post('/logout', userController.logoutUser);


//get the currently logged-in user
router.get(
    '/me',
    protect,
    userController.getCurrentUser
);


//admin and teacher can view statistics
router.get(
    '/status',
    protect,
    allowRoles('admin', 'teacher'),
    userController.getStatus
);


//admin and teacher can get filter options
router.get(
    '/filter/options',
    protect,
    allowRoles('admin', 'teacher'),
    userController.getFilterOptions
);


//admin and teacher can list every teacher (for class assignment).
//must stay above the '/:id' route so it is not read as an id
router.get(
    '/teachers',
    protect,
    allowRoles('admin', 'teacher'),
    userController.getAllTeachers
);


//students see how they rank against their own grade level.
//must also stay above the '/:id' route
router.get(
    '/leaderboard',
    protect,
    allowRoles('student'),
    userController.getLeaderboard
);


//admin and teacher can search users
router.get(
    '/search/:query',
    protect,
    allowRoles('admin', 'teacher'),
    userController.searchUsers
);


//admin and teacher can view all users
router.get(
    '/',
    protect,
    allowRoles('admin', 'teacher'),
    userController.getAllUsers
);


//only admin can create users
router.post(
    '/',
    protect,
    allowRoles('admin'),
    userController.createUser
);


//only admin can update users
router.put(
    '/:id',
    protect,
    allowRoles('admin'),
    userController.updateUser
);


//only admin can delete users
router.delete(
    '/:id',
    protect,
    allowRoles('admin'),
    userController.deleteUser
);

// Class Management Routes
router.post(
    '/classes',
    protect,
    allowRoles('admin'),
    userController.createClass
);

router.get(
    '/classes',
    protect,
    allowRoles('admin', 'teacher'),
    userController.getAllClasses
);

router.delete(
    '/classes/:id',
    protect,
    allowRoles('admin'),
    userController.deleteClass
);

//get user by id
router.get(
    '/:id',
    protect,
    allowRoles('admin', 'teacher'),
    userController.getUserById
);

//admin and teacher can grade students
router.put(
    '/:id/grades',
    protect,
    allowRoles('admin', 'teacher'),
    userController.updateGrades
);


module.exports = router;