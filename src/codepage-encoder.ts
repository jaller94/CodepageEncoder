import type { Codepage } from "../data/encodings.ts";
import definitions from "../generated/definitions.ts";
import aliases from "../generated/aliases.ts";
import strings from "./strings.ts";

type Codepoints = number[];

/**
 * A library for converting Unicode to obscure single byte codepage for use with thermal printers
 */
class CodepageEncoder {
  /**
   * Get list of supported codepages
   *
   * @return Return an array with the supported codepages
   */
  static getEncodings(): string[] {
    return Object.keys(definitions);
  }

  /**
   * Get codepage definition
   *
   * @param  codepage  The codepage, defaults to ascii when it cannot find the codepage
   * @return           Return an object with the codepage definition
   */
  static getEncoding(codepage: string): Codepage & { codepoints: Codepoints } {
    if (typeof aliases[codepage] !== "undefined") {
      codepage = aliases[codepage];
    }

    if (typeof definitions[codepage] === "undefined") {
      codepage = "ascii";
    }

    const definition = definitions[codepage];

    /* Create codepoints array if it doesn't exist */
    return {
      ...structuredClone(definition),
      codepoints: this.getCodepoints(codepage, true),
    };
  }

  /**
   * Get test strings for the specified codepage
   *
   * @param  codepage  The codepage
   * @return           Return an array with one or more objects
   *                   containing a property for the language of
   *                   the string and a property for the string itself
   */
  static getTestStrings(
    codepage: string,
  ): { language: string; string: string }[] {
    if (typeof aliases[codepage] !== "undefined") {
      codepage = aliases[codepage];
    }

    if (
      typeof definitions[codepage] !== "undefined" &&
      typeof definitions[codepage].languages !== "undefined"
    ) {
      return [...Object.entries(strings)].filter((
        [language],
      ) => definitions[codepage].languages.includes(language)).map((
        [language, string],
      ) => ({
        language,
        string,
      }));
    }

    return [];
  }

  /**
   * Determine if the specified codepage is supported
   *
   * @param  codepage  The codepage
   * @return           Return a boolean, true if the encoding is supported,
   *                   otherwise false
   */
  static supports(codepage: string): boolean {
    if (typeof aliases[codepage] !== "undefined") {
      codepage = aliases[codepage];
    }

    if (typeof definitions[codepage] === "undefined") {
      return false;
    }

    return true;
  }

  /**
   * Encode a string in the specified codepage
   *
   * @param  input     Text that needs encoded to the specified codepage
   * @param  codepage  The codepage
   * @return           Return an array of bytes with the encoded string
   */
  static encode(input: string, codepage: string): Uint8Array {
    const output = new Uint8Array(input.length);
    const definition = this.getEncoding(codepage);

    for (let c = 0; c < input.length; c++) {
      const codepoint = input.codePointAt(c);
      const position = definition.codepoints.findIndex((i) => i === codepoint);

      if (position !== -1) {
        output[c] = position;
      } else {
        output[c] = 0x3f;
      }
    }

    return output;
  }

  /**
   * Encode a string in the most optimal set of codepages.
   *
   * @param  input         Text that needs encoded
   * @param  candidates    An array of candidate codepages that are allowed to be used, ranked by importance
   * @return               Return an array of bytes with the encoded string
   */
  static autoEncode(
    input: string,
    candidates: string[],
  ): Array<{ codepage: string; bytes: Uint8Array }> {
    const fragments = Array<{ codepage: string; bytes: Uint8Array }>();
    let currentFragment: {
      codepage?: string;
      chars: number[];
    } = {
      chars: [],
    };

    for (let c = 0; c < input.length; c++) {
      const codePoint = input.codePointAt(c);

      let availableCodepage: string | undefined;
      let char = 0;

      if (currentFragment.codepage) {
        const definition = this.getEncoding(currentFragment.codepage);
        const position = definition.codepoints.findIndex((i) =>
          i === codePoint
        );

        if (position !== -1) {
          availableCodepage = currentFragment.codepage;
          char = position;
        }
      }

      if (!availableCodepage) {
        for (let i = 0; i < candidates.length; i++) {
          const definition = this.getEncoding(candidates[i]);
          const position = definition.codepoints.findIndex((i) =>
            i === codePoint
          );

          if (position !== -1) {
            availableCodepage = candidates[i];
            char = position;
            break;
          }
        }
      }

      if (!availableCodepage) {
        availableCodepage = currentFragment.codepage || candidates[0];
        char = 0x3f;
      }

      if (currentFragment.codepage !== availableCodepage) {
        if (currentFragment.codepage) {
          fragments.push({
            codepage: currentFragment.codepage,
            bytes: new Uint8Array(currentFragment.chars),
          });
        }

        currentFragment = {
          codepage: availableCodepage,
          chars: [],
        };
      }

      currentFragment.chars.push(char);
    }

    if (currentFragment.codepage) {
      fragments.push({
        codepage: currentFragment.codepage,
        bytes: new Uint8Array(currentFragment.chars),
      });
    }

    return fragments;
  }

  /**
   * Get codepoints
   *
   * @param  codepage         The codepage
   * @param  evaluateExtends  Evaluate the extends property
   * @return                  Return an object array with 256 codepoints for the specified codepage
   */
  static getCodepoints(codepage: string, evaluateExtends: boolean): number[] {
    let codepoints = new Array<number>(256);

    if (evaluateExtends) {
      if (typeof definitions[codepage].extends === "undefined") {
        codepoints = codepoints.fill(0xfffd);
      } else {
        codepoints = this.getEncoding(definitions[codepage].extends).codepoints;
      }
    }

    const value = definitions[codepage].value;
    if (value !== undefined) {
      if (value.length === 16) {
        for (let i = 0; i < 16; i++) {
          if (typeof value[i] !== "object") {
            continue;
          }

          for (let j = 0; j < 16; j++) {
            const subvalue = value[i];
            if (typeof subvalue !== "object") {
              continue;
            }
            const subsubvalue = subvalue[j];
            if (typeof subsubvalue !== "number") {
              continue;
            }

            codepoints[i * 16 + j] = subsubvalue;
          }
        }
      } else {
        const offset = definitions[codepage].offset || 0;

        for (let i = 0; i < value.length; i++) {
          const subvalue = value[i];
          if (typeof subvalue !== "number") {
            continue;
          }

          codepoints[offset + i] = subvalue;
        }
      }
    }

    return codepoints;
  }
}

export default CodepageEncoder;
