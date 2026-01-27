package routes

import (
	"pairwise/shared"

	"github.com/gofiber/fiber/v2"
)

func Setup(app *fiber.App, state *shared.State) {
	app.Use(shared.GetRequestLoggingMiddleware())

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(200).JSON(fiber.Map{
			"message": "market-data is alive",
		})
	})
}
