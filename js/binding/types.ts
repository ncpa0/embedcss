export type Value =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | Value[]
  | { [key: string]: Value };

export type ServiceCompileResult = {
  Code: string;
  Styles: string;
};

export type ServiceCompileOptions = {
  UniqueClassNames: boolean;
};

export type ServiceRequest = {
  Command: string;
  Args: string[];
};

export type ServiceErrorResponse = {
  Error: true;
  Msg: string;
};

export type Packet = {
  id: number;
  isRequest: boolean;
  value:
    | ServiceRequest
    | ServiceCompileResult
    | ServiceErrorResponse
    | null;
};
