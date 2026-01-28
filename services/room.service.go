package services

import (
	"encoding/json"
	"pairwise/logger"
	"pairwise/shared"
	"time"

	gonanoid "github.com/matoous/go-nanoid/v2"
)

type RoomService struct {
	state *shared.State
}

func NewRoomService(state *shared.State) *RoomService {
	return &RoomService{
		state: state,
	}
}

func (roomService *RoomService) Create() (*shared.Room, error) {
	alphabet := "abcdefghijklmnopqrstuvwxyz0123456789"
	roomID, err := gonanoid.Generate(alphabet, 6)
	if err != nil {
		logger.Error("failed to generate room id: %v", err)
		return nil, err
	}

	now := time.Now()
	expiresAt := now.Add(time.Duration(shared.RoomTTL) * time.Second)

	jsonData, err := json.Marshal(map[string]interface{}{})
	if err != nil {
		logger.Error("failed to marshal room data: %v", err)
		return nil, err
	}

	room := &shared.Room{
		Id:        roomID,
		Data:      jsonData,
		CreatedAt: now,
		ExpiresAt: expiresAt,
	}

	result := roomService.state.Database.Create(room)
	if result.Error != nil {
		logger.Error("failed to create room in database: %v", result.Error)
		return nil, result.Error
	}

	go roomService.scheduleRoomDeletion(roomID, shared.RoomTTL)

	return room, nil
}

func (roomService *RoomService) scheduleRoomDeletion(roomID string, ttlSeconds int) {
	timer := time.NewTimer(time.Duration(ttlSeconds) * time.Second)
	defer timer.Stop()

	<-timer.C

	err := roomService.Delete(roomID)
	if err != nil {
		logger.Error("failed to delete expired room %s: %v", roomID, err)
		return
	}

	logger.Info("deleted expired room %s", roomID)
}

func (roomService *RoomService) Delete(roomID string) error {
	result := roomService.state.Database.Delete(&shared.Room{}, "id = ?", roomID)
	if result.Error != nil {
		return result.Error
	}
	return nil
}

func (roomService *RoomService) Bootstrap() error {
	var rooms []shared.Room
	result := roomService.state.Database.Find(&rooms)
	if result.Error != nil {
		logger.Error("failed to fetch rooms for bootstrap: %v", result.Error)
		return result.Error
	}

	now := time.Now()
	for _, room := range rooms {
		timeUntilExpiry := room.ExpiresAt.Sub(now)

		if timeUntilExpiry <= 0 {
			// Room has already expired, delete immediately
			err := roomService.Delete(room.Id)
			if err != nil {
				logger.Error("failed to delete expired room %s during bootstrap: %v", room.Id, err)
			} else {
				logger.Info("deleted expired room %s during bootstrap", room.Id)
			}
		} else {
			// Room still valid, schedule deletion
			go roomService.scheduleRoomDeletion(room.Id, int(timeUntilExpiry.Seconds()))
			logger.Info("scheduled deletion for room %s in %v", room.Id, timeUntilExpiry)
		}
	}

	logger.Info("bootstrapped %d rooms", len(rooms))
	return nil
}
