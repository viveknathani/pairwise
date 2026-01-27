package shared

import (
	"gorm.io/gorm"
)

type State struct {
	Database    *gorm.DB
	Environment string
}
