package internal

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"strings"
	"time"

	"github.com/benbjohnson/css"
	"golang.org/x/exp/rand"
)

func Stringify(p *css.Printer, node css.Node) string {
	var buff strings.Builder
	p.Print(&buff, node)
	return buff.String()
}

var counter = 0

func transformCss(cssSnippet string, options *CompilerOptions) (outCname string, outCss string, error error) {
	defer func() {
		if r := recover(); r != nil {
			outCname = ""
			outCss = ""
			error = fmt.Errorf("panic: %v", r)
		}
	}()

	var parser css.Parser
	var printer css.Printer

	sheet := parser.ParseStyleSheet(css.NewScanner(strings.NewReader(cssSnippet)))

	// Iterate through the rules in the stylesheet.
	for _, rule := range sheet.Rules {
		// Check if the rule is a style rule.
		if qrule, ok := rule.(*css.QualifiedRule); ok {
			if ok, msg := isOnlyClassName(qrule.Prelude); !ok {
				return "", "", fmt.Errorf("invalid class name: %s", msg)
			}
			cnameToken := firstIdentTok(qrule.Prelude)

			currentClassName := cnameToken.Value

			// if !strings.HasPrefix(currentClassName, ".") {
			// 	return "", "", fmt.Errorf("selector is not a class name: %s", currentClassName)
			// }

			if options.UniqueClassNames == false {
				return currentClassName, cssSnippet, nil
			}

			uniqueCname := generateUniqueName(currentClassName, fmt.Sprintf("Seed(%v):%v", counter, cssSnippet))
			counter += 1

			lastPreuldeElem := qrule.Prelude[len(qrule.Prelude)-1]
			preludeWithoutLast := qrule.Prelude[:len(qrule.Prelude)-1]
			qrule.Prelude = append(
				preludeWithoutLast,
				&css.Token{Tok: css.DelimToken, Value: "."},
				&css.Token{Tok: css.IdentToken, Value: uniqueCname},
				lastPreuldeElem,
			)
			outName := strings.Trim(strings.ReplaceAll(Stringify(&printer, qrule.Prelude), ".", " "), " ")
			return outName, Stringify(&printer, sheet), nil
		}
	}

	// If no class selector was found, return an error.
	return "", "", fmt.Errorf("no class selector found in the CSS snippet")
}

func firstIdentTok(prelude css.ComponentValues) *css.Token {
	for _, v := range prelude {
		if token, ok := v.(*css.Token); ok {
			if token.Tok == css.IdentToken {
				return token
			}
		}
	}
	panic("unreachable: no ident token found")
}

func isOnlyClassName(prelude css.ComponentValues) (ok bool, msg string) {
	if len(prelude) == 1 {
		return true, ""
	}

	identCount := 0
	for _, v := range prelude {
		if token, ok := v.(*css.Token); ok {
			if token.Tok == css.IdentToken {
				identCount++
			}
		}
	}

	if identCount == 1 {
		return true, ""
	}

	if identCount > 1 {
		return false, "selector must be a single class name"
	}
	if identCount == 0 {

		return false, "missing class selector"
	}

	return true, ""
}

const charset = "abcdefghijklmnopqrstuvwxyz" +
	"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

var seededRand *rand.Rand = rand.New(
	rand.NewSource(uint64(time.Now().UnixNano())))

func GenerateRandomString(seed string, length int) string {
	if length < 0 {
		panic("GenerateRandomString: length cannot be negative")
	}
	if length == 0 {
		return ""
	}

	// Generate a deterministic seed value from the input seed string using SHA256.
	// SHA256 is a good choice as it produces a consistent hash for the same input.
	hash := sha256.Sum256([]byte(seed))

	// Convert the first 8 bytes of the hash to an int64 to use as the random number generator seed.
	// Using the first 8 bytes ensures we get a consistent seed value.
	rngSeed := binary.BigEndian.Uint64(hash[:8])

	// Create a new pseudo-random number generator with the deterministic seed.
	// This ensures that for the same rngSeed, the sequence of random numbers generated will be the same.
	rng := rand.New(rand.NewSource(rngSeed))

	// Define the characters to use for the random string.
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

	// Generate the string.
	result := make([]byte, length)
	for i := 0; i < length; i++ {
		result[i] = charset[rng.Intn(len(charset))]
	}

	return string(result)
}

func generateUniqueName(prefix string, seed string) string {
	return prefix + "_" + GenerateRandomString(seed, 10)
}
