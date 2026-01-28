package shared

// Environments
const (
	EnvDevelopment = "development"
	EnvProduction  = "production"
)

// HTTP Status Codes
const (
	StatusOK                  = 200
	StatusBadRequest          = 400
	StatusUnauthorized        = 401
	StatusNotFound            = 404
	StatusConflict            = 409
	StatusTooManyRequests     = 429
	StatusInternalServerError = 500
)

// Room
const (
	RoomTTL = 1 * 60 * 60 // 1 hour in seconds
)
