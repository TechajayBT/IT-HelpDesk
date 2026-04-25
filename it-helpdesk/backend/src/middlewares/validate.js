/**
 * Validation Middleware
 *
 * Factory function that creates an Express middleware from a Joi schema.
 * Validates either req.body (for POST/PUT/PATCH) or req.query (for GET) and
 * calls next() with an AppError on failure so the global error handler
 * sends a consistent 400 response.
 *
 * Usage:
 *   router.post("/register", validate(userRegisterSchema), authController.register);
 *   router.get("/tickets",   validate(ticketListQuerySchema, "query"), ticketController.list);
 */

const { AppError } = require("../utils/errors");
const logger = require("../config/logger");

/**
 * validate
 *
 * @param {import("joi").Schema} schema - The Joi schema to validate against
 * @param {"body"|"query"|"params"} [source="body"] - Which part of the request to validate
 * @returns {import("express").RequestHandler}
 */
const validate = (schema, source = "body") => {
  return (req, res, next) => {
    const dataToValidate = req[source];

    // Joi validates the data and returns either an error or the validated+coerced value.
    // allowUnknown: false — rejects extra fields the schema doesn't define (prevents injection)
    // abortEarly: false — collects ALL validation errors rather than stopping at the first
    // stripUnknown: true — removes unknown fields from the validated output (for body)
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: source === "body", // Strip unknowns from body, not from query (query may have pagination params)
    });

    if (error) {
      // Build a flat array of human-readable field errors for the client
      const details = error.details.map((d) => ({
        field: d.path.join("."),
        message: d.message,
      }));

      logger.debug("Validation failed", {
        source,
        path: req.path,
        errors: details,
      });

      // Pass to global error handler which will format as:
      // { success: false, error: { code: "VALIDATION_ERROR", message: "...", details: [...] } }
      return next(new AppError("Validation failed", 400, "VALIDATION_ERROR"));
    }

    // Replace the raw request data with Joi's coerced/defaulted version
    // (e.g., page "1" string becomes 1 number, missing role defaults to "requester")
    req[source] = value;

    // Store validation errors in res.locals for the error middleware to pick up
    // when the error is a VALIDATION_ERROR
    res.locals.validationDetails = null;

    next();
  };
};

module.exports = validate;
