import { randomBytes } from "crypto";

export function customAlphabet(alphabet: string, size: number) {
  return () => {
    const bytes = randomBytes(size);
    let id = "";
    for (let i = 0; i < size; i++) {
      id += alphabet[bytes[i]! % alphabet.length];
    }
    return id;
  };
}
