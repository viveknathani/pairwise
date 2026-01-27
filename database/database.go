package database

import (
	"database/sql"
	"os"
	"pairwise/logger"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	migrate "github.com/golang-migrate/migrate/v4"
	migratePostgres "github.com/golang-migrate/migrate/v4/database/postgres"

	// For golang-migrate
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func NewPostgres(url string) *gorm.DB {
	connection, err := sql.Open("postgres", url)
	if err != nil {
		logger.Error("error connecting to the database: %s", err.Error())
		os.Exit(1)
	}

	db, err := gorm.Open(postgres.New(postgres.Config{
		Conn: connection,
	}), &gorm.Config{
		SkipDefaultTransaction: true,
		Logger:                 gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		logger.Error("error using existing connection: %s", err.Error())
		os.Exit(1)
	}

	return db
}

func RunPostgresMigrations(relativePathToDirectory string, connection *sql.DB) {
	files, err := os.ReadDir(relativePathToDirectory)
	if err != nil {
		logger.Error("could not read migration directory: %v", err)
	}

	migrationFilesFound := false
	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".sql") {
			migrationFilesFound = true
		}
	}

	if !migrationFilesFound {
		logger.Info("no migration files found in %s, skipping", relativePathToDirectory)
		return
	}

	driver, err := migratePostgres.WithInstance(connection, &migratePostgres.Config{})
	if err != nil {
		logger.Error("failed to create postgres driver: %v", err)
		os.Exit(1)
	}

	m, err := migrate.NewWithDatabaseInstance("file://"+relativePathToDirectory, "postgres", driver)
	if err != nil {
		logger.Error("failed to create migrate instance: %v", err)
		os.Exit(1)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		logger.Error("failed to apply migrations: %v", err)
		os.Exit(1)
	}

	logger.Info("migrations applied successfully!")
}
