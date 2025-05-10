package internal

import (
	"regexp"
	"strings"
)

type CompilerOptions struct {
	UniqueClassNames bool
}

func Parse(code string, options *CompilerOptions) (string, string, error) {
	containsStyles, _ := regexp.Match(`import\s*{\s*(\w|,|\s)*\s*css\s*(\w|,|\s)*\s*}\s*from\s*("embedcss"|'embedcss')`, []byte(code))
	if !containsStyles {
		return code, "", nil
	}
	styleIdxStart := strings.Index(code, "css`")
	if styleIdxStart == -1 {
		return code, "", nil
	}
	codeBefore := code[:styleIdxStart]
	styleContent := code[styleIdxStart+4:]
	styleIdxEnd := strings.Index(styleContent, "`")
	if styleIdxEnd == -1 {
		return code, "", nil
	}
	codeAfter := styleContent[styleIdxEnd+1:]
	styleContent = styleContent[:styleIdxEnd]

	isAssigned := false
	for i := styleIdxStart - 1; i >= 0; i-- {
		if code[i] == '=' || code[i] == ':' || code[i] == '(' || code[i] == '{' {
			isAssigned = true
			break
		}
		if code[i] == ' ' || code[i] == '\n' {
			continue
		}
		break
	}

	empty := strings.Join(amap(split(styleContent, "\n"), func(t string) string {
		return ""
	}), "\n")

	if !isAssigned {
		// if the result of the css`` call is not assigned to a variable, it should be added
		// as a global style, rather than a css module

		code = codeBefore + "css.$(\"\")" + empty + codeAfter

		code, nextStyle, err := Parse(code, options)
		if nextStyle != "" {
			styleContent += "\n" + nextStyle
		}
		return code, styleContent, err
	}

	cname, transformedStyle, err := transformCss(styleContent, options)
	if err != nil {
		return "", "", err
	}
	styleContent = transformedStyle

	code = codeBefore + "css.$(\"" + cname + "\")" + empty + codeAfter

	code, nextStyle, err := Parse(code, options)
	if nextStyle != "" {
		styleContent += "\n" + nextStyle
	}
	return code, styleContent, err
}

func split(s string, sep string) []string {
	parts := make([]string, 0, 10)
	buff := ""
	for _, r := range s {
		char := string(r)
		if char == sep {
			parts = append(parts, buff)
			buff = ""
		} else {
			buff += char
		}
	}
	parts = append(parts, buff)
	return parts
}

func amap[T any](arr []T, f func(T) T) []T {
	res := make([]T, len(arr))
	for i, v := range arr {
		res[i] = f(v)
	}
	return res
}
