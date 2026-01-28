package controllers

import (
	"pairwise/services"
	"pairwise/shared"

	"github.com/gofiber/fiber/v2"
)

type RoomController struct {
	roomService *services.RoomService
}

func NewRoomController(state *shared.State) *RoomController {
	roomService := services.NewRoomService(state)
	go roomService.Bootstrap()
	return &RoomController{
		roomService,
	}
}

func (rc *RoomController) CreateRoom(c *fiber.Ctx) error {
	room, err := rc.roomService.Create()
	if err != nil {
		return shared.SendStandardResponse(
			c,
			shared.StatusInternalServerError,
			nil,
			"failed to create room",
		)
	}

	return shared.SendStandardResponse(
		c,
		shared.StatusOK,
		&map[string]interface{}{
			"room": room,
		},
		"room created successfully",
	)
}
