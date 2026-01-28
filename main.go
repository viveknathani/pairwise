package main

import (
	"os"
	"os/signal"
	"pairwise/database"
	"pairwise/logger"
	"pairwise/routes"
	"pairwise/shared"
	"syscall"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/joho/godotenv"
)

func loadEnvironmentVariables() {
	println("loading environment variables from .env file")
	err := godotenv.Load(".env")
	if err != nil {
		logger.Error("Error loading .env file: %v", err)
		logger.Info("proceeding with system environment variables")
	}
}

func main() {
	loadEnvironmentVariables()
	logger.SetLogLevel(os.Getenv("LOG_LEVEL"))

	postgres := database.NewPostgres(os.Getenv("POSTGRESQL_URL"))

	postgresConnection, err := postgres.DB()
	if err != nil {
		logger.Error("failed to get postgres connection: %v", err)
		os.Exit(1)
	}
	database.RunPostgresMigrations("database/migrations", postgresConnection)

	state := shared.State{
		Database:    postgres,
		Environment: os.Getenv("ENV"),
	}

	app := fiber.New()

	routes.Setup(app, &state)

	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
	}))

	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)

	port := os.Getenv("PORT")
	go func() {
		err := app.Listen(":" + port)
		if err != nil {
			logger.Error("listen of server returned an error: %s", err.Error())
			os.Exit(1)
		}
	}()
	logger.Info("server is up! ⚡️")

	<-done
	logger.Info("server is shutting down...")
}
