export const parseCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let field = "";
  let state: "field" | "quoted" | "closed" = "field";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === "\n" || (character === "\r" && index !== line.length - 1))
      throw new Error("Multiline CSV records are unsupported.");
    if (character === "\r" && index === line.length - 1) continue;
    if (state === "quoted") {
      if (character !== '"') field += character;
      else if (line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else state = "closed";
    } else if (character === ",") {
      fields.push(field);
      field = "";
      state = "field";
    } else if (character === '"' && state === "field" && field === "") state = "quoted";
    else if (state === "closed" || character === '"') throw new Error("Malformed CSV quote.");
    else field += character;
  }
  if (state === "quoted")
    throw new Error("Unterminated CSV field or unsupported multiline record.");
  fields.push(field);
  return fields;
};
