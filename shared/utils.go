package shared

import (
	"fmt"
	"pairwise/logger"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func SendStandardResponse(
	c *fiber.Ctx,
	code int,
	data *map[string]interface{},
	message string,
) error {
	return c.Status(code).JSON(fiber.Map{
		"message": message,
		"data":    data,
	})
}

func GetRequestID(c *fiber.Ctx) string {
	value, ok := c.Locals("requestID").(string)
	if ok {
		return value
	}
	return "0"
}

func GetRequestLoggingMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		requestID := uuid.New().String()
		c.Locals("requestID", requestID)

		c.Set("X-Request-ID", requestID)

		start := time.Now()
		c.Locals("start", start)

		err := c.Next()

		duration := time.Since(start)
		statusCode := c.Response().StatusCode()

		if err != nil {
			if fiberErr, ok := err.(*fiber.Error); ok {
				statusCode = fiberErr.Code
			}
		}

		method := c.Method()
		path := c.Path()
		body := c.Body()
		ip := GetClientIP(c)

		logStatement := fmt.Sprintf(
			"method=%s | path=%s | status=%d | duration=%s | body=%s | ip=%s | ",
			method,
			path,
			statusCode,
			duration,
			string(body),
			ip,
		)

		if statusCode >= 500 {
			logger.Error("%s", logStatement)
		} else {
			logger.Info("%s", logStatement)
		}

		return err
	}
}

func GetClientIP(c *fiber.Ctx) string {
	if ip := c.Get("X-Forwarded-For"); ip != "" {
		ips := strings.Split(ip, ",")
		return strings.TrimSpace(ips[0])
	}

	if ip := c.Get("X-Real-IP"); ip != "" {
		return ip
	}

	return c.IP()
}
