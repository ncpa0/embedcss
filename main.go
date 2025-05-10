package main

import (
	internal "embedcss_compiler/internal"
	"embedcss_compiler/logger"
	"encoding/json"
	"fmt"
)

type Input struct {
	Code    string
	Options internal.CompilerOptions
}

type Result struct {
	Code   string
	Styles string
}

func (r *Result) FromMap(m map[string]interface{}) {
	r.Code = m["Code"].(string)
	r.Styles = m["Styles"].(string)
}

func (r Result) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"Code":   r.Code,
		"Styles": r.Styles,
	}
}

func main() {
	service := internal.NewService()

	service.Command("compile", func(req internal.Request) (map[string]interface{}, error) {
		logger.Debug("received command: compile")

		if len(req.Args) != 2 {
			return nil, fmt.Errorf("compile expected 2 arguments, got %d", len(req.Args))
		}
		codeArg := req.Args[0]
		optionsArg := req.Args[1]

		options := &internal.CompilerOptions{}
		err := json.Unmarshal([]byte(optionsArg), options)

		if err != nil {
			return nil, fmt.Errorf("compile failed to parse options: %v", err)
		}

		newCode, styles, err := internal.Parse(codeArg, options)

		if err != nil {
			return nil, err
		}

		return Result{
			Code:   newCode,
			Styles: styles,
		}.ToMap(), nil
	})

	logger.Debug("starting service")
	service.Start()
}
