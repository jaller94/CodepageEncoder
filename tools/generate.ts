import fs from "node:fs";
import encodings from "../data/encodings.js";

function getCodepoints(codepage) {
  const codepoints = new Array<number>(256);
  let data;

  try {
    data = fs.readFileSync("data/encodings/" + codepage + ".txt", "utf8");
  } catch (err) {
    console.error(err);
  }

  if (data) {
    data = data.split("\n")
      .filter((line) => line.length && line.charAt(0) != "#")
      .map((line) => line.split("  "))
      .map((line) => [parseInt(line[0], 16), parseInt(line[1], 16)])
      .map((line) => [line[0], isNaN(line[1]) ? 0xfffd : line[1]]);

    data = new Map<number, number>(data);

    for (let i = 0; i < 256; i++) {
      if (data.has(i)) {
        codepoints[i] = data.get(i);
      }
    }
  }

  return codepoints;
}

function getEncoding(codepage: string) {
  if (!encodings[codepage]) {
    return;
  }
  const encoding = encodings[codepage];

  if (encoding.extends) {
    const base = getEncoding(encoding.extends);
    const codepoints = getCodepoints(codepage);

    for (let i = 0; i < 256; i++) {
      if (codepoints[i] !== null) {
        base[i] = codepoints[i];
      }
    }

    return base;
  }

  return getCodepoints(codepage);
}

function getDefinition(codepage: string) {
  const encoding = encodings[codepage];

  if (!encoding) {
    return;
  }
  const result = getEncoding(codepage);

  let value: Array<number | number[] | undefined>;
  let offset = 0;

  if (encoding.extends) {
    const base = getEncoding(encoding.extends);

    let offset = 0;
    let minimum = 256;
    let maximum = 0;
    const diffs = new Array<number | number[] | undefined>(17);

    for (let i = 0; i < 256; i++) {
      if (typeof result[i] !== "undefined" && result[i] != null) {
        maximum = Math.max(maximum, i);
      }

      if (typeof result[i] !== "undefined" && result[i] != base[i]) {
        minimum = Math.min(minimum, i);

        const row = i >> 4;

        if (typeof diffs[row] === "undefined") {
          diffs[row] = new Array<number>(17);
        }

        diffs[row][i % 16] = result[i];
      }
    }

    if (minimum >= 128) {
      offset = 128;
    }

    const diffString = JSON.stringify(diffs);
    const resultString = JSON.stringify(result.slice(offset));

    if (diffString === undefined) {
      throw Error("diffString is undefined");
    } else if (resultString === undefined) {
      throw Error("resultString is undefined");
    }

    if (diffString.length < resultString.length) {
      value = diffs;
    } else {
      if (offset > 0) {
        value = new Array(result.length - offset);

        for (let i = offset; i < result.length; i++) {
          if (typeof result[i] === "number") {
            value[i - offset] = result[i];
          }
        }
      } else {
        value = result;
      }
    }
  } else {
    value = result;
    offset = 0;
  }

  return {
    ...encoding,
    offset,
    value,
  };
}

function generateDefinitions() {
  let output = "";

  output += "const definitions = {\n\n";

  for (const codepage in encodings) {
    const definition = getDefinition(codepage);

    if (definition === undefined) {
      throw Error("definition is undefined");
    }

    output += `  '${codepage}': {\n`;
    output += `    name: ${JSON.stringify(definition.name)},\n`;

    if (definition.languages) {
      output += `    languages: ${JSON.stringify(definition.languages)},\n`;
    }

    if (definition.extends) {
      output += `    extends: '${definition.extends}',\n`;
    }

    if (definition.offset) {
      output += `    offset: ${definition.offset},\n`;
    }

    if (codepage == "ascii") {
      output += `    value: ${
        JSON.stringify(new Array(256).fill(1, 0, 128).map((_v, i) => i))
          .replaceAll("null", "")
      },\n`;
    } else {
      output += `    value: ${
        JSON.stringify(definition.value).replaceAll("null", "")
      }\n`;
    }
    output += `  },\n\n`;
  }

  output += "} as const;\n\n";
  output += "export default definitions;\n";

  fs.writeFileSync("generated/definitions.ts", output, "utf8");
}

function generateAliases() {
  const aliases = new Array<[string, string]>();

  for (const codepage in encodings) {
    const encoding = encodings[codepage];

    if (encoding.aliases) {
      for (const alias of encoding.aliases) {
        aliases.push([alias, codepage]);
      }
    }
  }

  let output = "";
  output += "const aliases = {\n";

  for (const alias of aliases) {
    output += `  '${alias[0]}': '${alias[1]}',\n`;
  }

  output += "} as const;\n\n";
  output += "export default aliases;\n";

  fs.writeFileSync("generated/aliases.ts", output, "utf8");
}

generateDefinitions();
generateAliases();
