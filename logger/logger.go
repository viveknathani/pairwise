package logger

import (
	"bufio"
	"fmt"
	"os"
	"sync"
	"time"
)

// level is controlled by LOG_LEVEL env var
// valid values: DEBUG, INFO, ERROR (default: INFO)
var level = "INFO"

// logger is the internal logger with mutex protection and buffered writes
var logger = struct {
	sync.Mutex
	buf *bufio.Writer
}{
	buf: bufio.NewWriter(os.Stdout),
}

const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorOrange = "\033[33m"
)

// Call this at the start of your program
func SetLogLevel(l string) {
	if l != "DEBUG" && l != "INFO" && l != "ERROR" {
		panic("invalid log level: " + l)
	}
	level = l
}

// Info logs informational messages
func Info(format string, args ...any) {
	if level == "INFO" || level == "DEBUG" {
		log("[INFO] ", format, args...)
	}
}

// Debug logs debug messages
func Debug(format string, args ...any) {
	if level == "DEBUG" {
		log("[DEBUG]", format, args...)
	}
}

// Error logs error messages (always logged)
func Error(format string, args ...any) {
	log("[ERROR]", format, args...)
}

// log is the internal logging function
func log(level string, format string, args ...any) {
	logger.Lock()
	defer logger.Unlock()

	var color string
	switch level {
	case "[ERROR]":
		color = colorRed
	case "[INFO] ":
		color = colorGreen
	case "[DEBUG]":
		color = colorOrange
	}

	msg := fmt.Sprintf(format, args...)

	fmt.Fprintln(
		logger.buf,
		color+level,
		time.Now().Format(time.DateTime),
		msg,
		colorReset,
	)

	logger.buf.Flush()
}
