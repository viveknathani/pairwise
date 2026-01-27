package shared

import (
	"fmt"
)

// ClientError is a custom error that we will use in our API responses
type ClientError struct {
	message string
}

// Error - implementing this on ClientError makes it compatible for places where want to return errors
func (err *ClientError) Error() string {
	return fmt.Sprintf("client error: %s", err.message)
}

// NewClientError - use this to return client errors from your service
func NewClientError(message string) *ClientError {
	return &ClientError{
		message: message,
	}
}
