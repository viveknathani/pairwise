package shared

import (
	"encoding/json"
	"time"
)

type Room struct {
	Id        string          `json:"id"        gorm:"column:id"`
	Data      json.RawMessage `json:"data"      gorm:"column:data"`
	CreatedAt time.Time       `json:"createdAt" gorm:"column:created_at"`
	ExpiresAt time.Time       `json:"updatedAt" gorm:"column:expires_at"`
}
