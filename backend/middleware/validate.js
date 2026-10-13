const { AppError } = require('./errorHandler');

// Usage: validate(zodSchema) or validate(zodSchema, 'query')
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const first = result.error.issues[0];
      return next(new AppError(first ? first.message : 'Invalid input.', 400, 'VALIDATION_ERROR'));
    }
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };