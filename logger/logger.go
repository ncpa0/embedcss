package logger

import (
	"fmt"
	"os"
)

var debug bool = false

func Error(msg string) {
	fmt.Fprintln(os.Stderr, "Error: "+msg)
}

func Errorf(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "Error: "+format+"\n", args...)
}

func Debug(msg string) {
	if debug {
		fmt.Fprintln(os.Stderr, "Debug: "+msg)
	}
}

func Debugf(format string, args ...interface{}) {
	if debug {
		fmt.Fprintf(os.Stderr, "Debug: "+format+"\n", args...)
	}
}
