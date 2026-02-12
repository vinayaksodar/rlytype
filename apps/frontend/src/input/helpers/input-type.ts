export type SupportedInputType =
  | "insertText"
  | "insertCompositionText"
  | "insertFromComposition"
  | "deleteWordBackward"
  | "deleteContentBackward";

const SUPPORTED_INPUT_TYPES: Set<SupportedInputType> = new Set([
  "insertText",
  "insertCompositionText",
  "insertFromComposition",
  "deleteWordBackward",
  "deleteContentBackward",
]);

export const isSupportedInputType = (inputType: string): inputType is SupportedInputType =>
  SUPPORTED_INPUT_TYPES.has(inputType as SupportedInputType);
