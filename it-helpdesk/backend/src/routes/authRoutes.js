/**
 * Auth Routes
 * Base path: /api/auth
 *
 * Middleware chain for each route:
 *   validate   → ensures req.body matches the Joi schema before controller runs
 *   authMiddleware → (on protected routes) verifies JWT and sets req.user
 */

const router = require("express").Router();
const authController = require("../controllers/authController");
const { authMiddleware } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const { userRegisterSchema, userLoginSchema } = require("../validators/schemas");

// POST /api/auth/register — Public: create account
router.post("/register", validate(userRegisterSchema), authController.register);

// POST /api/auth/login — Public: authenticate and get JWT
router.post("/login", validate(userLoginSchema), authController.login);

// POST /api/auth/logout — Protected: log the logout action (client discards token)
router.post("/logout", authMiddleware, authController.logout);

// GET /api/auth/me — Protected: get current user's profile
router.get("/me", authMiddleware, authController.getMe);

module.exports = router;
