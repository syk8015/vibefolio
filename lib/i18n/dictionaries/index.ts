import type { Locale } from "../config";
import { ko } from "./ko";
import { en } from "./en";

export type { Dictionary } from "./ko";

const dictionaries = { ko, en };

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}
