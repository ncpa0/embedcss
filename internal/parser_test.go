package internal_test

import (
	internal "embedcss_compiler/internal"
	"io/fs"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseCode(t *testing.T) {
	// read from the test_data.js file
	f := os.DirFS(".")
	testCode, err := fs.ReadFile(f, "test_data.js")
	if err != nil {
		t.Error(err)
		return
	}

	newCode, styles, err := internal.Parse(string(testCode), &internal.CompilerOptions{UniqueClassNames: true})

	if err != nil {
		t.Error(err)
		return
	}

	expectedCode := `import React from "react";
import { css } from "embedcss";

const style1 = css.$("myclass myclass_uob94bNhEJ")








;

const style2 = css.$("myotherclass myotherclass_LFb5KZjlMh")




;

const style3 = css.$("loool loool_u5HBxsPfw9")




;

// global
css.$("")








;

const style4 = css.$("loool loool_ECgJfeITna")




;

const App = () => {
  return (
    <div className={style1}>
      <button
        className={css.$("btn btn_aAqvvNG5WV")



}
      >
        Click Me
      </button>
    </div>
  );
};
`

	expectedStyles := `.myclass.myclass_uob94bNhEJ {
    color: red;
    font-size: 20px;

    & .subclass:hover {
      color: yellow;
    }
  }
.myotherclass.myotherclass_LFb5KZjlMh {
    color: green;
    font-size: 30px;
  }
.loool.loool_u5HBxsPfw9 {
    color: blue;
    font-size: 1px;
  }

  body {
    width: 100vw;
    height: 100vh;
  }

  a {
    text-decoration: none;
  }

.loool.loool_ECgJfeITna {
    color: blue;
    font-size: 1px;
  }
.btn.btn_aAqvvNG5WV {
            background: blue;
          }`

	assert.Equal(t, expectedCode, newCode)
	assert.Equal(t, expectedStyles, styles)
}
