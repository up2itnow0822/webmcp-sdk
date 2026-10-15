/** Match the child server's actual ready banner, never an occupied-port message. */
import { stripVTControlCharacters } from "node:util";
export function isViteReadyOutput(output) {
  return /\bVITE v[^\r\n]*\bready in\b/.test(stripVTControlCharacters(output));
}
