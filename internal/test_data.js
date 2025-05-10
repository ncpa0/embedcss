import React from "react";
import { css } from "embedcss";

const style1 = css`
  .myclass {
    color: red;
    font-size: 20px;

    & .subclass:hover {
      color: yellow;
    }
  }
`;

const style2 = css`
  .myotherclass {
    color: green;
    font-size: 30px;
  }
`;

const style3 = css`
  .loool {
    color: blue;
    font-size: 1px;
  }
`;

// global
css`
  body {
    width: 100vw;
    height: 100vh;
  }

  a {
    text-decoration: none;
  }
`;

const style4 = css`
  .loool {
    color: blue;
    font-size: 1px;
  }
`;

const App = () => {
  return (
    <div className={style1}>
      <button
        className={css`
          .btn {
            background: blue;
          }
        `}
      >
        Click Me
      </button>
    </div>
  );
};
